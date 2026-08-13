// The only file that adapts stripeHandlers.ts's pure Db interface onto
// real ctx.db — plus the public/internal Convex surface for membership
// state: the webhook entry point, billing-customer bookkeeping used by
// stripe.ts's checkout action, and the client-facing getMyMembership query.
//
// NOTE (codegen): the generated DataModel in `_generated/` predates the
// Garden tables (memberships, billingCustomers, coverageCodes, hostOrgs) —
// `npx convex dev` hasn't run against this schema yet. Every ctx here is
// typed `any` and every index callback is `(q: any)`, exactly like
// garden/entitlements.ts, so this file doesn't fight the stale generated
// types. Once codegen catches up this can tighten to the generated types.

import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "./_generated/server";
import { auth } from "./auth";
import { handleStripeEvent, type Db, type StripeWebhookEvent } from "./stripeHandlers";

// The Garden is the default host org; coverage/membership checkout that
// doesn't specify a hostOrgSlug attaches here (architect §2.1).
export const DEFAULT_HOST_ORG_SLUG = "the-garden";

const ENTITLED_STATUSES = new Set(["active", "past_due"]);
const LEVEL_RANK: Record<string, number> = { seat: 1, five: 2, host: 3 };

// ——— ctx.db adapter for the pure stripeHandlers.Db interface ———

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeConvexDb(ctx: any): Db {
  return {
    async getBillingCustomerByStripeId(stripeCustomerId: string) {
      const row = await ctx.db
        .query("billingCustomers")
        .withIndex("by_stripeCustomerId", (q: any) => q.eq("stripeCustomerId", stripeCustomerId))
        .unique();
      return row
        ? { userId: String(row.userId), stripeCustomerId: row.stripeCustomerId, email: row.email }
        : null;
    },

    async upsertBillingCustomer(row) {
      const existing = await ctx.db
        .query("billingCustomers")
        .withIndex("by_userId", (q: any) => q.eq("userId", row.userId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          stripeCustomerId: row.stripeCustomerId,
          email: row.email,
        });
      } else {
        await ctx.db.insert("billingCustomers", {
          userId: row.userId,
          stripeCustomerId: row.stripeCustomerId,
          email: row.email,
          createdAt: Date.now(),
        });
      }
    },

    async getMembershipBySubscription(stripeSubscriptionId: string) {
      const row = await ctx.db
        .query("memberships")
        .withIndex("by_stripeSubscriptionId", (q: any) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!row) return null;
      return {
        userId: String(row.userId),
        level: row.level,
        status: row.status,
        hostOrgId: String(row.hostOrgId),
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripePriceId: row.stripePriceId,
        currentPeriodEnd: row.currentPeriodEnd,
        coveredByCodeId: row.coveredByCodeId ? String(row.coveredByCodeId) : undefined,
      };
    },

    async upsertMembership(row) {
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_stripeSubscriptionId", (q: any) =>
          q.eq("stripeSubscriptionId", row.stripeSubscriptionId),
        )
        .unique();
      const patch = {
        userId: row.userId,
        level: row.level,
        status: row.status,
        hostOrgId: row.hostOrgId,
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripePriceId: row.stripePriceId,
        currentPeriodEnd: row.currentPeriodEnd,
        coveredByCodeId: row.coveredByCodeId,
        updatedAt: Date.now(),
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("memberships", { ...patch, createdAt: Date.now() });
      }
    },

    async getCodeBySubscription(stripeSubscriptionId: string) {
      const row = await ctx.db
        .query("coverageCodes")
        .withIndex("by_stripeSubscriptionId", (q: any) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!row) return null;
      return {
        hostOrgId: String(row.hostOrgId),
        code: row.code,
        seats: row.seats,
        stripeSubscriptionId: row.stripeSubscriptionId,
        status: row.status,
      };
    },

    async updateCode(stripeSubscriptionId: string, patch) {
      const existing = await ctx.db
        .query("coverageCodes")
        .withIndex("by_stripeSubscriptionId", (q: any) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!existing) return;
      await ctx.db.patch(existing._id, patch);
    },
  };
}

// ——— Webhook entry point (called from http.ts after signature verification) ———

export const applyStripeEvent = internalMutation({
  args: { event: v.any() },
  handler: async (ctx: any, args: { event: StripeWebhookEvent }) => {
    const db = makeConvexDb(ctx);
    await handleStripeEvent(args.event, db);
  },
});

// ——— Billing-customer bookkeeping used by stripe.ts's checkout action
//      (actions have no ctx.db — they call these via ctx.runQuery/runMutation) ———

export const getBillingCustomerForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx: any, args: { userId: string }) => {
    return ctx.db
      .query("billingCustomers")
      .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
      .unique();
  },
});

export const saveBillingCustomer = internalMutation({
  args: { userId: v.string(), stripeCustomerId: v.string(), email: v.optional(v.string()) },
  handler: async (ctx: any, args: { userId: string; stripeCustomerId: string; email?: string }) => {
    const db = makeConvexDb(ctx);
    await db.upsertBillingCustomer(args);
  },
});

export const getHostOrgForCheckout = internalQuery({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx: any, args: { slug?: string }) => {
    const slug = args.slug ?? DEFAULT_HOST_ORG_SLUG;
    return ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .unique();
  },
});

// ——— Client-facing query ———

export const getMyMembership = query({
  args: {},
  handler: async (ctx: any) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect();

    let best: any = null;
    let bestRank = 0;
    for (const row of rows) {
      if (!ENTITLED_STATUSES.has(row.status)) continue;
      const rank = LEVEL_RANK[row.level] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        best = row;
      }
    }
    return best;
  },
});

// Reconcile support: the nightly cron (garden/stripe.ts, "use node", lists
// Stripe subscriptions) calls `applyStripeEvent` above once per subscription
// with a synthetic "customer.subscription.updated" event — the exact same
// mutation and code path as the real webhook, so the backstop can't drift
// from the primary path by construction.
