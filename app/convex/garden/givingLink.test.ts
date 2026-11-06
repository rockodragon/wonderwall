import { describe, expect, it } from "vitest";
import { buildFundDonorLink, buildFundPlusUpLink, parseDonorRef, parseGiftRef } from "./givingLink";

describe("buildFundPlusUpLink / parseGiftRef", () => {
  const url = "https://buy.stripe.com/test_abc123";

  it("round-trips the member and the monthly amount through client_reference_id", () => {
    const link = buildFundPlusUpLink(url, { memberGiftId: "gift123", userId: "user456" }, { email: "d@example.com" });
    const parsed = new URL(link);
    expect(parsed.origin + parsed.pathname).toBe(url);
    expect(parsed.searchParams.get("client_reference_id")).toBe("gift-gift123-u-user456");
    expect(parsed.searchParams.get("prefilled_email")).toBe("d@example.com");
    expect(parseGiftRef(parsed.searchParams.get("client_reference_id"))).toEqual({ memberGiftId: "gift123", userId: "user456" });
  });

  it("keeps existing query params on the link", () => {
    const link = buildFundPlusUpLink(`${url}?locale=en`, { memberGiftId: "g", userId: "u" });
    expect(new URL(link).searchParams.get("locale")).toBe("en");
  });

  it.each([null, undefined, "", "evt-event1", "gift-", "gift-g1", "gift-g1-u-", "gift-g$1-u-u1", "gift-g1-u-u1-u-x"])(
    "returns null for %j",
    (ref) => {
      expect(parseGiftRef(ref)).toBeNull();
    },
  );
});

describe("buildFundDonorLink / parseDonorRef", () => {
  const url = "https://buy.stripe.com/test_abc123";

  it("round-trips the giver and prefills their email", () => {
    const link = buildFundDonorLink(url, "user456", { email: "d@example.com" });
    const parsed = new URL(link);
    expect(parsed.origin + parsed.pathname).toBe(url);
    expect(parsed.searchParams.get("client_reference_id")).toBe("fund-u-user456");
    expect(parsed.searchParams.get("prefilled_email")).toBe("d@example.com");
    expect(parseDonorRef(parsed.searchParams.get("client_reference_id"))).toEqual({ userId: "user456" });
  });

  it("omits prefilled_email when there is none, and keeps existing params", () => {
    const parsed = new URL(buildFundDonorLink(`${url}?locale=en`, "u1"));
    expect(parsed.searchParams.has("prefilled_email")).toBe(false);
    expect(parsed.searchParams.get("locale")).toBe("en");
  });

  it.each([null, undefined, "", "gift-g1-u-u1", "evt-event1", "evt-e1-u-u1", "fund-u-", "fund-u-bad$id", "fund-u-a b"])(
    "returns null for %j",
    (ref) => {
      expect(parseDonorRef(ref)).toBeNull();
    },
  );
});
