// Live booking (docs/features/live-booking.md): a venue posts a recurring
// paid gig, artists mark the dates they can play and attach clips, the
// venue picks one per date and pays them directly.
//
// House style (projectTeam.ts / communities.ts): the pure core — recurrence,
// clock math, validation, labels, payment links — lives in gigRules.ts and
// is unit-tested without Convex; this file is the thin ctx.db layer.
//
// The posting is a normal `projects` row (kind "paid"). Everything gig-
// specific hangs off `gigSeries` / `gigSlots` / `gigResponses` (schema.ts).

import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdminProfile } from "../helpers";
import { notifyFollowers } from "../follows";
import { scheduleNotificationEmail } from "../emailHelpers";
import { slugifyTitle, resolveAvailableSlug } from "./stories";
import { assertCommunityMember } from "./communities";
import { validateBudgetDeclaration } from "./projects";
import { ruleOf, summarizeGig } from "./gigSummary";
import { can } from "./capabilities";
import { assertCanPure, getGardenUser } from "./entitlements";
import { escapeHtml } from "./projectTeam";
import {
  HORIZON_WEEKS,
  MAX_CLIPS,
  MAX_NOTE_LENGTH,
  PAID_METHODS,
  addDays,
  buildPayLinks,
  compareDates,
  expandOccurrences,
  formatSlotDate,
  formatTimeRange,
  isValidDate,
  isValidTimeZone,
  nextResponseAction,
  ruleHasDatesAfter,
  slotTimes,
  todayIn,
  validateSeriesRule,
  validateVenueName,
  type PaidMethod,
  type ResponseStatus,
  type SeriesRule,
} from "./gigRules";

type Ctx = QueryCtx | MutationCtx;

/** Slots from this far back still show on the schedule (a "played" date
 * the venue wants to mark paid). */
const RECENT_PAST_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SLOTS_ON_PAGE = 60;
const MAX_SLOTS_PER_RESPONSE = 26;

// ——————————————————————————————————————————————————————————————
// ctx helpers
// ——————————————————————————————————————————————————————————————

async function requireUser(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated", reason: "Sign in first." });
  return userId;
}

async function getProfile(ctx: Ctx, userId: Id<"users">): Promise<Doc<"profiles"> | null> {
  return ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

async function resolveImageUrl(ctx: Ctx, profile: Doc<"profiles"> | null): Promise<string | null> {
  if (!profile) return null;
  if (profile.imageStorageId) return await ctx.storage.getUrl(profile.imageStorageId);
  return profile.imageUrl || null;
}

async function resolvePerson(ctx: Ctx, userId: Id<"users"> | undefined) {
  if (!userId) return null;
  const profile = await getProfile(ctx, userId);
  if (!profile) return null;
  return {
    userId,
    profileId: profile._id,
    name: profile.name,
    imageUrl: await resolveImageUrl(ctx, profile),
    location: profile.location ?? null,
  };
}

async function requireSeries(ctx: Ctx, seriesId: Id<"gigSeries">): Promise<Doc<"gigSeries">> {
  const series = await ctx.db.get(seriesId);
  if (!series) throw new ConvexError({ code: "not_found", reason: "That gig isn't there." });
  return series;
}

async function requireSlot(ctx: Ctx, slotId: Id<"gigSlots">): Promise<Doc<"gigSlots">> {
  const slot = await ctx.db.get(slotId);
  if (!slot) throw new ConvexError({ code: "not_found", reason: "That date isn't there." });
  return slot;
}

async function requireProject(ctx: Ctx, projectId: Id<"projects">): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError({ code: "not_found", reason: "That project isn't there." });
  return project;
}

/** The venue (series.hostUserId) — or an operator — manages the series. */
async function assertHost(ctx: Ctx, series: Doc<"gigSeries">, userId: Id<"users">): Promise<void> {
  if (series.hostUserId === userId) return;
  const profile = await getProfile(ctx, userId);
  if (isAdminProfile(profile)) return;
  throw new ConvexError({ code: "forbidden", reason: "Only the venue that posted this can do that." });
}

async function isHostOrAdmin(ctx: Ctx, series: Doc<"gigSeries">, userId: Id<"users"> | null): Promise<boolean> {
  if (!userId) return false;
  if (series.hostUserId === userId) return true;
  return isAdminProfile(await getProfile(ctx, userId));
}

// Same block check projectTeam.ts / messaging.ts use — either direction.
async function assertNotBlocked(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<void> {
  const [byA, byB] = await Promise.all([
    ctx.db
      .query("blocks")
      .withIndex("by_blockerId", (q) => q.eq("blockerId", a))
      .collect(),
    ctx.db
      .query("blocks")
      .withIndex("by_blockedId", (q) => q.eq("blockedId", a))
      .collect(),
  ]);
  const blocked = byA.some((r) => r.blockedId === b) || byB.some((r) => r.blockerId === b);
  if (blocked) throw new ConvexError({ code: "blocked", reason: "That isn't possible right now." });
}

async function notify(
  ctx: MutationCtx,
  n: { userId: Id<"users">; type: string; title: string; message: string; linkUrl: string; relatedUserId?: Id<"users"> },
): Promise<void> {
  await ctx.db.insert("notifications", {
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    linkUrl: n.linkUrl,
    relatedUserId: n.relatedUserId,
    createdAt: Date.now(),
  });
}

function projectLink(projectId: Id<"projects">): string {
  return `/projects/${projectId}`;
}

function slotLabel(series: Doc<"gigSeries">, slot: Doc<"gigSlots">): string {
  return `${formatSlotDate(slot.date)} · ${formatTimeRange(series.startTime, series.endTime)}`;
}

// ——————————————————————————————————————————————————————————————
// Email copy (live-booking.md §10) — pure builders so gigEmails.test.ts
// can cover escaping and wording without Convex. venueName / gigTitle /
// artistName / note are user-typed and go through escapeHtml; date/time
// labels come from gigRules.ts formatters and don't need it.
// ——————————————————————————————————————————————————————————————

export function buildBookedEmail(input: {
  venueName: string;
  gigTitle: string;
  dateLabel: string;
  dateTimeLabel: string;
  linkUrl: string;
  hasPayout: boolean;
}): { subject: string; previewText: string; heading: string; body: string; ctaText: string; ctaUrl: string } {
  const venue = escapeHtml(input.venueName);
  const title = escapeHtml(input.gigTitle);
  const next = input.hasPayout ? "" : " Add how you get paid under Settings so the venue can pay you.";
  return {
    subject: `You're booked: ${input.gigTitle} on ${input.dateLabel}`,
    previewText: `${input.venueName} booked you for ${input.gigTitle} on ${input.dateLabel}.`,
    heading: "You're booked",
    body: `<strong>${venue}</strong> booked you for <strong>${title}</strong> on ${input.dateTimeLabel}.${next}`,
    ctaText: "See the date",
    ctaUrl: input.linkUrl,
  };
}

export function buildOfferedDatesEmail(input: {
  artistName: string;
  gigTitle: string;
  dateLabels: string[];
  note?: string;
  linkUrl: string;
}): { subject: string; previewText: string; heading: string; body: string; ctaText: string; ctaUrl: string } {
  const artist = escapeHtml(input.artistName);
  const title = escapeHtml(input.gigTitle);
  const datesText = input.dateLabels.join(", ");
  const trimmedNote = input.note?.trim();
  const noteBlock = trimmedNote ? `<br><br>"${escapeHtml(trimmedNote)}"` : "";
  const dateSentence = input.dateLabels.length
    ? `for <strong>${title}</strong>: ${escapeHtml(datesText)}.`
    : `for <strong>${title}</strong>.`;
  return {
    subject: `${input.artistName} offered dates for ${input.gigTitle}`,
    previewText: input.dateLabels.length
      ? `${input.artistName} can play ${datesText}.`
      : `${input.artistName} offered dates for ${input.gigTitle}.`,
    heading: `${artist} offered dates`,
    body: `<strong>${artist}</strong> can play ${dateSentence}${noteBlock}`,
    ctaText: "Review the offer",
    ctaUrl: input.linkUrl,
  };
}

export function buildCancelledEmail(input: {
  venueName: string;
  gigTitle: string;
  dateLabel: string;
  linkUrl: string;
}): { subject: string; previewText: string; heading: string; body: string; ctaText: string; ctaUrl: string } {
  const venue = escapeHtml(input.venueName);
  const title = escapeHtml(input.gigTitle);
  return {
    subject: `${input.venueName} cancelled ${input.dateLabel}`,
    previewText: "The venue cancelled that date. Your other dates aren't affected.",
    heading: "A date was cancelled",
    body: `<strong>${venue}</strong> cancelled <strong>${title}</strong> on ${input.dateLabel}. Your other dates aren't affected.`,
    ctaText: "See the gig",
    ctaUrl: input.linkUrl,
  };
}

export function buildArtistWithdrewEmail(input: {
  artistName: string;
  gigTitle: string;
  dateLabel: string;
  linkUrl: string;
}): { subject: string; previewText: string; heading: string; body: string; ctaText: string; ctaUrl: string } {
  const artist = escapeHtml(input.artistName);
  const title = escapeHtml(input.gigTitle);
  return {
    subject: `${input.artistName} can't make ${input.dateLabel}`,
    previewText: `${input.gigTitle} — that date is open again.`,
    heading: `${artist} withdrew`,
    body: `<strong>${artist}</strong> can no longer play <strong>${title}</strong> on ${input.dateLabel}. That date is open again.`,
    ctaText: "See the gig",
    ctaUrl: input.linkUrl,
  };
}

function validateNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new ConvexError({ code: "note_too_long", reason: `Keep the note under ${MAX_NOTE_LENGTH} characters.` });
  }
  return trimmed;
}

/** Every clip must be the responder's own portfolio piece. */
async function validateClips(ctx: Ctx, profileId: Id<"profiles">, clipIds: Id<"artifacts">[]): Promise<Id<"artifacts">[]> {
  const unique = [...new Set(clipIds.map(String))] as unknown as Id<"artifacts">[];
  if (unique.length > MAX_CLIPS) {
    throw new ConvexError({ code: "too_many_clips", reason: `Attach up to ${MAX_CLIPS} clips.` });
  }
  for (const id of unique) {
    const artifact = await ctx.db.get(id);
    if (!artifact || String(artifact.profileId) !== String(profileId)) {
      throw new ConvexError({ code: "bad_clip", reason: "Clips have to be pieces from your own portfolio." });
    }
  }
  return unique;
}

async function responsesForSlot(ctx: Ctx, slotId: Id<"gigSlots">, status: ResponseStatus): Promise<Doc<"gigResponses">[]> {
  return ctx.db
    .query("gigResponses")
    .withIndex("by_slotId_status", (q) => q.eq("slotId", slotId).eq("status", status))
    .collect();
}

async function anyResponseOnSlot(ctx: Ctx, slotId: Id<"gigSlots">): Promise<boolean> {
  const row = await ctx.db
    .query("gigResponses")
    .withIndex("by_slotId_status", (q) => q.eq("slotId", slotId))
    .first();
  return row !== null;
}

async function myResponse(ctx: Ctx, slotId: Id<"gigSlots">, userId: Id<"users">): Promise<Doc<"gigResponses"> | null> {
  return ctx.db
    .query("gigResponses")
    .withIndex("by_slotId_userId", (q) => q.eq("slotId", slotId).eq("userId", userId))
    .first();
}

/** Future slots of a series, any status, oldest first. */
async function futureSlots(ctx: Ctx, series: Doc<"gigSeries">, nowMs: number): Promise<Doc<"gigSlots">[]> {
  return ctx.db
    .query("gigSlots")
    .withIndex("by_projectId_startsAt", (q) => q.eq("projectId", series.projectId).gte("startsAt", nowMs))
    .collect();
}

/** Opens every date the rule lands on from today through the horizon that
 * doesn't already have a slot. Idempotent — safe from create, from edits,
 * and from the daily cron. Returns how many were opened. */
async function materializeSeries(ctx: MutationCtx, series: Doc<"gigSeries">, nowMs: number): Promise<number> {
  const rule = ruleOf(series);
  const today = todayIn(rule.timeZone, nowMs);
  const through = addDays(today, HORIZON_WEEKS * 7);
  const wanted = expandOccurrences(rule, today, through);
  const existing = await ctx.db
    .query("gigSlots")
    .withIndex("by_seriesId_date", (q) => q.eq("seriesId", series._id).gte("date", today))
    .collect();
  const have = new Set(existing.map((s) => s.date));
  let opened = 0;
  for (const date of wanted) {
    if (have.has(date)) continue;
    const { startsAt, endsAt } = slotTimes(rule, date);
    if (endsAt <= nowMs) continue; // today's date, already over
    await ctx.db.insert("gigSlots", {
      seriesId: series._id,
      projectId: series.projectId,
      date,
      startsAt,
      endsAt,
      status: "open",
      createdAt: nowMs,
    });
    opened++;
  }
  await ctx.db.patch(series._id, { materializedThrough: through, updatedAt: nowMs });
  return opened;
}

/** Future open dates the venue no longer wants: a date nobody has answered
 * simply goes away; one with responses is cancelled so the people who
 * offered can see it's off. Booked dates are never touched here. */
async function dropFutureOpenSlots(
  ctx: MutationCtx,
  series: Doc<"gigSeries">,
  nowMs: number,
  keep: (slot: Doc<"gigSlots">) => boolean,
): Promise<void> {
  const slots = await futureSlots(ctx, series, nowMs);
  for (const slot of slots) {
    if (slot.status !== "open" || keep(slot)) continue;
    if (await anyResponseOnSlot(ctx, slot._id)) {
      await ctx.db.patch(slot._id, { status: "cancelled", cancelledAt: nowMs });
    } else {
      await ctx.db.delete(slot._id);
    }
  }
}

const locationArgs = {
  location: v.optional(v.string()),
  locationType: v.optional(v.string()),
  address: v.optional(
    v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    }),
  ),
  coordinates: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  placeId: v.optional(v.string()),
};

const ruleArgs = {
  weekdays: v.array(v.number()),
  intervalWeeks: v.number(),
  startDate: v.string(),
  endMode: v.string(),
  endDate: v.optional(v.string()),
  count: v.optional(v.number()),
  startTime: v.string(),
  endTime: v.string(),
  timeZone: v.string(),
};

function ruleFromArgs(args: {
  weekdays: number[];
  intervalWeeks: number;
  startDate: string;
  endMode: string;
  endDate?: string;
  count?: number;
  startTime: string;
  endTime: string;
  timeZone: string;
}): SeriesRule {
  return {
    weekdays: args.weekdays,
    intervalWeeks: args.intervalWeeks,
    startDate: args.startDate,
    endMode: args.endMode as SeriesRule["endMode"],
    endDate: args.endMode === "until" ? args.endDate : undefined,
    count: args.endMode === "count" ? args.count : undefined,
    startTime: args.startTime,
    endTime: args.endTime,
    timeZone: args.timeZone,
  };
}

// ——————————————————————————————————————————————————————————————
// Venue side
// ——————————————————————————————————————————————————————————————

/** Post a recurring paid gig. Creates the paid project and the series,
 * opens the first HORIZON_WEEKS of dates. Free to post, same as
 * createPaidProject (garden/projects.ts) — the reconcile pass decides any
 * seat gate for both in one place. */
export const createGigSeries = mutation({
  args: {
    title: v.string(),
    blurb: v.optional(v.string()),
    venueName: v.optional(v.string()),
    // Per date. Same four states as createPaidProject.
    budgetType: v.string(),
    budget: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    interests: v.optional(v.array(v.string())),
    hostOrgId: v.optional(v.id("hostOrgs")),
    ...locationArgs,
    ...ruleArgs,
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();

    const title = args.title.trim();
    if (!title) throw new ConvexError({ code: "invalid_title", reason: "Give it a title." });
    const budgetError = validateBudgetDeclaration(args);
    if (budgetError) throw new ConvexError(budgetError);
    if (!args.location?.trim()) {
      throw new ConvexError({ code: "invalid_location", reason: "A gig happens somewhere — pick the venue's location." });
    }
    if (!isValidTimeZone(args.timeZone)) {
      throw new ConvexError({ code: "invalid_time_zone", reason: "That time zone isn't one we know." });
    }
    const rule = ruleFromArgs(args);
    const ruleError = validateSeriesRule(rule, todayIn(rule.timeZone, now));
    if (ruleError) throw new ConvexError(ruleError);
    if (args.hostOrgId) await assertCommunityMember(ctx, args.hostOrgId, userId);

    const storySlug = await resolveAvailableSlug(slugifyTitle(title), async (candidate) => {
      const hit = await ctx.db
        .query("projects")
        .withIndex("by_storySlug", (q) => q.eq("storySlug", candidate))
        .unique();
      return hit !== null;
    });

    const projectId = await ctx.db.insert("projects", {
      userId,
      kind: "paid",
      origin: "posted",
      title,
      blurb: args.blurb?.trim() || undefined,
      budgetType: args.budgetType,
      budget: args.budget,
      budgetMax: args.budgetMax,
      status: "active",
      stage: "forming",
      stageChangedAt: now,
      storySlug,
      interests: args.interests,
      hostOrgId: args.hostOrgId,
      location: args.location,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      remote: false,
      createdAt: now,
      updatedAt: now,
    });

    const seriesId = await ctx.db.insert("gigSeries", {
      projectId,
      hostUserId: userId,
      venueName: validateVenueName(args.venueName),
      timeZone: rule.timeZone,
      startTime: rule.startTime,
      endTime: rule.endTime,
      weekdays: [...rule.weekdays].sort((a, b) => a - b),
      intervalWeeks: rule.intervalWeeks,
      startDate: rule.startDate,
      endMode: rule.endMode,
      endDate: rule.endDate,
      count: rule.count,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    const series = (await ctx.db.get(seriesId))!;
    const opened = await materializeSeries(ctx, series, now);

    // Same follower fan-out createPaidProject does (following.md §1 #5).
    const profile = await getProfile(ctx, userId);
    await notifyFollowers(ctx, userId, {
      type: "followed_posted_project",
      title: `${profile?.name || "Someone"} posted ${title}`,
      message: "",
      linkUrl: projectLink(projectId),
    });

    return { projectId, seriesId, storySlug, slotsOpened: opened };
  },
});

/** Venue edits the time of day, the venue name, or how the series ends.
 * Changing the days of the week isn't offered — end this series and post
 * a new one; every response is tied to a specific date. A time change
 * moves every future date, booked ones included, and tells the artists. */
export const updateGigSeries = mutation({
  args: {
    seriesId: v.id("gigSeries"),
    venueName: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    endMode: v.optional(v.string()),
    endDate: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const series = await requireSeries(ctx, args.seriesId);
    await assertHost(ctx, series, userId);
    if (series.status === "ended") {
      throw new ConvexError({ code: "series_ended", reason: "This series has ended. Post a new one." });
    }
    const now = Date.now();
    const rule: SeriesRule = {
      ...ruleOf(series),
      startTime: args.startTime ?? series.startTime,
      endTime: args.endTime ?? series.endTime,
      endMode: (args.endMode ?? series.endMode) as SeriesRule["endMode"],
      endDate: args.endMode ? (args.endMode === "until" ? args.endDate : undefined) : series.endDate,
      count: args.endMode ? (args.endMode === "count" ? args.count : undefined) : series.count,
    };
    // `today` is the series' own start date here: the start-in-the-past
    // rule is for new series, not for one that has been running a month.
    const ruleError = validateSeriesRule(rule, series.startDate);
    if (ruleError) throw new ConvexError(ruleError);

    const timesChanged = rule.startTime !== series.startTime || rule.endTime !== series.endTime;
    const endChanged = rule.endMode !== series.endMode || rule.endDate !== series.endDate || rule.count !== series.count;

    await ctx.db.patch(series._id, {
      venueName: args.venueName !== undefined ? validateVenueName(args.venueName) : series.venueName,
      startTime: rule.startTime,
      endTime: rule.endTime,
      endMode: rule.endMode,
      endDate: rule.endDate,
      count: rule.count,
      updatedAt: now,
    });
    const updated = (await ctx.db.get(series._id))!;
    const project = await requireProject(ctx, series.projectId);

    if (timesChanged) {
      const slots = await futureSlots(ctx, updated, now);
      for (const slot of slots) {
        if (slot.status === "cancelled") continue;
        const { startsAt, endsAt } = slotTimes(rule, slot.date);
        await ctx.db.patch(slot._id, { startsAt, endsAt });
        if (slot.status === "booked" && slot.bookedUserId) {
          await notify(ctx, {
            userId: slot.bookedUserId,
            type: "gig_time_changed",
            title: `New time for ${project.title}`,
            message: `${formatSlotDate(slot.date)} is now ${formatTimeRange(rule.startTime, rule.endTime)}.`,
            linkUrl: projectLink(project._id),
            relatedUserId: userId,
          });
        }
      }
    }

    if (endChanged) {
      const today = todayIn(rule.timeZone, now);
      const allowed = new Set(expandOccurrences(rule, today, addDays(today, 366 * 3)));
      await dropFutureOpenSlots(ctx, updated, now, (slot) => allowed.has(slot.date));
    }

    const opened = await materializeSeries(ctx, updated, now);
    return { ok: true as const, slotsOpened: opened };
  },
});

/** open → taking responses · paused → visible, no new responses · ended →
 * future open dates dropped, booked dates kept. */
export const setSeriesStatus = mutation({
  args: { seriesId: v.id("gigSeries"), status: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const series = await requireSeries(ctx, args.seriesId);
    await assertHost(ctx, series, userId);
    if (args.status !== "open" && args.status !== "paused" && args.status !== "ended") {
      throw new ConvexError({ code: "invalid_status", reason: "Open, paused, or ended." });
    }
    if (series.status === "ended") {
      throw new ConvexError({ code: "series_ended", reason: "An ended series stays ended. Post a new one." });
    }
    if (series.status === args.status) return { ok: true as const, changed: false as const };
    const now = Date.now();
    await ctx.db.patch(series._id, { status: args.status, updatedAt: now });
    if (args.status === "ended") {
      await dropFutureOpenSlots(ctx, series, now, () => false);
    } else if (args.status === "open") {
      await materializeSeries(ctx, (await ctx.db.get(series._id))!, now);
    }
    return { ok: true as const, changed: true as const };
  },
});

/** One extra date outside the rule (a New Year's Eve show on a Thursday).
 * Uses the series' own times. A cancelled date on that day reopens. */
export const addSlot = mutation({
  args: { seriesId: v.id("gigSeries"), date: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const series = await requireSeries(ctx, args.seriesId);
    await assertHost(ctx, series, userId);
    if (series.status === "ended") {
      throw new ConvexError({ code: "series_ended", reason: "This series has ended." });
    }
    if (!isValidDate(args.date)) throw new ConvexError({ code: "invalid_date", reason: "Pick a real date." });
    const now = Date.now();
    const today = todayIn(series.timeZone, now);
    if (compareDates(args.date, today) < 0) {
      throw new ConvexError({ code: "invalid_date", reason: "That date has passed." });
    }
    const existing = await ctx.db
      .query("gigSlots")
      .withIndex("by_seriesId_date", (q) => q.eq("seriesId", series._id).eq("date", args.date))
      .first();
    const { startsAt, endsAt } = slotTimes(ruleOf(series), args.date);
    if (endsAt <= now) throw new ConvexError({ code: "invalid_date", reason: "That set time has already passed." });
    if (existing) {
      if (existing.status !== "cancelled") {
        throw new ConvexError({ code: "duplicate_date", reason: "That date is already on the schedule." });
      }
      await ctx.db.patch(existing._id, {
        status: "open",
        startsAt,
        endsAt,
        cancelledAt: undefined,
        bookedUserId: undefined,
        bookedResponseId: undefined,
        bookedAt: undefined,
      });
      return { ok: true as const, slotId: existing._id };
    }
    const slotId = await ctx.db.insert("gigSlots", {
      seriesId: series._id,
      projectId: series.projectId,
      date: args.date,
      startsAt,
      endsAt,
      status: "open",
      createdAt: now,
    });
    return { ok: true as const, slotId };
  },
});

/** Venue drops one date. A booked artist is told; their response row keeps
 * its "booked" status as the record of what was agreed. */
export const cancelSlot = mutation({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    const series = await requireSeries(ctx, slot.seriesId);
    await assertHost(ctx, series, userId);
    if (slot.status === "cancelled") return { ok: true as const, changed: false as const };
    const now = Date.now();
    const hadResponses = await anyResponseOnSlot(ctx, slot._id);
    if (slot.status === "open" && !hadResponses) {
      await ctx.db.delete(slot._id);
      return { ok: true as const, changed: true as const, deleted: true as const };
    }
    await ctx.db.patch(slot._id, { status: "cancelled", cancelledAt: now });
    if (slot.status === "booked" && slot.bookedUserId) {
      const project = await requireProject(ctx, series.projectId);
      await notify(ctx, {
        userId: slot.bookedUserId,
        type: "gig_cancelled",
        title: `${formatSlotDate(slot.date)} at ${series.venueName ?? project.title} is off`,
        message: "The venue cancelled that date. Your other dates aren't affected.",
        linkUrl: projectLink(project._id),
        relatedUserId: userId,
      });
      await scheduleNotificationEmail(ctx, {
        userId: slot.bookedUserId,
        category: "activity",
        ...buildCancelledEmail({
          venueName: series.venueName ?? project.title,
          gigTitle: project.title,
          dateLabel: formatSlotDate(slot.date),
          linkUrl: projectLink(project._id),
        }),
      });
    }
    return { ok: true as const, changed: true as const, deleted: false as const };
  },
});

/** Venue puts a cancelled date back, open again. */
export const reopenSlot = mutation({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    const series = await requireSeries(ctx, slot.seriesId);
    await assertHost(ctx, series, userId);
    if (slot.status !== "cancelled") return { ok: true as const, changed: false as const };
    if (slot.endsAt <= Date.now()) throw new ConvexError({ code: "in_past", reason: "That date has passed." });
    if (slot.bookedResponseId) {
      const resp = await ctx.db.get(slot.bookedResponseId);
      if (resp && resp.status === "booked") await ctx.db.patch(resp._id, { status: "available", updatedAt: Date.now() });
    }
    await ctx.db.patch(slot._id, {
      status: "open",
      cancelledAt: undefined,
      bookedUserId: undefined,
      bookedResponseId: undefined,
      bookedAt: undefined,
    });
    return { ok: true as const, changed: true as const };
  },
});

/** Venue picks who plays a date. */
export const bookSlot = mutation({
  args: { slotId: v.id("gigSlots"), responseId: v.id("gigResponses") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    const series = await requireSeries(ctx, slot.seriesId);
    await assertHost(ctx, series, userId);
    if (slot.status !== "open") {
      throw new ConvexError({
        code: "slot_unavailable",
        reason: slot.status === "booked" ? "That date is already booked." : "That date was cancelled.",
      });
    }
    const now = Date.now();
    if (slot.endsAt <= now) throw new ConvexError({ code: "in_past", reason: "That date has passed." });
    const response = await ctx.db.get(args.responseId);
    if (!response || String(response.slotId) !== String(slot._id)) {
      throw new ConvexError({ code: "not_found", reason: "That response isn't for this date." });
    }
    if (response.status !== "available") {
      throw new ConvexError({ code: "response_unavailable", reason: "They're no longer available for that date." });
    }
    await assertNotBlocked(ctx, userId, response.userId);

    await ctx.db.patch(slot._id, {
      status: "booked",
      bookedUserId: response.userId,
      bookedResponseId: response._id,
      bookedAt: now,
    });
    await ctx.db.patch(response._id, { status: "booked", updatedAt: now });

    const project = await requireProject(ctx, series.projectId);
    const artist = await getProfile(ctx, response.userId);
    const hasPayout = !!artist?.payoutHandles && Object.values(artist.payoutHandles).some(Boolean);
    await notify(ctx, {
      userId: response.userId,
      type: "gig_booked",
      title: `You're booked: ${series.venueName ?? project.title}`,
      message: `${slotLabel(series, slot)}.${hasPayout ? "" : " Add how you get paid under Settings so the venue can pay you."}`,
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    await scheduleNotificationEmail(ctx, {
      userId: response.userId,
      category: "activity",
      ...buildBookedEmail({
        venueName: series.venueName ?? project.title,
        gigTitle: project.title,
        dateLabel: formatSlotDate(slot.date),
        dateTimeLabel: slotLabel(series, slot),
        linkUrl: projectLink(project._id),
        hasPayout,
      }),
    });
    return { ok: true as const };
  },
});

/** Venue takes a booking back; the date reopens and the artist is told. */
export const unbookSlot = mutation({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    const series = await requireSeries(ctx, slot.seriesId);
    await assertHost(ctx, series, userId);
    if (slot.status !== "booked" || !slot.bookedUserId) return { ok: true as const, changed: false as const };
    const now = Date.now();
    if (slot.bookedResponseId) {
      const resp = await ctx.db.get(slot.bookedResponseId);
      if (resp) await ctx.db.patch(resp._id, { status: "available", updatedAt: now });
    }
    await ctx.db.patch(slot._id, {
      status: "open",
      bookedUserId: undefined,
      bookedResponseId: undefined,
      bookedAt: undefined,
    });
    const project = await requireProject(ctx, series.projectId);
    await notify(ctx, {
      userId: slot.bookedUserId,
      type: "gig_unbooked",
      title: `${formatSlotDate(slot.date)} at ${series.venueName ?? project.title} changed`,
      message: "The venue reopened that date. You're still listed as available for it.",
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const, changed: true as const };
  },
});

/** Venue records that they paid the artist directly (plan §3: the platform
 * records it and takes nothing). The artist confirms it landed. */
export const markSlotPaid = mutation({
  args: { slotId: v.id("gigSlots"), amountCents: v.number(), method: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    const series = await requireSeries(ctx, slot.seriesId);
    await assertHost(ctx, series, userId);
    if (!slot.bookedUserId) throw new ConvexError({ code: "not_booked", reason: "Nobody is booked on that date." });
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
      throw new ConvexError({ code: "invalid_amount", reason: "A real amount bigger than zero." });
    }
    if (!(PAID_METHODS as string[]).includes(args.method)) {
      throw new ConvexError({ code: "invalid_method", reason: "Say how you paid." });
    }
    const now = Date.now();
    await ctx.db.patch(slot._id, {
      paidAmountCents: args.amountCents,
      paidMethod: args.method as PaidMethod,
      paidAt: now,
      paidConfirmedAt: undefined,
    });
    const project = await requireProject(ctx, series.projectId);
    await notify(ctx, {
      userId: slot.bookedUserId,
      type: "gig_paid",
      title: `${series.venueName ?? project.title} marked ${formatSlotDate(slot.date)} paid`,
      message: `$${(args.amountCents / 100).toLocaleString("en-US")} via ${args.method}. Confirm it once it lands.`,
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const };
  },
});

export const confirmSlotPaid = mutation({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    if (String(slot.bookedUserId) !== String(userId)) {
      throw new ConvexError({ code: "forbidden", reason: "Only the artist who played can confirm." });
    }
    if (!slot.paidAt) throw new ConvexError({ code: "not_paid", reason: "The venue hasn't marked this paid yet." });
    if (slot.paidConfirmedAt) return { ok: true as const, changed: false as const };
    const now = Date.now();
    await ctx.db.patch(slot._id, { paidConfirmedAt: now });
    const series = await requireSeries(ctx, slot.seriesId);
    const project = await requireProject(ctx, series.projectId);
    const artist = await getProfile(ctx, userId);
    await notify(ctx, {
      userId: series.hostUserId,
      type: "gig_paid_confirmed",
      title: `${artist?.name ?? "The artist"} confirmed payment for ${formatSlotDate(slot.date)}`,
      message: project.title,
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const, changed: true as const };
  },
});

// ——————————————————————————————————————————————————————————————
// Artist side
// ——————————————————————————————————————————————————————————————

/** "I can play these dates." One submission, one row per date; the note
 * and clips ride on every row. Re-submitting a date you already offered
 * updates its note and clips; a withdrawn date comes back. */
export const respondAvailable = mutation({
  args: {
    seriesId: v.id("gigSeries"),
    slotIds: v.array(v.id("gigSlots")),
    note: v.optional(v.string()),
    clipIds: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new ConvexError({ code: "no_profile", reason: "Finish your profile first." });
    const series = await requireSeries(ctx, args.seriesId);
    if (series.hostUserId === userId) {
      throw new ConvexError({ code: "forbidden", reason: "You posted this gig." });
    }
    if (series.status !== "open") {
      throw new ConvexError({
        code: "series_closed",
        reason: series.status === "paused" ? "This gig isn't taking responses right now." : "This gig has ended.",
      });
    }
    if (args.slotIds.length === 0) throw new ConvexError({ code: "no_dates", reason: "Pick at least one date." });
    if (args.slotIds.length > MAX_SLOTS_PER_RESPONSE) {
      throw new ConvexError({ code: "too_many_dates", reason: `Up to ${MAX_SLOTS_PER_RESPONSE} dates at a time.` });
    }
    // The gate (docs/features/live-booking.md §8): free to look, membership
    // to respond. Same denial anatomy every other enforced capability throws.
    assertCanPure(await getGardenUser(ctx, userId), "gig.respond");
    await assertNotBlocked(ctx, userId, series.hostUserId);
    const note = validateNote(args.note);
    const clipIds = await validateClips(ctx, profile._id, args.clipIds);
    const now = Date.now();

    let added = 0;
    let updated = 0;
    let firstDate: string | null = null;
    const addedDates: string[] = [];
    const seen = new Set<string>();
    for (const slotId of args.slotIds) {
      if (seen.has(String(slotId))) continue;
      seen.add(String(slotId));
      const slot = await ctx.db.get(slotId);
      if (!slot || String(slot.seriesId) !== String(series._id)) {
        throw new ConvexError({ code: "not_found", reason: "One of those dates isn't on this gig." });
      }
      if (slot.status !== "open" || slot.endsAt <= now) {
        throw new ConvexError({ code: "slot_unavailable", reason: `${formatSlotDate(slot.date)} isn't open any more.` });
      }
      const existing = await myResponse(ctx, slot._id, userId);
      const action = nextResponseAction(existing?.status as ResponseStatus | undefined);
      if (action === "create") {
        await ctx.db.insert("gigResponses", {
          slotId: slot._id,
          seriesId: series._id,
          projectId: series.projectId,
          userId,
          profileId: profile._id,
          status: "available",
          note,
          clipIds,
          createdAt: now,
          updatedAt: now,
        });
        added++;
        addedDates.push(slot.date);
      } else if (action === "reactivate") {
        await ctx.db.patch(existing!._id, { status: "available", note, clipIds, updatedAt: now });
        added++;
        addedDates.push(slot.date);
      } else if (existing && existing.status === "available") {
        await ctx.db.patch(existing._id, { note, clipIds, updatedAt: now });
        updated++;
      }
      if (!firstDate || compareDates(slot.date, firstDate) < 0) firstDate = slot.date;
    }

    if (added > 0) {
      const project = await requireProject(ctx, series.projectId);
      await notify(ctx, {
        userId: series.hostUserId,
        type: "gig_response",
        title: `${profile.name} can play ${added === 1 ? formatSlotDate(firstDate!) : `${added} dates`}`,
        message: `${project.title}${note ? ` — "${note.slice(0, 120)}"` : ""}`,
        linkUrl: projectLink(project._id),
        relatedUserId: userId,
      });
      await scheduleNotificationEmail(ctx, {
        userId: series.hostUserId,
        category: "activity",
        ...buildOfferedDatesEmail({
          artistName: profile.name,
          gigTitle: project.title,
          dateLabels: [...addedDates].sort(compareDates).map(formatSlotDate),
          note,
          linkUrl: projectLink(project._id),
        }),
      });
    }
    return { ok: true as const, added, updated };
  },
});

/** Artist takes a date back. If they were booked on it, the date reopens
 * and the venue is told — life happens, and a silent no-show is worse. */
export const withdrawResponse = mutation({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const slot = await requireSlot(ctx, args.slotId);
    const existing = await myResponse(ctx, slot._id, userId);
    if (!existing || existing.status === "withdrawn") return { ok: true as const, changed: false as const };
    const now = Date.now();
    const wasBooked = existing.status === "booked" && String(slot.bookedUserId) === String(userId) && slot.status === "booked";
    await ctx.db.patch(existing._id, { status: "withdrawn", updatedAt: now });
    if (wasBooked) {
      await ctx.db.patch(slot._id, {
        status: "open",
        bookedUserId: undefined,
        bookedResponseId: undefined,
        bookedAt: undefined,
      });
      const series = await requireSeries(ctx, slot.seriesId);
      const project = await requireProject(ctx, series.projectId);
      const profile = await getProfile(ctx, userId);
      await notify(ctx, {
        userId: series.hostUserId,
        type: "gig_artist_withdrew",
        title: `${profile?.name ?? "Your artist"} can't make ${formatSlotDate(slot.date)}`,
        message: `${project.title} — that date is open again.`,
        linkUrl: projectLink(project._id),
        relatedUserId: userId,
      });
      await scheduleNotificationEmail(ctx, {
        userId: series.hostUserId,
        category: "activity",
        ...buildArtistWithdrewEmail({
          artistName: profile?.name ?? "Your artist",
          gigTitle: project.title,
          dateLabel: formatSlotDate(slot.date),
          linkUrl: projectLink(project._id),
        }),
      });
    }
    return { ok: true as const, changed: true as const, wasBooked };
  },
});

// ——————————————————————————————————————————————————————————————
// Reads
// ——————————————————————————————————————————————————————————————

/** The schedule on the project page — every date from two weeks back
 * through the horizon, with what the viewer is allowed to know about each.
 * Null for a project that isn't a gig. */
export const getSchedule = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const series = await ctx.db
      .query("gigSeries")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();
    if (!series) return null;
    const now = Date.now();
    const isHost = await isHostOrAdmin(ctx, series, userId);
    const viewerProfile = userId ? await getProfile(ctx, userId) : null;
    // Whether this viewer may respond, decided by the same can() the
    // mutation enforces — so the UI never offers a checkbox the server
    // would refuse, and the denial text on the page is the server's own.
    const respond =
      userId && !isHost ? can(await getGardenUser(ctx, userId), "gig.respond") : { allowed: false as const };

    const rows = await ctx.db
      .query("gigSlots")
      .withIndex("by_projectId_startsAt", (q) => q.eq("projectId", args.projectId).gte("startsAt", now - RECENT_PAST_MS))
      .take(MAX_SLOTS_ON_PAGE);

    const slots = [];
    for (const slot of rows) {
      const available = await responsesForSlot(ctx, slot._id, "available");
      const booked = await resolvePerson(ctx, slot.bookedUserId);
      const mine = userId ? await myResponse(ctx, slot._id, userId) : null;
      const isBookedArtist = !!userId && String(slot.bookedUserId) === String(userId);
      slots.push({
        slotId: slot._id,
        date: slot.date,
        dateLabel: formatSlotDate(slot.date),
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: slot.status as "open" | "booked" | "cancelled",
        isPast: slot.endsAt <= now,
        availableCount: available.length,
        booked: booked ? { profileId: booked.profileId, name: booked.name, imageUrl: booked.imageUrl } : null,
        mine: mine ? (mine.status as ResponseStatus) : null,
        // Payment state is between the venue and the artist only.
        payment:
          isHost || isBookedArtist
            ? {
                amountCents: slot.paidAmountCents ?? null,
                method: slot.paidMethod ?? null,
                paidAt: slot.paidAt ?? null,
                confirmedAt: slot.paidConfirmedAt ?? null,
              }
            : null,
      });
    }

    const rule = ruleOf(series);
    const summary = await summarizeGig(ctx, args.projectId, now);
    return {
      seriesId: series._id,
      status: series.status as "open" | "paused" | "ended",
      venueName: series.venueName ?? null,
      rule,
      timeRange: formatTimeRange(rule.startTime, rule.endTime),
      cadence: summary?.cadence ?? "",
      schedule: summary?.schedule ?? "",
      ends: summary?.ends ?? "",
      openCount: summary?.openCount ?? 0,
      viewer: {
        isSignedIn: !!userId,
        isHost,
        hasProfile: !!viewerProfile,
        hasPayoutHandles: !!viewerProfile?.payoutHandles && Object.values(viewerProfile.payoutHandles).some(Boolean),
        canRespond: respond.allowed,
        respondDenial: respond.allowed
          ? null
          : { reason: respond.reason ?? "Responding to a gig takes membership.", upgradePath: respond.upgradePath ?? null },
      },
      slots,
    };
  },
});

/** Venue only: who offered to play a date, with their clips ready to play. */
export const listResponders = query({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const slot = await ctx.db.get(args.slotId);
    if (!slot) return [];
    const series = await requireSeries(ctx, slot.seriesId);
    if (!(await isHostOrAdmin(ctx, series, userId))) return [];

    const rows = [
      ...(await responsesForSlot(ctx, slot._id, "booked")),
      ...(await responsesForSlot(ctx, slot._id, "available")),
    ];
    rows.sort((a, b) => a.createdAt - b.createdAt);

    const out = [];
    for (const r of rows) {
      const person = await resolvePerson(ctx, r.userId);
      if (!person) continue;
      const clips = [];
      for (const id of r.clipIds) {
        const a = await ctx.db.get(id);
        if (!a) continue;
        clips.push({
          artifactId: a._id,
          type: a.type,
          title: a.title ?? null,
          mediaUrl: a.mediaStorageId ? await ctx.storage.getUrl(a.mediaStorageId) : (a.mediaUrl ?? null),
          linkUrl: a.mediaUrl ?? null,
          ogImageUrl: a.ogImageUrl ?? null,
        });
      }
      // How many other dates on this series they're already booked for —
      // a venue building a rotation wants to know.
      const theirRows = await ctx.db
        .query("gigResponses")
        .withIndex("by_seriesId_userId", (q) => q.eq("seriesId", series._id).eq("userId", r.userId))
        .collect();
      out.push({
        responseId: r._id,
        status: r.status as ResponseStatus,
        profileId: person.profileId,
        userId: r.userId,
        name: person.name,
        imageUrl: person.imageUrl,
        location: person.location,
        note: r.note ?? null,
        clips,
        bookedElsewhereCount: theirRows.filter((x) => x.status === "booked" && String(x.slotId) !== String(slot._id)).length,
        respondedAt: r.createdAt,
      });
    }
    return out;
  },
});

/** Venue or the booked artist: how to pay, and what's been recorded. */
export const getSlotPayment = query({
  args: { slotId: v.id("gigSlots") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const slot = await ctx.db.get(args.slotId);
    if (!slot || !slot.bookedUserId) return null;
    const series = await requireSeries(ctx, slot.seriesId);
    const isHost = await isHostOrAdmin(ctx, series, userId);
    const isArtist = String(slot.bookedUserId) === String(userId);
    if (!isHost && !isArtist) return null;

    const project = await requireProject(ctx, series.projectId);
    const artist = await getProfile(ctx, slot.bookedUserId);
    const amountDollars = project.budgetType === "amount" && project.budget ? project.budget : null;
    const note = `${series.venueName ?? project.title} · ${formatSlotDate(slot.date)}`;
    return {
      isHost,
      artistName: artist?.name ?? "The artist",
      amountDollars,
      links: buildPayLinks(artist?.payoutHandles, amountDollars ?? undefined, note),
      paidAmountCents: slot.paidAmountCents ?? null,
      paidMethod: slot.paidMethod ?? null,
      paidAt: slot.paidAt ?? null,
      paidConfirmedAt: slot.paidConfirmedAt ?? null,
    };
  },
});

/** The signed-in artist's own dates across every gig: booked and offered,
 * upcoming first. For the settings page. */
export const listMyGigs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const rows = [
      ...(await ctx.db
        .query("gigResponses")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "booked"))
        .collect()),
      ...(await ctx.db
        .query("gigResponses")
        .withIndex("by_userId_status", (q) => q.eq("userId", userId).eq("status", "available"))
        .collect()),
    ];
    const out = [];
    for (const r of rows) {
      const slot = await ctx.db.get(r.slotId);
      if (!slot || slot.endsAt < now - RECENT_PAST_MS) continue;
      const series = await ctx.db.get(r.seriesId);
      const project = await ctx.db.get(r.projectId);
      if (!series || !project) continue;
      out.push({
        slotId: slot._id,
        projectId: project._id,
        title: project.title,
        venueName: series.venueName ?? null,
        date: slot.date,
        dateLabel: formatSlotDate(slot.date),
        timeRange: formatTimeRange(series.startTime, series.endTime),
        startsAt: slot.startsAt,
        slotStatus: slot.status,
        mine: r.status as ResponseStatus,
        paidAt: r.status === "booked" ? (slot.paidAt ?? null) : null,
        paidConfirmedAt: r.status === "booked" ? (slot.paidConfirmedAt ?? null) : null,
      });
    }
    out.sort((a, b) => a.startsAt - b.startsAt);
    return out;
  },
});

// ——————————————————————————————————————————————————————————————
// Cron — keeps every open series stocked with dates HORIZON_WEEKS ahead,
// and closes a finite one that has nothing left. Idempotent.
// ——————————————————————————————————————————————————————————————

export const extendGigSeries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const open = await ctx.db
      .query("gigSeries")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    let opened = 0;
    let ended = 0;
    for (const series of open) {
      const rule = ruleOf(series);
      const today = todayIn(rule.timeZone, now);
      opened += await materializeSeries(ctx, series, now);
      if (!ruleHasDatesAfter(rule, today)) {
        const remaining = (await futureSlots(ctx, series, now)).some((s) => s.status !== "cancelled");
        if (!remaining) {
          await ctx.db.patch(series._id, { status: "ended", updatedAt: now });
          ended++;
        }
      }
    }
    return { series: open.length, opened, ended };
  },
});
