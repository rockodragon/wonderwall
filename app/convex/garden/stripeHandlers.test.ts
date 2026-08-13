// Pure-logic tests for the Stripe webhook state machine. No Convex, no
// network — an in-memory fake Db + hand-written fixture events shaped like
// real Stripe payloads. This is the correctness proof for W1 (nothing
// executes against real Stripe tonight — see stripe.ts).

import { describe, expect, it } from "vitest";
import {
  extractCurrentPeriodEnd,
  handleStripeEvent,
  mapSubscriptionStatus,
  type BillingCustomerRow,
  type CoverageCodeRow,
  type Db,
  type MembershipRow,
  type StripeCheckoutSessionLike,
  type StripeSubscriptionLike,
  type StripeWebhookEvent,
} from "./stripeHandlers";
import { deriveGardenUser } from "./entitlements";

// ——— In-memory fake Db ———

function createFakeDb() {
  const memberships = new Map<string, MembershipRow>(); // keyed by stripeSubscriptionId
  const codes = new Map<string, CoverageCodeRow>(); // keyed by stripeSubscriptionId
  const billingCustomers = new Map<string, BillingCustomerRow>(); // keyed by userId

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
      return memberships.get(id) ?? null;
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
  };

  return { db, memberships, codes, billingCustomers };
}

// ——— Fixtures (hand-written, shaped like real Stripe objects) ———

const MEMBERSHIP_METADATA = {
  kind: "membership",
  level: "seat",
  hostOrgId: "hostOrg_theGarden",
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
      hostOrgId: "hostOrg_theGarden",
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

  it("non-membership kind (e.g. missing/other metadata) is ignored — coverage checkout is W2", async () => {
    const { db, memberships, billingCustomers } = createFakeDb();
    await handleStripeEvent(
      event("checkout.session.completed", checkoutSessionFixture({ metadata: { kind: "coverage" } })),
      db,
    );
    expect(memberships.size).toBe(0);
    expect(billingCustomers.size).toBe(0);
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
      hostOrgId: "hostOrg_theGarden",
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

// ——— Misc ———

describe("unhandled event types", () => {
  it("ignores events outside W1 scope without throwing", async () => {
    const { db } = createFakeDb();
    await expect(handleStripeEvent(event("invoice.paid", {}), db)).resolves.toBeUndefined();
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
