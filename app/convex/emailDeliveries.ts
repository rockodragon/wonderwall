// Delivery tracking for outbound email (bead: know whether email landed,
// stop sending to addresses that bounce or complain).
//
// This file is the concrete Db adapter behind resendWebhook.ts's pure
// `handleResendEvent` — same split as garden/stripeHandlers.ts (pure logic)
// / garden/memberships.ts (ctx.db adapter). No "use node": everything here
// is plain Convex queries/mutations reachable from the httpAction in
// http.ts and from emails.ts's "use node" action via ctx.runMutation /
// ctx.runQuery.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { requireAdminCtx } from "./helpers";
import { resolveSenderCommunityName } from "./email/senderCommunity";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getOrCreatePreferences, type EmailCategory } from "./emailPreferences";
import { getUserEmail } from "./emailHelpers";
import { isPostedProject } from "./engagement/rules";
import { conversationReminderEligibility } from "./engagement/conversations";
import { getLoopRow } from "./engagement/settings";
import { readUnreadReminder } from "./engagement/reminderSettings";
import { blockBetween } from "./blocks";
import { trackEvent } from "./posthog";
import { internal } from "./_generated/api";
import {
  acceptsProviderEvent, CONTACT_GAP_MS, CONTACT_LEASE_MS, CONTACT_MAX_ATTEMPTS, contactPolicyValidator,
  contactRetryAt, emailSendValidators, reservedUntil, type ContactGoal, type ContactPolicy,
  type EmailContactMetadata, type ProviderStatus,
} from "./emailContactPolicy";

const statusValidator = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("bounced"),
  v.literal("complained"),
  v.literal("failed"),
  v.literal("suppressed"),
);

const categoryValidator = v.union(
  v.literal("activity"),
  v.literal("digest"),
  v.literal("announcements"),
  v.literal("transactional"),
);

/** Normalizes an email address the same way in every direction this module
 * touches one — recording a send, checking suppression, applying a webhook
 * event. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type EligibilityInput = {
  userId?: Id<"users">;
  email?: string;
  category?: string;
  policy?: ContactPolicy;
  goal?: ContactGoal;
  conversationId?: Id<"conversations">;
  messageId?: Id<"messages">;
  blockedUserId?: Id<"users">;
  journeyKey?: string;
  sourceType?: string;
  excludeContactId?: Id<"emailDeliveries">;
};

/** The same current-state decision serves previews and atomic dispatch claims. */
export async function contactEligibility(ctx: QueryCtx | MutationCtx, input: EligibilityInput, now = Date.now()) {
  const policy = input.policy ?? (input.category === "transactional" ? "transactional" : "standard");
  let email = input.email;
  if (input.userId) {
    const user = await ctx.db.get(input.userId);
    if (!user) return { eligible: false as const, reason: "unknown_user" };
    email = await getUserEmail(ctx, input.userId) ?? undefined;
    if (policy !== "transactional") {
      const preferences = await ctx.db.query("emailPreferences")
        .withIndex("by_userId", q => q.eq("userId", input.userId!)).unique();
      if (preferences && input.category && preferences[input.category as EmailCategory] === false) {
        return { eligible: false as const, reason: "email_off" };
      }
    }
  }
  if (!email) return { eligible: false as const, reason: "no_email" };
  const normalized = normalizeEmail(email);
  const suppression = await ctx.db.query("emailSuppressions")
    .withIndex("by_email", q => q.eq("email", normalized)).first();
  if (suppression) return { eligible: false as const, reason: "suppressed" };
  if (input.userId && input.blockedUserId && await blockBetween(ctx, input.userId, input.blockedUserId)) {
    return { eligible: false as const, reason: "blocked" };
  }

  if (input.goal === "unread_message" && !(await readUnreadReminder(ctx)).enabled) {
    return { eligible: false as const, reason: "loop_off" };
  }
  if (input.journeyKey) {
    const loop = await getLoopRow(ctx, input.journeyKey);
    if (loop?.enabled === false) {
      return { eligible: false as const, reason: "loop_off" };
    }
  }
  if (input.goal === "no_project" && input.userId) {
    for await (const project of ctx.db.query("projects").withIndex("by_userId", q => q.eq("userId", input.userId!))) {
      if (isPostedProject(project)) return { eligible: false as const, reason: "goal_completed" };
    }
  }
  if (input.goal === "unread_message" || input.sourceType === "message") {
    if (!input.userId || !input.conversationId) return { eligible: false as const, reason: "missing_context" };
    const result = await conversationReminderEligibility(ctx, {
      userId: input.userId, conversationId: input.conversationId,
      cutoff: input.goal === "unread_message" ? now - CONTACT_GAP_MS : now, messageId: input.messageId,
    });
    if (!result.eligible) return { eligible: false as const, reason: result.reason };
  }

  if (policy === "standard" && input.userId) {
    const recent = await ctx.db.query("emailDeliveries")
      .withIndex("by_recipientUserId_cooldownAt", q => q.eq("recipientUserId", input.userId!).gt("cooldownAt", now - CONTACT_GAP_MS))
      .order("desc").take(100);
    const blockedUntil = recent.filter(row => row._id !== input.excludeContactId)
      .map(reservedUntil).filter((at): at is number => at !== null && at > now);
    if (blockedUntil.length) return { eligible: false as const, reason: "contact_cooldown", retryAt: Math.max(...blockedUntil) };
  }
  return { eligible: true as const, reason: "eligible", email: normalized };
}

export const readContactEligibility = internalQuery({
  args: {
    userId: v.optional(v.id("users")), email: v.optional(v.string()), category: v.optional(v.string()),
    policy: v.optional(contactPolicyValidator),
    goal: v.optional(v.union(v.literal("no_project"), v.literal("unread_message"))),
    conversationId: v.optional(v.id("conversations")), messageId: v.optional(v.id("messages")),
    blockedUserId: v.optional(v.id("users")), journeyKey: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    excludeContactId: v.optional(v.id("emailDeliveries")),
  },
  handler: async (ctx, args) => {
    const { eligible, reason, ...result } = await contactEligibility(ctx, args);
    return { eligible, reason, ...(result.retryAt ? { retryAt: result.retryAt } : {}) };
  },
});

export async function queueEmailContact(
  ctx: MutationCtx,
  input: { to: string; subject: string; category?: string; recipientUserId?: Id<"users">; contact?: EmailContactMetadata },
): Promise<{ contactId: Id<"emailDeliveries">; created: boolean }> {
  if (input.contact?.dedupeKey) {
    const existing = await ctx.db.query("emailDeliveries")
      .withIndex("by_dedupeKey", q => q.eq("dedupeKey", input.contact!.dedupeKey)).unique();
    if (existing) return { contactId: existing._id, created: false };
  }
  const now = Date.now();
  const { dedupeKey, ...metadata }: Partial<EmailContactMetadata> = input.contact ?? {};
  const contactId = await ctx.db.insert("emailDeliveries", {
    ...metadata, dedupeKey, recipientUserId: input.recipientUserId,
    policy: metadata.policy ?? (input.category === "transactional" ? "transactional" : "standard"),
    to: normalizeEmail(input.to), subject: input.subject, category: input.category,
    provider: "pending", status: "queued", attempts: 0, lastEventAt: now, createdAt: now,
  });
  return { contactId, created: true };
}

/** Already-scheduled legacy actions enter the same ledger before any network call. */
export const queueLegacySend = internalMutation({
  args: emailSendValidators,
  handler: async (ctx, args) => {
    const queued = await queueEmailContact(ctx, args);
    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, { ...args, contactId: queued.contactId });
    return queued.contactId;
  },
});

async function updateNudge(ctx: MutationCtx, row: Doc<"emailDeliveries">, status: "sent" | "failed" | "suppressed" | "cancelled", reason?: string) {
  if (!row.nudgeLogId) return;
  const log = await ctx.db.get(row.nudgeLogId);
  if (!log) return;
  await ctx.db.patch(log._id, { status, reason, ...(status === "sent" ? { at: Date.now() } : {}) });
  if (status === "sent" && log.status !== "sent" && row.recipientUserId) {
    await trackEvent(ctx, "nudge_sent", row.recipientUserId, {
      ...(row.journeyKey ? { loop: row.journeyKey } : {}), contact_id: row._id,
      ...(row.journeyRunId ? { journey_run_id: row.journeyRunId } : {}),
    });
  }
}

export const claimForDispatch = internalMutation({
  args: { contactId: v.id("emailDeliveries") },
  handler: async (ctx, { contactId }) => {
    const row = await ctx.db.get(contactId);
    const now = Date.now();
    if (!row || row.status !== "queued") return { claimed: false as const };
    if ((row.leaseUntil ?? 0) > now || (row.nextAttemptAt ?? 0) > now) return { claimed: false as const };
    if ((row.attempts ?? 0) > 0 && now - row.createdAt >= 23 * 60 * 60 * 1000) {
      await ctx.db.patch(contactId, { status: "failed", detail: "idempotency_window_expired", cooldownAt: undefined, leaseUntil: undefined, lastEventAt: now });
      await updateNudge(ctx, row, "failed", "idempotency_window_expired");
      return { claimed: false as const };
    }
    if ((row.attempts ?? 0) >= CONTACT_MAX_ATTEMPTS) {
      await ctx.db.patch(contactId, { status: "failed", detail: "attempts_exhausted", leaseUntil: undefined, lastEventAt: now });
      await updateNudge(ctx, row, "failed", "attempts_exhausted");
      return { claimed: false as const };
    }
    const decision = await contactEligibility(ctx, {
      userId: row.recipientUserId, email: row.to, category: row.category, policy: row.policy,
      goal: row.goal, conversationId: row.conversationId, messageId: row.messageId,
      blockedUserId: row.blockedUserId, journeyKey: row.journeyKey, sourceType: row.sourceType, excludeContactId: contactId,
    }, now);
    if (!decision.eligible) {
      const status = decision.reason === "suppressed" ? "suppressed" : "cancelled";
      await ctx.db.patch(contactId, { status, detail: decision.reason, leaseUntil: undefined, cooldownAt: undefined, lastEventAt: now });
      await updateNudge(ctx, row, status, decision.reason);
      return { claimed: false as const, reason: decision.reason };
    }
    const attempts = (row.attempts ?? 0) + 1;
    const unsubscribeToken = row.recipientUserId && row.category !== "transactional"
      ? (await getOrCreatePreferences(ctx, row.recipientUserId)).unsubscribeToken : undefined;
    await ctx.db.patch(contactId, {
      attempts, lastAttemptAt: now, leaseUntil: now + CONTACT_LEASE_MS, nextAttemptAt: undefined,
      // Transactional and message emails reserve no cooldown: a direct
      // message's email must not hold back a nudge, digest or announcement.
      cooldownAt: row.policy === "transactional" || row.policy === "message" ? undefined : now,
      to: decision.email, lastEventAt: now,
    });
    return { claimed: true as const, attempts, to: decision.email, unsubscribeToken };
  },
});

async function applyProviderStatus(ctx: MutationCtx, row: Doc<"emailDeliveries">, status: ProviderStatus, eventAt: number, detail?: string, eventKey?: string) {
  if (!acceptsProviderEvent(row, { status, eventAt })) return;
  await ctx.db.patch(row._id, {
    status, lastEventAt: Date.now(), lastProviderEventAt: eventAt,
    lastProviderEventId: eventKey, ...(detail ? { detail } : {}),
  });
}

export const finishDispatch = internalMutation({
  args: {
    contactId: v.id("emailDeliveries"), attempt: v.number(), provider: v.string(),
    providerId: v.optional(v.string()), error: v.optional(v.string()), retryable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.contactId);
    if (!row || row.attempts !== args.attempt || row.status !== "queued") return { retryAt: null };
    const now = Date.now();
    if (!args.providerId || args.error) {
      const retryAt = contactRetryAt(now, row.attempts, args.retryable === true);
      await ctx.db.patch(row._id, {
        provider: args.provider, status: retryAt === null ? "failed" : "queued",
        detail: (args.error ?? "missing_provider_id").slice(0, 300),
        nextAttemptAt: retryAt ?? undefined, leaseUntil: retryAt ?? undefined,
        cooldownAt: args.provider === "console" ? undefined : row.cooldownAt, lastEventAt: now,
      });
      if (retryAt === null) await updateNudge(ctx, row, "failed", args.error ?? "missing_provider_id");
      return { retryAt };
    }
    await ctx.db.patch(row._id, {
      provider: args.provider, providerId: args.providerId, status: "accepted", acceptedAt: now,
      leaseUntil: undefined, nextAttemptAt: undefined, lastEventAt: now, detail: undefined,
    });
    await updateNudge(ctx, row, "sent");
    const pending = await ctx.db.query("emailDeliveryEvents")
      .withIndex("by_providerId", q => q.eq("providerId", args.providerId!)).take(100);
    for (const event of pending.sort((a, b) => a.eventAt - b.eventAt)) {
      const current = await ctx.db.get(row._id);
      if (current) await applyProviderStatus(ctx, current, event.status as ProviderStatus, event.eventAt, event.detail, event.eventKey);
      await ctx.db.patch(event._id, { appliedAt: now });
    }
    return { retryAt: null };
  },
});

export const recordProviderEvent = internalMutation({
  args: {
    providerId: v.string(), eventKey: v.string(), status: statusValidator,
    eventAt: v.number(), detail: v.optional(v.string()), recipients: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("emailDeliveryEvents").withIndex("by_eventKey", q => q.eq("eventKey", args.eventKey)).unique();
    if (existing) return { duplicate: true };
    const row = await ctx.db.query("emailDeliveries").withIndex("by_providerId", q => q.eq("providerId", args.providerId)).unique();
    const now = Date.now();
    await ctx.db.insert("emailDeliveryEvents", { ...args, receivedAt: now, ...(row ? { appliedAt: now } : {}) });
    if (row) await applyProviderStatus(ctx, row, args.status, args.eventAt, args.detail, args.eventKey);
    return { unknown: !row };
  },
});

/** Called by emails.sendNotificationEmail right after a successful send.
 * The console provider returns no id, so callers skip this entirely rather
 * than call it with an undefined providerId. */
export const recordSend = internalMutation({
  args: {
    providerId: v.string(),
    provider: v.string(),
    to: v.string(),
    subject: v.string(),
    category: v.optional(categoryValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("emailDeliveries").withIndex("by_providerId", q => q.eq("providerId", args.providerId)).unique();
    if (existing) return existing._id;
    await ctx.db.insert("emailDeliveries", {
      providerId: args.providerId,
      provider: args.provider,
      to: normalizeEmail(args.to),
      subject: args.subject,
      category: args.category,
      status: "sent",
      lastEventAt: now,
      createdAt: now,
    });
  },
});

/** Gate checked before every send. */
export const isSuppressed = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(args.email)))
      .first();
    return row !== null;
  },
});

/** The name a community email is sent under (order: email/sender.ts's
 * pickSenderCommunity). `communityId` is the community the email is about,
 * `userId` the recipient. Null when there is no community to name, and the
 * sender keeps its default name. */
export const getCommunitySenderName = internalQuery({
  args: {
    communityId: v.optional(v.id("hostOrgs")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<string | null> =>
    resolveSenderCommunityName(ctx, { communityId: args.communityId, userId: args.userId }),
});

// ——— Adapter methods for resendWebhook.ts's ResendWebhookDb interface ———

export const getDeliveryByProviderId = internalQuery({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_providerId", (q) => q.eq("providerId", args.providerId))
      .unique();
    if (!row) return null;
    const status = row.status === "accepted" ? "sent" : row.status;
    if (!["sent", "delivered", "delayed", "bounced", "complained", "failed", "suppressed"].includes(status)) return null;
    return { providerId: row.providerId!, status: status as ProviderStatus, lastProviderEventAt: row.lastProviderEventAt };
  },
});

export const applyDeliveryEvent = internalMutation({
  args: {
    providerId: v.string(),
    status: statusValidator,
    lastEventAt: v.number(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_providerId", (q) => q.eq("providerId", args.providerId))
      .unique();
    if (!row) return { unknown: true as const };

    await applyProviderStatus(ctx, row, args.status, args.lastEventAt, args.detail);
    return { unknown: false as const };
  },
});

export const addSuppression = internalMutation({
  args: {
    email: v.string(),
    reason: v.union(v.literal("bounced"), v.literal("complained"), v.literal("suppressed")),
    providerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("emailSuppressions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) return; // already suppressed — no need for a second row

    await ctx.db.insert("emailSuppressions", {
      email,
      reason: args.reason,
      providerId: args.providerId,
      createdAt: Date.now(),
    });
  },
});

// ——— Admin read (debugging) ———

/** For `convex run` debugging. */
export const recentForAddress = internalQuery({
  args: { email: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("emailDeliveries")
      .withIndex("by_to_createdAt", (q) => q.eq("to", normalizeEmail(args.email)))
      .order("desc")
      .take(limit);
  },
});

/** Admin-only. No UI consumes this yet — for debugging from the dashboard /
 * `convex run`. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminCtx(ctx);
    const limit = Math.min(args.limit ?? 50, 50);
    return await ctx.db.query("emailDeliveries").order("desc").take(limit);
  },
});
