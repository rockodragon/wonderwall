import { describe, expect, it } from "vitest";
import { NAMED_FUNDS, SOPHIA_FUND_SLUG, availableCents, fundOrgSlug, fundPath, namedFundLinks } from "./namedFunds";

describe("availableCents", () => {
  it("adds the Sophia Fund's seed to the ledger balance", () => {
    expect(availableCents(SOPHIA_FUND_SLUG, 250_000)).toBe((NAMED_FUNDS[SOPHIA_FUND_SLUG].seedCents ?? 0) + 250_000);
    expect(availableCents(SOPHIA_FUND_SLUG, 0)).toBe(1_000_000);
  });

  it("is just the balance for a fund with no seed", () => {
    expect(availableCents("some-other-fund", 12_300)).toBe(12_300);
  });
});

// Rick, 2026-11-06: one address per fund, favoring its name, and Give goes to
// the fund's own Stripe link even before its org row has one.
describe("fund addresses", () => {
  it("names the Sophia fund's page by the fund, not its host org", () => {
    expect(fundPath(SOPHIA_FUND_SLUG)).toBe("/fund/sophia");
    expect(fundPath("creatives-exchange")).toBe("/fund/creatives-exchange");
  });

  it("reads both addresses back to the org, so older links still resolve", () => {
    expect(fundOrgSlug("sophia")).toBe(SOPHIA_FUND_SLUG);
    expect(fundOrgSlug(SOPHIA_FUND_SLUG)).toBe(SOPHIA_FUND_SLUG);
    expect(fundOrgSlug("creatives-exchange")).toBe("creatives-exchange");
  });
});

describe("namedFundLinks", () => {
  it("fills in the named fund's Stripe link when the org row has none", () => {
    const org = namedFundLinks({ slug: SOPHIA_FUND_SLUG, givingUrl: "https://abidingpractice.org/give" });
    expect(org.paymentLinkUrl).toBe(NAMED_FUNDS[SOPHIA_FUND_SLUG].paymentLinkUrl);
    expect(org.paymentLinkUrl).toBe("https://buy.stripe.com/cNi7sL62k5U95sd6YU4Rq03");
  });

  it("lets the org row's own link win", () => {
    const org = namedFundLinks({ slug: SOPHIA_FUND_SLUG, paymentLinkUrl: "https://buy.stripe.com/other" });
    expect(org.paymentLinkUrl).toBe("https://buy.stripe.com/other");
  });

  it("leaves a fund with no named link alone", () => {
    const org = { slug: "creatives-exchange", paymentLinkUrl: null };
    expect(namedFundLinks(org)).toBe(org);
  });
});
