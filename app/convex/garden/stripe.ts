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
const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

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
  },
  handler: async (ctx, args) => {
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
    // No hostOrgId: a seat is platform membership, not community membership
    // (community-groups.md §0).
    const metadata: Record<string, string> = {
      kind: "membership",
      level: args.level,
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

// ——— createTicketCheckout — one-time payment for an event ticket tier ———
//
// Same shape as createMembershipCheckout but mode="payment" with inline
// price_data (tiers are per-event, so there's no pre-provisioned Stripe
// price). Metadata {kind: "event_ticket", eventId, tierName, userId?} rides
// on the session; checkout.session.completed records the purchase into
// ticketPurchases via the existing webhook path (stripeHandlers.ts →
// memberships.makeConvexDb). Guests can buy — auth is optional, Stripe
// collects the buyer's email either way.

export const createTicketCheckout = action({
  args: {
    eventId: v.id("events"),
    tierName: v.string(),
  },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(
      (internal as any).events.getEventForTicketCheckout,
      { eventId: args.eventId, tierName: args.tierName },
    );
    if (!info) {
      throw new ConvexError("That event isn't there anymore.");
    }
    if (info.status !== "published") {
      throw new ConvexError("This event isn't selling tickets right now.");
    }
    if (info.datetime < Date.now()) {
      throw new ConvexError("This event has already happened.");
    }
    const tier = info.tier;
    if (!tier) {
      throw new ConvexError("That ticket tier no longer exists — refresh and try again.");
    }
    if (tier.quantity !== undefined && info.sold >= tier.quantity) {
      throw new ConvexError(`"${tier.name}" tickets are sold out.`);
    }

    const userId = await auth.getUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();

    const stripe = getStripeClient();

    const metadata: Record<string, string> = {
      kind: "event_ticket",
      eventId: String(args.eventId),
      tierName: tier.name,
      ...(userId ? { userId: String(userId) } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: identity?.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: tier.priceCents,
            product_data: {
              name: `${info.title} — ${tier.name}`,
              ...(tier.description ? { description: tier.description } : {}),
            },
          },
        },
      ],
      metadata,
      success_url: `${siteUrl()}/events/${args.eventId}?ticket=success`,
      cancel_url: `${siteUrl()}/events/${args.eventId}`,
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

// ——— createPoolContributionCheckout — one-time "fund the pool" payment ———
//
// Money words: this is NEVER "donate"/"gift"/tax-deductible copy — money
// through the platform's own Stripe account is fund/back/"add to the
// project pool" language only (see fund.$slug.tsx and community-groups.md
// §3). "Donate" stays reserved for the AP out-link lane the fund page
// already renders when an org has givingUrl/paymentLinkUrl.
//
// Same shape as createTicketCheckout (mode "payment", inline price_data —
// there's no pre-provisioned Stripe price for an arbitrary contribution
// amount). checkout.session.completed records the inflow into
// grantContributions (type "contribution_in") via the existing webhook path
// (stripeHandlers.ts's handlePoolContributionCompleted → memberships.
// makeConvexDb). Guests can pay — auth is optional, same as ticket
// checkout; Stripe collects the buyer's email either way.

const MIN_POOL_CONTRIBUTION_CENTS = 500; // $5
const MAX_POOL_CONTRIBUTION_CENTS = 500_000; // $5,000 — bigger asks go through Rick directly

// hostOrgs.slug for the single platform row (mirrors garden/communities.ts's
// PLATFORM_ORG_SLUG). Kept as a literal rather than imported so this "use
// node" action file doesn't pull communities.ts's query/mutation-defining
// module into its bundle for one constant.
const PLATFORM_HOST_ORG_SLUG = "creatives-exchange";

export const createPoolContributionCheckout = action({
  args: {
    amountCents: v.number(),
    hostOrgSlug: v.optional(v.string()),
    payerName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.amountCents)) {
      throw new ConvexError({ reason: "Give a whole number of cents." });
    }
    if (args.amountCents < MIN_POOL_CONTRIBUTION_CENTS) {
      throw new ConvexError({
        reason: `Contributions start at $${(MIN_POOL_CONTRIBUTION_CENTS / 100).toFixed(0)}.`,
      });
    }
    if (args.amountCents > MAX_POOL_CONTRIBUTION_CENTS) {
      throw new ConvexError({
        reason: `Contributions top out at $${(MAX_POOL_CONTRIBUTION_CENTS / 100).toLocaleString()} here — for anything bigger, reach out directly.`,
      });
    }

    const slug = args.hostOrgSlug ?? PLATFORM_HOST_ORG_SLUG;
    const hostOrg = await ctx.runQuery(
      (internal as any).garden.memberships.getHostOrgBySlug,
      { slug },
    );
    if (!hostOrg) {
      throw new ConvexError({ reason: "That project pool isn't set up yet — check back soon." });
    }
    if (hostOrg.kind !== "platform" && hostOrg.kind !== "community") {
      throw new ConvexError({
        reason:
          "This organization's fund runs through its own giving link, not the project pool — look for the Give button on their page.",
      });
    }

    const userId = await auth.getUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();

    const stripe = getStripeClient();

    const productName =
      hostOrg.kind === "platform"
        ? "Project pool — creatives.exchange"
        : `Project pool — ${hostOrg.name}`;

    const metadata: Record<string, string> = {
      kind: "pool_contribution",
      hostOrgId: String(hostOrg._id),
      ...(userId ? { userId: String(userId) } : {}),
      ...(args.payerName ? { payerName: args.payerName } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: identity?.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: args.amountCents,
            product_data: { name: productName },
          },
        },
      ],
      metadata,
      success_url: `${siteUrl()}/fund/${hostOrg.slug}?contributed=1`,
      cancel_url: `${siteUrl()}/fund/${hostOrg.slug}`,
      allow_promotion_codes: false,
    });

    if (!session.url) {
      throw new ConvexError("Stripe did not return a checkout URL.");
    }

    return { url: session.url };
  },
});

// ——— createProductCheckout — one-time or monthly community product ———
//
// Same shape as createTicketCheckout/createPoolContributionCheckout (mode
// varies by billing, inline price_data — communityProducts has no
// pre-provisioned Stripe price) but reuses createMembershipCheckout's
// billing-customer pattern for signed-in buyers, because a monthly product
// needs a Stripe customer to attach the subscription to and a one-time
// buyer benefits from it too (one customer per user across every checkout +
// the billing portal). Guests may buy a one-time product; monthly requires
// sign-in so the subscription has a user to tie back to (productPurchases.
// userId is how customer.subscription.* webhooks find their rows via
// stripeSubscriptionId, but hasProductAccess — garden/products.ts — reads
// by userId, so a guest subscription could never be recognized as owned).
// Metadata mirrors onto subscription_data for monthly, same reasoning as
// createMembershipCheckout: every customer.subscription.* / invoice.paid
// webhook must be self-sufficient (kind/productId/hostOrgId/billing) even
// if it arrives before checkout.session.completed does — see
// stripeHandlers.ts's header comment.

export const createProductCheckout = action({
  args: {
    productId: v.id("communityProducts"),
  },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(
      (internal as any).garden.memberships.getProductForCheckout,
      { productId: args.productId },
    );
    if (!info) {
      throw new ConvexError("That product isn't there anymore.");
    }
    const { product, org } = info;

    if (product.status !== "active") {
      throw new ConvexError("This product isn't for sale right now.");
    }
    if (org.kind !== "community" || (org.status ?? "active") !== "active") {
      throw new ConvexError("This community isn't set up to sell right now.");
    }

    const userId = await auth.getUserId(ctx);
    if (product.billing === "monthly" && !userId) {
      throw new ConvexError("Sign in to subscribe — we tie a subscription to your account.");
    }

    const stripe = getStripeClient();

    // Reuse one Stripe customer per user across checkouts + the billing
    // portal (architect §3.4) — same pattern as createMembershipCheckout.
    let stripeCustomerId: string | undefined;
    if (userId) {
      const existing = await ctx.runQuery(
        (internal as any).garden.memberships.getBillingCustomerForUser,
        { userId: String(userId) },
      );
      stripeCustomerId = existing?.stripeCustomerId;
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
    }

    const metadata: Record<string, string> = {
      kind: "community_product",
      productId: String(args.productId),
      hostOrgId: String(product.hostOrgId),
      ...(userId ? { userId: String(userId) } : {}),
      billing: product.billing,
    };

    const isMonthly = product.billing === "monthly";
    const successUrl = `${siteUrl()}/communities/${org.slug}?purchased=1`;
    const cancelUrl = `${siteUrl()}/communities/${org.slug}`;

    const session = await stripe.checkout.sessions.create({
      mode: isMonthly ? "subscription" : "payment",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: product.priceCents,
            product_data: { name: `${product.name} — ${org.name}` },
            ...(isMonthly ? { recurring: { interval: "month" as const } } : {}),
          },
        },
      ],
      metadata,
      ...(isMonthly ? { subscription_data: { metadata } } : {}),
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
    });

    if (!session.url) {
      throw new ConvexError("Stripe did not return a checkout URL.");
    }

    return { url: session.url };
  },
});

// ——— createBillingPortalSession — self-serve card update / cancel ———
//
// Points a signed-in user at their existing Stripe customer's Billing
// Portal — the only self-serve lane for cancelling a seat/product
// subscription or updating a card (there's no in-app cancel/update flow).
// Reuses the same billingCustomers row createMembershipCheckout and
// createProductCheckout write on first checkout (architect §3.4): one
// Stripe customer per user across every checkout *and* the portal, so this
// works for a seat, a Five/Leader membership, or a monthly community
// product alike.
//
// NOTE: the portal's available actions (cancel, update payment method,
// view invoices, switch plan, etc.) are configured in the Stripe dashboard
// under Settings → Billing → Customer portal, not here. Whatever a member
// does in the portal — including cancellation — flows back through the
// existing `customer.subscription.updated`/`customer.subscription.deleted`
// webhooks (stripeHandlers.ts, already implemented/tested), so nothing
// else on the Convex side needs to change to reflect it.

export const createBillingPortalSession = action({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new ConvexError("Sign in to manage billing.");
    }

    const existing = await ctx.runQuery(
      (internal as any).garden.memberships.getBillingCustomerForUser,
      { userId: String(userId) },
    );
    if (!existing?.stripeCustomerId) {
      throw new ConvexError("No billing on file yet — a seat or a purchase sets this up.");
    }

    const stripe = getStripeClient();

    const session = await stripe.billingPortal.sessions.create({
      customer: existing.stripeCustomerId,
      return_url: `${siteUrl()}/settings`,
    });

    return { url: session.url };
  },
});

// ——— Nightly reconcile — the backstop (architect §2.3, "never cut") ———
//
// Note: this sweep only replays `customer.subscription.*` state (see the
// loop below) — it never reconciles invoices, so a missed invoice.paid
// delivery for a dues share has no backstop today; that gap is tracked
// alongside the rest of the money-model follow-ups, not solved here.

export const reconcileMemberships = internalAction({
  args: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx) => {
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
