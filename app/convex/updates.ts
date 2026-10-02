// Updates (docs/features/desk-updates.md) — short cards an admin writes that
// sit on a member's desk until that person has read them.
//
// An Update is stored once with an audience rule; each person's state lives
// in `updateReads`, written on first touch. That is what lets someone who
// joins next week still see the Welcome card. "Send it now" is only the pipe
// that pulls people back: one notification and one email per person, in
// scheduled batches of 50 (announcements.ts's fan-out shape, minus the
// recipient rows — the audience is walked with a cursor instead).
//
// Conventions follow announcements.ts: getAuthUserId from
// @convex-dev/auth/server, ConvexError with a plain {code, reason} payload.

import { v, ConvexError } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers";
import { scheduleNotificationEmail } from "./emailHelpers";
import { escapeHtml } from "./email/template";

// ——————————————————————————————————————————————————————————————
// Limits and the pure rules
// ——————————————————————————————————————————————————————————————

export const TITLE_MAX = 80;
export const BODY_MAX = 600;
export const ACTION_LABEL_MAX = 24;
export const NEW_FOR_DAYS_DEFAULT = 14;
export const NEW_FOR_DAYS_MIN = 1;
export const NEW_FOR_DAYS_MAX = 90;
/** People per scheduled delivery batch (same cadence as the other fan-outs). */
export const SEND_BATCH_SIZE = 50;
/** The notification's message is the body cut to about this many characters. */
export const NOTIFICATION_MESSAGE_MAX = 140;

const DAY_MS = 24 * 60 * 60 * 1000;

type Audience = "everyone" | "community" | "new";
type UpdateStatus = "draft" | "published" | "archived";

const audienceValidator = v.union(v.literal("everyone"), v.literal("community"), v.literal("new"));
const statusValidator = v.union(v.literal("draft"), v.literal("published"), v.literal("archived"));

/** What a handler throws: ConvexError needs a plain object, so a `type`. */
type UpdateErrorPayload = { code: string; reason: string };

function fail(code: string, reason: string): never {
  const payload: UpdateErrorPayload = { code, reason };
  throw new ConvexError(payload);
}

/** An in-app path ("/events/…", not "//host") or an https:// link. */
export function isValidActionUrl(url: string): boolean {
  if (/\s/.test(url)) return false;
  if (/^\/(?![/\\])/.test(url)) return true;
  // The host must start right after "https://" (URL() would quietly turn
  // "https:///x" into "https://x/").
  if (!/^https:\/\/[^/?#\\@]/i.test(url)) return false;
  try {
    return new URL(url).hostname.length > 0;
  } catch {
    return false;
  }
}

export type UpdateFieldsInput = {
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  audience: Audience;
  hostOrgId?: Id<"hostOrgs">;
  newForDays?: number;
  startsAt: number;
  endsAt?: number;
  order: number;
};

export type CleanUpdateFields = {
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  audience: Audience;
  hostOrgId?: Id<"hostOrgs">;
  newForDays?: number;
  startsAt: number;
  endsAt?: number;
  order: number;
};

/** Every rule in the spec's table, no database. Returns the trimmed fields
 * to store (an empty optional text is "not set") or throws {code, reason}. */
export function cleanUpdateFields(input: UpdateFieldsInput): CleanUpdateFields {
  const title = input.title.trim();
  if (!title) fail("title_required", "Add a title.");
  if (title.length > TITLE_MAX) fail("title_too_long", `Keep the title to ${TITLE_MAX} characters.`);

  const body = input.body.trim();
  if (!body) fail("body_required", "Add the text.");
  if (body.length > BODY_MAX) fail("body_too_long", `Keep the text to ${BODY_MAX} characters.`);

  const actionLabel = input.actionLabel?.trim() || undefined;
  const actionUrl = input.actionUrl?.trim() || undefined;
  if (Boolean(actionLabel) !== Boolean(actionUrl)) {
    fail("action_incomplete", "A button needs both a label and a link.");
  }
  if (actionLabel && actionLabel.length > ACTION_LABEL_MAX) {
    fail("action_label_too_long", `Keep the button label to ${ACTION_LABEL_MAX} characters.`);
  }
  if (actionUrl && !isValidActionUrl(actionUrl)) {
    fail("action_url_invalid", "The link must start with / or https://.");
  }

  if (input.audience === "community" && !input.hostOrgId) {
    fail("community_required", "Pick the community.");
  }
  if (input.audience !== "community" && input.hostOrgId) {
    fail("community_not_allowed", "Only a community audience takes a community.");
  }

  let newForDays: number | undefined;
  if (input.audience === "new") {
    newForDays = input.newForDays ?? NEW_FOR_DAYS_DEFAULT;
    if (
      !Number.isInteger(newForDays) ||
      newForDays < NEW_FOR_DAYS_MIN ||
      newForDays > NEW_FOR_DAYS_MAX
    ) {
      fail("days_invalid", `Days must be a whole number from ${NEW_FOR_DAYS_MIN} to ${NEW_FOR_DAYS_MAX}.`);
    }
  }

  if (!Number.isFinite(input.startsAt)) fail("starts_invalid", "Pick a start.");
  if (input.endsAt !== undefined) {
    if (!Number.isFinite(input.endsAt)) fail("ends_invalid", "Pick an end.");
    if (input.endsAt <= input.startsAt) fail("ends_before_start", "The end has to come after the start.");
  }
  if (!Number.isFinite(input.order)) fail("order_invalid", "Order must be a number.");

  return {
    title,
    body,
    actionLabel,
    actionUrl,
    audience: input.audience,
    hostOrgId: input.audience === "community" ? input.hostOrgId : undefined,
    newForDays,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    order: input.order,
  };
}

/** The body cut to about `max` characters at a word boundary, on one line. */
export function trimToWord(text: string, max = NOTIFICATION_MESSAGE_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const head = flat.slice(0, max + 1);
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : flat.slice(0, max);
  return `${cut.replace(/[\s,.;:!?-]+$/, "")}…`;
}

/** Inside its dates: started, and not past `endsAt` when one is set. */
export function isInDates(update: { startsAt: number; endsAt?: number }, now: number): boolean {
  return update.startsAt <= now && (update.endsAt === undefined || update.endsAt > now);
}

/** Accounts created after this moment are "new" for the Update. */
function newCutoff(newForDays: number | undefined, at: number): number {
  return at - (newForDays ?? NEW_FOR_DAYS_DEFAULT) * DAY_MS;
}

/** In-app card path the notification and email fall back to. */
export function cardPath(updateId: string): string {
  return `/today?card=update:${updateId}`;
}

/** The email's button. The email template puts the site origin in front of
 * ctaUrl, so it takes a path: an in-app action goes straight to it; an
 * https:// action (or none) opens the card on the desk, where the button is. */
export function emailButton(update: {
  _id: string;
  actionLabel?: string;
  actionUrl?: string;
}): { ctaText: string; ctaUrl: string } {
  if (update.actionLabel && update.actionUrl?.startsWith("/")) {
    return { ctaText: update.actionLabel, ctaUrl: update.actionUrl };
  }
  return { ctaText: "Open it", ctaUrl: cardPath(update._id) };
}

// ——————————————————————————————————————————————————————————————
// Starter drafts (spec: "Starter drafts (copy)")
// ——————————————————————————————————————————————————————————————

/** The event the Oct 6 draft links to, found by this title (case-insensitive). */
export const OCT6_EVENT_TITLE = "What is this and why?";

/** CLAIMS.whatItIs + " " + CLAIMS.theGarden from app/app/constants/claims.ts.
 * convex/ can't import from app/, so this is a hand copy; claims.test.ts
 * checks it word for word, as it does for GIVING_SENTENCES. */
export const WELCOME_BODY =
  "TheCreative.exchange is where creatives find paid work, get backed by people who believe in them, and apply for grants. " +
  "The platform is open to any creative. The Garden is the Christian creative community on it, and it is where this started.";

export type StarterUpdate = {
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  audience: Audience;
  newForDays?: number;
  order: number;
  /** Link the button to the published event with this title, if there is one. */
  linksToEvent?: string;
};

export const STARTER_UPDATES: readonly StarterUpdate[] = [
  {
    title: "Welcome",
    body: WELCOME_BODY,
    actionLabel: "Meet people",
    actionUrl: "/today?view=people",
    audience: "everyone",
    order: 1,
  },
  {
    title: "Your tools are in the corner",
    body: "On a computer, everything is behind the yellow button in the lower left. Hover it. Each tool sorts your desk, and its menu takes you where you want to go.",
    audience: "everyone",
    order: 2,
  },
  {
    title: "Add a photo and a few lines",
    body: "People say yes to a face. Add yours and say what you make.",
    actionLabel: "Edit my profile",
    actionUrl: "/settings",
    audience: "new",
    newForDays: 14,
    order: 3,
  },
  {
    title: "Oct 6: What is this and why?",
    body: "The first Creator Notes, online. What TheCreative.exchange is, why it exists, and what happens next.",
    actionLabel: "See the event",
    actionUrl: "/events", // swapped for /events/<id> when the event exists
    audience: "everyone",
    order: 4,
    linksToEvent: OCT6_EVENT_TITLE,
  },
];

// ——————————————————————————————————————————————————————————————
// Audience
// ——————————————————————————————————————————————————————————————

type AudienceRule = {
  audience: Audience;
  hostOrgId?: Id<"hostOrgs">;
  newForDays?: number;
};

/** How many people match the rule at `at`. Admin screens only. */
async function countAudience(ctx: QueryCtx, rule: AudienceRule, at: number): Promise<number> {
  if (rule.audience === "community") {
    const hostOrgId = rule.hostOrgId;
    if (!hostOrgId) return 0;
    const members = await ctx.db
      .query("communityMembers")
      .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", hostOrgId))
      .collect();
    return members.filter((m) => m.status === "active").length;
  }
  if (rule.audience === "new") {
    const cutoff = newCutoff(rule.newForDays, at);
    const fresh = await ctx.db
      .query("users")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", cutoff))
      .collect();
    return fresh.length;
  }
  return (await ctx.db.query("users").collect()).length;
}

/** Whether one signed-in person is in the Update's audience right now. */
async function inAudience(
  ctx: QueryCtx,
  update: Doc<"updates">,
  userId: Id<"users">,
  userCreatedAt: number,
  now: number,
): Promise<boolean> {
  if (update.audience === "everyone") return true;
  if (update.audience === "new") return userCreatedAt > newCutoff(update.newForDays, now);
  const hostOrgId = update.hostOrgId;
  if (!hostOrgId) return false;
  const membership = await ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", hostOrgId).eq("userId", userId))
    .unique();
  return membership?.status === "active";
}

// ——————————————————————————————————————————————————————————————
// Viewer
// ——————————————————————————————————————————————————————————————

export type UpdateCard = {
  _id: Id<"updates">;
  title: string;
  body: string;
  imageUrl: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
};

/** The Updates this person should see right now: published, inside their
 * dates, in their audience, not archived by them. Order, then newest start. */
export const listMine = query({
  args: {},
  handler: async (ctx): Promise<UpdateCard[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const now = Date.now();
    const published = await ctx.db
      .query("updates")
      .withIndex("by_status_order", (q) => q.eq("status", "published"))
      .collect();
    const live = published.filter((u) => isInDates(u, now));
    if (live.length === 0) return [];

    const reads = await ctx.db
      .query("updateReads")
      .withIndex("by_userId_updateId", (q) => q.eq("userId", userId))
      .collect();
    const archived = new Set(reads.filter((r) => r.archivedAt !== undefined).map((r) => r.updateId));

    const mine: Doc<"updates">[] = [];
    for (const update of live) {
      if (archived.has(update._id)) continue;
      if (await inAudience(ctx, update, userId, user._creationTime, now)) mine.push(update);
    }
    mine.sort((a, b) => a.order - b.order || b.startsAt - a.startsAt);

    return Promise.all(
      mine.map(async (u) => ({
        _id: u._id,
        title: u.title,
        body: u.body,
        imageUrl: u.imageStorageId ? await ctx.storage.getUrl(u.imageStorageId) : null,
        actionLabel: u.actionLabel ?? null,
        actionUrl: u.actionUrl ?? null,
      })),
    );
  },
});

/** An Update that has left this person's desk: the card, plus when they
 * archived it (null if it simply ended) and when its dates ended (null if
 * it has no end). */
export type PastUpdateCard = UpdateCard & {
  archivedAt: number | null;
  endsAt: number | null;
};

/** Whether this person was in the Update's audience before `sawItBy` (the
 * moment they archived it, or the moment it ended). "New" is measured from
 * the first moment they could have seen it, so a new-members Update they
 * read in week one stays theirs after the two weeks are up. A community's
 * members are its active ones who had joined by then. */
async function wasInAudience(
  ctx: QueryCtx,
  update: Doc<"updates">,
  userId: Id<"users">,
  userCreatedAt: number,
  sawItBy: number,
): Promise<boolean> {
  const firstChance = Math.max(update.startsAt, userCreatedAt);
  if (firstChance > sawItBy) return false;
  if (update.audience === "everyone") return true;
  if (update.audience === "new") return userCreatedAt > newCutoff(update.newForDays, firstChance);
  const hostOrgId = update.hostOrgId;
  if (!hostOrgId) return false;
  const membership = await ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", hostOrgId).eq("userId", userId))
    .unique();
  return membership?.status === "active" && membership.joinedAt <= sawItBy;
}

/** The Updates that have left this person's desk, newest first: the ones
 * they archived, and the ones published to them that have since ended.
 * Never a draft, never one they weren't in the audience for. */
export const listPastMine = query({
  args: {},
  handler: async (ctx): Promise<PastUpdateCard[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];

    const now = Date.now();
    const reads = await ctx.db
      .query("updateReads")
      .withIndex("by_userId_updateId", (q) => q.eq("userId", userId))
      .collect();
    const archivedAt = new Map<string, number>();
    for (const r of reads) if (r.archivedAt !== undefined) archivedAt.set(r.updateId, r.archivedAt);

    // An Update an admin archived counts only if this person archived it
    // too: otherwise there's no telling they ever saw it.
    const published = await ctx.db
      .query("updates")
      .withIndex("by_status_order", (q) => q.eq("status", "published"))
      .collect();
    const adminArchived = await ctx.db
      .query("updates")
      .withIndex("by_status_order", (q) => q.eq("status", "archived"))
      .collect();

    const past: { update: Doc<"updates">; archivedAt: number | null; leftAt: number }[] = [];
    for (const update of [...published, ...adminArchived]) {
      const mine = archivedAt.get(update._id);
      const ended = update.status === "published" && update.endsAt !== undefined && update.endsAt <= now;
      // When it left their desk: their archive, else the end of its dates.
      const leftAt = mine ?? (ended ? update.endsAt : undefined);
      if (leftAt === undefined) continue;
      if (!(await wasInAudience(ctx, update, userId, user._creationTime, leftAt))) continue;
      past.push({ update, archivedAt: mine ?? null, leftAt });
    }
    past.sort((a, b) => b.leftAt - a.leftAt);

    return Promise.all(
      past.map(async ({ update: u, archivedAt: at }) => ({
        _id: u._id,
        title: u.title,
        body: u.body,
        imageUrl: u.imageStorageId ? await ctx.storage.getUrl(u.imageStorageId) : null,
        actionLabel: u.actionLabel ?? null,
        actionUrl: u.actionUrl ?? null,
        archivedAt: at,
        endsAt: u.endsAt ?? null,
      })),
    );
  },
});

type ReadFields = "openedAt" | "clickedAt" | "archivedAt";

/** Sets the given timestamps on the person's read row, creating it on first
 * touch. A timestamp that is already set is left alone, so every call is
 * idempotent. */
async function touchRead(
  ctx: MutationCtx,
  updateId: Id<"updates">,
  fields: ReadFields[],
): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) fail("not_signed_in", "Sign in first.");
  const update = await ctx.db.get(updateId);
  if (!update) fail("not_found", "That Update isn't here anymore.");

  const now = Date.now();
  const row = await ctx.db
    .query("updateReads")
    .withIndex("by_userId_updateId", (q) => q.eq("userId", userId).eq("updateId", updateId))
    .unique();
  if (!row) {
    const created: { userId: Id<"users">; updateId: Id<"updates"> } & Partial<Record<ReadFields, number>> = {
      userId,
      updateId,
    };
    for (const f of fields) created[f] = now;
    await ctx.db.insert("updateReads", created);
    return;
  }
  const patch: Partial<Record<ReadFields, number>> = {};
  for (const f of fields) if (row[f] === undefined) patch[f] = now;
  if (Object.keys(patch).length > 0) await ctx.db.patch(row._id, patch);
}

/** They opened the card. Counts as "seen". */
export const open = mutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, args) => {
    await touchRead(ctx, args.updateId, ["openedAt"]);
  },
});

/** They pressed its button: seen, clicked, and done. */
export const click = mutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, args) => {
    await touchRead(ctx, args.updateId, ["openedAt", "clickedAt", "archivedAt"]);
  },
});

/** Done for them: it never shows again. Reading it is what "seen" means, so
 * this counts as opened too ("Got it" on a phone never calls `open`). */
export const archive = mutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, args) => {
    await touchRead(ctx, args.updateId, ["openedAt", "archivedAt"]);
  },
});

// ——————————————————————————————————————————————————————————————
// Admin
// ——————————————————————————————————————————————————————————————

async function requireAdminUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) fail("not_signed_in", "Sign in first.");
  await requireAdmin(ctx, userId);
  return userId;
}

export type AdminUpdate = Doc<"updates"> & {
  imageUrl: string | null;
  opened: number;
  clicked: number;
  archived: number;
  audienceNow: number;
};

/** Every Update, in display order, with its stats. */
export const adminList = query({
  args: {},
  handler: async (ctx): Promise<AdminUpdate[]> => {
    await requireAdminUser(ctx);
    const now = Date.now();
    const all = await ctx.db.query("updates").collect();
    all.sort((a, b) => a.order - b.order || b.startsAt - a.startsAt);

    // Several Updates often share an audience; count each rule once.
    const audienceCounts = new Map<string, number>();
    const audienceNow = async (u: Doc<"updates">) => {
      const key = `${u.audience}:${u.hostOrgId ?? ""}:${u.newForDays ?? ""}`;
      const known = audienceCounts.get(key);
      if (known !== undefined) return known;
      const n = await countAudience(ctx, u, now);
      audienceCounts.set(key, n);
      return n;
    };

    return Promise.all(
      all.map(async (u) => {
        const reads = await ctx.db
          .query("updateReads")
          .withIndex("by_updateId", (q) => q.eq("updateId", u._id))
          .collect();
        return {
          ...u,
          imageUrl: u.imageStorageId ? await ctx.storage.getUrl(u.imageStorageId) : null,
          opened: reads.filter((r) => r.openedAt !== undefined).length,
          clicked: reads.filter((r) => r.clickedAt !== undefined).length,
          archived: reads.filter((r) => r.archivedAt !== undefined).length,
          audienceNow: await audienceNow(u),
        };
      }),
    );
  },
});

/** Create (no updateId, starts as a draft) or edit an Update. Edits replace
 * the whole record: an optional field left out is cleared, and a picture
 * that is replaced or cleared is deleted from storage. Status is not touched
 * by an edit. */
export const save = mutation({
  args: {
    updateId: v.optional(v.id("updates")),
    title: v.string(),
    body: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    actionLabel: v.optional(v.string()),
    actionUrl: v.optional(v.string()),
    audience: audienceValidator,
    hostOrgId: v.optional(v.id("hostOrgs")),
    newForDays: v.optional(v.number()),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    order: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"updates">> => {
    const userId = await requireAdminUser(ctx);
    const fields = cleanUpdateFields(args);
    if (fields.hostOrgId && !(await ctx.db.get(fields.hostOrgId))) {
      fail("community_not_found", "That community isn't here.");
    }

    const now = Date.now();
    if (!args.updateId) {
      return await ctx.db.insert("updates", {
        ...fields,
        imageStorageId: args.imageStorageId,
        status: "draft",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existing = await ctx.db.get(args.updateId);
    if (!existing) fail("not_found", "That Update isn't here anymore.");
    await ctx.db.patch(args.updateId, {
      ...fields,
      imageStorageId: args.imageStorageId,
      updatedAt: now,
    });
    if (existing.imageStorageId && existing.imageStorageId !== args.imageStorageId) {
      try {
        await ctx.storage.delete(existing.imageStorageId);
      } catch {
        // already gone
      }
    }
    return args.updateId;
  },
});

/** Draft, published or archived. Only published Updates inside their dates
 * ever show. */
export const setStatus = mutation({
  args: { updateId: v.id("updates"), status: statusValidator },
  handler: async (ctx, args) => {
    await requireAdminUser(ctx);
    const existing = await ctx.db.get(args.updateId);
    if (!existing) fail("not_found", "That Update isn't here anymore.");
    const status: UpdateStatus = args.status;
    await ctx.db.patch(args.updateId, { status, updatedAt: Date.now() });
  },
});

/** The number the editor shows. A community audience with no community yet
 * counts 0, so the editor can ask while the form is half filled. */
export const audienceCount = query({
  args: {
    audience: audienceValidator,
    hostOrgId: v.optional(v.id("hostOrgs")),
    newForDays: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<number> => {
    await requireAdminUser(ctx);
    const days = Math.min(
      NEW_FOR_DAYS_MAX,
      Math.max(NEW_FOR_DAYS_MIN, Math.round(args.newForDays ?? NEW_FOR_DAYS_DEFAULT)),
    );
    return countAudience(ctx, { ...args, newForDays: days }, Date.now());
  },
});

/** An upload URL for the picture; save the returned storage id on the Update. */
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireAdminUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Notification and email for everyone in the audience right now. Once per
 * Update, published Updates only. Delivery runs in scheduled batches of 50
 * (deliverBatch); the count returned is the audience at this moment. */
export const sendNow = mutation({
  args: { updateId: v.id("updates") },
  handler: async (ctx, args): Promise<{ recipients: number }> => {
    await requireAdminUser(ctx);
    const update = await ctx.db.get(args.updateId);
    if (!update) fail("not_found", "That Update isn't here anymore.");
    if (update.sentAt !== undefined) fail("already_sent", "This Update was already sent.");
    if (update.status !== "published") fail("not_published", "Publish it before sending it.");

    const now = Date.now();
    const recipients = await countAudience(ctx, update, now);
    await ctx.db.patch(update._id, { sentAt: now, sentCount: recipients, updatedAt: now });
    if (recipients > 0) {
      await ctx.scheduler.runAfter(0, internal.updates.deliverBatch, {
        updateId: update._id,
        cursor: null,
      });
    }
    return { recipients };
  },
});

/** Internal. Delivers to the next page of up to 50 people, then schedules
 * itself for the next page until the audience is done. Walks the `users`
 * table (or the community's members) with a cursor, so no recipient rows are
 * kept. "New" is measured from the moment of sending. */
export const deliverBatch = internalMutation({
  args: { updateId: v.id("updates"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const update = await ctx.db.get(args.updateId);
    if (!update || update.sentAt === undefined) return;
    const paginationOpts = { numItems: SEND_BATCH_SIZE, cursor: args.cursor };

    let userIds: Id<"users">[];
    let isDone: boolean;
    let continueCursor: string;
    if (update.audience === "community") {
      const hostOrgId = update.hostOrgId;
      if (!hostOrgId) return;
      const page = await ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", hostOrgId))
        .paginate(paginationOpts);
      userIds = page.page.filter((m) => m.status === "active").map((m) => m.userId);
      ({ isDone, continueCursor } = page);
    } else if (update.audience === "new") {
      const cutoff = newCutoff(update.newForDays, update.sentAt);
      const page = await ctx.db
        .query("users")
        .withIndex("by_creation_time", (q) => q.gt("_creationTime", cutoff))
        .paginate(paginationOpts);
      userIds = page.page.map((u) => u._id);
      ({ isDone, continueCursor } = page);
    } else {
      const page = await ctx.db.query("users").paginate(paginationOpts);
      userIds = page.page.map((u) => u._id);
      ({ isDone, continueCursor } = page);
    }

    const linkUrl = cardPath(update._id);
    const message = trimToWord(update.body);
    const { ctaText, ctaUrl } = emailButton(update);
    const emailBody = escapeHtml(update.body).replace(/\n/g, "<br>");

    for (const userId of userIds) {
      await ctx.db.insert("notifications", {
        userId,
        type: "update",
        title: update.title,
        message,
        linkUrl,
        createdAt: Date.now(),
      });
      await scheduleNotificationEmail(ctx, {
        userId,
        subject: update.title,
        previewText: message,
        heading: update.title,
        body: emailBody,
        ctaText,
        ctaUrl,
        category: "announcements",
      });
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.updates.deliverBatch, {
        updateId: args.updateId,
        cursor: continueCursor,
      });
    }
  },
});

/** Creates the four starter drafts that are missing (matched by title).
 * They land as drafts for an admin to review and publish. */
export const addStarterDrafts = mutation({
  args: {},
  handler: async (ctx): Promise<{ added: number }> => {
    const userId = await requireAdminUser(ctx);
    const existingTitles = new Set((await ctx.db.query("updates").collect()).map((u) => u.title));
    const now = Date.now();

    let added = 0;
    for (const starter of STARTER_UPDATES) {
      if (existingTitles.has(starter.title)) continue;
      let { actionUrl } = starter;
      let endsAt: number | undefined;
      if (starter.linksToEvent) {
        const event = await findPublishedEvent(ctx, starter.linksToEvent, now);
        if (event) {
          actionUrl = `/events/${event._id}`;
          endsAt = event.datetime + DAY_MS;
        }
      }
      await ctx.db.insert("updates", {
        title: starter.title,
        body: starter.body,
        actionLabel: starter.actionLabel,
        actionUrl,
        audience: starter.audience,
        newForDays: starter.newForDays,
        startsAt: now,
        endsAt,
        order: starter.order,
        status: "draft",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      added++;
    }
    return { added };
  },
});

/** The published event with this title (case-insensitive): the next one
 * coming up, else the most recent. */
async function findPublishedEvent(
  ctx: QueryCtx,
  title: string,
  now: number,
): Promise<Doc<"events"> | null> {
  const wanted = title.trim().toLowerCase();
  const published = await ctx.db
    .query("events")
    .withIndex("by_status", (q) => q.eq("status", "published"))
    .collect();
  const matches = published
    .filter((e) => e.title.trim().toLowerCase() === wanted)
    .sort((a, b) => a.datetime - b.datetime);
  return matches.find((e) => e.datetime >= now) ?? matches[matches.length - 1] ?? null;
}
