// Pure-logic tests for AP's own Stripe webhook (see apGifts.ts's header).
// No Convex, no network — same style as stripeHandlers.test.ts.

import { describe, expect, it } from "vitest";
import {
  isApGrantFundGift,
  buildApGrantContributionRow,
  type ApCheckoutSessionLike,
} from "./apGifts";

function makeSession(overrides: Partial<ApCheckoutSessionLike> = {}): ApCheckoutSessionLike {
  return {
    id: "cs_ap_123",
    payment_status: "paid",
    currency: "usd",
    amount_total: 5000,
    metadata: {},
    payment_link: null,
    customer_details: { name: "Jordan Rivers" },
    created: 1_800_000_000, // 2027-01-15T... UTC
    ...overrides,
  };
}

describe("isApGrantFundGift", () => {
  it("is true when metadata designates the grant fund", () => {
    const session = makeSession({ metadata: { fund: "grant-fund" } });
    expect(isApGrantFundGift(session, [])).toBe(true);
  });

  it("is true when the session's payment_link is a known grant-fund link id", () => {
    const session = makeSession({ payment_link: "plink_grantfund1" });
    expect(isApGrantFundGift(session, ["plink_grantfund1", "plink_grantfund2"])).toBe(true);
  });

  it("is true when payment_link is an expanded object matching a known id", () => {
    const session = makeSession({ payment_link: { id: "plink_grantfund1" } });
    expect(isApGrantFundGift(session, ["plink_grantfund1"])).toBe(true);
  });

  it("is false for an unrelated AP donation (no metadata, no matching link)", () => {
    const session = makeSession({ metadata: {}, payment_link: "plink_generalfund" });
    expect(isApGrantFundGift(session, ["plink_grantfund1"])).toBe(false);
  });

  it("is false when metadata.fund is set to something else", () => {
    const session = makeSession({ metadata: { fund: "building-fund" } });
    expect(isApGrantFundGift(session, [])).toBe(false);
  });

  it("is false with no metadata, no payment_link, and no configured link ids", () => {
    const session = makeSession({ metadata: null, payment_link: null });
    expect(isApGrantFundGift(session, [])).toBe(false);
  });
});

describe("buildApGrantContributionRow", () => {
  it("records the full amount with no platform share", () => {
    const session = makeSession({ amount_total: 12_345 });
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 1_800_000_000_000 });
    expect("row" in result).toBe(true);
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.grossCents).toBe(12_345);
    expect(result.row.poolCents).toBe(12_345);
    expect(result.row.platformCents).toBe(0);
  });

  it("never carries the payer's email, only an opt-in display name", () => {
    const session = makeSession({
      customer_details: { name: "Jordan Rivers", email: "jordan@example.com" },
    });
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 0 });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.payerName).toBe("Jordan Rivers");
    expect(JSON.stringify(result.row)).not.toContain("jordan@example.com");
  });

  it("leaves payerName undefined when no name was given", () => {
    const session = makeSession({ customer_details: null });
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 0 });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.payerName).toBeUndefined();
  });

  it("prefixes stripeRef with ap: so it can never collide with the platform account's ids", () => {
    const session = makeSession({ id: "cs_test_abc123" });
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 0 });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.stripeRef).toBe("ap:cs_test_abc123");
  });

  it("skips a non-usd session rather than misrecording the amount", () => {
    const session = makeSession({ currency: "eur" });
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 0 });
    expect("skipped" in result).toBe(true);
  });

  it("formats period as YYYY-MM in UTC from the session's created timestamp", () => {
    // 1_800_000_000 seconds since epoch = 2027-01-15T06:40:00Z
    const session = makeSession({ created: 1_800_000_000 });
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 0 });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.period).toBe("2027-01");
  });

  it("falls back to now() for period when the session has no created timestamp", () => {
    const session = makeSession({ created: undefined });
    // now = 1_735_689_600_000 ms = 2025-01-01T00:00:00Z
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 1_735_689_600_000 });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.period).toBe("2025-01");
  });

  it("always tags the row as contribution_in with the AP gift note", () => {
    const session = makeSession();
    const result = buildApGrantContributionRow({ session, hostOrgId: "hostOrg_ap", now: 0 });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.type).toBe("contribution_in");
    expect(result.row.note).toBe("Gift through Abiding Practice");
    expect(result.row.hostOrgId).toBe("hostOrg_ap");
  });
});
