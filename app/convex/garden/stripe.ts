"use node";

// Thin Convex action layer over the `stripe` SDK (node runtime — actions
// only, per the "use node" directive; no query/mutation/httpAction may live
// in this file). Everything that touches Stripe state transitions lives in
// stripeHandlers.ts (pure) + memberships.ts (the ctx.db adapter); this file
// is just: create a Checkout Session, and the nightly reconcile sweep.
//
// NOTE (codegen): same caveat as memberships.ts — `internal.garden.*`
// references to this session's new files aren't in the stale generated API
// yet, so they're cast through `as any`. `ctx: any` throughout, matching
// garden/entitlements.ts's style.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import Stripe from "stripe";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { auth } from "../auth";

// Matches the `stripe` package's pinned default (node_modules/stripe's
// apiVersion.js) at install time — keep these in lockstep on upgrade.
const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ConvexError("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  }
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

function siteUrl(): string {
  return process.env.SITE_URL || "https://www.thegarden.app";
}

const PRICE_ENV_BY_LEVEL: Record<string, string | undefined> = {
  seat: process.env.STRIPE_PRICE_SEAT,
  five: process.env.STRIPE_PRICE_FIVE,
  host: process.env.STRIPE_PRICE_HOST,
};

// ——— createMembershipCheckout ———

export const createMembershipCheckout = action({
  args: {
    level: v.union(v.literal("seat"), v.literal("five"), v.literal("host")),
    hostOrgSlug: v.optional(v.string()),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx: any, args: { level: "seat" | "five" | "host"; hostOrgSlug?: string }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to become a member.");
    }

    const priceId = PRICE_ENV_BY_LEVEL[args.level];
    if (!priceId) {
      throw new ConvexError(
        `Stripe price env var for level "${args.level}" is not set (STRIPE_PRICE_${args.level.toUpperCase()}).`,
      );
    }

    const hostOrg = await ctx.runQuery(
      (internal as any).garden.memberships.getHostOrgForCheckout,
      { slug: args.hostOrgSlug },
    );
    if (!hostOrg) {
      throw new ConvexError("Host org not found — has the default 'the-garden' row been seeded?");
    }

    const stripe = getStripeClient();

    // Reuse one Stripe customer per user across checkouts + the billing
    // portal (architect §3.4).
    const existing = await ctx.runQuery(
      (internal as any).garden.memberships.getBillingCustomerForUser,
      { userId: String(userId) },
    );

    let stripeCustomerId: string | undefined = existing?.stripeCustomerId;
    if (!stripeCustomerId) {
      const identity = await ctx.auth.getUserIdentity();
      const customer = await stripe.customers.create({
        email: identity?.email ?? undefined,
        metadata: { userId: String(userId) },
      });
      stripeCustomerId = customer.id;
      await ctx.runMutation((internal as any).garden.memberships.saveBillingCustomer, {
        userId: String(userId),
        stripeCustomerId,
        email: identity?.email ?? undefined,
      });
    }

    // Mirrored onto the subscription itself (subscription_data.metadata) so
    // every customer.subscription.* webhook is self-sufficient even if it
    // arrives before checkout.session.completed — see stripeHandlers.ts's
    // header comment for why this matters for idempotent convergence.
    const metadata: Record<string, string> = {
      kind: "membership",
      level: args.level,
      hostOrgId: String(hostOrg._id),
      userId: String(userId),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: `${siteUrl()}/join/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/join`,
      allow_promotion_codes: false,
    });

    if (!session.url) {
      throw new ConvexError("Stripe did not return a checkout URL.");
    }

    return { url: session.url };
  },
});

// ——— createCoverageCheckout — W2 (church coverage codes). Stub only. ———
//
// TODO(W2): mirrors createMembershipCheckout but mode="subscription" with
// `quantity = seats` on a single seat-equivalent price, metadata
// {kind: "coverage", hostOrgId, sponsorName}. The webhook side
// (customer.subscription.updated/.deleted for kind="coverage") is already
// implemented in stripeHandlers.ts and tested — only the checkout-session
// creation + the coverageCodes row issuance are outstanding.
//
// export const createCoverageCheckout = action({ ... });

// ——— Nightly reconcile — the backstop (architect §2.3, "never cut") ———

export const reconcileMemberships = internalAction({
  args: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx: any) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.warn("[stripe] reconcile skipped — STRIPE_SECRET_KEY not set");
      return { processed: 0, skipped: true };
    }
    const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });

    let startingAfter: string | undefined;
    let processed = 0;

    do {
      const page = await stripe.subscriptions.list({
        status: "all",
        limit: 100,
        starting_after: startingAfter,
      });

      for (const sub of page.data) {
        const kind = sub.metadata?.kind;
        if (kind !== "membership" && kind !== "coverage") continue;

        // Replay through the exact same pure handler + mutation the real
        // webhook uses — a reconcile sweep is just a synthetic
        // "customer.subscription.updated" event per subscription. Idempotent
        // by construction (see stripeHandlers.test.ts).
        await ctx.runMutation((internal as any).garden.memberships.applyStripeEvent, {
          event: {
            id: `reconcile_${sub.id}_${Date.now()}`,
            type: "customer.subscription.updated",
            data: { object: sub },
          },
        });
        processed++;
      }

      startingAfter = page.has_more ? page.data[page.data.length - 1]?.id : undefined;
    } while (startingAfter);

    console.log(`[stripe] reconcile complete — ${processed} subscriptions converged`);
    return { processed, skipped: false };
  },
});
