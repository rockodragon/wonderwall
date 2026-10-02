// Pure-logic tests for the helpers behind listMySupportGiven (support.ts).
// No Convex, no network.

import { describe, expect, it } from "vitest";
import { fundMoneyKind, isGivenSupport, supportCadence, supportKind, supporterView, totalPaidCents } from "./support";
import type { Id } from "../_generated/dataModel";

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

describe("isGivenSupport — what listMySupportGiven lists", () => {
  it("keeps confirmed and pledged support of a known kind", () => {
    expect(isGivenSupport({ status: "confirmed", type: "financial_one_time" })).toBe(true);
    expect(isGivenSupport({ status: "pledged", type: "financial_recurring" })).toBe(true);
    expect(isGivenSupport({ status: "confirmed", type: "encouragement" })).toBe(true);
    expect(isGivenSupport({ status: "confirmed", type: "resource" })).toBe(true);
  });

  it("drops an unfinished checkout and a type it doesn't know", () => {
    expect(isGivenSupport({ status: "pending", type: "financial_one_time" })).toBe(false);
    expect(isGivenSupport({ status: "confirmed", type: "mystery" })).toBe(false);
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

describe("supporterView", () => {
  const row = {
    _id: "s1" as Id<"projectSupport">,
    projectId: "p1" as Id<"projects">,
    type: "financial_one_time",
    amountCents: 500,
    status: "confirmed",
    createdAt: 1,
    tierId: "t1" as Id<"patronTiers">,
    tierName: "Friend",
    visible: true,
    supporterName: "Ana",
    supporterUserId: "u1" as Id<"users">,
  };

  it("shows who backed, never how much, to everyone but the owner", () => {
    const pub = supporterView(row, false) as Record<string, unknown>;
    expect(pub.supporterName).toBe("Ana");
    expect(pub).not.toHaveProperty("amountCents");
    expect(pub).not.toHaveProperty("tierName");
    expect(pub).not.toHaveProperty("tierId");
  });

  it("shows the owner the amount and tier", () => {
    const own = supporterView(row, true);
    expect(own.amountCents).toBe(500);
    expect(own.tierName).toBe("Friend");
  });

  it("keeps an anonymous backer anonymous, even to the owner", () => {
    const anon = supporterView({ ...row, visible: false }, true) as Record<string, unknown>;
    expect(anon.supporterName).toBe("Anonymous");
    expect(anon).not.toHaveProperty("supporterUserId");
  });
});
