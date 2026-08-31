// Stripe webhook state transitions — THE CORE, PURE (spec §5, architect §2.3).
// No Convex import, no `stripe` SDK import, no network. Takes a locally-typed
// Stripe event + a minimal Db interface and returns/awaits state changes only
// through that interface, so this file is unit-testable without a deployment
// (see stripeHandlers.test.ts) and swappable onto a real ctx.db adapter
// (see garden/memberships.ts, which is the only file that touches ctx.db).
//
// Every handler is IDEMPOTENT: replaying the same event (or receiving events
// out of order) converges to the same end state. That's what makes the
// nightly reconcile cron (garden/stripe.ts) safe to run as a dumb replay of
// synthetic "customer.subscription.updated" events — it calls the exact same
// code path as the webhook.
//
// Design note (metadata mirroring): `checkout.session.completed` only proves
// a session finished — the authoritative subscription status/quantity lives
// on the Subscription object. Two things make that safe here:
//   1. garden/stripe.ts sets `subscription_data.metadata` to the *same*
//      object as the session metadata, so every subscription.* webhook is
//      self-sufficient (kind/level/hostOrgId/userId all present) even if it
//      arrives before checkout.session.completed does.
//   2. The webhook endpoint is configured (architect note, see http.ts) to
//      expand `data.object.subscription` on checkout.session.completed, so
//      we usually get status/price/period-end without a follow-up API call.
//      If it ever arrives unexpanded, we fall back to "incomplete" and let
//      the almost-always-following subscription.updated event converge —
//      idempotency makes either order correct.

// ——— Locally-typed Stripe shapes (intentionally NOT `stripe` package types —
// this file must stay dependency-free so it never risks bundling `stripe`
// into anything, and so tests need no network/SDK). ———

export interface StripeSubscriptionItemLike {
  price: { id: string };
  quantity?: number;
  /** Stripe API versions have moved this between the subscription's top
   * level and the item level over time; extractCurrentPeriodEnd checks both. */
  current_period_end?: number;
}

export interface StripeSubscriptionLike {
  id: string;
  customer: string;
  status: string; // Stripe.Subscription.Status
  current_period_end?: number;
  items: { data: StripeSubscriptionItemLike[] };
  metadata?: Record<string, string> | null;
}

export interface StripeCheckoutSessionLike {
  id: string;
  mode: string; // "subscription" | "payment" | "setup"
  customer: string | null;
  /** String id normally; an expanded object when the webhook endpoint
   * requests `expand: ["data.object.subscription"]` (see http.ts). */
  subscription: string | StripeSubscriptionLike | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string> | null;
  /** Total charged in the smallest currency unit — present on one-time
   * payment sessions (event tickets). */
  amount_total?: number | null;
}

export type StripeWebhookEvent =
  | {
      id: string;
      type: "checkout.session.completed";
      data: { object: StripeCheckoutSessionLike };
    }
  | {
      id: string;
      type: "customer.subscription.created" | "customer.subscription.updated";
      data: { object: StripeSubscriptionLike };
    }
  | {
      id: string;
      type: "customer.subscription.deleted";
      data: { object: StripeSubscriptionLike };
    }
  | { id: string; type: string; data: { object: unknown } };

// ——— The Db interface pure handlers depend on. Rows use plain strings for
// ids (Convex Ids ARE strings at runtime; garden/memberships.ts's adapter
// passes real ctx.db values through unchanged). ———

export interface BillingCustomerRow {
  userId: string;
  stripeCustomerId: string;
  email?: string;
}

export interface MembershipRow {
  userId: string;
  level: string; // "seat" | "five" | "host"
  status: string; // "active" | "past_due" | "canceled" | "incomplete"
  hostOrgId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  currentPeriodEnd?: number;
  coveredByCodeId?: string;
}

export interface CoverageCodeRow {
  hostOrgId: string;
  code: string;
  seats: number;
  stripeSubscriptionId: string;
  status: string; // "active" | "suspended" | "canceled"
}

export interface TicketPurchaseRow {
  eventId: string;
  tierName: string;
  amountCents: number;
  buyerEmail?: string;
  userId?: string;
  stripeSessionId: string;
  status: string; // "paid"
}

export interface Db {
  getBillingCustomerByStripeId(stripeCustomerId: string): Promise<BillingCustomerRow | null>;
  upsertBillingCustomer(row: BillingCustomerRow): Promise<void>;

  getMembershipBySubscription(stripeSubscriptionId: string): Promise<MembershipRow | null>;
  upsertMembership(row: MembershipRow): Promise<void>;

  getCodeBySubscription(stripeSubscriptionId: string): Promise<CoverageCodeRow | null>;
  updateCode(
    stripeSubscriptionId: string,
    patch: Partial<Pick<CoverageCodeRow, "seats" | "status">>,
  ): Promise<void>;

  /** Keyed by stripeSessionId — replaying the same checkout.session.completed
   * event must converge to one row (idempotency, same as memberships). */
  upsertTicketPurchase(row: TicketPurchaseRow): Promise<void>;
}

// ——— Pure helpers ———

/** Membership status mapping (task spec, verbatim). Unknown Stripe statuses
 * (e.g. a future "paused") fall back to "incomplete" rather than guessing —
 * never silently grant or strip entitlements on a status we don't recognize. */
const MEMBERSHIP_STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "canceled",
  incomplete_expired: "canceled",
  incomplete: "incomplete",
};

export function mapSubscriptionStatus(stripeStatus: string): string {
  return MEMBERSHIP_STATUS_MAP[stripeStatus] ?? "incomplete";
}

export function extractCurrentPeriodEnd(sub: StripeSubscriptionLike): number | undefined {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const item = sub.items?.data?.[0];
  return typeof item?.current_period_end === "number" ? item.current_period_end : undefined;
}

export function extractPriceId(sub: StripeSubscriptionLike): string | undefined {
  return sub.items?.data?.[0]?.price?.id;
}

export function extractQuantity(sub: StripeSubscriptionLike): number | undefined {
  return sub.items?.data?.[0]?.quantity;
}

function subscriptionId(session: StripeCheckoutSessionLike): string | undefined {
  return typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
}

function expandedSubscription(session: StripeCheckoutSessionLike): StripeSubscriptionLike | null {
  return typeof session.subscription === "string" || session.subscription === null
    ? null
    : session.subscription;
}

// ——— checkout.session.completed (membership + event tickets — coverage
// checkout + issuance is W2; other kinds/modes are ignored defensively) ———

/** One-time payment session for an event ticket (mode "payment",
 * kind "event_ticket" — created by garden/stripe.ts's createTicketCheckout).
 * Records the completed purchase, keyed by session id for idempotency. */
async function handleTicketCheckoutCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const { eventId, tierName, userId } = metadata;
  if (!eventId || !tierName) {
    console.warn("[stripe] event_ticket checkout.session.completed missing metadata", {
      sessionId: session.id,
    });
    return;
  }

  await db.upsertTicketPurchase({
    eventId,
    tierName,
    amountCents: session.amount_total ?? 0,
    buyerEmail: session.customer_details?.email ?? undefined,
    userId: userId || undefined,
    stripeSessionId: session.id,
    status: "paid",
  });
}

async function handleCheckoutSessionCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  const metadata = session.metadata ?? {};

  if (session.mode === "payment") {
    if (metadata.kind === "event_ticket") {
      return handleTicketCheckoutCompleted(session, db);
    }
    return; // unknown one-time payment kind — ignore defensively
  }

  if (session.mode !== "subscription") return;

  if (metadata.kind !== "membership") return;

  const { userId, level, hostOrgId } = metadata;
  if (!userId || !level || !hostOrgId) {
    console.warn("[stripe] checkout.session.completed missing required metadata", {
      sessionId: session.id,
    });
    return;
  }

  const subId = subscriptionId(session);
  if (!subId) {
    console.warn("[stripe] checkout.session.completed has no subscription id", {
      sessionId: session.id,
    });
    return;
  }

  if (session.customer) {
    await db.upsertBillingCustomer({
      userId,
      stripeCustomerId: session.customer,
      email: session.customer_details?.email ?? undefined,
    });
  }

  const sub = expandedSubscription(session);
  const status = sub ? mapSubscriptionStatus(sub.status) : "incomplete";

  const existing = await db.getMembershipBySubscription(subId);

  await db.upsertMembership({
    userId,
    level,
    status,
    hostOrgId,
    stripeSubscriptionId: subId,
    stripePriceId: sub ? extractPriceId(sub) : undefined,
    currentPeriodEnd: sub ? extractCurrentPeriodEnd(sub) : undefined,
    // A subscription.updated event may have already landed first (out-of-
    // order) and set this — never clobber it from a checkout session, which
    // has no concept of coverage.
    coveredByCodeId: existing?.coveredByCodeId,
  });
}

// ——— customer.subscription.updated / .created (membership + coverage) ———

async function handleMembershipSubscriptionUpdate(
  sub: StripeSubscriptionLike,
  db: Db,
  status: string,
): Promise<void> {
  const existing = await db.getMembershipBySubscription(sub.id);
  const metadata = sub.metadata ?? {};

  const userId = metadata.userId ?? existing?.userId;
  const hostOrgId = metadata.hostOrgId ?? existing?.hostOrgId;
  const level = metadata.level ?? existing?.level;

  if (!userId || !hostOrgId || !level) {
    // No metadata (legacy/foreign subscription) and no prior row to fall
    // back on — we can't reconstruct enough to create a membership safely.
    console.warn("[stripe] subscription event: cannot resolve membership identity", {
      subscriptionId: sub.id,
    });
    return;
  }

  await db.upsertMembership({
    userId,
    level,
    status,
    hostOrgId,
    stripeSubscriptionId: sub.id,
    stripePriceId: extractPriceId(sub),
    currentPeriodEnd: extractCurrentPeriodEnd(sub),
    coveredByCodeId: existing?.coveredByCodeId,
  });
}

/** Coverage-code status mirrors the subscription, with the coverage-specific
 * vocabulary (schema: "active" | "suspended" | "canceled") and the hard
 * grace rule: card failure suspends the CODE, it never touches the
 * memberships it already covers (those are a separate, operator-mediated
 * lapse — spec item 2, architect R5). An "incomplete" subscription (payment
 * not yet confirmed) leaves the code's status untouched rather than guessing. */
async function handleCoverageSubscriptionUpdate(sub: StripeSubscriptionLike, db: Db): Promise<void> {
  const code = await db.getCodeBySubscription(sub.id);
  if (!code) {
    // Coverage-code issuance (creating the row) is W2 — a subscription
    // update for a code we don't know about yet is a no-op here.
    console.warn("[stripe] coverage subscription update with no coverageCodes row (issuance is W2)", {
      subscriptionId: sub.id,
    });
    return;
  }

  const mapped = mapSubscriptionStatus(sub.status);
  const status =
    mapped === "active" ? "active" : mapped === "past_due" ? "suspended" : mapped === "canceled" ? "canceled" : code.status;

  const quantity = extractQuantity(sub);

  await db.updateCode(sub.id, {
    seats: quantity ?? code.seats,
    status,
  });
}

async function handleSubscriptionUpdated(sub: StripeSubscriptionLike, db: Db): Promise<void> {
  const kind = sub.metadata?.kind;

  if (kind === "coverage") return handleCoverageSubscriptionUpdate(sub, db);
  if (kind && kind !== "membership") return; // unknown recurring kind — ignore defensively

  await handleMembershipSubscriptionUpdate(sub, db, mapSubscriptionStatus(sub.status));
}

// ——— customer.subscription.deleted (membership + coverage) ———

async function handleSubscriptionDeleted(sub: StripeSubscriptionLike, db: Db): Promise<void> {
  const kind = sub.metadata?.kind;

  if (kind === "coverage") {
    const code = await db.getCodeBySubscription(sub.id);
    if (!code) return; // never issued (W2) or already gone — nothing to converge
    await db.updateCode(sub.id, { status: "canceled" });
    return;
  }
  if (kind && kind !== "membership") return;

  // Deletion always means canceled — no status mapping ambiguity, and
  // idempotent (re-applying to an already-canceled row is a no-op change).
  await handleMembershipSubscriptionUpdate(sub, db, "canceled");
}

// ——— Dispatcher ———

export async function handleStripeEvent(event: StripeWebhookEvent, db: Db): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(event.data.object as StripeCheckoutSessionLike, db);
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object as StripeSubscriptionLike, db);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as StripeSubscriptionLike, db);
    default:
      return; // every other event type is intentionally ignored (W1 scope)
  }
}
