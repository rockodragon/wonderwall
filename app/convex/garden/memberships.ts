// The only file that adapts stripeHandlers.ts's pure Db interface onto
// real ctx.db — plus the public/internal Convex surface for membership
// state: the webhook entry point, billing-customer bookkeeping used by
// stripe.ts's checkout action, and the client-facing getMyMembership query.
//
// NOTE (codegen): the generated DataModel in `_generated/` predates the
// Garden tables (memberships, billingCustomers, coverageCodes, hostOrgs) —
// `npx convex dev` hasn't run against this schema yet. Every ctx here is
// typed `any` and every index callback is `(q)`, exactly like
// garden/entitlements.ts, so this file doesn't fight the stale generated
// types. Once codegen catches up this can tighten to the generated types.

import { v } from "convex/values";
import { query, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { handleStripeEvent, type Db, type StripeWebhookEvent } from "./stripeHandlers";

const ENTITLED_STATUSES = new Set(["active", "past_due"]);
const LEVEL_RANK: Record<string, number> = { seat: 1, five: 2, host: 3 };

// ——— ctx.db adapter for the pure stripeHandlers.Db interface ———

// Boundary adapter: the pure Db speaks plain strings; Convex speaks branded
// Ids. Casts live HERE and only here (the type seam).
function makeConvexDb(ctx: MutationCtx): Db {
  return {
    async getBillingCustomerByStripeId(stripeCustomerId: string) {
      const row = await ctx.db
        .query("billingCustomers")
        .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", stripeCustomerId))
        .unique();
      return row
        ? { userId: String(row.userId), stripeCustomerId: row.stripeCustomerId, email: row.email }
        : null;
    },

    async upsertBillingCustomer(row) {
      const existing = await ctx.db
        .query("billingCustomers")
        .withIndex("by_userId", (q) => q.eq("userId", row.userId as Id<"users">))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          stripeCustomerId: row.stripeCustomerId,
          email: row.email,
        });
      } else {
        await ctx.db.insert("billingCustomers", {
          userId: row.userId as Id<"users">,
          stripeCustomerId: row.stripeCustomerId,
          email: row.email,
          createdAt: Date.now(),
        });
      }
    },

    async getMembershipBySubscription(stripeSubscriptionId: string) {
      const row = await ctx.db
        .query("memberships")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!row) return null;
      return {
        id: String(row._id),
        userId: String(row.userId),
        level: row.level,
        status: row.status,
        // Optional — a seat is platform membership, not community
        // membership (community-groups.md §0); only covered/legacy rows
        // carry one.
        hostOrgId: row.hostOrgId ? String(row.hostOrgId) : undefined,
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripePriceId: row.stripePriceId,
        currentPeriodEnd: row.currentPeriodEnd,
        coveredByCodeId: row.coveredByCodeId ? String(row.coveredByCodeId) : undefined,
      };
    },

    async upsertMembership(row) {
      const existing = await ctx.db
        .query("memberships")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", row.stripeSubscriptionId),
        )
        .unique();
      const patch = {
        userId: row.userId as Id<"users">,
        level: row.level,
        status: row.status,
        hostOrgId: row.hostOrgId as Id<"hostOrgs"> | undefined,
        stripeSubscriptionId: row.stripeSubscriptionId,
        stripePriceId: row.stripePriceId,
        currentPeriodEnd: row.currentPeriodEnd,
        coveredByCodeId: row.coveredByCodeId as Id<"coverageCodes"> | undefined,
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
        .withIndex("by_stripeSubscriptionId", (q) =>
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
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .unique();
      if (!existing) return;
      await ctx.db.patch(existing._id, patch);
    },

    async upsertTicketPurchase(row) {
      const existing = await ctx.db
        .query("ticketPurchases")
        .withIndex("by_stripeSessionId", (q) =>
          q.eq("stripeSessionId", row.stripeSessionId),
        )
        .unique();
      const patch = {
        eventId: row.eventId as Id<"events">,
        tierName: row.tierName,
        amountCents: row.amountCents,
        buyerEmail: row.buyerEmail,
        userId: row.userId as Id<"users"> | undefined,
        stripeSessionId: row.stripeSessionId,
        status: row.status,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("ticketPurchases", { ...patch, createdAt: Date.now() });
      }
    },

    async getHostOrgIdBySlug(slug: string) {
      const row = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      return row ? String(row._id) : null;
    },

    async getContributionByStripeRef(stripeRef: string) {
      const row = await ctx.db
        .query("grantContributions")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
        .unique();
      return row ? { stripeRef: row.stripeRef as string } : null;
    },

    async insertContribution(row) {
      await ctx.db.insert("grantContributions", {
        hostOrgId: row.hostOrgId as Id<"hostOrgs">,
        type: row.type,
        grossCents: row.grossCents,
        platformCents: row.platformCents,
        poolCents: row.poolCents,
        userId: row.userId as Id<"users"> | undefined,
        payerName: row.payerName,
        membershipId: row.membershipId as Id<"memberships"> | undefined,
        stripeRef: row.stripeRef,
        period: row.period,
        note: row.note,
        createdAt: Date.now(),
      });
    },

    async getProductPurchaseByRef(stripeRef: string) {
      const row = await ctx.db
        .query("productPurchases")
        .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
        .unique();
      return row ? { stripeRef: row.stripeRef as string } : null;
    },

    async insertProductPurchase(row) {
      const now = Date.now();
      await ctx.db.insert("productPurchases", {
        productId: row.productId as Id<"communityProducts">,
        hostOrgId: row.hostOrgId as Id<"hostOrgs">,
        userId: row.userId as Id<"users"> | undefined,
        buyerEmail: row.buyerEmail,
        grossCents: row.grossCents,
        platformCents: row.platformCents,
        hostCents: row.hostCents,
        billing: row.billing,
        status: row.status,
        stripeRef: row.stripeRef,
        stripeSubscriptionId: row.stripeSubscriptionId,
        currentPeriodEnd: row.currentPeriodEnd,
        period: row.period,
        createdAt: now,
        updatedAt: now,
      });
    },

    async updateProductPurchasesBySubscription(stripeSubscriptionId, patch) {
      const rows = await ctx.db
        .query("productPurchases")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .collect();
      const updatedAt = Date.now();
      for (const row of rows) {
        await ctx.db.patch(row._id, { ...patch, updatedAt });
      }
    },
  };
}

// ——— Webhook entry point (called from http.ts after signature verification) ———

export const applyStripeEvent = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => {
    const event = args.event as StripeWebhookEvent; // v.any() boundary — cast once here
    const db = makeConvexDb(ctx);
    await handleStripeEvent(event, db);
  },
});

// ——— Billing-customer bookkeeping used by stripe.ts's checkout action
//      (actions have no ctx.db — they call these via ctx.runQuery/runMutation) ———

export const getBillingCustomerForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("billingCustomers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const saveBillingCustomer = internalMutation({
  args: { userId: v.id("users"), stripeCustomerId: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const db = makeConvexDb(ctx);
    await db.upsertBillingCustomer(args);
  },
});

// Used by stripe.ts's createPoolContributionCheckout (a "use node" action,
// no ctx.db of its own) to resolve which pool a one-time contribution
// targets and validate its kind before building the Stripe session.
export const getHostOrgBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// Used by stripe.ts's createProductCheckout (a "use node" action, no
// ctx.db of its own) to load a community product + its host org in one
// round trip before building the Stripe session. Null when either side is
// missing — never partial data the action would have to null-check twice.
export const getProductForCheckout = internalQuery({
  args: { productId: v.id("communityProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const org = await ctx.db.get(product.hostOrgId);
    if (!org) return null;
    return {
      product: {
        _id: product._id,
        hostOrgId: product.hostOrgId,
        name: product.name,
        priceCents: product.priceCents,
        billing: product.billing,
        status: product.status,
      },
      org: {
        _id: org._id,
        slug: org.slug,
        name: org.name,
        kind: org.kind,
        status: org.status,
      },
    };
  },
});

// ——— Client-facing query ———

export const getMyMembership = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
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
