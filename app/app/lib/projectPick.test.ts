import { describe, expect, it } from "vitest";
import { canSaveProject, fundingOf, isProjectOwner, moneyOf } from "./projectPick";

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

// Save is for a signed-in member who isn't the lead, on a project the browse
// lists show. The project page and Today's posts offer it by this one rule.
describe("isProjectOwner", () => {
  it("is the lead's own profile, never a stranger's or a signed-out viewer's", () => {
    expect(isProjectOwner({ userId: "u1" }, { userId: "u1" })).toBe(true);
    expect(isProjectOwner({ userId: "u1" }, { userId: "u2" })).toBe(false);
    expect(isProjectOwner({ userId: "u1" }, null)).toBe(false);
    expect(isProjectOwner({ userId: "u1" }, undefined)).toBe(false);
  });
});

describe("canSaveProject", () => {
  const member = { signedIn: true, profile: { userId: "u-me" } };
  const theirs = { userId: "u-them", status: "active" };

  it("offers Save to a signed-in member on someone else's shown project", () => {
    expect(canSaveProject(member, theirs)).toBe(true);
    for (const status of ["active", "in_progress", "completed"]) expect(canSaveProject(member, { ...theirs, status })).toBe(true);
  });

  it("never offers it on your own project", () => {
    expect(canSaveProject(member, { ...theirs, userId: "u-me" })).toBe(false);
  });

  it("never offers it to a signed-out visitor", () => {
    expect(canSaveProject({ signedIn: false, profile: undefined }, theirs)).toBe(false);
    expect(canSaveProject({ signedIn: false, profile: null }, theirs)).toBe(false);
  });

  it("waits for the profile to load, so a lead never sees it flash", () => {
    expect(canSaveProject({ signedIn: true, profile: undefined }, theirs)).toBe(false);
    // Signed in with no profile row yet: not the lead of anything.
    expect(canSaveProject({ signedIn: true, profile: null }, theirs)).toBe(true);
  });

  it("is not offered on a project the browse lists don't show", () => {
    for (const status of ["archived", "hidden", "pending"]) expect(canSaveProject(member, { ...theirs, status })).toBe(false);
  });
});
