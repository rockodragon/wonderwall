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
//      self-sufficient (kind/level/userId all present) even if it arrives
//      before checkout.session.completed does. hostOrgId is no longer part
//      of that metadata (a seat is platform membership, not community
//      membership — community-groups.md §0); it only survives on rows a
//      covered/legacy path set directly.
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
   * payment sessions (event tickets, pool contributions). */
  amount_total?: number | null;
  /** Seconds since epoch. Used as the contribution `period` fallback for
   * one-time pool contributions, which (unlike invoices) carry no
   * period_start. */
  created?: number;
}

/** Locally-typed Stripe Invoice shape — `invoice.paid` (dues shares). Stripe
 * has moved where a paid invoice's subscription metadata lives across API
 * versions (top-level `subscription_details`, the newer `parent.
 * subscription_details`, and the line item as a last resort), so
 * resolveInvoiceMembershipMetadata checks all three rather than picking one. */
export interface StripeInvoiceLike {
  id: string;
  amount_paid: number;
  created: number;
  customer: string | null;
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  lines?: {
    data?: Array<{
      metadata?: Record<string, string> | null;
      /** Seconds since epoch — the line's billing period. Used (community
       * product renewals only) as the subscription's next currentPeriodEnd,
       * since a paid invoice carries no top-level current_period_end of its
       * own. */
      period?: { end?: number } | null;
    }>;
  } | null;
  /** Seconds since epoch — the billing period this invoice covers. Falls
   * back to `created` when absent. */
  period_start?: number;
  /** "subscription_create" on the very first invoice of a subscription
   * (already recorded by checkout.session.completed), "subscription_cycle"
   * on a renewal. Community-product renewals are recorded ONLY on
   * "subscription_cycle" — see handleProductInvoicePaid. */
  billing_reason?: string;
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
  | {
      id: string;
      type: "invoice.paid";
      data: { object: StripeInvoiceLike };
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
  /** Convex row id — present only on reads (getMembershipBySubscription),
   * never required on a write. Lets handleInvoicePaid reference the
   * membership from a grantContributions row (membershipId). */
  id?: string;
  userId: string;
  level: string; // "seat" | "five" | "host"
  status: string; // "active" | "past_due" | "canceled" | "incomplete"
  /** A seat is PLATFORM membership, not community membership (community-
   * groups.md §0) — new self-paid seats leave this unset. Still set for
   * covered seats (coverage.ts writes ctx.db directly, bypassing this Db). */
  hostOrgId?: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  currentPeriodEnd?: number;
  coveredByCodeId?: string;
}

/** Money IN to a grant pool — the mirror of `allocations` (money OUT).
 * Written by handleInvoicePaid (dues_share) and handlePoolContributionPaid
 * (contribution_in) below; topup_in/sponsor_in/entry_fee_in/adjustment are
 * operator-entered (garden/allocations.ts's recordContribution), never
 * through this webhook path. See schema.ts's grantContributions comment for
 * the fee-rule vocabulary. */
export interface ContributionRow {
  hostOrgId: string;
  type: "dues_share" | "contribution_in" | "topup_in" | "sponsor_in" | "entry_fee_in" | "adjustment";
  grossCents: number;
  platformCents: number;
  poolCents: number;
  userId?: string;
  payerName?: string;
  membershipId?: string;
  stripeRef?: string;
  period: string; // "YYYY-MM"
  note?: string;
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

/** One row per PAYMENT on a community product (schema.ts's productPurchases
 * comment, verbatim): a one-time checkout, a subscription's first payment
 * (keyed by checkout session id), or a renewal (keyed by invoice id).
 * Written by handleProductCheckoutCompleted and handleProductInvoicePaid
 * below, patched in place by handleProductSubscriptionUpdate/.deleted. */
export interface ProductPurchaseRow {
  productId: string;
  hostOrgId: string;
  userId?: string;
  buyerEmail?: string;
  grossCents: number;
  platformCents: number; // 10% incl. processing — hostSaleSplit below
  hostCents: number; // 90%
  billing: string; // "one_time" | "monthly" — mirrors the product at purchase time
  status: string; // "paid" (one-time) | "active" | "past_due" | "canceled" | "refunded"
  stripeRef: string; // checkout session id or invoice id — idempotency key
  stripeSubscriptionId?: string;
  currentPeriodEnd?: number; // ms, subscriptions
  period: string; // "YYYY-MM"
}

/** One row per act of support on a project (schema.ts's projectSupport).
 * Written here only for the two FINANCIAL types: a backing checkout
 * (garden/stripe.ts's createBackingCheckout) inserts a "pending" row up
 * front, and this file confirms it once Stripe says the money actually
 * moved.
 *
 * STATUS INCONSISTENCY (pre-existing, named rather than "fixed" — schema.ts
 * is owned elsewhere): schema.ts documents projectSupport.status as
 * "pending" | "confirmed", but garden/support.ts's older pledge path writes
 * "pledged", and its VISIBLE_STATUSES reads "confirmed" | "pledged". The
 * backing path therefore uses the schema's own pair — "pending" (public
 * nowhere: it is in neither VISIBLE_STATUSES nor garden/projects.ts's
 * confirmed-only filter) then "confirmed" — so for real money, only a real
 * charge makes the row public. Nothing here writes "pledged". */
export interface ProjectSupportRow {
  projectId: string;
  supporterUserId?: string;
  supporterName: string;
  type: string; // "financial_one_time" | "financial_recurring"
  amountCents: number;
  message?: string;
  visible: boolean;
  status: string; // "pending" | "confirmed"
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

  /** Resolves a hostOrgs row's id by slug — used to find the platform pool
   * row ("creatives-exchange") for dues shares and pool contributions that
   * don't name a community. */
  getHostOrgIdBySlug(slug: string): Promise<string | null>;

  /** Idempotency check for grantContributions, keyed by stripeRef (an
   * invoice id or checkout session id) — same convergence pattern as
   * upsertMembership/upsertTicketPurchase, but contributions are
   * insert-once (never patched), so this is a lookup-before-insert instead
   * of an upsert. */
  getContributionByStripeRef(stripeRef: string): Promise<{ stripeRef: string } | null>;
  insertContribution(row: ContributionRow): Promise<void>;

  /** Idempotency check for productPurchases, keyed by stripeRef (a checkout
   * session id for a first payment, an invoice id for a renewal) — same
   * lookup-before-insert pattern as getContributionByStripeRef. */
  getProductPurchaseByRef(stripeRef: string): Promise<{ stripeRef: string } | null>;
  insertProductPurchase(row: ProductPurchaseRow): Promise<void>;

  /** Propagates a subscription's status/period-end onto every
   * productPurchases row keyed by that stripeSubscriptionId — there can be
   * more than one (the first-payment row plus any renewal rows). Unknown
   * subscription id is a safe no-op. */
  updateProductPurchasesBySubscription(
    stripeSubscriptionId: string,
    patch: { status: string; currentPeriodEnd?: number },
  ): Promise<void>;

  /** Backing (garden/stripe.ts's createBackingCheckout). The checkout action
   * writes the "pending" projectSupport row before redirecting and passes its
   * id on the session metadata, so confirmation is a patch keyed by row id —
   * the same converge-on-replay guarantee upsertMembership gets from the
   * subscription id, without needing a stripeRef column projectSupport
   * doesn't have. insertProjectSupport is the fallback for a session whose
   * pending row is gone (or predates it). */
  getProjectSupportById(supportId: string): Promise<{ id: string; status: string } | null>;
  updateProjectSupport(
    supportId: string,
    patch: Partial<Pick<ProjectSupportRow, "status" | "amountCents">>,
  ): Promise<void>;
  insertProjectSupport(row: ProjectSupportRow): Promise<void>;

  /** Coverage-code issuance (garden/stripe.ts's createCoverageCheckout).
   * getCodeByCode is the uniqueness check for a freshly generated code
   * (coverageCodes.code is what a creative types at /c/CODE, so it must not
   * collide); insertCoverageCode is idempotency-guarded by the caller via
   * getCodeBySubscription above — one subscription, one code. */
  getCodeByCode(code: string): Promise<{ code: string } | null>;
  insertCoverageCode(row: CoverageCodeRow): Promise<void>;
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

// ——— Fee rules (community-grant-pools.md §2 "one bite per dollar") ———
//
// The single row's own dollar amounts are what makes each math case
// checkable at a glance from the ledger — see grantContributions' schema
// comment. Kept local to this file (rather than imported) because they're
// pure integer math with no Convex/Stripe surface of their own.

/** Dues (subscription invoices): pool 50% / platform 50% (platform's half
 * covers processing too). */
function duesSplit(grossCents: number): { platformCents: number; poolCents: number } {
  const poolCents = Math.round(grossCents * 0.5);
  return { platformCents: grossCents - poolCents, poolCents };
}

/** One-time pool contributions ("one bite per dollar"): platform 10%
 * including processing, pool gets the rest. Same formula recordContribution
 * (garden/allocations.ts) uses for operator-entered topup/sponsor/entry-fee
 * inflows — kept in one place there since that mutation has no Stripe event
 * to hang off of. */
function contributionSplit(grossCents: number): { platformCents: number; poolCents: number } {
  const platformCents = Math.round(grossCents * 0.1);
  return { platformCents, poolCents: grossCents - platformCents };
}

/** Anything a host sells (community products): host 90% / platform 10%
 * including processing. Same rule and rounding as products.ts's
 * splitHostSale, reimplemented locally (not imported) so this file stays
 * dependency-free — see header note. */
function hostSaleSplit(grossCents: number): { platformCents: number; hostCents: number } {
  const platformCents = Math.round(grossCents * 0.1);
  return { platformCents, hostCents: grossCents - platformCents };
}

/** Stripe timestamps are seconds since epoch; every ms-typed field on our
 * rows (productPurchases.currentPeriodEnd) needs this conversion. */
function toMsTimestamp(seconds: number | undefined): number | undefined {
  return typeof seconds === "number" ? seconds * 1000 : undefined;
}

/** "YYYY-MM" from a Stripe seconds-since-epoch timestamp — same convention
 * allocations.period already uses (UTC, so this never drifts with the
 * server's local timezone). */
function periodFromStripeSeconds(seconds: number): string {
  const d = new Date(seconds * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** hostOrgs.slug for the single platform row (mirrors garden/communities.ts's
 * PLATFORM_ORG_SLUG). Duplicated as a literal, not imported, so this pure
 * file never pulls in communities.ts's Convex query/mutation definitions —
 * see this file's header note on staying dependency-free. */
const PLATFORM_HOST_ORG_SLUG = "creatives-exchange";

// ——— Backing a project (garden/stripe.ts's createBackingCheckout) ———
//
// The $5 floor is a margin rule, not a UX preference: Stripe's 30c fixed fee
// eats an unreasonable share of anything smaller (docs/features/
// community-groups.md §3 — the same floor createPoolContributionCheckout
// uses). Pure so the checkout action and its tests share one authority.

export const MIN_BACKING_CENTS = 500; // $5

/** Null when the amount is fundable; otherwise the reason to show the
 * backer, verbatim. Money words: "back"/"fund"/"add to", never
 * "donate"/"gift"/tax-deductible — this money moves through the platform's
 * own Stripe account (see garden/stripe.ts's header). */
export function validateBackingAmount(amountCents: number): string | null {
  if (!Number.isFinite(amountCents) || !Number.isInteger(amountCents)) {
    return "Give a whole number of cents.";
  }
  if (amountCents < MIN_BACKING_CENTS) {
    return `Backing starts at $${(MIN_BACKING_CENTS / 100).toFixed(0)}.`;
  }
  return null;
}

// ——— Coverage-code generation (garden/stripe.ts's createCoverageCheckout) ———
//
// Same alphabet and shape as convex/invites.ts's generateCode and
// helpers.ts's ensureAdminCode: no 0/O/1/I, so a code read off a bulletin
// board or a slide can't be mistyped into someone else's.

const COVERAGE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const COVERAGE_CODE_LENGTH = 8;
const COVERAGE_CODE_ATTEMPTS = 25;

function randomCoverageCode(): string {
  let code = "";
  for (let i = 0; i < COVERAGE_CODE_LENGTH; i++) {
    code += COVERAGE_CODE_CHARS[Math.floor(Math.random() * COVERAGE_CODE_CHARS.length)];
  }
  return code;
}

/** Collision handling mirrors ensureAdminCode: generate, check, retry a
 * bounded number of times. Exhausting every attempt THROWS rather than
 * quietly skipping issuance (the file's usual posture for unresolvable
 * data) — a sponsor has already been charged at this point, so a 500 that
 * Stripe retries is strictly better than a paid subscription with no code. */
async function generateUniqueCoverageCode(db: Db): Promise<string> {
  for (let attempt = 0; attempt < COVERAGE_CODE_ATTEMPTS; attempt++) {
    const candidate = randomCoverageCode();
    if (!(await db.getCodeByCode(candidate))) return candidate;
  }
  throw new Error("Could not generate a unique coverage code");
}

// ——— checkout.session.completed (membership, event tickets, pool
// contributions, community products, project backing, and coverage-code
// issuance; other kinds/modes are ignored defensively) ———

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

/** One-time payment session for a pool contribution (mode "payment",
 * kind "pool_contribution" — created by garden/stripe.ts's
 * createPoolContributionCheckout). "One bite per dollar": platform takes
 * 10%, the rest locks to the named pool (or the platform pool when no
 * community is named). Idempotent by session id, like ticket checkouts. */
async function handlePoolContributionCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  const grossCents = session.amount_total ?? 0;
  if (grossCents <= 0) {
    console.warn("[stripe] pool_contribution checkout.session.completed has no amount", {
      sessionId: session.id,
    });
    return;
  }

  if (await db.getContributionByStripeRef(session.id)) return; // idempotent replay

  const metadata = session.metadata ?? {};
  const hostOrgId = metadata.hostOrgId || (await db.getHostOrgIdBySlug(PLATFORM_HOST_ORG_SLUG));
  if (!hostOrgId) {
    console.warn("[stripe] pool_contribution checkout.session.completed: no resolvable host org (is the platform row seeded?)", {
      sessionId: session.id,
    });
    return;
  }

  const { platformCents, poolCents } = contributionSplit(grossCents);
  const periodSeconds = session.created ?? Math.floor(Date.now() / 1000);

  await db.insertContribution({
    hostOrgId,
    type: "contribution_in",
    grossCents,
    platformCents,
    poolCents,
    userId: metadata.userId || undefined,
    // NEVER session.customer_details?.email — a payer name is opt-in
    // display copy, not a captured email (task spec, money-words rule).
    payerName: metadata.payerName || undefined,
    stripeRef: session.id,
    period: periodFromStripeSeconds(periodSeconds),
  });
}

/** Checkout session for a community product (mode "payment" for one_time,
 * "subscription" for monthly — created by garden/stripe.ts's
 * createProductCheckout). Records the payment, keyed by session id for
 * idempotency, with the 90/10 host split. A monthly purchase's status is
 * "active" (not "paid" — it needs the subscription lifecycle to keep it
 * entitled); its stripeSubscriptionId/currentPeriodEnd come from the
 * expanded subscription when present, same fallback-to-"incomplete"-later
 * reasoning as handleCheckoutSessionCompleted's membership branch (an
 * almost-always-following subscription.updated event converges it). */
async function handleProductCheckoutCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  if (await db.getProductPurchaseByRef(session.id)) return; // idempotent replay

  const metadata = session.metadata ?? {};
  const { productId, hostOrgId, billing, userId } = metadata;
  if (!productId || !hostOrgId || !billing) {
    console.warn("[stripe] community_product checkout.session.completed missing metadata", {
      sessionId: session.id,
    });
    return;
  }

  const grossCents = session.amount_total ?? 0;
  const { platformCents, hostCents } = hostSaleSplit(grossCents);
  const periodSeconds = session.created ?? Math.floor(Date.now() / 1000);

  const sub = expandedSubscription(session);

  await db.insertProductPurchase({
    productId,
    hostOrgId,
    userId: userId || undefined,
    buyerEmail: session.customer_details?.email ?? undefined,
    grossCents,
    platformCents,
    hostCents,
    billing,
    status: billing === "monthly" ? "active" : "paid",
    stripeRef: session.id,
    stripeSubscriptionId: billing === "monthly" ? subscriptionId(session) : undefined,
    currentPeriodEnd: sub ? toMsTimestamp(extractCurrentPeriodEnd(sub)) : undefined,
    period: periodFromStripeSeconds(periodSeconds),
  });
}

/** Backing a project — mode "payment" for "Give once", "subscription" for
 * "Give monthly" (kind "backing", created by garden/stripe.ts's
 * createBackingCheckout). The projectSupport row already exists as "pending"
 * (written by the action before the redirect, its id carried on the session
 * metadata); this confirms it, which is what makes it visible in the Support
 * modal and counted by garden/projects.ts's confirmed-only filter.
 *
 * Idempotent two ways: a replay finds the row already "confirmed" and stops,
 * and the fallback insert (pending row missing — deleted, or a session
 * created before it existed) is only reached when there is no id to converge
 * on. */
async function handleBackingCheckoutCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const { projectId, supportId, userId, supporterName, visible } = metadata;
  const type = session.mode === "subscription" ? "financial_recurring" : "financial_one_time";

  if (supportId) {
    const existing = await db.getProjectSupportById(supportId);
    if (existing) {
      if (existing.status === "confirmed") return; // idempotent replay
      // Only the status moves: amount/visibility/message were captured at
      // intent time and Stripe charged exactly that (no promotion codes).
      await db.updateProjectSupport(supportId, { status: "confirmed" });
      return;
    }
  }

  if (!projectId) {
    console.warn("[stripe] backing checkout.session.completed missing projectId metadata", {
      sessionId: session.id,
    });
    return;
  }

  const amountCents = session.amount_total ?? 0;
  if (amountCents <= 0) {
    console.warn("[stripe] backing checkout.session.completed has no amount", {
      sessionId: session.id,
    });
    return;
  }

  await db.insertProjectSupport({
    projectId,
    supporterUserId: userId || undefined,
    supporterName: supporterName || "Someone",
    type,
    amountCents,
    // NEVER session.customer_details?.email — a supporter name is opt-in
    // display copy, not a captured email (same rule as pool contributions).
    visible: visible === "true",
    status: "confirmed",
  });
}

/** Coverage — a sponsor (a church) buying N seats: mode "subscription",
 * kind "coverage", quantity = seats (created by garden/stripe.ts's
 * createCoverageCheckout). Issues the coverageCodes row a creative redeems
 * at /c/CODE (garden/coverage.ts). The seat count and the code's later
 * status are then kept in sync by handleCoverageSubscriptionUpdate below —
 * this only has to get the row into existence.
 *
 * Idempotent by subscription id: one subscription, one code, forever. A
 * replay (or an out-of-order subscription.updated that arrived first and was
 * a no-op) converges on the same single row. */
async function handleCoverageCheckoutCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const { hostOrgId, seats } = metadata;
  const subId = subscriptionId(session);

  if (!hostOrgId || !subId) {
    console.warn("[stripe] coverage checkout.session.completed missing hostOrgId or subscription", {
      sessionId: session.id,
    });
    return;
  }

  if (await db.getCodeBySubscription(subId)) return; // idempotent replay

  const sub = expandedSubscription(session);
  const parsedSeats = Number(seats);
  const seatCount =
    Number.isInteger(parsedSeats) && parsedSeats > 0
      ? parsedSeats
      : (sub ? extractQuantity(sub) : undefined) ?? 1;

  // Issue ACTIVE unless the subscription is already visibly in trouble. An
  // unexpanded or "incomplete" subscription issues active on purpose: the
  // grace rule is that billing trouble suspends a code, never that a
  // sponsor who just paid waits on a webhook race — and the
  // almost-always-following subscription.updated converges it either way
  // (see handleCoverageSubscriptionUpdate).
  const mapped = sub ? mapSubscriptionStatus(sub.status) : "active";
  const status = mapped === "past_due" ? "suspended" : mapped === "canceled" ? "canceled" : "active";

  await db.insertCoverageCode({
    hostOrgId,
    code: await generateUniqueCoverageCode(db),
    seats: seatCount,
    stripeSubscriptionId: subId,
    status,
  });
}

async function handleCheckoutSessionCompleted(
  session: StripeCheckoutSessionLike,
  db: Db,
): Promise<void> {
  const metadata = session.metadata ?? {};

  if (metadata.kind === "community_product") {
    return handleProductCheckoutCompleted(session, db);
  }

  // Backing spans both modes ("Give once" is a payment, "Give monthly" a
  // subscription), so it dispatches before the mode split.
  if (metadata.kind === "backing") {
    return handleBackingCheckoutCompleted(session, db);
  }

  if (session.mode === "payment") {
    if (metadata.kind === "event_ticket") {
      return handleTicketCheckoutCompleted(session, db);
    }
    if (metadata.kind === "pool_contribution") {
      return handlePoolContributionCompleted(session, db);
    }
    return; // unknown one-time payment kind — ignore defensively
  }

  if (session.mode !== "subscription") return;

  if (metadata.kind === "coverage") {
    return handleCoverageCheckoutCompleted(session, db);
  }

  if (metadata.kind !== "membership") return;

  // hostOrgId is intentionally NOT required here — a seat is platform
  // membership, not community membership (community-groups.md §0); new
  // self-paid checkouts carry no hostOrgId at all.
  const { userId, level } = metadata;
  if (!userId || !level) {
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
    // No hostOrgId in metadata anymore (a seat is platform membership) —
    // preserve one only if a prior row already had it (e.g. out-of-order
    // arrival after a covered/legacy row was written directly by
    // coverage.ts).
    hostOrgId: existing?.hostOrgId,
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
  const level = metadata.level ?? existing?.level;
  // Optional — a seat is platform membership, not community membership.
  // Kept only for legacy/covered rows that already carried one.
  const hostOrgId = metadata.hostOrgId ?? existing?.hostOrgId;

  if (!userId || !level) {
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
    // Issuance happens on checkout.session.completed
    // (handleCoverageCheckoutCompleted above). An update that beats it —
    // or one for a foreign/legacy subscription — is a no-op here; the
    // checkout event issues the row and carries the seat count itself.
    console.warn("[stripe] coverage subscription update with no coverageCodes row yet", {
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

/** Community-product subscription: patches every productPurchases row keyed
 * by this stripeSubscriptionId (the first-payment row plus any renewal
 * rows) with the mapped status and period end. Unknown subscription id is a
 * safe no-op — the Db method itself finds nothing to patch. */
async function handleProductSubscriptionUpdate(
  sub: StripeSubscriptionLike,
  db: Db,
  status: string,
): Promise<void> {
  await db.updateProductPurchasesBySubscription(sub.id, {
    status,
    currentPeriodEnd: toMsTimestamp(extractCurrentPeriodEnd(sub)),
  });
}

async function handleSubscriptionUpdated(sub: StripeSubscriptionLike, db: Db): Promise<void> {
  const kind = sub.metadata?.kind;

  if (kind === "coverage") return handleCoverageSubscriptionUpdate(sub, db);
  if (kind === "community_product") {
    return handleProductSubscriptionUpdate(sub, db, mapSubscriptionStatus(sub.status));
  }
  if (kind && kind !== "membership") return; // unknown recurring kind — ignore defensively

  await handleMembershipSubscriptionUpdate(sub, db, mapSubscriptionStatus(sub.status));
}

// ——— customer.subscription.deleted (membership + coverage + community product) ———

async function handleSubscriptionDeleted(sub: StripeSubscriptionLike, db: Db): Promise<void> {
  const kind = sub.metadata?.kind;

  if (kind === "coverage") {
    const code = await db.getCodeBySubscription(sub.id);
    if (!code) return; // never issued, or already gone — nothing to converge
    await db.updateCode(sub.id, { status: "canceled" });
    return;
  }
  if (kind === "community_product") {
    // Deletion always means canceled — no status mapping ambiguity, and
    // idempotent (re-applying to an already-canceled row is a no-op change).
    return handleProductSubscriptionUpdate(sub, db, "canceled");
  }
  if (kind && kind !== "membership") return;

  // Deletion always means canceled — no status mapping ambiguity, and
  // idempotent (re-applying to an already-canceled row is a no-op change).
  await handleMembershipSubscriptionUpdate(sub, db, "canceled");
}

// ——— invoice.paid (dues shares) ———

/** Stripe has relocated a paid invoice's subscription metadata across API
 * versions — try the newer `parent.subscription_details`, then the older
 * top-level `subscription_details`, then fall back to the first line
 * item's metadata (subscription_data.metadata mirrors onto both, per this
 * file's header note). Returns null when none carry any metadata at all. */
function resolveInvoiceMembershipMetadata(invoice: StripeInvoiceLike): Record<string, string> | null {
  return (
    invoice.parent?.subscription_details?.metadata ??
    invoice.subscription_details?.metadata ??
    invoice.lines?.data?.[0]?.metadata ??
    null
  );
}

function subscriptionIdFromInvoice(invoice: StripeInvoiceLike): string | undefined {
  const sub = invoice.subscription;
  if (!sub) return undefined;
  return typeof sub === "string" ? sub : sub.id;
}

/** Dues share on a paid membership invoice — the recurring half of the
 * grant-pool inflow (the other half is one-time pool contributions, see
 * handlePoolContributionCompleted above). Idempotent by invoice id, and a
 * deliberately quiet no-op — never throws — on anything that can't be
 * resolved: a missing platform hostOrgs row is an ops issue to fix (seed
 * it), not a reason to fail the webhook and have Stripe retry forever. */
/** Renewal invoice on a community-product subscription — the recurring half
 * of a monthly product's income (the first payment is recorded by
 * handleProductCheckoutCompleted instead). Only "subscription_cycle"
 * invoices are recorded here; the very first invoice on a new subscription
 * carries billing_reason "subscription_create" and is deliberately skipped
 * — checkout.session.completed already wrote that row. Idempotent by
 * invoice id, quiet no-op on anything unresolvable, same reasoning as
 * handleInvoicePaid below. */
async function handleProductInvoicePaid(
  invoice: StripeInvoiceLike,
  metadata: Record<string, string>,
  db: Db,
): Promise<void> {
  if (invoice.billing_reason !== "subscription_cycle") return; // first invoice — already recorded at checkout

  if (await db.getProductPurchaseByRef(invoice.id)) return; // idempotent replay

  const { productId, hostOrgId, userId } = metadata;
  if (!productId || !hostOrgId) {
    console.warn("[stripe] community_product invoice.paid missing metadata", {
      invoiceId: invoice.id,
    });
    return;
  }

  const grossCents = invoice.amount_paid;
  const { platformCents, hostCents } = hostSaleSplit(grossCents);
  const periodEndSeconds = invoice.lines?.data?.[0]?.period?.end ?? undefined;

  await db.insertProductPurchase({
    productId,
    hostOrgId,
    userId: userId || undefined,
    grossCents,
    platformCents,
    hostCents,
    billing: "monthly",
    status: "active",
    stripeRef: invoice.id,
    stripeSubscriptionId: subscriptionIdFromInvoice(invoice),
    currentPeriodEnd: toMsTimestamp(periodEndSeconds),
    period: periodFromStripeSeconds(invoice.period_start ?? invoice.created),
  });
}

async function handleInvoicePaid(invoice: StripeInvoiceLike, db: Db): Promise<void> {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return; // $0 invoice (e.g. a trial) — nothing moved

  const metadata = resolveInvoiceMembershipMetadata(invoice);
  if (!metadata) return; // no resolvable subscription metadata at all

  if (metadata.kind === "community_product") {
    return handleProductInvoicePaid(invoice, metadata, db);
  }

  if (metadata.kind !== "membership") return; // not a membership subscription's invoice

  if (await db.getContributionByStripeRef(invoice.id)) return; // idempotent replay

  const hostOrgId = await db.getHostOrgIdBySlug(PLATFORM_HOST_ORG_SLUG);
  if (!hostOrgId) {
    console.warn("[stripe] invoice.paid: platform host org row is missing — has 'creatives-exchange' been seeded?", {
      invoiceId: invoice.id,
    });
    return;
  }

  const grossCents = invoice.amount_paid;
  const { platformCents, poolCents } = duesSplit(grossCents);

  const subId = subscriptionIdFromInvoice(invoice);
  const membership = subId ? await db.getMembershipBySubscription(subId) : null;

  await db.insertContribution({
    hostOrgId,
    type: "dues_share",
    grossCents,
    platformCents,
    poolCents,
    userId: metadata.userId || undefined,
    membershipId: membership?.id,
    stripeRef: invoice.id,
    period: periodFromStripeSeconds(invoice.period_start ?? invoice.created),
  });
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
    case "invoice.paid":
      return handleInvoicePaid(event.data.object as StripeInvoiceLike, db);
    default:
      return; // every other event type is intentionally ignored (W1 scope)
  }
}
