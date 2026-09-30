// Pure-logic tests for AP's own Stripe webhook (see apGifts.ts's header).
// No Convex, no network — same style as stripeHandlers.test.ts.

import { describe, expect, it } from "vitest";
import {
  buildApRenewalRow,
  invoiceSubscriptionId,
  isApGrantFundGift,
  buildApGrantContributionRow,
  buildApTicketContributionRow,
  buildTicketLink,
  parseTicketRef,
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

describe("buildTicketLink", () => {
  const url = "https://buy.stripe.com/test_abc123";

  it("appends a guest ref with no client_reference_id suffix", () => {
    const link = buildTicketLink(url, "event123");
    const parsed = new URL(link);
    expect(parsed.origin + parsed.pathname).toBe(url);
    expect(parsed.searchParams.get("client_reference_id")).toBe("evt-event123");
    expect(parsed.searchParams.has("prefilled_email")).toBe(false);
  });

  it("includes the userId when signed in", () => {
    const link = buildTicketLink(url, "event123", { userId: "user456" });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("client_reference_id")).toBe("evt-event123-u-user456");
  });

  it("prefills the email when known", () => {
    const link = buildTicketLink(url, "event123", { email: "diane@example.com" });
    const parsed = new URL(link);
    expect(parsed.searchParams.get("prefilled_email")).toBe("diane@example.com");
  });

  it("preserves existing query params on the payment link", () => {
    const link = buildTicketLink("https://buy.stripe.com/test_abc123?locale=en", "event123");
    const parsed = new URL(link);
    expect(parsed.searchParams.get("locale")).toBe("en");
    expect(parsed.searchParams.get("client_reference_id")).toBe("evt-event123");
  });
});

describe("parseTicketRef", () => {
  it("parses a guest ref", () => {
    expect(parseTicketRef("evt-event123")).toEqual({ eventId: "event123", userId: undefined });
  });

  it("parses a signed-in ref", () => {
    expect(parseTicketRef("evt-event123-u-user456")).toEqual({
      eventId: "event123",
      userId: "user456",
    });
  });

  it("round-trips through buildTicketLink", () => {
    const link = buildTicketLink("https://buy.stripe.com/test_abc123", "event123", {
      userId: "user456",
    });
    const ref = new URL(link).searchParams.get("client_reference_id");
    expect(parseTicketRef(ref)).toEqual({ eventId: "event123", userId: "user456" });
  });

  it.each([null, undefined, "", "not-a-ticket-ref", "evt-", "evt-event123-u-", "evt-ev$ent-u-user"])(
    "returns null for %j",
    (ref) => {
      expect(parseTicketRef(ref)).toBeNull();
    },
  );

  it("returns null for a ref with more than one -u- split point", () => {
    expect(parseTicketRef("evt-event123-u-user456-u-extra")).toBeNull();
  });
});

describe("buildApTicketContributionRow", () => {
  it("records the full ticket amount as ticket_in, with the event title in the note", () => {
    const session = makeSession({ amount_total: 2500 });
    const result = buildApTicketContributionRow({
      session,
      hostOrgId: "hostOrg_ap",
      eventTitle: "Fall Gathering",
      now: 0,
    });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.type).toBe("ticket_in");
    expect(result.row.grossCents).toBe(2500);
    expect(result.row.poolCents).toBe(2500);
    expect(result.row.platformCents).toBe(0);
    expect(result.row.note).toBe("Ticket: Fall Gathering");
  });

  it("carries the buyer's userId when the ref resolved a signed-in user", () => {
    const session = makeSession();
    const result = buildApTicketContributionRow({
      session,
      hostOrgId: "hostOrg_ap",
      eventTitle: "Fall Gathering",
      userId: "user456",
      now: 0,
    });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.userId).toBe("user456");
  });

  it("leaves userId undefined for a guest buyer", () => {
    const session = makeSession();
    const result = buildApTicketContributionRow({
      session,
      hostOrgId: "hostOrg_ap",
      eventTitle: "Fall Gathering",
      now: 0,
    });
    if (!("row" in result)) throw new Error("expected a row");
    expect(result.row.userId).toBeUndefined();
  });

  it("skips a non-usd session", () => {
    const session = makeSession({ currency: "eur" });
    const result = buildApTicketContributionRow({
      session,
      hostOrgId: "hostOrg_ap",
      eventTitle: "Fall Gathering",
      now: 0,
    });
    expect("skipped" in result).toBe(true);
  });

  it("never carries the payer's email", () => {
    const session = makeSession({
      customer_details: { name: "Jordan Rivers", email: "jordan@example.com" },
    });
    const result = buildApTicketContributionRow({
      session,
      hostOrgId: "hostOrg_ap",
      eventTitle: "Fall Gathering",
      now: 0,
    });
    if (!("row" in result)) throw new Error("expected a row");
    expect(JSON.stringify(result.row)).not.toContain("jordan@example.com");
  });
});

describe("monthly gift renewals (invoice.paid)", () => {
  const base = { id: "in_1", amount_paid: 2500, currency: "usd", period_start: 1_790_000_000 };

  it("finds the subscription in either place Stripe puts it", () => {
    expect(invoiceSubscriptionId({ id: "in_1", subscription: "sub_old" })).toBe("sub_old");
    expect(
      invoiceSubscriptionId({ id: "in_1", parent: { subscription_details: { subscription: "sub_new" } } }),
    ).toBe("sub_new");
    expect(invoiceSubscriptionId({ id: "in_1" })).toBeNull();
  });

  it("a renewal becomes a gift row keyed on the invoice", () => {
    const r = buildApRenewalRow({
      invoice: { ...base, billing_reason: "subscription_cycle" },
      hostOrgId: "org_ap",
      payerName: "Dana",
      now: 0,
    });
    expect("row" in r && r.row).toMatchObject({
      type: "contribution_in",
      grossCents: 2500,
      poolCents: 2500,
      platformCents: 0,
      payerName: "Dana",
      stripeRef: "ap:in_1",
    });
  });

  it("skips the first invoice, which its checkout already recorded", () => {
    const r = buildApRenewalRow({ invoice: { ...base, billing_reason: "subscription_create" }, hostOrgId: "org_ap", now: 0 });
    expect("skipped" in r).toBe(true);
  });

  it("skips non-usd and zero-amount invoices", () => {
    expect("skipped" in buildApRenewalRow({ invoice: { ...base, currency: "eur" }, hostOrgId: "o", now: 0 })).toBe(true);
    expect("skipped" in buildApRenewalRow({ invoice: { ...base, amount_paid: 0 }, hostOrgId: "o", now: 0 })).toBe(true);
  });
});
