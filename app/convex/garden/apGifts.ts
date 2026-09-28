// AP's own Stripe account — a SECOND, independent webhook (docs/phase-1b/
// stripe-runbook.md §5 "On-site donations to the grant fund", interim
// step). Abiding Practice (AP) runs its own Stripe account for general
// giving; when a donor designates a gift for The Garden's grant fund, this
// records it directly into `grantContributions` at the FULL amount — no
// platform share, because we never touch the money (it settles straight
// into AP's account, not ours). That's the opposite of the platform's own
// /stripe/webhook (garden/stripeHandlers.ts + garden/memberships.ts), whose
// events describe money moving through OUR account.
//
// Pure logic (the designation rule + the row shaper) is split out and
// exported so it's unit-testable with no Convex/Stripe import, same
// reasoning as stripeHandlers.ts's header. The Convex glue below it is a
// single small mutation, not a whole adapter — this integration is one
// event shape, not the dozen the platform webhook dispatches.

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const AP_HOST_ORG_SLUG = "abiding-practice";

// ——— Locally-typed Stripe shapes (intentionally not the `stripe` package's
// types — see stripeHandlers.ts's header for why: dependency-free, no
// network needed to unit test). ———

export interface ApCheckoutSessionLike {
  id: string;
  payment_status?: string; // "paid" | "unpaid" | "no_payment_required"
  currency?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
  /** String id normally; only an object when the webhook endpoint expands
   * it, which this integration doesn't request. */
  payment_link?: string | { id: string } | null;
  customer_details?: { name?: string | null; email?: string | null } | null;
  /** Seconds since epoch — same "period" fallback stripeHandlers.ts uses for
   * one-time payment sessions, which carry no period_start. */
  created?: number;
}

export type ApStripeWebhookEvent =
  | {
      id: string;
      type: "checkout.session.completed" | "checkout.session.async_payment_succeeded";
      data: { object: ApCheckoutSessionLike };
    }
  | { id: string; type: string; data: { object: unknown } };

/** Shape of the row this file writes — a subset of schema.ts's
 * grantContributions, always `type: "contribution_in"`, always
 * `platformCents: 0` (we don't move the money, so we take no cut). */
export interface ApGrantContributionRow {
  hostOrgId: string;
  type: "contribution_in";
  grossCents: number;
  platformCents: 0;
  poolCents: number;
  payerName?: string;
  stripeRef: string; // "ap:<session id>" — prefixed so it can never collide
  // with the platform account's own checkout session / invoice ids.
  period: string; // "YYYY-MM"
  note: string;
  createdAt: number;
}

// ——— Pure designation rule ———

/** Whether a paid AP checkout session is a gift designated for The Garden's
 * grant fund, vs. one of AP's own unrelated donations flowing through the
 * same Stripe account. Two ways a donor/AP can designate it:
 *   1. `metadata.fund === "grant-fund"` on the session (set when AP builds
 *      a checkout that lets the donor choose), or
 *   2. the session came from one of AP's dedicated grant-fund Payment
 *      Links (`AP_GRANT_PAYMENT_LINK_IDS`, comma-separated `plink_…` ids) —
 *      the simpler path when AP just hands out a fixed link.
 * Neither present → it's none of our business; the caller does nothing and
 * still answers 200 so Stripe doesn't retry AP's unrelated payments. */
export function isApGrantFundGift(
  session: Pick<ApCheckoutSessionLike, "metadata" | "payment_link">,
  grantPaymentLinkIds: string[],
): boolean {
  if (session.metadata?.fund === "grant-fund") return true;

  const linkId =
    typeof session.payment_link === "string" ? session.payment_link : session.payment_link?.id;
  if (linkId && grantPaymentLinkIds.includes(linkId)) return true;

  return false;
}

/** "YYYY-MM" from a Stripe seconds-since-epoch timestamp — same UTC
 * convention as stripeHandlers.ts's periodFromStripeSeconds and
 * allocations.period, duplicated rather than imported so this file stays
 * dependency-free (this file's header note). */
function periodFromStripeSeconds(seconds: number): string {
  const d = new Date(seconds * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export type BuildApGrantRowResult =
  | { row: ApGrantContributionRow }
  | { skipped: true; reason: string };

/** Shapes a `grantContributions` row from a paid, grant-fund-designated AP
 * session. Caller is responsible for the designation check
 * (isApGrantFundGift) and for resolving hostOrgId — this function only
 * knows how to turn a session into a row, plus the currency guard (we only
 * ever record usd; the schema has no currency column, so anything else
 * would silently misrepresent the amount). */
export function buildApGrantContributionRow(args: {
  session: ApCheckoutSessionLike;
  hostOrgId: string;
  now: number;
}): BuildApGrantRowResult {
  const { session, hostOrgId, now } = args;

  const currency = (session.currency ?? "usd").toLowerCase();
  if (currency !== "usd") {
    return { skipped: true, reason: `non-usd currency (${currency}), skipping` };
  }

  const grossCents = session.amount_total ?? 0;
  const periodSeconds = session.created ?? Math.floor(now / 1000);

  return {
    row: {
      hostOrgId,
      type: "contribution_in",
      grossCents,
      platformCents: 0,
      poolCents: grossCents,
      // NEVER session.customer_details?.email — a payer name is opt-in
      // display copy, not a captured email (same rule as stripeHandlers.ts's
      // handlePoolContributionCompleted).
      payerName: session.customer_details?.name || undefined,
      stripeRef: `ap:${session.id}`,
      period: periodFromStripeSeconds(periodSeconds),
      note: "Gift through Abiding Practice",
      createdAt: now,
    },
  };
}

// ——— Convex glue: the one mutation the /stripe/ap/webhook route calls ———

export const applyApStripeEvent = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => {
    const event = args.event as ApStripeWebhookEvent;

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return; // not a session event — nothing for this route to do
    }

    const session = event.data.object as ApCheckoutSessionLike;

    if (session.payment_status !== "paid") {
      console.log("[ap stripe webhook] session not paid, ignoring", event.id, session.id);
      return;
    }

    const grantPaymentLinkIds = (process.env.AP_GRANT_PAYMENT_LINK_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!isApGrantFundGift(session, grantPaymentLinkIds)) {
      console.log("[ap stripe webhook] not a grant-fund gift", event.id);
      return;
    }

    // Thrown (not logged-and-returned) so the route answers 500 and Stripe
    // retries until abiding-practice is seeded — a grant-fund gift must
    // never be silently dropped just because the org row isn't there yet.
    const org = await ctx.db
      .query("hostOrgs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_slug", (q: any) => q.eq("slug", AP_HOST_ORG_SLUG))
      .unique();
    if (!org) {
      throw new Error(
        `[ap stripe webhook] "${AP_HOST_ORG_SLUG}" hostOrg not seeded — run garden/devSeed:seedApOrg`,
      );
    }

    const stripeRef = `ap:${session.id}`;
    const existing = await ctx.db
      .query("grantContributions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_stripeRef", (q: any) => q.eq("stripeRef", stripeRef))
      .unique();
    if (existing) return; // idempotent replay

    const result = buildApGrantContributionRow({ session, hostOrgId: String(org._id), now: Date.now() });
    if ("skipped" in result) {
      console.log("[ap stripe webhook]", result.reason, event.id);
      return;
    }

    const { hostOrgId: _hostOrgId, ...rest } = result.row;
    await ctx.db.insert("grantContributions", {
      ...rest,
      hostOrgId: org._id as Id<"hostOrgs">,
    });
  },
});

