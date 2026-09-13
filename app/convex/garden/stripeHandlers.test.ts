// Pure-logic tests for the Stripe webhook state machine. No Convex, no
// network — an in-memory fake Db + hand-written fixture events shaped like
// real Stripe payloads. This is the correctness proof for W1 (nothing
// executes against real Stripe tonight — see stripe.ts).

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractCurrentPeriodEnd,
  handleStripeEvent,
  mapSubscriptionStatus,
  validateBackingAmount,
  MIN_BACKING_CENTS,
  type BillingCustomerRow,
  type ContributionRow,
  type CoverageCodeRow,
  type Db,
  type MembershipRow,
  type ProductPurchaseRow,
  type ProjectSupportRow,
  type StripeCheckoutSessionLike,
  type StripeInvoiceLike,
  type StripeSubscriptionLike,
  type StripeWebhookEvent,
  type TicketPurchaseRow,
} from "./stripeHandlers";
import { deriveGardenUser } from "./entitlements";

// ——— In-memory fake Db ———

const PLATFORM_HOST_ORG_ID = "hostOrg_platform";

function createFakeDb() {
  const memberships = new Map<string, MembershipRow>(); // keyed by stripeSubscriptionId
  const codes = new Map<string, CoverageCodeRow>(); // keyed by stripeSubscriptionId
  const billingCustomers = new Map<string, BillingCustomerRow>(); // keyed by userId
  const ticketPurchases = new Map<string, TicketPurchaseRow>(); // keyed by stripeSessionId
  const contributions = new Map<string, ContributionRow>(); // keyed by stripeRef
  const productPurchases = new Map<string, ProductPurchaseRow>(); // keyed by stripeRef
  // Keyed by row id — a backing checkout writes its "pending" row before the
  // redirect (garden/support.ts's startBacking) and the webhook converges on
  // that id, since projectSupport has no stripeRef column.
  const projectSupport = new Map<string, ProjectSupportRow & { id: string }>();
  let nextSupportId = 1;
  const projectRaisedCents = new Map<string, number>(); // projectId -> accumulated cents
  // Only "creatives-exchange" is seeded by default — tests that need it
  // absent (the "missing platform row" case) delete it first.
  const hostOrgsBySlug = new Map<string, string>([["creatives-exchange", PLATFORM_HOST_ORG_ID]]);
  let nextMembershipId = 1;
  const membershipIds = new Map<string, string>(); // stripeSubscriptionId -> id

  const db: Db = {
    async getBillingCustomerByStripeId(stripeCustomerId) {
      for (const row of billingCustomers.values()) {
        if (row.stripeCustomerId === stripeCustomerId) return row;
      }
      return null;
    },
    async upsertBillingCustomer(row) {
      billingCustomers.set(row.userId, row);
    },
    async getMembershipBySubscription(id) {
      const row = memberships.get(id);
      if (!row) return null;
      if (!membershipIds.has(id)) membershipIds.set(id, `membership_${nextMembershipId++}`);
      return { ...row, id: membershipIds.get(id) };
    },
    async upsertMembership(row) {
      memberships.set(row.stripeSubscriptionId, row);
    },
    async getCodeBySubscription(id) {
      return codes.get(id) ?? null;
    },
    async updateCode(id, patch) {
      const existing = codes.get(id);
      if (!existing) return;
      codes.set(id, { ...existing, ...patch });
    },
    async upsertTicketPurchase(row) {
      ticketPurchases.set(row.stripeSessionId, row);
    },
    async getHostOrgIdBySlug(slug) {
      return hostOrgsBySlug.get(slug) ?? null;
    },
    async getContributionByStripeRef(stripeRef) {
      const row = contributions.get(stripeRef);
      return row ? { stripeRef } : null;
    },
    async insertContribution(row) {
      if (!row.stripeRef) throw new Error("test fixture expects every contribution to carry a stripeRef");
      contributions.set(row.stripeRef, row);
    },
    async getProductPurchaseByRef(stripeRef) {
      return productPurchases.has(stripeRef) ? { stripeRef } : null;
    },
    async insertProductPurchase(row) {
      productPurchases.set(row.stripeRef, row);
    },
    async updateProductPurchasesBySubscription(stripeSubscriptionId, patch) {
      for (const [ref, row] of productPurchases) {
        if (row.stripeSubscriptionId === stripeSubscriptionId) {
          productPurchases.set(ref, { ...row, ...patch });
        }
      }
    },
    async getProjectSupportById(supportId) {
      const row = projectSupport.get(supportId);
      return row ? { id: row.id, status: row.status, amountCents: row.amountCents, projectId: row.projectId } : null;
    },
    async updateProjectSupport(supportId, patch) {
      const existing = projectSupport.get(supportId);
      if (!existing) return;
      projectSupport.set(supportId, { ...existing, ...patch });
    },
    async insertProjectSupport(row) {
      const id = `support_${nextSupportId++}`;
      projectSupport.set(id, { ...row, id });
    },
    async incrementProjectRaisedCents(projectId, amountCents) {
      projectRaisedCents.set(projectId, (projectRaisedCents.get(projectId) ?? 0) + amountCents);
    },
    async getCodeByCode(code) {
      for (const row of codes.values()) {
        if (row.code === code) return { code: row.code };
      }
      return null;
    },
    async insertCoverageCode(row) {
      codes.set(row.stripeSubscriptionId, row);
    },
  };

  return {
    db,
    memberships,
    codes,
    billingCustomers,
    ticketPurchases,
    contributions,
    productPurchases,
    hostOrgsBySlug,
    projectSupport,
    projectRaisedCents,
  };
}

// ——— Fixtures (hand-written, shaped like real Stripe objects) ———

// No hostOrgId: a seat is platform membership, not community membership
// (community-groups.md §0) — new self-paid checkouts never carry one.
const MEMBERSHIP_METADATA = {
  kind: "membership",
  level: "seat",
  userId: "user_diane",
};

function subscriptionFixture(overrides: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    current_period_end: 1_800_000_000,
    items: { data: [{ price: { id: "price_seat" }, quantity: 1 }] },
    metadata: { ...MEMBERSHIP_METADATA },
    ...overrides,
  };
}

function checkoutSessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_123",
    mode: "subscription",
    customer: "cus_123",
    subscription: subscriptionFixture(),
    customer_details: { email: "diane@example.com" },
    metadata: { ...MEMBERSHIP_METADATA },
    ...overrides,
  };
}

function event(type: StripeWebhookEvent["type"], object: unknown, id = "evt_1"): StripeWebhookEvent {
  return { id, type, data: { object } } as StripeWebhookEvent;
}

const COVERAGE_METADATA = { kind: "coverage", hostOrgId: "hostOrg_grace" };

function coverageSubscriptionFixture(
  overrides: Partial<StripeSubscriptionLike> = {},
): StripeSubscriptionLike {
  return {
    id: "sub_grace",
    customer: "cus_grace",
    status: "active",
    items: { data: [{ price: { id: "price_seat" }, quantity: 10 }] },
    metadata: { ...COVERAGE_METADATA },
    ...overrides,
  };
}

// ——— checkout.session.completed ———

describe("checkout.session.completed", () => {
  it("happy path: creates billingCustomer + active membership", async () => {
    const { db, memberships, billingCustomers } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", checkoutSessionFixture()), db);

    expect(billingCustomers.get("user_diane")).toEqual({
      userId: "user_diane",
      stripeCustomerId: "cus_123",
      email: "diane@example.com",
    });

    const m = memberships.get("sub_123");
    expect(m).toBeTruthy();
    expect(m).toMatchObject({
      userId: "user_diane",
      level: "seat",
      status: "active",
      // Platform membership, not community membership — new seats never
      // carry a hostOrgId (community-groups.md §0).
      hostOrgId: undefined,
      stripePriceId: "price_seat",
      currentPeriodEnd: 1_800_000_000,
    });
  });

  it("trialing subscription still confers active (grace)", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        checkoutSessionFixture({ subscription: subscriptionFixture({ status: "trialing" }) }),
      ),
      db,
    );
    expect(memberships.get("sub_123")?.status).toBe("active");
  });

  it("non-subscription mode sessions are ignored", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", checkoutSessionFixture({ mode: "payment" })),
      db,
    );
    expect(memberships.size).toBe(0);
  });

  it("a coverage session with no hostOrgId writes nothing (never a membership)", async () => {
    const { db, memberships, billingCustomers, codes } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", checkoutSessionFixture({ metadata: { kind: "coverage" } })),
      db,
    );
    expect(memberships.size).toBe(0);
    expect(billingCustomers.size).toBe(0);
    expect(codes.size).toBe(0); // issuance needs a sponsoring org
  });

  it("unexpanded subscription (string id only) falls back to incomplete, not a guess", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", checkoutSessionFixture({ subscription: "sub_123" })),
      db,
    );
    expect(memberships.get("sub_123")?.status).toBe("incomplete");
  });
});

// ——— checkout.session.completed (event tickets — mode "payment") ———

function ticketSessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_ticket_1",
    mode: "payment",
    customer: null,
    subscription: null,
    customer_details: { email: "diane@example.com" },
    amount_total: 2500,
    metadata: {
      kind: "event_ticket",
      eventId: "event_showcase",
      tierName: "General",
      userId: "user_diane",
    },
    ...overrides,
  };
}

describe("checkout.session.completed (event tickets)", () => {
  it("records a paid ticket purchase keyed by session id", async () => {
    const { db, ticketPurchases } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", ticketSessionFixture()),
      db,
    );
    expect(ticketPurchases.get("cs_ticket_1")).toEqual({
      eventId: "event_showcase",
      tierName: "General",
      amountCents: 2500,
      buyerEmail: "diane@example.com",
      userId: "user_diane",
      stripeSessionId: "cs_ticket_1",
      status: "paid",
    });
  });

  it("guest checkout (no userId in metadata) still records with buyer email", async () => {
    const { db, ticketPurchases } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        ticketSessionFixture({
          metadata: {
            kind: "event_ticket",
            eventId: "event_showcase",
            tierName: "Patron",
          },
        }),
      ),
      db,
    );
    const purchase = ticketPurchases.get("cs_ticket_1")!;
    expect(purchase.userId).toBeUndefined();
    expect(purchase.buyerEmail).toBe("diane@example.com");
    expect(purchase.tierName).toBe("Patron");
  });

  it("idempotent replay: same session event twice yields one row", async () => {
    const { db, ticketPurchases } = createFakeDb();
    const evt = event("checkout.session.completed", ticketSessionFixture());
    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);
    expect(ticketPurchases.size).toBe(1);
  });

  it("missing eventId/tierName metadata is a safe no-op", async () => {
    const { db, ticketPurchases } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        ticketSessionFixture({ metadata: { kind: "event_ticket" } }),
      ),
      db,
    );
    expect(ticketPurchases.size).toBe(0);
  });

  it("payment sessions of unknown kind never touch tickets or memberships", async () => {
    const { db, ticketPurchases, memberships } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        ticketSessionFixture({ metadata: { kind: "something_else" } }),
      ),
      db,
    );
    expect(ticketPurchases.size).toBe(0);
    expect(memberships.size).toBe(0);
  });
});

// ——— customer.subscription.updated ———

describe("customer.subscription.updated (membership)", () => {
  it("syncs status, price, and currentPeriodEnd", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(event("customer.subscription.updated", subscriptionFixture()), db);
    expect(memberships.get("sub_123")).toMatchObject({
      status: "active",
      stripePriceId: "price_seat",
      currentPeriodEnd: 1_800_000_000,
    });
  });

  it("past_due keeps the entitled status per entitlements grace rules", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(
      event("customer.subscription.updated", subscriptionFixture({ status: "past_due" })),
      db,
    );
    const m = memberships.get("sub_123")!;
    expect(m.status).toBe("past_due");
    // Cross-check against the real entitlement derivation: past_due must
    // still confer the level (entitlements.ts's ENTITLED_STATUSES).
    const gardenUser = deriveGardenUser({
      userId: m.userId,
      profile: { name: "Diane" },
      memberships: [m],
      activePassionProjects: 0,
    });
    expect(gardenUser.level).toBe("seat");
  });

  it.each([
    ["canceled", "canceled"],
    ["unpaid", "canceled"],
    ["incomplete_expired", "canceled"],
    ["incomplete", "incomplete"],
  ] as const)("maps Stripe status %s to membership status %s", async (stripeStatus, expected) => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(
      event("customer.subscription.updated", subscriptionFixture({ status: stripeStatus })),
      db,
    );
    expect(memberships.get("sub_123")?.status).toBe(expected);
  });

  it("unrecognized Stripe status falls back to incomplete rather than guessing", () => {
    expect(mapSubscriptionStatus("paused")).toBe("incomplete");
  });

  it("idempotent replay: applying the same event twice yields one row, same state", async () => {
    const { db, memberships } = createFakeDb();
    const evt = event("customer.subscription.updated", subscriptionFixture());
    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);
    expect(memberships.size).toBe(1);
    expect(memberships.get("sub_123")?.status).toBe("active");
  });

  it("out-of-order: subscription.updated before checkout.session.completed still converges", async () => {
    const { db, memberships } = createFakeDb();

    // subscription.updated arrives first — self-sufficient via mirrored
    // subscription_data.metadata (see stripe.ts / this file's header note).
    await handleStripeEvent(event("customer.subscription.updated", subscriptionFixture()), db);
    expect(memberships.size).toBe(1);
    expect(memberships.get("sub_123")?.status).toBe("active");

    // checkout.session.completed arrives second — same subscription id,
    // must converge to a single row, not duplicate.
    await handleStripeEvent(event("checkout.session.completed", checkoutSessionFixture()), db);
    expect(memberships.size).toBe(1);
    expect(memberships.get("sub_123")).toMatchObject({
      userId: "user_diane",
      level: "seat",
      status: "active",
      hostOrgId: undefined,
    });
  });

  it("missing metadata and no prior row is a safe no-op (cannot reconstruct identity)", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(
      event("customer.subscription.updated", subscriptionFixture({ id: "sub_orphan", metadata: null })),
      db,
    );
    expect(memberships.size).toBe(0);
  });
});

// ——— customer.subscription.deleted ———

describe("customer.subscription.deleted (membership)", () => {
  it("cancels an existing membership", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(event("customer.subscription.updated", subscriptionFixture()), db);
    await handleStripeEvent(
      event("customer.subscription.deleted", subscriptionFixture({ status: "canceled" })),
      db,
    );
    expect(memberships.get("sub_123")?.status).toBe("canceled");
  });

  it("idempotent: deleting twice stays canceled, one row", async () => {
    const { db, memberships } = createFakeDb();
    await handleStripeEvent(event("customer.subscription.updated", subscriptionFixture()), db);
    const del = event("customer.subscription.deleted", subscriptionFixture({ status: "canceled" }));
    await handleStripeEvent(del, db);
    await handleStripeEvent(del, db);
    expect(memberships.size).toBe(1);
    expect(memberships.get("sub_123")?.status).toBe("canceled");
  });
});

// ——— Coverage codes ———

describe("coverage subscriptions", () => {
  it("quantity change syncs coverageCodes.seats", async () => {
    const { db, codes } = createFakeDb();
    codes.set("sub_grace", {
      hostOrgId: "hostOrg_grace",
      code: "GRACE-FALL",
      seats: 10,
      stripeSubscriptionId: "sub_grace",
      status: "active",
    });

    await handleStripeEvent(
      event("customer.subscription.updated", coverageSubscriptionFixture({ items: { data: [{ price: { id: "price_seat" }, quantity: 25 }] } })),
      db,
    );

    expect(codes.get("sub_grace")).toMatchObject({ seats: 25, status: "active" });
  });

  it("payment failure suspends the code — never cancels redeemed memberships", async () => {
    const { db, codes, memberships } = createFakeDb();
    codes.set("sub_grace", {
      hostOrgId: "hostOrg_grace",
      code: "GRACE-FALL",
      seats: 10,
      stripeSubscriptionId: "sub_grace",
      status: "active",
    });
    // A covered creative's membership already exists and must not be touched.
    memberships.set("sub_covered_creative", {
      userId: "user_covered",
      level: "seat",
      status: "active",
      hostOrgId: "hostOrg_grace",
      stripeSubscriptionId: "sub_covered_creative",
      coveredByCodeId: "code_grace",
    });

    await handleStripeEvent(
      event("customer.subscription.updated", coverageSubscriptionFixture({ status: "past_due" })),
      db,
    );

    expect(codes.get("sub_grace")?.status).toBe("suspended");
    expect(codes.get("sub_grace")?.seats).toBe(10);
    // Untouched.
    expect(memberships.get("sub_covered_creative")?.status).toBe("active");
  });

  it("recovers from suspended back to active on a successful retry", async () => {
    const { db, codes } = createFakeDb();
    codes.set("sub_grace", {
      hostOrgId: "hostOrg_grace",
      code: "GRACE-FALL",
      seats: 10,
      stripeSubscriptionId: "sub_grace",
      status: "suspended",
    });
    await handleStripeEvent(event("customer.subscription.updated", coverageSubscriptionFixture()), db);
    expect(codes.get("sub_grace")?.status).toBe("active");
  });

  it("deleted subscription cancels the code", async () => {
    const { db, codes } = createFakeDb();
    codes.set("sub_grace", {
      hostOrgId: "hostOrg_grace",
      code: "GRACE-FALL",
      seats: 10,
      stripeSubscriptionId: "sub_grace",
      status: "suspended",
    });
    await handleStripeEvent(
      event("customer.subscription.deleted", coverageSubscriptionFixture({ status: "canceled" })),
      db,
    );
    expect(codes.get("sub_grace")?.status).toBe("canceled");
  });

  it("update for an unknown coverage subscription (issuance not yet processed) is a safe no-op", async () => {
    const { db, codes } = createFakeDb();
    await handleStripeEvent(event("customer.subscription.updated", coverageSubscriptionFixture()), db);
    expect(codes.size).toBe(0);
  });

  it("incomplete status leaves the code's current status untouched rather than guessing", async () => {
    const { db, codes } = createFakeDb();
    codes.set("sub_grace", {
      hostOrgId: "hostOrg_grace",
      code: "GRACE-FALL",
      seats: 10,
      stripeSubscriptionId: "sub_grace",
      status: "active",
    });
    await handleStripeEvent(
      event("customer.subscription.updated", coverageSubscriptionFixture({ status: "incomplete" })),
      db,
    );
    expect(codes.get("sub_grace")?.status).toBe("active");
  });
});

// ——— invoice.paid (dues shares) ———

function invoiceFixture(overrides: Partial<StripeInvoiceLike> = {}): StripeInvoiceLike {
  return {
    id: "in_123",
    amount_paid: 1000, // $10
    created: 1_700_000_000,
    customer: "cus_123",
    subscription: "sub_123",
    parent: { subscription_details: { metadata: { ...MEMBERSHIP_METADATA } } },
    period_start: 1_700_000_000,
    ...overrides,
  };
}

describe("invoice.paid (dues shares)", () => {
  it("happy path via parent.subscription_details.metadata: writes a dues_share row, 50/50 split", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(event("invoice.paid", invoiceFixture()), db);
    expect(contributions.get("in_123")).toMatchObject({
      hostOrgId: PLATFORM_HOST_ORG_ID,
      type: "dues_share",
      grossCents: 1000,
      platformCents: 500,
      poolCents: 500,
      userId: "user_diane",
      stripeRef: "in_123",
      period: "2023-11",
    });
  });

  it("resolves metadata from the older top-level subscription_details when parent is absent", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event(
        "invoice.paid",
        invoiceFixture({ parent: null, subscription_details: { metadata: { ...MEMBERSHIP_METADATA } } }),
      ),
      db,
    );
    expect(contributions.get("in_123")).toMatchObject({ type: "dues_share", grossCents: 1000 });
  });

  it("resolves metadata from the first line item as a last resort", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event(
        "invoice.paid",
        invoiceFixture({
          parent: null,
          subscription_details: null,
          lines: { data: [{ metadata: { ...MEMBERSHIP_METADATA } }] },
        }),
      ),
      db,
    );
    expect(contributions.get("in_123")).toMatchObject({ type: "dues_share", grossCents: 1000 });
  });

  it("a zero-amount invoice (e.g. a trial) is ignored", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(event("invoice.paid", invoiceFixture({ amount_paid: 0 })), db);
    expect(contributions.size).toBe(0);
  });

  it("a non-membership subscription's invoice is ignored", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event(
        "invoice.paid",
        invoiceFixture({ parent: { subscription_details: { metadata: { kind: "coverage" } } } }),
      ),
      db,
    );
    expect(contributions.size).toBe(0);
  });

  it("no resolvable subscription metadata at all is a safe no-op", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event("invoice.paid", invoiceFixture({ parent: null, subscription_details: null, lines: null })),
      db,
    );
    expect(contributions.size).toBe(0);
  });

  it("idempotent replay: the same invoice id twice yields one row", async () => {
    const { db, contributions } = createFakeDb();
    const evt = event("invoice.paid", invoiceFixture());
    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);
    expect(contributions.size).toBe(1);
  });

  it("a missing platform host org row is a safe no-op, not a throw", async () => {
    const { db, contributions, hostOrgsBySlug } = createFakeDb();
    hostOrgsBySlug.delete("creatives-exchange");
    await expect(handleStripeEvent(event("invoice.paid", invoiceFixture()), db)).resolves.toBeUndefined();
    expect(contributions.size).toBe(0);
  });

  it("carries the membershipId when a membership row exists for the subscription", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(event("customer.subscription.updated", subscriptionFixture()), db);
    await handleStripeEvent(event("invoice.paid", invoiceFixture()), db);
    expect(contributions.get("in_123")?.membershipId).toBeTruthy();
  });

  it("$25 dues splits 1250/1250", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(event("invoice.paid", invoiceFixture({ amount_paid: 2500 })), db);
    expect(contributions.get("in_123")).toMatchObject({ platformCents: 1250, poolCents: 1250 });
  });

  it("odd cents round sanely (999 -> pool 500 / platform 499; 1001 -> pool 501 / platform 500)", async () => {
    const { db: db1, contributions: c1 } = createFakeDb();
    await handleStripeEvent(event("invoice.paid", invoiceFixture({ amount_paid: 999 })), db1);
    expect(c1.get("in_123")).toMatchObject({ poolCents: 500, platformCents: 499 });

    const { db: db2, contributions: c2 } = createFakeDb();
    await handleStripeEvent(event("invoice.paid", invoiceFixture({ amount_paid: 1001 })), db2);
    expect(c2.get("in_123")).toMatchObject({ poolCents: 501, platformCents: 500 });
  });

  it("falls back to `created` for the period when period_start is absent", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(event("invoice.paid", invoiceFixture({ period_start: undefined })), db);
    expect(contributions.get("in_123")?.period).toBe("2023-11");
  });
});

// ——— checkout.session.completed (one-time pool contributions) ———

function poolContributionSessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_pool_1",
    mode: "payment",
    customer: null,
    subscription: null,
    customer_details: { email: "diane@example.com" },
    amount_total: 1000, // $10
    created: 1_700_000_000,
    metadata: { kind: "pool_contribution", hostOrgId: "hostOrg_community1", userId: "user_diane" },
    ...overrides,
  };
}

describe("checkout.session.completed (pool contributions)", () => {
  it("happy path: writes a contribution_in row on the named host org, 10% platform split", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", poolContributionSessionFixture()), db);
    expect(contributions.get("cs_pool_1")).toMatchObject({
      hostOrgId: "hostOrg_community1",
      type: "contribution_in",
      grossCents: 1000,
      platformCents: 100,
      poolCents: 900,
      userId: "user_diane",
      stripeRef: "cs_pool_1",
      period: "2023-11",
    });
  });

  it("no hostOrgId in metadata falls back to the platform pool", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        poolContributionSessionFixture({ metadata: { kind: "pool_contribution", userId: "user_diane" } }),
      ),
      db,
    );
    expect(contributions.get("cs_pool_1")?.hostOrgId).toBe(PLATFORM_HOST_ORG_ID);
  });

  it("$25 contribution splits 250 platform / 2250 pool", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", poolContributionSessionFixture({ amount_total: 2500 })),
      db,
    );
    expect(contributions.get("cs_pool_1")).toMatchObject({ platformCents: 250, poolCents: 2250 });
  });

  it("idempotent replay: the same session id twice yields one row", async () => {
    const { db, contributions } = createFakeDb();
    const evt = event("checkout.session.completed", poolContributionSessionFixture());
    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);
    expect(contributions.size).toBe(1);
  });

  it("a guest (no userId in metadata) still records, with userId undefined", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        poolContributionSessionFixture({ metadata: { kind: "pool_contribution", hostOrgId: "hostOrg_community1" } }),
      ),
      db,
    );
    expect(contributions.get("cs_pool_1")?.userId).toBeUndefined();
  });

  it("payerName comes from metadata only — never Stripe's customer_details.email", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        poolContributionSessionFixture({
          metadata: {
            kind: "pool_contribution",
            hostOrgId: "hostOrg_community1",
            payerName: "The Diane Fund",
          },
        }),
      ),
      db,
    );
    const row = contributions.get("cs_pool_1");
    expect(row?.payerName).toBe("The Diane Fund");
    expect(row?.payerName).not.toBe("diane@example.com");
  });

  it("a zero-amount session is ignored", async () => {
    const { db, contributions } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", poolContributionSessionFixture({ amount_total: 0 })),
      db,
    );
    expect(contributions.size).toBe(0);
  });

  it("missing platform row (no metadata.hostOrgId, no seeded platform row) is a safe no-op", async () => {
    const { db, contributions, hostOrgsBySlug } = createFakeDb();
    hostOrgsBySlug.delete("creatives-exchange");
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        poolContributionSessionFixture({ metadata: { kind: "pool_contribution" } }),
      ),
      db,
    );
    expect(contributions.size).toBe(0);
  });
});

// ——— checkout.session.completed / subscription / invoice (community products) ———

const PRODUCT_METADATA_ONE_TIME = {
  kind: "community_product",
  productId: "product_1",
  hostOrgId: "hostOrg_community1",
  userId: "user_diane",
  billing: "one_time",
};

const PRODUCT_METADATA_MONTHLY = {
  kind: "community_product",
  productId: "product_2",
  hostOrgId: "hostOrg_community1",
  userId: "user_diane",
  billing: "monthly",
};

function productSessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_product_1",
    mode: "payment",
    customer: null,
    subscription: null,
    customer_details: { email: "diane@example.com" },
    amount_total: 2500, // $25
    created: 1_700_000_000,
    metadata: { ...PRODUCT_METADATA_ONE_TIME },
    ...overrides,
  };
}

function productSubscriptionFixture(
  overrides: Partial<StripeSubscriptionLike> = {},
): StripeSubscriptionLike {
  return {
    id: "sub_product_1",
    customer: "cus_123",
    status: "active",
    current_period_end: 1_800_000_000, // seconds
    items: { data: [{ price: { id: "price_product" }, quantity: 1 }] },
    metadata: { ...PRODUCT_METADATA_MONTHLY },
    ...overrides,
  };
}

function productMonthlySessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_product_monthly_1",
    mode: "subscription",
    customer: "cus_123",
    subscription: productSubscriptionFixture(),
    customer_details: { email: "diane@example.com" },
    amount_total: 1000, // $10/mo
    created: 1_700_000_000,
    metadata: { ...PRODUCT_METADATA_MONTHLY },
    ...overrides,
  };
}

function productInvoiceFixture(overrides: Partial<StripeInvoiceLike> = {}): StripeInvoiceLike {
  return {
    id: "in_product_1",
    amount_paid: 1000, // $10
    created: 1_700_000_000,
    customer: "cus_123",
    subscription: "sub_product_1",
    parent: { subscription_details: { metadata: { ...PRODUCT_METADATA_MONTHLY } } },
    period_start: 1_700_000_000,
    billing_reason: "subscription_cycle",
    lines: { data: [{ period: { end: 1_800_000_000 } }] },
    ...overrides,
  };
}

describe("checkout.session.completed (community products)", () => {
  it("happy path one-time: writes a paid row keyed by session id, 90/10 split ($25 -> 250/2250)", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", productSessionFixture()), db);
    expect(productPurchases.get("cs_product_1")).toMatchObject({
      productId: "product_1",
      hostOrgId: "hostOrg_community1",
      userId: "user_diane",
      buyerEmail: "diane@example.com",
      grossCents: 2500,
      platformCents: 250,
      hostCents: 2250,
      billing: "one_time",
      status: "paid",
      stripeRef: "cs_product_1",
      period: "2023-11",
    });
  });

  it("monthly first payment: status active, subscription id + period end (ms) recorded", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", productMonthlySessionFixture()), db);
    expect(productPurchases.get("cs_product_monthly_1")).toMatchObject({
      productId: "product_2",
      billing: "monthly",
      status: "active",
      stripeSubscriptionId: "sub_product_1",
      currentPeriodEnd: 1_800_000_000_000, // seconds -> ms
      grossCents: 1000,
      platformCents: 100,
      hostCents: 900,
    });
  });

  it("idempotent replay: same session event twice yields one row", async () => {
    const { db, productPurchases } = createFakeDb();
    const evt = event("checkout.session.completed", productSessionFixture());
    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);
    expect(productPurchases.size).toBe(1);
  });

  it("guest one-time purchase: no userId in metadata, buyer email still kept", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        productSessionFixture({
          metadata: {
            kind: "community_product",
            productId: "product_1",
            hostOrgId: "hostOrg_community1",
            billing: "one_time",
          },
        }),
      ),
      db,
    );
    const row = productPurchases.get("cs_product_1")!;
    expect(row.userId).toBeUndefined();
    expect(row.buyerEmail).toBe("diane@example.com");
  });

  it("missing required metadata (no productId/hostOrgId/billing) is a safe no-op", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        productSessionFixture({ metadata: { kind: "community_product" } }),
      ),
      db,
    );
    expect(productPurchases.size).toBe(0);
  });
});

describe("customer.subscription.updated/.deleted (community products)", () => {
  it("past_due propagates to every purchase row on that subscription", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", productMonthlySessionFixture()), db);
    await handleStripeEvent(
      event("customer.subscription.updated", productSubscriptionFixture({ status: "past_due" })),
      db,
    );
    expect(productPurchases.get("cs_product_monthly_1")?.status).toBe("past_due");
  });

  it("canceled propagates to every purchase row on that subscription", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", productMonthlySessionFixture()), db);
    await handleStripeEvent(
      event("customer.subscription.updated", productSubscriptionFixture({ status: "canceled" })),
      db,
    );
    expect(productPurchases.get("cs_product_monthly_1")?.status).toBe("canceled");
  });

  it("deleted subscription cancels every purchase row on that subscription", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", productMonthlySessionFixture()), db);
    await handleStripeEvent(
      event("customer.subscription.deleted", productSubscriptionFixture({ status: "canceled" })),
      db,
    );
    expect(productPurchases.get("cs_product_monthly_1")?.status).toBe("canceled");
  });

  it("unknown subscription id is a safe no-op", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(
      event(
        "customer.subscription.updated",
        productSubscriptionFixture({ id: "sub_no_purchase_row" }),
      ),
      db,
    );
    expect(productPurchases.size).toBe(0);
  });
});

describe("invoice.paid (community product renewals)", () => {
  it("renewal invoice ('subscription_cycle') inserts exactly one row, 90/10 split; replay is a no-op", async () => {
    const { db, productPurchases } = createFakeDb();
    const evt = event("invoice.paid", productInvoiceFixture());
    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);
    expect(productPurchases.size).toBe(1);
    expect(productPurchases.get("in_product_1")).toMatchObject({
      productId: "product_2",
      hostOrgId: "hostOrg_community1",
      userId: "user_diane",
      grossCents: 1000,
      platformCents: 100,
      hostCents: 900,
      billing: "monthly",
      status: "active",
      stripeSubscriptionId: "sub_product_1",
      currentPeriodEnd: 1_800_000_000_000,
      period: "2023-11",
    });
  });

  it("the first invoice ('subscription_create') inserts nothing — checkout already recorded it", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(
      event("invoice.paid", productInvoiceFixture({ billing_reason: "subscription_create" })),
      db,
    );
    expect(productPurchases.size).toBe(0);
  });

  it("missing metadata (unresolvable subscription) is a safe no-op", async () => {
    const { db, productPurchases } = createFakeDb();
    await handleStripeEvent(
      event(
        "invoice.paid",
        productInvoiceFixture({ parent: null, subscription_details: null, lines: null }),
      ),
      db,
    );
    expect(productPurchases.size).toBe(0);
  });
});

// ——— Misc ———

describe("unhandled event types", () => {
  it("ignores events outside scope without throwing", async () => {
    const { db } = createFakeDb();
    await expect(handleStripeEvent(event("charge.refunded", {}), db)).resolves.toBeUndefined();
  });
});

describe("extractCurrentPeriodEnd", () => {
  it("falls back to the subscription item's period end when absent at top level", () => {
    const sub = subscriptionFixture({
      current_period_end: undefined,
      items: { data: [{ price: { id: "price_seat" }, quantity: 1, current_period_end: 1_900_000_000 }] },
    });
    expect(extractCurrentPeriodEnd(sub)).toBe(1_900_000_000);
  });
});

// ——— Backing a project (checkout.session.completed, kind "backing") ———

const BACKING_METADATA = {
  kind: "backing",
  projectId: "project_1",
  userId: "user_patron",
  visible: "true",
  supporterName: "Ada",
  supportId: "support_pending",
};

function backingSessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_backing",
    mode: "payment",
    customer: "cus_patron",
    subscription: null,
    customer_details: { email: "ada@example.com" },
    metadata: { ...BACKING_METADATA },
    amount_total: 2500,
    created: 1_700_000_000,
    ...overrides,
  };
}

/** What garden/support.ts's startBacking leaves behind before the redirect. */
function seedPendingBacking(
  projectSupport: Map<string, ProjectSupportRow & { id: string }>,
  overrides: Partial<ProjectSupportRow> = {},
) {
  projectSupport.set("support_pending", {
    id: "support_pending",
    projectId: "project_1",
    supporterUserId: "user_patron",
    supporterName: "Ada",
    type: "financial_one_time",
    amountCents: 2500,
    visible: true,
    status: "pending",
    ...overrides,
  });
}

describe("checkout.session.completed — backing a project", () => {
  it("confirms the pending row the checkout action wrote, leaving its money alone", async () => {
    const { db, projectSupport } = createFakeDb();
    seedPendingBacking(projectSupport);

    await handleStripeEvent(event("checkout.session.completed", backingSessionFixture()), db);

    expect(projectSupport.size).toBe(1);
    expect(projectSupport.get("support_pending")).toMatchObject({
      status: "confirmed",
      amountCents: 2500,
      type: "financial_one_time",
      supporterUserId: "user_patron",
      visible: true,
    });
  });

  it("replaying the same event converges — one row, still confirmed", async () => {
    const { db, projectSupport } = createFakeDb();
    seedPendingBacking(projectSupport);
    const evt = event("checkout.session.completed", backingSessionFixture());

    await handleStripeEvent(evt, db);
    await handleStripeEvent(evt, db);

    expect(projectSupport.size).toBe(1);
    expect(projectSupport.get("support_pending")?.status).toBe("confirmed");
  });

  it("monthly backing (mode 'subscription') records financial_recurring", async () => {
    const { db, projectSupport } = createFakeDb();
    seedPendingBacking(projectSupport, { type: "financial_recurring", amountCents: 1000 });

    await handleStripeEvent(
      event(
        "checkout.session.completed",
        backingSessionFixture({ mode: "subscription", subscription: "sub_backing", amount_total: 1000 }),
      ),
      db,
    );

    expect(projectSupport.get("support_pending")).toMatchObject({
      status: "confirmed",
      type: "financial_recurring",
      amountCents: 1000,
    });
  });

  it("inserts a confirmed row when the pending one is gone (deleted, or an older session)", async () => {
    const { db, projectSupport } = createFakeDb();

    await handleStripeEvent(
      event("checkout.session.completed", backingSessionFixture({ mode: "subscription", subscription: "sub_backing" })),
      db,
    );

    expect(projectSupport.size).toBe(1);
    expect([...projectSupport.values()][0]).toMatchObject({
      projectId: "project_1",
      supporterUserId: "user_patron",
      supporterName: "Ada",
      type: "financial_recurring",
      amountCents: 2500,
      visible: true,
      status: "confirmed",
    });
  });

  it("anonymous backing (visible 'false') never flips to public on the fallback insert", async () => {
    const { db, projectSupport } = createFakeDb();

    await handleStripeEvent(
      event(
        "checkout.session.completed",
        backingSessionFixture({ metadata: { ...BACKING_METADATA, visible: "false" } }),
      ),
      db,
    );

    expect([...projectSupport.values()][0]?.visible).toBe(false);
  });

  it("no projectId and no pending row is a safe no-op", async () => {
    const { db, projectSupport } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", backingSessionFixture({ metadata: { kind: "backing" } })),
      db,
    );
    expect(projectSupport.size).toBe(0);
  });

  it("a session with no amount writes nothing rather than a $0 backing", async () => {
    const { db, projectSupport } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", backingSessionFixture({ amount_total: 0 })),
      db,
    );
    expect(projectSupport.size).toBe(0);
  });
});

describe("validateBackingAmount — the $5 floor (community-groups.md §3)", () => {
  it("accepts the floor exactly and anything above it", () => {
    expect(validateBackingAmount(MIN_BACKING_CENTS)).toBeNull();
    expect(validateBackingAmount(2500)).toBeNull();
  });

  it("rejects anything under $5 — Stripe's 30c fixed fee eats the margin", () => {
    expect(validateBackingAmount(499)).toContain("$5");
    expect(validateBackingAmount(0)).toContain("$5");
    expect(validateBackingAmount(-2500)).toContain("$5");
  });

  it("rejects fractional cents and non-numbers before they reach Stripe", () => {
    expect(validateBackingAmount(2500.5)).toBe("Give a whole number of cents.");
    expect(validateBackingAmount(NaN)).toBe("Give a whole number of cents.");
    expect(validateBackingAmount(Infinity)).toBe("Give a whole number of cents.");
  });

  it("never says donate/gift/tax-deductible (money-words rule)", () => {
    const reasons = [validateBackingAmount(1), validateBackingAmount(2500.5)].join(" ").toLowerCase();
    for (const banned of ["donat", "gift", "tax-deduct"]) {
      expect(reasons).not.toContain(banned);
    }
  });
});

// ——— Coverage-code issuance (checkout.session.completed, kind "coverage") ———

function coverageSessionFixture(
  overrides: Partial<StripeCheckoutSessionLike> = {},
): StripeCheckoutSessionLike {
  return {
    id: "cs_grace",
    mode: "subscription",
    customer: "cus_grace",
    subscription: coverageSubscriptionFixture(),
    metadata: { ...COVERAGE_METADATA, sponsorName: "Grace Church", seats: "10" },
    ...overrides,
  };
}

describe("checkout.session.completed — coverage code issuance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issues one code for the sponsor's subscription", async () => {
    const { db, codes } = createFakeDb();
    await handleStripeEvent(event("checkout.session.completed", coverageSessionFixture()), db);

    expect(codes.size).toBe(1);
    const issued = codes.get("sub_grace");
    expect(issued).toMatchObject({
      hostOrgId: "hostOrg_grace",
      seats: 10,
      stripeSubscriptionId: "sub_grace",
      status: "active",
    });
    // Same alphabet as invites.ts/helpers.ts — no 0/O/1/I to mistype.
    expect(issued?.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("replaying issues nothing new — one subscription, one code", async () => {
    const { db, codes } = createFakeDb();
    const evt = event("checkout.session.completed", coverageSessionFixture());
    await handleStripeEvent(evt, db);
    const first = codes.get("sub_grace")?.code;
    await handleStripeEvent(evt, db);

    expect(codes.size).toBe(1);
    expect(codes.get("sub_grace")?.code).toBe(first);
  });

  it("retries past a code collision instead of issuing a duplicate", async () => {
    const { db, codes } = createFakeDb();
    codes.set("sub_other", {
      hostOrgId: "hostOrg_other",
      code: "AAAAAAAA",
      seats: 1,
      stripeSubscriptionId: "sub_other",
      status: "active",
    });
    // First candidate is all-"A" (index 0) and collides; the second is
    // all-"9" (the last character of the alphabet).
    let call = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (call++ < 8 ? 0 : 0.999999));

    await handleStripeEvent(event("checkout.session.completed", coverageSessionFixture()), db);

    expect(codes.get("sub_grace")?.code).toBe("99999999");
  });

  it("falls back to the subscription's quantity when seats metadata is absent", async () => {
    const { db, codes } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        coverageSessionFixture({ metadata: { ...COVERAGE_METADATA } }),
      ),
      db,
    );
    expect(codes.get("sub_grace")?.seats).toBe(10);
  });

  it("a sponsor already past due issues suspended, not active", async () => {
    const { db, codes } = createFakeDb();
    await handleStripeEvent(
      event(
        "checkout.session.completed",
        coverageSessionFixture({ subscription: coverageSubscriptionFixture({ status: "past_due" }) }),
      ),
      db,
    );
    expect(codes.get("sub_grace")?.status).toBe("suspended");
  });

  it("an unexpanded subscription still issues (active), and later events converge it", async () => {
    const { db, codes } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", coverageSessionFixture({ subscription: "sub_grace" })),
      db,
    );
    expect(codes.get("sub_grace")).toMatchObject({ seats: 10, status: "active" });

    await handleStripeEvent(
      event("customer.subscription.updated", coverageSubscriptionFixture({ status: "past_due" })),
      db,
    );
    expect(codes.get("sub_grace")?.status).toBe("suspended");
  });

  it("no subscription id on the session issues nothing", async () => {
    const { db, codes } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", coverageSessionFixture({ subscription: null })),
      db,
    );
    expect(codes.size).toBe(0);
  });
});
