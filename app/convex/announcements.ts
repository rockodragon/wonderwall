// Announcements (docs/announcements-prd.md) — one-way broadcasts + automatic
// day-before reminders for Projects/Events/Offerings. Delivery reuses the
// existing `notifications` table and `emails.sendNotificationEmail` action;
// no new delivery mechanism, no group threads (see PRD Design Decisions).
//
// Conventions follow the garden modules (offerings.ts, garden/support.ts):
// getAuthUserId from @convex-dev/auth/server, ConvexError with a
// {code, reason} payload — NOT convex/events.ts's bare Error("...") shape.

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
import type { Id } from "./_generated/dataModel";
import { getUserEmail, scheduleNotificationEmail } from "./emailHelpers";
import { normalizeEmail } from "./garden/eventRsvps";
import { normalizeUpdateBody } from "./garden/stories";

const targetTypeValidator = v.union(
  v.literal("project"),
  v.literal("event"),
  v.literal("offering"),
);
type TargetType = "project" | "event" | "offering";

const MAX_BODY_LENGTH = 2000; // same cap messaging.ts enforces on messages.content
const MAX_AUDIENCE_SIZE = 500; // cap on the resolve-and-record transaction only
const BROADCAST_DAILY_LIMIT = 2; // per target per 24h
const BATCH_SIZE = 25; // deliverAnnouncementBatch claims this many pending rows per invocation
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDER_TARGETS_PER_RUN = 20;

// ——————————————————————————————————————————————————————————————
// Target lookup — shared by permission checks and delivery's title/CTA/
// provenance text. Not audience resolution itself (that's resolveAudience
// below); this just answers "who owns it" and "what's it called."
// ——————————————————————————————————————————————————————————————

interface TargetInfo {
  ownerId: Id<"users">;
  title: string;
}

async function loadTarget(
  ctx: QueryCtx | MutationCtx,
  targetType: TargetType,
  targetId: string,
): Promise<TargetInfo | null> {
  switch (targetType) {
    case "project": {
      const doc = await ctx.db.get(targetId as Id<"projects">);
      if (!doc) return null;
      return { ownerId: doc.userId, title: doc.title };
    }
    case "event": {
      const doc = await ctx.db.get(targetId as Id<"events">);
      if (!doc) return null;
      return { ownerId: doc.organizerId, title: doc.title };
    }
    case "offering": {
      const doc = await ctx.db.get(targetId as Id<"offerings">);
      if (!doc) return null;
      return { ownerId: doc.userId, title: doc.title };
    }
  }
}

/** "Live" per the Auto-reminder Cron's trigger window condition 3. Used only
 * to abort a still-pending reminder batch after a cancellation — nothing
 * already delivered can be unsent, but pending rows can stop being sent. */
async function isTargetLive(
  ctx: QueryCtx | MutationCtx,
  targetType: TargetType,
  targetId: string,
): Promise<boolean> {
  if (targetType === "event") {
    const event = await ctx.db.get(targetId as Id<"events">);
    return event?.status === "published";
  }
  if (targetType === "offering") {
    const offering = await ctx.db.get(targetId as Id<"offerings">);
    return offering?.status === "active";
  }
  return true;
}

// ——————————————————————————————————————————————————————————————
// Permissions (PRD "Permissions" section). Reading is owner-or-admin;
// sending (sendAnnouncement, below) is owner-only with no admin override —
// checked inline there since it's a stricter, different rule.
// ——————————————————————————————————————————————————————————————

async function assertOwnerOrAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  ownerId: Id<"users">,
): Promise<void> {
  if (userId === ownerId) return;
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile?.isAdmin) {
    throw new ConvexError({ code: "forbidden", reason: "You don't have access to this." });
  }
}

// ——————————————————————————————————————————————————————————————
// resolveAudience — the ONE shared implementation (PRD §1: "a single
// switch... called by the audience query, the broadcast mutation, and the
// reminder cron — three callers, one function"). Nothing else in this
// feature reads projectSupport/eventRsvps/eventApplications/
// offeringSignups directly.
// ——————————————————————————————————————————————————————————————

export interface ResolvedRecipient {
  userId?: Id<"users">;
  email?: string;
}

export interface ResolvedAudience {
  recipients: ResolvedRecipient[];
  unreachable: number;
}

export async function resolveAudience(
  ctx: QueryCtx | MutationCtx,
  targetType: TargetType,
  targetId: string,
): Promise<ResolvedAudience> {
  // Account recipients dedupe by userId (e.g. an RSVP and an accepted
  // application from the same user produce one recipient) — a Map keyed by
  // userId handles this for every target type in one pass.
  const byUserId = new Map<Id<"users">, ResolvedRecipient>();
  const guestRecipients: ResolvedRecipient[] = [];
  let unreachable = 0;

  switch (targetType) {
    case "project": {
      const rows = await ctx.db
        .query("projectSupport")
        .withIndex("by_projectId", (q) => q.eq("projectId", targetId as Id<"projects">))
        .collect();
      for (const row of rows) {
        if (row.supporterUserId) {
          // Anonymous supporters (visible: false) ARE included — they asked
          // for public anonymity, not silence.
          byUserId.set(row.supporterUserId, { userId: row.supporterUserId });
        } else {
          // projectSupport.supporterUserId is optional in schema but
          // supportProject requires auth and always sets it — defensive,
          // not an expected state today (PRD V1 Scope Cuts #1).
          unreachable++;
        }
      }
      break;
    }
    case "event": {
      // Union of both attendance paths — both write against the same
      // events table (PRD §1, "Why events union two tables").
      const [rsvps, applications] = await Promise.all([
        ctx.db
          .query("eventRsvps")
          .withIndex("by_eventId", (q) => q.eq("eventId", targetId as Id<"events">))
          .collect(),
        ctx.db
          .query("eventApplications")
          .withIndex("by_eventId_status", (q) =>
            q.eq("eventId", targetId as Id<"events">).eq("status", "accepted"),
          )
          .collect(),
      ]);
      for (const rsvp of rsvps) {
        if (rsvp.userId) {
          byUserId.set(rsvp.userId, { userId: rsvp.userId });
        } else {
          // Guest RSVP — email only, via the required eventRsvps.email field.
          // Already normalized on write, but normalize again defensively.
          guestRecipients.push({ email: normalizeEmail(rsvp.email) });
        }
      }
      for (const application of applications) {
        byUserId.set(application.applicantId, { userId: application.applicantId });
      }
      break;
    }
    case "offering": {
      // userId is required on offeringSignups — always in-app + email.
      // "pledged" included alongside "confirmed" (PRD §1, "Why offerings
      // include pledged" — a paid offering with no external link can only
      // ever produce pledged rows).
      const rows = await ctx.db
        .query("offeringSignups")
        .withIndex("by_offeringId", (q) => q.eq("offeringId", targetId as Id<"offerings">))
        .collect();
      for (const row of rows) {
        if (row.status === "pledged" || row.status === "confirmed") {
          byUserId.set(row.userId, { userId: row.userId });
        }
      }
      break;
    }
  }

  return {
    recipients: [...byUserId.values(), ...guestRecipients],
    unreachable,
  };
}

/**
 * Excludes the target's owner (the about-to-be sender) from a resolved
 * audience, by userId and by normalized email (PRD §1 dedupe rules: "The
 * sender is excluded from their own audience"). Applied by the two
 * owner-driven callers (getAnnouncementAudience, sendAnnouncement) AFTER
 * calling resolveAudience — never inside resolveAudience itself, whose
 * signature takes no sender/owner argument and which the reminder cron
 * calls with no sender to exclude.
 */
function excludeOwner(
  audience: ResolvedAudience,
  ownerId: Id<"users">,
  ownerEmail: string | null,
): ResolvedAudience {
  const normalizedOwnerEmail = ownerEmail ? normalizeEmail(ownerEmail) : null;
  const recipients = audience.recipients.filter((r) => {
    if (r.userId === ownerId) return false;
    if (normalizedOwnerEmail && r.email && normalizeEmail(r.email) === normalizedOwnerEmail) {
      return false;
    }
    return true;
  });
  return { recipients, unreachable: audience.unreachable };
}

// ——————————————————————————————————————————————————————————————
// Delivery text helpers
// ——————————————————————————————————————————————————————————————

function ctaTextFor(targetType: TargetType): string {
  switch (targetType) {
    case "project":
      return "View Project";
    case "event":
      return "View event";
    case "offering":
      return "View offering";
  }
}

/**
 * Path (not absolute URL — sendNotificationEmail prefixes SITE_URL) to the
 * target's page. Offerings have no per-item detail route in this app
 * (routes.ts defines no "offerings/:id") — the owner's /offerings dashboard
 * is the closest thing to a target page for that kind.
 */
function targetPath(targetType: TargetType, targetId: string): string {
  switch (targetType) {
    case "project":
      return `/projects/${targetId}`;
    case "event":
      return `/events/${targetId}`;
    case "offering":
      return `/offerings`;
  }
}

function provenanceLine(targetType: TargetType, title: string): string {
  switch (targetType) {
    case "project":
      return `You're getting this because you support ${title}.`;
    case "event":
      return `You're getting this because you RSVP'd to ${title}.`;
    case "offering":
      return `You're getting this because you signed up for ${title}.`;
  }
}

async function getSenderName(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<string> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return profile?.name || "Someone";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * sendNotificationEmail (convex/emails.ts) interpolates `body` into the
 * email HTML unescaped — deliberate there (events.ts passes <strong>
 * through it), but an announcement body is user-authored, so it MUST be
 * escaped first. Then \n -> <br> so a multi-line note survives the single
 * <p> the template wraps it in. Skipping this is an HTML-injection hole
 * with a broadcast audience attached (PRD, Key Mutations).
 */
function escapedBodyHtml(body: string): string {
  return escapeHtml(body).replace(/\n/g, "<br>");
}

/**
 * Server-side, fixed zone. There is no per-user timezone anywhere in the
 * schema and the browser isn't in the loop for an email or a stored
 * notification row — naming one zone is honest; "local time" would be a
 * guess (PRD §3).
 */
function formatReminderTime(startsAt: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(new Date(startsAt));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")}, ${get("month")} ${get("day")} at ${get("hour")}:${get("minute")} ${get("dayPeriod")} ${get("timeZoneName")}`;
}

// ——————————————————————————————————————————————————————————————
// Key Queries
// ——————————————————————————————————————————————————————————————

// Owner-or-admin. Wraps resolveAudience; returns counts only, never rows.
export const getAnnouncementAudience = query({
  args: { targetType: targetTypeValidator, targetId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) throw new ConvexError({ code: "not_found", reason: "That doesn't exist." });
    await assertOwnerOrAdmin(ctx, userId, target.ownerId);

    const audience = await resolveAudience(ctx, args.targetType, args.targetId);
    const ownerEmail = await getUserEmail(ctx, target.ownerId);
    const filtered = excludeOwner(audience, target.ownerId, ownerEmail);

    const reachable = filtered.recipients.filter((r) => r.userId !== undefined).length;
    const emailOnly = filtered.recipients.filter(
      (r) => r.userId === undefined && r.email !== undefined,
    ).length;

    // `pledged` is a display-only split of the offering audience already
    // resolved above, not a second resolution path: resolveAudience's
    // return shape carries no per-recipient status (its signature is fixed
    // by the spec), so this cross-references the same by_offeringId rows
    // against the already-resolved recipient set purely to label the count
    // line ("8 confirmed, 4 pledged"). Who's IN the audience is decided by
    // resolveAudience alone; this never changes membership.
    let pledged = 0;
    if (args.targetType === "offering") {
      const signups = await ctx.db
        .query("offeringSignups")
        .withIndex("by_offeringId", (q) => q.eq("offeringId", args.targetId as Id<"offerings">))
        .collect();
      const pledgedUserIds = new Set(
        signups.filter((s) => s.status === "pledged").map((s) => s.userId),
      );
      pledged = filtered.recipients.filter(
        (r) => r.userId !== undefined && pledgedUserIds.has(r.userId),
      ).length;
    }

    return { reachable, emailOnly, unreachable: filtered.unreachable, pledged };
  },
});

// Owner-or-admin. Sent history for one target, newest first, with counts.
export const listAnnouncementsForTarget = query({
  args: { targetType: targetTypeValidator, targetId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) throw new ConvexError({ code: "not_found", reason: "That doesn't exist." });
    await assertOwnerOrAdmin(ctx, userId, target.ownerId);

    const rows = await ctx.db
      .query("announcements")
      .withIndex("by_target_createdAt", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .order("desc")
      .take(20);

    return rows.map((r) => ({
      _id: r._id,
      kind: r.kind,
      body: r.body,
      recipientCount: r.recipientCount,
      emailedCount: r.emailedCount,
      unreachableCount: r.unreachableCount,
      createdAt: r.createdAt,
    }));
  },
});

// ——————————————————————————————————————————————————————————————
// Key Mutations
// ——————————————————————————————————————————————————————————————

// Owner-only (no admin override — PRD Permissions: a broadcast is authored
// speech signed with the sender's name). Auth + ownership + rate limit +
// body validation, then resolveAudience, then inserts the announcement row
// and one pending announcementRecipients row per recipient. Schedules the
// first delivery batch and returns the counts. Sends nothing itself — the
// two-phase design (PRD "Why fan-out is batched, not one transaction").
export const sendAnnouncement = mutation({
  args: { targetType: targetTypeValidator, targetId: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) throw new ConvexError({ code: "not_found", reason: "That doesn't exist." });

    if (target.ownerId !== userId) {
      throw new ConvexError({
        code: "forbidden",
        reason: "Only the owner can send announcements here.",
      });
    }

    const body = normalizeUpdateBody(args.body);
    if (!body) {
      throw new ConvexError({ code: "empty_body", reason: "Write something before sending." });
    }
    if (body.length > MAX_BODY_LENGTH) {
      throw new ConvexError({
        code: "body_too_long",
        reason: `Keep it under ${MAX_BODY_LENGTH} characters.`,
      });
    }

    // Rate limit: 2 broadcasts per target per 24h. Reminders don't count —
    // they aren't the sender's messages (PRD §3).
    const windowStart = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await ctx.db
      .query("announcements")
      .withIndex("by_target_createdAt", (q) =>
        q
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
          .gte("createdAt", windowStart),
      )
      .collect();
    const broadcastsToday = recent.filter((a) => a.kind === "broadcast").length;
    if (broadcastsToday >= BROADCAST_DAILY_LIMIT) {
      throw new ConvexError({
        code: "rate_limited",
        reason: `You've sent ${BROADCAST_DAILY_LIMIT} announcements today. Try again tomorrow.`,
      });
    }

    const audience = await resolveAudience(ctx, args.targetType, args.targetId);
    const ownerEmail = await getUserEmail(ctx, target.ownerId);
    const filtered = excludeOwner(audience, target.ownerId, ownerEmail);

    if (filtered.recipients.length > MAX_AUDIENCE_SIZE) {
      throw new ConvexError({
        code: "audience_too_large",
        reason: "This audience is too large to send to right now.",
      });
    }

    const now = Date.now();
    const announcementId = await ctx.db.insert("announcements", {
      targetType: args.targetType,
      targetId: args.targetId,
      senderUserId: userId,
      kind: "broadcast",
      body,
      recipientCount: filtered.recipients.length,
      emailedCount: 0,
      unreachableCount: filtered.unreachable,
      createdAt: now,
    });

    for (const recipient of filtered.recipients) {
      await ctx.db.insert("announcementRecipients", {
        announcementId,
        userId: recipient.userId,
        email: recipient.email,
        createdAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, internal.announcements.deliverAnnouncementBatch, {
      announcementId,
    });

    return {
      recipientCount: filtered.recipients.length,
      unreachableCount: filtered.unreachable,
    };
  },
});

// Internal. Claims up to 25 pending recipient rows for one announcement,
// delivers them, marks them deliveredAt, and reschedules itself at 0 if any
// remain. The whole fan-out, for both broadcasts and reminders.
export const deliverAnnouncementBatch = internalMutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    const announcement = await ctx.db.get(args.announcementId);
    if (!announcement) return;

    // Reminder-only cancellation guard (PRD "Cancelled after the reminder
    // went out"): nothing already delivered can be unsent, but a
    // still-pending batch can be stopped. Broadcasts always proceed — one
    // on a cancelled event is very likely the cancellation notice itself.
    if (announcement.kind === "reminder") {
      const stillLive = await isTargetLive(ctx, announcement.targetType, announcement.targetId);
      if (!stillLive) return;
    }

    const pending = await ctx.db
      .query("announcementRecipients")
      .withIndex("by_announcementId_deliveredAt", (q) =>
        q.eq("announcementId", args.announcementId).eq("deliveredAt", undefined),
      )
      .take(BATCH_SIZE);

    if (pending.length === 0) return;

    const target = await loadTarget(ctx, announcement.targetType, announcement.targetId);
    const targetTitle = target?.title ?? "your update";
    const senderName = announcement.senderUserId
      ? await getSenderName(ctx, announcement.senderUserId)
      : null;

    const ctaUrl = targetPath(announcement.targetType, announcement.targetId);
    const ctaText = ctaTextFor(announcement.targetType);
    const notificationTitle =
      announcement.kind === "reminder"
        ? `Reminder: ${targetTitle} is tomorrow`
        : `Update on ${targetTitle}`;
    const emailSubject =
      announcement.kind === "reminder"
        ? `Reminder: ${targetTitle} is tomorrow`
        : `${senderName ?? "Someone"} — update on ${targetTitle}`;

    const escapedBody = escapedBodyHtml(announcement.body);
    const provenance = provenanceLine(announcement.targetType, targetTitle);
    // Broadcast emails append a reply line; system reminders carry none
    // (PRD, Reply routing #4).
    const emailBodyHtml =
      announcement.kind === "broadcast"
        ? `${escapedBody}<br><br>${provenance}<br><br>To reply, message ${senderName ?? "the sender"} on The Exchange.`
        : `${escapedBody}<br><br>${provenance}`;
    const previewText =
      announcement.kind === "reminder" ? announcement.body : announcement.body.slice(0, 120);

    let emailedDelta = 0;

    for (const recipient of pending) {
      const now = Date.now();
      let notificationId: Id<"notifications"> | undefined;

      // In-app: direct ctx.db.insert (likesDigest.ts shape), not the public
      // createNotification mutation, which isn't callable from server code.
      if (recipient.userId) {
        notificationId = await ctx.db.insert("notifications", {
          userId: recipient.userId,
          type: announcement.kind === "reminder" ? "reminder" : "announcement",
          title: notificationTitle,
          message: announcement.body,
          linkUrl: ctaUrl,
          relatedUserId: announcement.kind === "broadcast" ? announcement.senderUserId : undefined,
          createdAt: now,
        });
      }

      // Guests already have their (normalized) email from resolve time;
      // account recipients' address is resolved now, at delivery time.
      const rawEmail = recipient.userId
        ? await getUserEmail(ctx, recipient.userId)
        : recipient.email;
      const normalizedEmail = rawEmail ? normalizeEmail(rawEmail) : undefined;

      let emailQueuedAt: number | undefined;
      if (normalizedEmail) {
        // Cross-batch email dedupe (PRD §1): skip if another recipient of
        // this same announcement already had an email queued for this
        // address. Convex mutations read-your-writes within one execution,
        // so this also dedupes within the current batch, not just across
        // batches.
        const sameEmailRows = await ctx.db
          .query("announcementRecipients")
          .withIndex("by_announcementId_email", (q) =>
            q.eq("announcementId", args.announcementId).eq("email", normalizedEmail),
          )
          .collect();
        const alreadyQueued = sameEmailRows.some(
          (row) => row._id !== recipient._id && row.emailQueuedAt !== undefined,
        );

        if (!alreadyQueued) {
          if (recipient.userId) {
            await scheduleNotificationEmail(ctx, {
              userId: recipient.userId,
              subject: emailSubject,
              previewText,
              heading: targetTitle,
              body: emailBodyHtml,
              ctaText,
              ctaUrl,
            });
          } else {
            await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
              to: normalizedEmail,
              subject: emailSubject,
              previewText,
              heading: targetTitle,
              body: emailBodyHtml,
              ctaText,
              ctaUrl,
            });
          }
          emailQueuedAt = now;
          emailedDelta++;
        }
      }

      await ctx.db.patch(recipient._id, {
        notificationId,
        email: normalizedEmail,
        emailQueuedAt,
        deliveredAt: now,
      });
    }

    if (emailedDelta > 0) {
      await ctx.db.patch(args.announcementId, {
        emailedCount: announcement.emailedCount + emailedDelta,
      });
    }

    const remaining = await ctx.db
      .query("announcementRecipients")
      .withIndex("by_announcementId_deliveredAt", (q) =>
        q.eq("announcementId", args.announcementId).eq("deliveredAt", undefined),
      )
      .first();
    if (remaining) {
      await ctx.scheduler.runAfter(0, internal.announcements.deliverAnnouncementBatch, {
        announcementId: args.announcementId,
      });
    }
  },
});

// Internal, cron-only. Scans for events/offerings inside the reminder
// window, checks reminderKey, creates the announcement + recipient rows,
// schedules delivery. Never delivers inline.
export const sendDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const windowEnd = now + REMINDER_WINDOW_MS;

    // Condition 1 (startsAt - now <= 24h) and condition 2 (now < startsAt,
    // strictly — a cron outage that ends after start must not send "is
    // tomorrow" for something underway) together bound the range
    // (now, windowEnd]. Condition 3 (target still live) is the extra
    // .filter()/in-memory check below.
    const dueEvents = await ctx.db
      .query("events")
      .withIndex("by_datetime", (q) => q.gt("datetime", now).lte("datetime", windowEnd))
      .filter((q) => q.eq(q.field("status"), "published"))
      .collect();

    const activeOfferings = await ctx.db
      .query("offerings")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const dueOfferings = activeOfferings.filter(
      (o) => o.startDate !== undefined && o.startDate > now && o.startDate <= windowEnd,
    );

    type DueTarget = { targetType: "event" | "offering"; targetId: string; startsAt: number };
    const dueTargets: DueTarget[] = [
      ...dueEvents.map((e): DueTarget => ({
        targetType: "event",
        targetId: e._id as string,
        startsAt: e.datetime,
      })),
      ...dueOfferings.map((o): DueTarget => ({
        targetType: "offering",
        targetId: o._id as string,
        startsAt: o.startDate as number,
      })),
    ];
    // Soonest-starting first, in the unlikely event of a backlog beyond the cap.
    dueTargets.sort((a, b) => a.startsAt - b.startsAt);

    let remindersSent = 0;
    for (const dueTarget of dueTargets.slice(0, MAX_REMINDER_TARGETS_PER_RUN)) {
      // Idempotency (PRD §3): "reminder24h:{targetType}:{targetId}:{startsAt}",
      // looked up via by_reminderKey before insert. Convex mutations are
      // serializable, so lookup-then-insert inside this one mutation can't
      // race with itself.
      const reminderKey = `reminder24h:${dueTarget.targetType}:${dueTarget.targetId}:${dueTarget.startsAt}`;
      const existing = await ctx.db
        .query("announcements")
        .withIndex("by_reminderKey", (q) => q.eq("reminderKey", reminderKey))
        .unique();
      if (existing) continue;

      const audience = await resolveAudience(ctx, dueTarget.targetType, dueTarget.targetId);
      const insertedAt = Date.now();
      const announcementId = await ctx.db.insert("announcements", {
        targetType: dueTarget.targetType,
        targetId: dueTarget.targetId,
        senderUserId: undefined,
        kind: "reminder",
        reminderKey,
        body: `Starts ${formatReminderTime(dueTarget.startsAt)}`,
        recipientCount: audience.recipients.length,
        emailedCount: 0,
        unreachableCount: audience.unreachable,
        createdAt: insertedAt,
      });

      for (const recipient of audience.recipients) {
        await ctx.db.insert("announcementRecipients", {
          announcementId,
          userId: recipient.userId,
          email: recipient.email,
          createdAt: insertedAt,
        });
      }

      await ctx.scheduler.runAfter(0, internal.announcements.deliverAnnouncementBatch, {
        announcementId,
      });
      remindersSent++;
    }

    return { targetsConsidered: dueTargets.length, remindersSent };
  },
});
