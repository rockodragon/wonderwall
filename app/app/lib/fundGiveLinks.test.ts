import { describe, expect, it } from "vitest";
import { fundGiveLinks } from "./fundGiveLinks";

const STRIPE = "https://buy.stripe.com/test_abc";
const MONTHLY = "https://buy.stripe.com/test_monthly";
const RETURN = "/fund/sophia?x=1";
const signedIn = (profile: { userId: string; email?: string | null } | null | undefined) => ({ signedIn: true, profile });

describe("fundGiveLinks", () => {
  it("is loading until the org is known", () => {
    expect(fundGiveLinks(undefined, signedIn(null), RETURN)).toEqual({ state: "loading" });
  });

  it("is none when the fund has no link", () => {
    expect(fundGiveLinks(null, signedIn(null), RETURN)).toEqual({ state: "none" });
    expect(fundGiveLinks({}, { signedIn: false, profile: null }, RETURN)).toEqual({ state: "none" });
  });

  it("is loading while auth settles", () => {
    expect(fundGiveLinks({ paymentLinkUrl: STRIPE }, { authLoading: true, signedIn: false, profile: undefined }, RETURN)).toEqual({ state: "loading" });
  });

  it("sends a signed-out visitor to sign up and back", () => {
    expect(fundGiveLinks({ paymentLinkUrl: STRIPE }, { signedIn: false, profile: null }, RETURN)).toEqual({
      state: "needsAccount",
      href: `/signup?redirect=${encodeURIComponent(RETURN)}`,
      returnTo: RETURN,
    });
  });

  it("is loading while a signed-in profile loads", () => {
    expect(fundGiveLinks({ paymentLinkUrl: STRIPE }, signedIn(undefined), RETURN)).toEqual({ state: "loading" });
  });

  it("names the giver on the fund's Stripe links", () => {
    const result = fundGiveLinks(
      { paymentLinkUrl: STRIPE, monthlyPaymentLinkUrl: MONTHLY },
      signedIn({ userId: "user1", email: "a@example.com" }),
      RETURN,
    );
    if (result.state !== "ready") throw new Error("expected ready");
    for (const link of [result.oneTime, result.monthly]) {
      const url = new URL(link!);
      expect(url.searchParams.get("client_reference_id")).toBe("fund-u-user1");
      expect(url.searchParams.get("prefilled_email")).toBe("a@example.com");
    }
    expect(new URL(result.monthly!).pathname).toBe("/test_monthly");
  });

  it("passes a non-Stripe giving link through untagged", () => {
    const result = fundGiveLinks({ givingUrl: "https://example.org/give" }, signedIn({ userId: "user1" }), RETURN);
    expect(result).toEqual({ state: "ready", oneTime: "https://example.org/give", monthly: null });
  });

  // Review 2026-11-06: an untagged link here was a gift with no account,
  // dropped by the webhook unless its link id was configured.
  it("sends a signed-in person with no profile to finish onboarding, then back", () => {
    expect(fundGiveLinks({ paymentLinkUrl: STRIPE }, signedIn(null), RETURN)).toEqual({
      state: "needsAccount",
      href: "/onboarding",
      returnTo: RETURN,
    });
  });
});
