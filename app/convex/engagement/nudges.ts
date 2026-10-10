// Engagement loops, the app's half (docs/features/engagement-loops.md).
// PostHog decides when and calls POST /api/nudges (engagement/webhook.ts);
// attemptNudge below decides whether to send and sends through the ordinary
// email pipeline. Every call is logged to nudgeLog, sent or skipped with the
// reason, and the admin page (/admin/engagement-loops) reads that log.
//
// No cron anywhere in this: a nudge happens only when PostHog calls.

import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { normalizeEmail } from "../emailDeliveries";
import { getOrCreatePreferences } from "../emailPreferences";
import { getUserEmail, scheduleNotificationEmail } from "../emailHelpers";
import { requireAdminCtx } from "../helpers";
import { trackEvent } from "../posthog";
import {
  buildNudgeEmail,
  checkLoopText,
  DEFAULT_LOOPS,
  isLoopKey,
  resolveLoop,
  type EffectiveLoop,
} from "./loops";
import {
  NUDGE_GAP_MS,
  countLog,
  countShared,
  decideNudge,
  isPostedProject,
  latestOf,
  type NudgeFacts,
  type SkipReason,
} from "./rules";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many of a person's newest notifications are looked through for the
 * cheers email. It only mails rows from the last few days. */
const DIGEST_SCAN = 50;

async function loadLoop(ctx: QueryCtx, key: string): Promise<EffectiveLoop | null> {
  const row = await ctx.db
    .query("engagementLoops")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return resolveLoop(key, row);
}

/** Whether the person has posted a project (isPostedProject in rules.ts says
 * which rows count). Stops at the first. */
async function hasPostedProject(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  for await (const project of ctx.db.query("projects").withIndex("by_userId", (q) => q.eq("userId", userId))) {
    if (isPostedProject(project)) return true;
  }
  return false;
}

/** Everything decideNudge needs to know about this loop and this person.
 * Reads only; the one exception is the email-settings row, which the send
 * would create anyway (getOrCreatePreferences, the same call
 * scheduleNotificationEmail makes). */
async function gatherFacts(
  ctx: MutationCtx,
  loop: EffectiveLoop,
  userId: Id<"users"> | null,
  now: number,
): Promise<NudgeFacts> {
  const facts: NudgeFacts = {
    now,
    loopEnabled: loop.enabled,
    userExists: false,
    hasEmail: false,
    emailAllowed: false,
    suppressed: false,
    conditionHolds: false,
    condition: loop.condition,
    alreadySent: false,
    lastNudgeAt: null,
    lastDigestAt: null,
  };
  const user = userId ? await ctx.db.get(userId) : null;
  if (!userId || !user) return facts;
  facts.userExists = true;

  const email = await getUserEmail(ctx, userId);
  facts.hasEmail = email !== null;
  if (email) {
    const prefs = await getOrCreatePreferences(ctx, userId);
    facts.emailAllowed = prefs[loop.category];
    facts.suppressed =
      (await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
        .first()) !== null;
  }

  facts.conditionHolds = !(await hasPostedProject(ctx, userId));

  const thisLoop = await ctx.db
    .query("nudgeLog")
    .withIndex("by_loopKey_userId", (q) => q.eq("loopKey", loop.key).eq("userId", userId))
    .collect();
  facts.alreadySent = thisLoop.some((r) => r.status === "sent");

  const lastDay = await ctx.db
    .query("nudgeLog")
    .withIndex("by_userId_at", (q) => q.eq("userId", userId).gt("at", now - NUDGE_GAP_MS))
    .collect();
  facts.lastNudgeAt = latestOf(lastDay.filter((r) => r.status === "sent").map((r) => r.at));

  const newest = await ctx.db
    .query("notifications")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(DIGEST_SCAN);
  facts.lastDigestAt = latestOf(newest.map((n) => n.digestedAt));

  return facts;
}

export type AttemptResult = { status: "sent" } | { status: "skipped"; reason: SkipReason };

/** One PostHog call: decide, send or skip, log it. Never throws for a bad
 * distinct_id: that is a skip ("unknown_user"), so PostHog is not left
 * retrying a call that can never work. A loop key that isn't a loop is the
 * webhook's 400 and never gets here. */
export const attemptNudge = internalMutation({
  args: { loop: v.string(), distinctId: v.string() },
  handler: async (ctx, args): Promise<AttemptResult> => {
    const loop = await loadLoop(ctx, args.loop);
    if (!loop) throw new Error(`Unknown engagement loop: ${args.loop}`);

    const now = Date.now();
    // PostHog's distinct id is our user id. normalizeId says null for
    // anything that isn't one (an anonymous browser id, a typo, a template
    // PostHog never filled in).
    const userId = ctx.db.normalizeId("users", args.distinctId);

    const facts = await gatherFacts(ctx, loop, userId, now);
    const decision = decideNudge(facts);

    if (!decision.send) {
      await ctx.db.insert("nudgeLog", {
        loopKey: loop.key,
        ...(userId && facts.userExists ? { userId } : {}),
        status: "skipped",
        reason: decision.reason,
        at: now,
      });
      return { status: "skipped", reason: decision.reason };
    }

    // decideNudge only sends for a person that exists.
    const recipient = userId as Id<"users">;
    await scheduleNotificationEmail(ctx, {
      userId: recipient,
      category: loop.category,
      ...buildNudgeEmail(loop),
    });
    await ctx.db.insert("nudgeLog", { loopKey: loop.key, userId: recipient, status: "sent", at: now });
    await trackEvent(ctx, "nudge_sent", recipient, { loop: loop.key });
    return { status: "sent" };
  },
});

// ——— /admin/engagement-loops ———

type WindowView = {
  sent: number;
  skipped: number;
  reasons: { reason: string; label: string; count: number }[];
  /** Sends followed by a project the same person created within 7 days. */
  shared: number;
};

/** Each loop as it runs now, with what happened in the last 7 and 30 days.
 * Admins only. Small at this scale: a month of one loop's log, and the
 * projects of the people it was sent to. */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminCtx(ctx);
    const now = Date.now();

    const loops = [];
    for (const def of DEFAULT_LOOPS) {
      const loop = (await loadLoop(ctx, def.key)) as EffectiveLoop;
      const rows = await ctx.db
        .query("nudgeLog")
        .withIndex("by_loopKey_at", (q) => q.eq("loopKey", def.key).gt("at", now - 30 * DAY_MS))
        .collect();

      const sends = rows.flatMap((r) =>
        r.status === "sent" && r.userId ? [{ userId: r.userId as string, at: r.at }] : [],
      );
      const projectTimes = new Map<string, number[]>();
      for (const userId of new Set(sends.map((s) => s.userId))) {
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_userId", (q) => q.eq("userId", userId as Id<"users">))
          .collect();
        projectTimes.set(userId, projects.filter(isPostedProject).map((p) => p.createdAt));
      }

      const windowFor = (days: number): WindowView => ({
        ...countLog(rows, now, days),
        shared: countShared(
          sends.filter((s) => s.at > now - days * DAY_MS),
          projectTimes,
        ),
      });

      loops.push({
        key: loop.key,
        name: loop.name,
        when: loop.when,
        enabled: loop.enabled,
        subject: loop.subject,
        body: loop.body,
        ctaText: loop.ctaText,
        edited: loop.edited,
        updatedAt: loop.updatedAt ?? null,
        last7: windowFor(7),
        last30: windowFor(30),
      });
    }
    return loops;
  },
});

/** Turn a loop on or off, or change its subject and text. Whatever is not
 * passed stays as it is. The first save writes a row; from then on the row
 * overrides the code's defaults. Admins only. */
export const adminSave = mutation({
  args: {
    key: v.string(),
    enabled: v.optional(v.boolean()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminId = await requireAdminCtx(ctx);
    if (!isLoopKey(args.key)) throw new ConvexError({ code: "unknown_loop", reason: "No such loop." });

    const current = (await loadLoop(ctx, args.key)) as EffectiveLoop;
    const text = checkLoopText({ subject: args.subject ?? current.subject, body: args.body ?? current.body });
    if (!text.ok) throw new ConvexError({ code: "invalid_text", reason: text.reason });

    const next = {
      enabled: args.enabled ?? current.enabled,
      subject: text.subject,
      body: text.body,
      updatedAt: Date.now(),
      updatedBy: adminId,
    };
    const row = await ctx.db
      .query("engagementLoops")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("engagementLoops", { key: args.key, ...next });
  },
});
