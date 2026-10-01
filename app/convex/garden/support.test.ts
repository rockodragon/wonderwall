// Pure-logic tests for the helpers behind listMySupportGiven (support.ts).
// No Convex, no network.

import { describe, expect, it } from "vitest";
import { fundMoneyKind, supportCadence, supportKind, totalPaidCents } from "./support";

describe("supportKind", () => {
  it("maps the three financial types to money", () => {
    expect(supportKind("financial_one_time")).toBe("money");
    expect(supportKind("financial_recurring")).toBe("money");
    expect(supportKind("financial_annual")).toBe("money");
  });

  it("maps encouragement to cheer and resource to resource", () => {
    expect(supportKind("encouragement")).toBe("cheer");
    expect(supportKind("resource")).toBe("resource");
  });

  it("returns null for a type it doesn't know", () => {
    expect(supportKind("something_else")).toBeNull();
    expect(supportKind("")).toBeNull();
  });
});

describe("supportCadence", () => {
  it("says how often a backing repeats", () => {
    expect(supportCadence("financial_one_time")).toBe("one_time");
    expect(supportCadence("financial_recurring")).toBe("monthly");
    expect(supportCadence("financial_annual")).toBe("yearly");
  });

  it("is null for cheers and resources", () => {
    expect(supportCadence("encouragement")).toBeNull();
    expect(supportCadence("resource")).toBeNull();
  });
});

describe("fundMoneyKind", () => {
  it("counts contributions and tickets as the person's own money", () => {
    expect(fundMoneyKind("contribution_in")).toBe("contribution");
    expect(fundMoneyKind("ticket_in")).toBe("ticket");
  });

  it("leaves out dues and operator-entered ledger lines", () => {
    for (const type of ["dues_share", "adjustment", "topup_in", "sponsor_in", "entry_fee_in"]) {
      expect(fundMoneyKind(type), type).toBeNull();
    }
  });
});

describe("totalPaidCents", () => {
  it("adds the first charge and every renewal", () => {
    expect(totalPaidCents([{ grossCents: 1000 }, { grossCents: 1000 }, { grossCents: 1000 }])).toBe(3000);
  });

  it("is zero when nothing has been paid yet", () => {
    expect(totalPaidCents([])).toBe(0);
  });
});
