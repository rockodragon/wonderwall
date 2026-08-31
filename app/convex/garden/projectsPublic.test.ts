// Pure-logic tests for the public Projects browse/detail shaping. No Convex —
// plain fixtures, same style as allocations.test.ts and stories.test.ts.

import { describe, expect, it } from "vitest";
import { resolveMoneyLine, shapeProjectCard, type ProjectLike } from "./projectsPublic";

describe("resolveMoneyLine", () => {
  it("paid with a set amount reads as a whole-dollar budget line", () => {
    expect(resolveMoneyLine({ kind: "paid", budgetType: "amount", budget: 1200 })).toBe(
      "Budget $1,200",
    );
  });

  it("paid open to proposals says so", () => {
    expect(resolveMoneyLine({ kind: "paid", budgetType: "proposals" })).toBe(
      "Open to proposals",
    );
  });

  it("paid with a declared range reads as one span of money", () => {
    expect(
      resolveMoneyLine({ kind: "paid", budgetType: "range", budget: 300, budgetMax: 600 }),
    ).toBe("Budget $300\u2013600");
  });

  it("a volunteer posting reads 'Unpaid' — never a budget line", () => {
    expect(resolveMoneyLine({ kind: "paid", budgetType: "volunteer" })).toBe("Unpaid");
  });

  it("a legacy paid row with a budget and no type still reads as that amount", () => {
    expect(resolveMoneyLine({ kind: "paid", budget: 1200 })).toBe("Budget $1,200");
  });

  it("a legacy paid row with no budget at all reads as open to proposals, not 'Budget $undefined'", () => {
    expect(resolveMoneyLine({ kind: "paid" })).toBe("Open to proposals");
  });

  it("passion with a goal and partial raise reads '$340 of $500' (raisedCents -> dollars)", () => {
    expect(resolveMoneyLine({ kind: "passion", goal: 500, raisedCents: 34000 })).toBe(
      "$340 of $500",
    );
  });

  it("passion with a goal but no raisedCents yet treats raised as $0, not blank", () => {
    expect(resolveMoneyLine({ kind: "passion", goal: 500 })).toBe("$0 of $500");
  });

  it("passion without a goal reads 'Seeking support'", () => {
    expect(resolveMoneyLine({ kind: "passion" })).toBe("Seeking support");
  });

  it("passion with goal 0 is treated as no real goal (falls through to Seeking support)", () => {
    expect(resolveMoneyLine({ kind: "passion", goal: 0, raisedCents: 5000 })).toBe(
      "Seeking support",
    );
  });

  it("a raise that lands on odd cents keeps two decimal places", () => {
    expect(resolveMoneyLine({ kind: "passion", goal: 500, raisedCents: 12550 })).toBe(
      "$125.50 of $500",
    );
  });
});

describe("shapeProjectCard", () => {
  it("maps a passion project's fields through, attaching the owner name and money line", () => {
    const project: ProjectLike = {
      _id: "proj_1",
      kind: "passion",
      title: "Psalms for the 2AM",
      blurb: "A record made in the back room.",
      photoUrl: "https://example.com/p.jpg",
      goal: 500,
      raisedCents: 34000,
      storySlug: "psalms-for-the-2am",
    };
    expect(shapeProjectCard(project, "Shua")).toEqual({
      id: "proj_1",
      kind: "passion",
      title: "Psalms for the 2AM",
      blurb: "A record made in the back room.",
      byName: "Shua",
      photoUrl: "https://example.com/p.jpg",
      budgetType: undefined,
      budget: undefined,
      budgetMax: undefined,
      goal: 500,
      raisedCents: 34000,
      storySlug: "psalms-for-the-2am",
      moneyLine: "$340 of $500",
    });
  });

  it("maps a paid project's fields through with the budget money line", () => {
    const project: ProjectLike = {
      _id: "proj_2",
      kind: "paid",
      title: "Mix 3 tracks for the showcase",
      budget: 1200,
    };
    expect(shapeProjectCard(project, "Table Art Society")).toEqual({
      id: "proj_2",
      kind: "paid",
      title: "Mix 3 tracks for the showcase",
      blurb: undefined,
      byName: "Table Art Society",
      photoUrl: undefined,
      budgetType: undefined,
      budget: 1200,
      budgetMax: undefined,
      goal: undefined,
      raisedCents: undefined,
      storySlug: undefined,
      moneyLine: "Budget $1,200",
    });
  });

  it("_id is stringified even when the driver hands back a non-string id object", () => {
    const project: ProjectLike = { _id: { toString: () => "proj_weird" } as unknown as string, kind: "passion", title: "X" };
    expect(shapeProjectCard(project, "Anon").id).toBe("proj_weird");
  });

  it("an unrecognized kind value falls back to 'passion' rather than throwing", () => {
    const project: ProjectLike = { _id: "proj_3", kind: "mystery", title: "Untitled" };
    expect(shapeProjectCard(project, "Anon").kind).toBe("passion");
  });

  it("missing optional fields (blurb, photoUrl, storySlug) stay undefined, never defaulted to empty string", () => {
    const project: ProjectLike = { _id: "proj_4", kind: "paid", title: "Bare project", budget: 100 };
    const card = shapeProjectCard(project, "Anon");
    expect(card.blurb).toBeUndefined();
    expect(card.photoUrl).toBeUndefined();
    expect(card.storySlug).toBeUndefined();
  });
});
