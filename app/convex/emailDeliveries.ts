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

const statusValidator = v.union(
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("bounced"),
  v.literal("complained"),
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

// ——— Adapter methods for resendWebhook.ts's ResendWebhookDb interface ———

export const getDeliveryByProviderId = internalQuery({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_providerId", (q) => q.eq("providerId", args.providerId))
      .unique();
    if (!row) return null;
    return { providerId: row.providerId, status: row.status };
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

    await ctx.db.patch(row._id, {
      status: args.status,
      lastEventAt: args.lastEventAt,
      ...(args.detail !== undefined ? { detail: args.detail } : {}),
    });
    return { unknown: false as const };
  },
});

export const addSuppression = internalMutation({
  args: {
    email: v.string(),
    reason: v.union(v.literal("bounced"), v.literal("complained")),
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
