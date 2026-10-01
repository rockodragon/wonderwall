// Pure-logic tests for ticketRouting.ts. The rule these cover is a tax
// rule, not a UX one: charitable ticket money must settle in the 501(c)(3)'s
// own Stripe account, never in the for-profit's, and the code must refuse
// rather than guess when it can't.

import { describe, expect, it } from "vitest";
import { needsCharitableReceipt, routeTicketMoney } from "./ticketRouting";

describe("routeTicketMoney", () => {
  it("settles in the platform account when no beneficiary is named", () => {
    for (const none of [null, undefined]) {
      const routing = routeTicketMoney(none);
      expect(routing.ok).toBe(true);
      if (routing.ok) {
        expect(routing.destinationAccountId).toBeUndefined();
      }
    }
  });

  it("settles in the connected account when one is named and onboarded", () => {
    const routing = routeTicketMoney({
      name: "Abiding Practice",
      stripeConnectAccountId: "acct_123",
      taxStatus: "501c3",
    });
    expect(routing).toEqual({
      ok: true,
      destinationAccountId: "acct_123",
      beneficiaryTaxStatus: "501c3",
    });
  });

  // The whole point of the module. A fallback here would put charitable
  // money on the for-profit's books and leave someone unpicking it by hand.
  it("REFUSES rather than falling back when the beneficiary isn't connected", () => {
    const routing = routeTicketMoney({
      name: "Abiding Practice",
      taxStatus: "501c3",
    });
    expect(routing.ok).toBe(false);
    if (!routing.ok) {
      expect(routing.reason).toContain("Abiding Practice");
      // The buyer needs to know nothing was charged.
      expect(routing.reason).toMatch(/nothing is charged/i);
    }
  });

  it("refuses an empty account id the same as a missing one", () => {
    const routing = routeTicketMoney({
      name: "Table Art Society",
      stripeConnectAccountId: "",
      taxStatus: "501c3",
    });
    expect(routing.ok).toBe(false);
  });

  it("routes a for-profit beneficiary to its own account too", () => {
    const routing = routeTicketMoney({
      name: "Some Studio",
      stripeConnectAccountId: "acct_forprofit",
      taxStatus: "for_profit",
    });
    expect(routing.ok).toBe(true);
    if (routing.ok) {
      expect(routing.destinationAccountId).toBe("acct_forprofit");
      expect(routing.beneficiaryTaxStatus).toBe("for_profit");
    }
  });
});

describe("needsCharitableReceipt", () => {
  it("is true only for a 501(c)(3) beneficiary", () => {
    expect(needsCharitableReceipt("501c3")).toBe(true);
    expect(needsCharitableReceipt("for_profit")).toBe(false);
    expect(needsCharitableReceipt(undefined)).toBe(false);
    // An unrecognized value must not be treated as charitable.
    expect(needsCharitableReceipt("nonprofit")).toBe(false);
  });
});
