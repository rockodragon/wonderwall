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
// Same account, second use (2026-09-28): an event can also sell tickets
// through an AP Payment Link instead of the platform's own ticketTiers/
// Connect checkout (events.externalTicketUrl, schema.ts). A ticket sale is
// distinguished from a designated gift by `client_reference_id` — set by
// buildTicketLink below when the event page builds the link a buyer clicks
// — rather than by metadata/payment_link id the way a gift is, because the
// ref also needs to carry WHICH event (and, when known, which signed-in
// user) the purchase is for. The buyer is added to the event via the same
// insert/dedupe path as a free RSVP (garden/eventRsvps.ts's upsertEventRsvp)
// and the ticket is recorded into grantContributions as `ticket_in` — a
// benefit for the artist grant fund, same as a gift, because AP is still
// merchant of record and the money still never touches our account.
//
// Pure logic (the designation rule, the ticket-ref format, and the row
// shapers) is split out and exported so it's unit-testable with no Convex/
// Stripe import, same reasoning as stripeHandlers.ts's header. The Convex
// glue below it is a single small mutation, not a whole adapter — this
// integration is a couple of event shapes, not the dozen the platform
// webhook dispatches.

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { decideTableTicket, paidWithVerifiedEmail, upsertEventRsvp } from "./eventRsvps";
import { parseGiftRef } from "./givingLink";

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
  /** Set by buildTicketLink below when the session came from an event's
   * ticket link, rather than by AP's own checkout (a gift has no client
   * reference id). Absent on anything unrelated to this integration. */
  client_reference_id?: string | null;
  /** The Payment Link's custom fields — AP's has one optional text box for
   * the other guests' names (ticketLink.ts guestNamesFrom). */
  custom_fields?: StripeCustomFieldLike[] | null;
  /** Set when the Payment Link sells a subscription (a monthly gift). */
  subscription?: string | { id: string } | null;
  /** Seconds since epoch — same "period" fallback stripeHandlers.ts uses for
   * one-time payment sessions, which carry no period_start. */
  created?: number;
}

/** The parts of a Stripe invoice a monthly gift's renewal needs. Where the
 * subscription id lives has moved across API versions, so both places. */
export interface ApInvoiceLike {
  id: string;
  billing_reason?: string | null; // "subscription_create" | "subscription_cycle" | …
  amount_paid?: number | null;
  currency?: string | null;
  created?: number;
  period_start?: number;
  customer_name?: string | null;
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
}

export function invoiceSubscriptionId(invoice: ApInvoiceLike): string | null {
  const s = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  if (!s) return null;
  return typeof s === "string" ? s : s.id;
}

/** A renewal of a monthly gift → one contribution row. The first invoice
 * ("subscription_create") is skipped: its checkout session already
 * recorded that payment. */
export function buildApRenewalRow(args: {
  invoice: ApInvoiceLike;
  hostOrgId: string;
  payerName?: string;
  userId?: string;
  memberGiftId?: string;
  now: number;
}): BuildApGrantRowResult {
  const { invoice, hostOrgId, payerName, userId, memberGiftId, now } = args;
  if (invoice.billing_reason === "subscription_create") {
    return { skipped: true, reason: "first invoice — recorded by its checkout" };
  }
  const currency = (invoice.currency ?? "usd").toLowerCase();
  if (currency !== "usd") return { skipped: true, reason: `non-usd currency (${currency}), skipping` };
  const grossCents = invoice.amount_paid ?? 0;
  if (grossCents <= 0) return { skipped: true, reason: "nothing paid" };
  return {
    row: {
      hostOrgId,
      type: "contribution_in",
      grossCents,
      platformCents: 0,
      poolCents: grossCents,
      payerName: payerName || invoice.customer_name || undefined,
      ...(userId ? { userId } : {}),
      ...(memberGiftId ? { memberGiftId } : {}),
      stripeRef: `ap:${invoice.id}`,
      period: periodFromStripeSeconds(invoice.period_start ?? invoice.created ?? Math.floor(now / 1000)),
      note: "Monthly gift through Abiding Practice",
      createdAt: now,
    },
  };
}

export type ApStripeWebhookEvent =
  | { id: string; type: "invoice.paid"; data: { object: ApInvoiceLike } }
  | {
      id: string;
      type: "checkout.session.completed" | "checkout.session.async_payment_succeeded";
      data: { object: ApCheckoutSessionLike };
    }
  | { id: string; type: string; data: { object: unknown } };

/** Shape of the row this file writes — a subset of schema.ts's
 * grantContributions, always `platformCents: 0` (we don't move the money,
 * so we take no cut) whether it's a gift or a ticket. */
export interface ApGrantContributionRow {
  hostOrgId: string;
  type: "contribution_in" | "ticket_in";
  grossCents: number;
  platformCents: 0;
  poolCents: number;
  userId?: string; // the buyer, when a ticket purchase resolved a signed-in user; or the member behind a /give plus-up
  // A member's plus-up to the fund from /give (givingLink.ts): the monthly
  // amount that prompted it. The behavior-change report reads this.
  memberGiftId?: string;
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
  /** From the /give plus-up link's client_reference_id (parseGiftRef). */
  attribution?: { userId: string; memberGiftId: string };
  now: number;
}): BuildApGrantRowResult {
  const { session, hostOrgId, attribution, now } = args;

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
      ...(attribution ? { userId: attribution.userId, memberGiftId: attribution.memberGiftId } : {}),
      stripeRef: `ap:${session.id}`,
      period: periodFromStripeSeconds(periodSeconds),
      note: attribution
        ? (session.subscription ? "Monthly gift through Abiding Practice, added from a member's monthly amount" : "Gift through Abiding Practice, added from a member's monthly amount")
        : "Gift through Abiding Practice",
      createdAt: now,
    },
  };
}

/** Shapes a `grantContributions` row from a paid AP ticket-purchase session
 * (buildTicketLink/parseTicketRef below). Same currency guard and shape as
 * buildApGrantContributionRow, but type "ticket_in", the event's title in
 * the note instead of generic gift copy, and userId carried through when
 * the ref resolved a signed-in buyer. */
export function buildApTicketContributionRow(args: {
  session: ApCheckoutSessionLike;
  hostOrgId: string;
  eventTitle: string;
  userId?: string;
  now: number;
}): BuildApGrantRowResult {
  const { session, hostOrgId, eventTitle, userId, now } = args;

  const currency = (session.currency ?? "usd").toLowerCase();
  if (currency !== "usd") {
    return { skipped: true, reason: `non-usd currency (${currency}), skipping` };
  }

  const grossCents = session.amount_total ?? 0;
  const periodSeconds = session.created ?? Math.floor(now / 1000);

  return {
    row: {
      hostOrgId,
      type: "ticket_in",
      grossCents,
      platformCents: 0,
      poolCents: grossCents,
      userId,
      // NEVER session.customer_details?.email — same rule as the gift row.
      payerName: session.customer_details?.name || undefined,
      stripeRef: `ap:${session.id}`,
      period: periodFromStripeSeconds(periodSeconds),
      note: `Ticket: ${eventTitle}`,
      createdAt: now,
    },
  };
}

// Ticket link helpers live in ./ticketLink (no server imports, so the
// event page can use them in the browser).
export { buildTicketLink, parseTicketRef, type TicketRef } from "./ticketLink";
import {
  guestNamesFrom,
  parseTicketRef,
  ticketCountFor,
  type StripeCustomFieldLike,
  type TicketRef,
} from "./ticketLink";

// ——— Convex glue: the one mutation the /stripe/ap/webhook route calls ———

// Thrown (not logged-and-returned) so the route answers 500 and Stripe
// retries until abiding-practice is seeded — a gift or ticket sale must
// never be silently dropped just because the org row isn't there yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getApHostOrg(ctx: any) {
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
  return org;
}

/** The buyer an AP ticket session may be attributed to.
 * client_reference_id is built in the browser and anyone can edit it, so
 * its user id alone proves nothing. The account is used only when Stripe's
 * checkout email matches that account's verified email; otherwise the
 * buyer is an email guest (claimTicketBySession can still attach a
 * standalone Event's RSVP to whoever holds the checkout session id; a
 * Table's Event only to the participant who paid with that email). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trustedTicketBuyer(ctx: any, session: ApCheckoutSessionLike, ref: TicketRef): Promise<Id<"users"> | undefined> {
  if (!ref.userId) return undefined;
  const userId = ctx.db.normalizeId("users", ref.userId) as Id<"users"> | null;
  const user = userId
    ? ((await ctx.db.get(userId)) as { email?: string; emailVerificationTime?: number } | null)
    : null;
  if (!paidWithVerifiedEmail(user, session.customer_details?.email)) return undefined;
  return userId ?? undefined;
}

/** The ticket branch: session.client_reference_id resolved to an event via
 * parseTicketRef. Adds the buyer to the event (through the same
 * insert/dedupe helper a free RSVP uses) and records the ticket into
 * grantContributions. Never throws on a bad/stale ref — Stripe would just
 * retry forever for a session this route can never make sense of.
 *
 * Standalone Events take any paid ticket, as before. A Table's Event first
 * passes decideTableTicket (eventRsvps.ts); a refused purchase writes neither an RSVP nor
 * a ticket_in row (the money is going back), only an
 * externalTicketExceptions row for an operator to refund in AP's Stripe
 * account. Table checkout's own refund path (classPayments refund_required)
 * doesn't fit: it refunds through the platform's Stripe account and needs
 * a buyer account. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyApTicketSession(ctx: any, event: ApStripeWebhookEvent, session: ApCheckoutSessionLike, ref: TicketRef) {
  const stripeRef = `ap:${session.id}`;

  // Idempotent on ap:<session id> — checked on every table a replay could
  // have already written (the RSVP and the money land in one call below,
  // but a retried webhook after a partial prior failure should still be
  // caught by either one already being there; a refused ticket leaves
  // only its exception row).
  const [existingContribution, existingRsvp, existingException] = await Promise.all([
    ctx.db
      .query("grantContributions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_stripeRef", (q: any) => q.eq("stripeRef", stripeRef))
      .unique(),
    ctx.db
      .query("eventRsvps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_stripeRef", (q: any) => q.eq("stripeRef", stripeRef))
      .unique(),
    ctx.db
      .query("externalTicketExceptions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_stripeRef", (q: any) => q.eq("stripeRef", stripeRef))
      .unique(),
  ]);
  if (existingContribution || existingRsvp || existingException) {
    console.log("[ap stripe webhook] ticket session already applied, ignoring replay", event.id, session.id);
    return;
  }

  const normalizedEventId = ctx.db.normalizeId("events", ref.eventId) as Id<"events"> | null;
  if (!normalizedEventId) {
    console.log("[ap stripe webhook] ticket ref has a malformed event id, ignoring", event.id, ref.eventId);
    return;
  }
  const eventDoc = await ctx.db.get(normalizedEventId);
  if (!eventDoc) {
    console.log("[ap stripe webhook] ticket ref's event no longer exists, ignoring", event.id, ref.eventId);
    return;
  }

  let userId = await trustedTicketBuyer(ctx, session, ref);

  let name: string | undefined;
  let email: string | undefined;
  if (userId) {
    const [profile, userDoc] = await Promise.all([
      ctx.db
        .query("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .unique(),
      ctx.db.get(userId),
    ]);
    name = profile?.name ?? (userDoc as { name?: string } | null)?.name ?? session.customer_details?.name ?? undefined;
    email = (userDoc as { email?: string } | null)?.email ?? session.customer_details?.email ?? undefined;
  } else {
    name = session.customer_details?.name ?? undefined;
    email = session.customer_details?.email ?? undefined;
  }

  if (!email) {
    console.log("[ap stripe webhook] ticket session has no email to RSVP with, ignoring", event.id, session.id);
    return;
  }

  const grossCents = session.amount_total ?? 0;
  // The link lets the buyer pick a quantity; the payload has the total.
  const tickets = ticketCountFor(grossCents, eventDoc.externalTicketPriceCents);

  if (eventDoc.tableId) {
    const decision = await decideTableTicket(ctx, eventDoc, { userId, email, tickets });
    if (!decision.ok) {
      console.error("[ap stripe webhook] Table ticket refused, flagged for refund", event.id, session.id, decision.reason);
      await ctx.db.insert("externalTicketExceptions", {
        stripeRef,
        eventId: normalizedEventId,
        tableId: decision.tableId,
        grossCents,
        currency: (session.currency ?? "usd").toLowerCase(),
        ticketCount: tickets,
        reason: decision.reason,
        payerName: session.customer_details?.name || undefined,
        status: "refund_required",
        createdAt: Date.now(),
      });
      return;
    }
    // A buyer who isn't an accepted participant is recorded as a guest
    // (no account on the row), which is how guest chairs are counted.
    if (!decision.userId) {
      userId = undefined;
      name = session.customer_details?.name ?? undefined;
      email = session.customer_details?.email ?? email;
    }
  }

  await upsertEventRsvp(ctx, {
    eventId: normalizedEventId,
    userId,
    name: name || "Guest",
    email,
    paidCents: grossCents,
    stripeRef,
    tickets,
    guestNames: guestNamesFrom(session.custom_fields),
  });

  const org = await getApHostOrg(ctx);
  const result = buildApTicketContributionRow({
    session,
    hostOrgId: String(org._id),
    eventTitle: eventDoc.title,
    userId: userId ? String(userId) : undefined,
    now: Date.now(),
  });
  if ("skipped" in result) {
    console.log("[ap stripe webhook]", result.reason, event.id);
    return;
  }

  const { hostOrgId: _hostOrgId, userId: _userId, ...rest } = result.row;
  await ctx.db.insert("grantContributions", {
    ...rest,
    userId,
    hostOrgId: org._id as Id<"hostOrgs">,
  });
}

export const applyApStripeEvent = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => {
    const event = args.event as ApStripeWebhookEvent;

    if (event.type === "invoice.paid") {
      await applyApRenewal(ctx, event.id, event.data.object as ApInvoiceLike);
      return;
    }

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

    // Ticket purchases are told apart from designated gifts by
    // client_reference_id (buildTicketLink/parseTicketRef above) — a gift
    // checkout never sets one, so this only ever matches an event's ticket
    // link, and it's checked first so a ticket sale is never mistaken for
    // an undesignated gift just because it also happened to come from one
    // of AP_GRANT_PAYMENT_LINK_IDS.
    const ticketRef = parseTicketRef(session.client_reference_id);
    if (ticketRef) {
      await applyApTicketSession(ctx, event, session, ticketRef);
      return;
    }

    const grantPaymentLinkIds = (process.env.AP_GRANT_PAYMENT_LINK_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    // A plus-up from /give carries `gift-<memberGiftId>-u-<userId>`
    // (givingLink.ts). The link is one of the fund's own, so the ref alone
    // designates it; the ids are checked against real rows before they are
    // written, and a stale ref falls back to an unattributed gift.
    const giftRef = parseGiftRef(session.client_reference_id);
    let attribution: { userId: Id<"users">; memberGiftId: Id<"memberGifts"> } | undefined;
    if (giftRef) {
      const userId = ctx.db.normalizeId("users", giftRef.userId);
      const memberGiftId = ctx.db.normalizeId("memberGifts", giftRef.memberGiftId);
      const gift = memberGiftId ? await ctx.db.get(memberGiftId) : null;
      if (userId && memberGiftId && gift && String(gift.userId) === String(userId)) {
        attribution = { userId, memberGiftId };
      }
    }

    if (!attribution && !isApGrantFundGift(session, grantPaymentLinkIds)) {
      console.log("[ap stripe webhook] not a grant-fund gift", event.id);
      return;
    }

    const org = await getApHostOrg(ctx);

    const stripeRef = `ap:${session.id}`;
    const existing = await ctx.db
      .query("grantContributions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_stripeRef", (q: any) => q.eq("stripeRef", stripeRef))
      .unique();
    if (existing) return; // idempotent replay

    const result = buildApGrantContributionRow({
      session,
      hostOrgId: String(org._id),
      ...(attribution ? { attribution: { userId: String(attribution.userId), memberGiftId: String(attribution.memberGiftId) } } : {}),
      now: Date.now(),
    });
    if ("skipped" in result) {
      console.log("[ap stripe webhook]", result.reason, event.id);
      return;
    }

    // The row's userId/memberGiftId are plain strings; the typed ids come
    // from `attribution` (already resolved against real rows above).
    const { hostOrgId: _hostOrgId, userId: _userId, memberGiftId: _memberGiftId, ...rest } = result.row;
    await ctx.db.insert("grantContributions", {
      ...rest,
      hostOrgId: org._id as Id<"hostOrgs">,
      ...(attribution ? { userId: attribution.userId, memberGiftId: attribution.memberGiftId } : {}),
    });

    // A monthly gift: remember its subscription so renewals are recognized.
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (subscriptionId) {
      const known = await ctx.db
        .query("apGiftSubscriptions")
        .withIndex("by_subscriptionId", (q) => q.eq("subscriptionId", subscriptionId))
        .unique();
      if (!known) {
        await ctx.db.insert("apGiftSubscriptions", {
          subscriptionId,
          hostOrgId: org._id as Id<"hostOrgs">,
          payerName: session.customer_details?.name || undefined,
          ...(attribution ? { userId: attribution.userId, memberGiftId: attribution.memberGiftId } : {}),
          createdAt: Date.now(),
        });
      }
    }
  },
});

/** invoice.paid on AP's account: a renewal of a monthly grant-fund gift adds
 * to the fund; any other subscription of AP's is none of our business. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyApRenewal(ctx: any, eventId: string, invoice: ApInvoiceLike) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const gift = await ctx.db
    .query("apGiftSubscriptions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_subscriptionId", (q: any) => q.eq("subscriptionId", subscriptionId))
    .unique();
  if (!gift) {
    console.log("[ap stripe webhook] invoice for a subscription that isn't a grant-fund gift", eventId);
    return;
  }
  const stripeRef = `ap:${invoice.id}`;
  const existing = await ctx.db
    .query("grantContributions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_stripeRef", (q: any) => q.eq("stripeRef", stripeRef))
    .unique();
  if (existing) return; // idempotent replay
  const result = buildApRenewalRow({
    invoice,
    hostOrgId: String(gift.hostOrgId),
    payerName: gift.payerName,
    ...(gift.userId ? { userId: String(gift.userId) } : {}),
    ...(gift.memberGiftId ? { memberGiftId: String(gift.memberGiftId) } : {}),
    now: Date.now(),
  });
  if ("skipped" in result) {
    console.log("[ap stripe webhook]", result.reason, eventId);
    return;
  }
  const { hostOrgId: _h, userId: _u, memberGiftId: _g, ...rest } = result.row;
  await ctx.db.insert("grantContributions", {
    ...rest,
    hostOrgId: gift.hostOrgId,
    ...(gift.userId ? { userId: gift.userId } : {}),
    ...(gift.memberGiftId ? { memberGiftId: gift.memberGiftId } : {}),
  });
}

