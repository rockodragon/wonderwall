// Pure-logic tests for products.ts: the 90/10 host split, product
// validation, the access rule, and the earnings arithmetic.

import { describe, expect, it } from "vitest";
import {
  computeHostEarnings,
  hasProductAccess,
  splitHostSale,
  validateProduct,
} from "./products";

describe("splitHostSale — host 90 / platform 10, sums to gross", () => {
  it("splits round numbers", () => {
    expect(splitHostSale(1000)).toEqual({ platformCents: 100, hostCents: 900 });
    expect(splitHostSale(12000)).toEqual({ platformCents: 1200, hostCents: 10800 });
  });
  it("odd cents still sum to gross", () => {
    for (const gross of [1, 999, 1234, 55555]) {
      const s = splitHostSale(gross);
      expect(s.platformCents + s.hostCents).toBe(gross);
    }
  });
});

describe("validateProduct", () => {
  const ok = { name: "Premium circle", priceCents: 2500, billing: "monthly" };
  it("accepts a plain product", () => {
    expect(validateProduct(ok)).toBeNull();
    expect(validateProduct({ ...ok, resources: [{ label: "Drive", url: "https://x.org/d" }] })).toBeNull();
  });
  it("needs a name and a real price", () => {
    expect(validateProduct({ ...ok, name: " " })?.code).toBe("invalid_name");
    expect(validateProduct({ ...ok, priceCents: 50 })?.code).toBe("invalid_price");
    expect(validateProduct({ ...ok, priceCents: 10.5 })?.code).toBe("invalid_price");
    expect(validateProduct({ ...ok, priceCents: 600_000 })?.code).toBe("invalid_price");
  });
  it("only two billing shapes", () => {
    expect(validateProduct({ ...ok, billing: "yearly" })?.code).toBe("invalid_billing");
    expect(validateProduct({ ...ok, billing: "one_time" })).toBeNull();
  });
  it("resources need a label and an http(s) link", () => {
    expect(validateProduct({ ...ok, resources: [{ label: "", url: "https://x.org" }] })?.code).toBe("invalid_resource");
    expect(validateProduct({ ...ok, resources: [{ label: "Doc", url: "notaurl" }] })?.code).toBe("invalid_resource");
    expect(validateProduct({ ...ok, resources: [{ label: "Doc", url: "ftp://x.org" }] })?.code).toBe("invalid_resource");
  });
});

describe("hasProductAccess", () => {
  const now = 1_800_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  it("a one-time paid row is forever", () => {
    expect(hasProductAccess([{ billing: "one_time", status: "paid" }], now)).toBe(true);
  });
  it("refunded and canceled rows grant nothing", () => {
    expect(hasProductAccess([{ billing: "one_time", status: "refunded" }], now)).toBe(false);
    expect(hasProductAccess([{ billing: "monthly", status: "canceled", currentPeriodEnd: now + day }], now)).toBe(false);
  });
  it("an active subscription inside its period grants access; past_due keeps grace", () => {
    expect(hasProductAccess([{ billing: "monthly", status: "active", currentPeriodEnd: now + day }], now)).toBe(true);
    expect(hasProductAccess([{ billing: "monthly", status: "past_due", currentPeriodEnd: now - day }], now)).toBe(true);
  });
  it("a subscription well past its period lapses even if status never updated", () => {
    expect(hasProductAccess([{ billing: "monthly", status: "active", currentPeriodEnd: now - 30 * day }], now)).toBe(false);
  });
  it("no period end known: status alone decides", () => {
    expect(hasProductAccess([{ billing: "monthly", status: "active" }], now)).toBe(true);
  });
  it("empty is false", () => {
    expect(hasProductAccess([], now)).toBe(false);
  });
});

describe("computeHostEarnings", () => {
  const sale = (gross: number, status = "paid") => ({
    grossCents: gross,
    platformCents: Math.round(gross * 0.1),
    hostCents: gross - Math.round(gross * 0.1),
    status,
  });
  it("sums non-refunded sales and nets payouts", () => {
    const e = computeHostEarnings([sale(10000), sale(2500), sale(5000, "refunded")], [{ amountCents: 5000 }]);
    expect(e).toEqual({
      salesCount: 2,
      grossCents: 12500,
      platformCents: 1250,
      hostCents: 11250,
      paidOutCents: 5000,
      owedCents: 6250,
    });
  });
  it("zero state is all zeros, not undefined", () => {
    expect(computeHostEarnings([], []).owedCents).toBe(0);
  });
});
