import { describe, expect, it } from "vitest";
import { fundingOf, moneyOf } from "./projectPick";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

describe("fundingOf", () => {
  it("says what a passion project has raised against its goal", () => {
    expect(fundingOf({ kind: "passion", goal: 1000, raisedCents: 32_000 }, money)).toEqual({ raised: "$320", goal: "$1,000", pct: 32 });
  });

  it("starts at zero and stops at 100%", () => {
    expect(fundingOf({ kind: "passion", goal: 500 }, money)).toEqual({ raised: "$0", goal: "$500", pct: 0 });
    expect(fundingOf({ kind: "passion", goal: 100, raisedCents: 99_999 }, money)?.pct).toBe(100);
  });

  it("is null for a paid project or a passion project with no goal", () => {
    expect(fundingOf({ kind: "paid", goal: 1000 }, money)).toBeNull();
    expect(fundingOf({ kind: "passion", goal: 0 }, money)).toBeNull();
    expect(fundingOf({ kind: "passion", goal: null }, money)).toBeNull();
  });
});

describe("moneyOf", () => {
  it("prints a gig's set amount per date, and any other pay as it is", () => {
    expect(moneyOf({ budgetType: "amount", budget: 150, gig: { status: "open" } })).toBe("$150/date");
    expect(moneyOf({ budgetType: "amount", budget: 150 })).toBe("$150");
    expect(moneyOf({ budgetType: "volunteer" })).toBe(moneyOf({ budgetType: "volunteer", gig: { status: "open" } }));
  });
});
