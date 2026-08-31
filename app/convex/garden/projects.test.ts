// Pure-logic tests for the paid-posting money guardrail. No Convex — plain
// fixtures, same style as projectsPublic.test.ts and stories.test.ts.
//
// The rule these pin down: a paid posting must declare one of four money
// states. That's what replaced the old required-number guardrail — an unpaid
// ask can't masquerade as paid work, and a small or unknown budget no longer
// blocks the post.

import { describe, expect, it } from "vitest";
import { validateBudgetDeclaration } from "./projects";

describe("validateBudgetDeclaration — the four states, declared correctly", () => {
  it("accepts a set amount", () => {
    expect(validateBudgetDeclaration({ budgetType: "amount", budget: 400 })).toBeNull();
  });

  it("accepts a range with a high number above the low one", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 300, budgetMax: 600 }),
    ).toBeNull();
  });

  it("accepts open to proposals with no numbers", () => {
    expect(validateBudgetDeclaration({ budgetType: "proposals" })).toBeNull();
  });

  it("accepts volunteer with no numbers", () => {
    expect(validateBudgetDeclaration({ budgetType: "volunteer" })).toBeNull();
  });
});

describe("validateBudgetDeclaration — an unknown or missing state", () => {
  it("rejects a budgetType that isn't one of the four", () => {
    expect(validateBudgetDeclaration({ budgetType: "negotiable" })).toEqual({
      code: "invalid_budget_type",
      reason:
        "Say how this one pays: a set amount, a range, open to proposals, or volunteer.",
    });
  });

  it("rejects an empty budgetType", () => {
    expect(validateBudgetDeclaration({ budgetType: "" })?.code).toBe("invalid_budget_type");
  });
});

describe("validateBudgetDeclaration — 'amount' needs one real number", () => {
  it("rejects a missing amount", () => {
    expect(validateBudgetDeclaration({ budgetType: "amount" })).toEqual({
      code: "invalid_budget",
      reason: "A set amount needs a real number bigger than zero.",
    });
  });

  it("rejects zero, a negative, and a non-finite amount", () => {
    for (const budget of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateBudgetDeclaration({ budgetType: "amount", budget })?.code).toBe(
        "invalid_budget",
      );
    }
  });

  it("rejects a stray high end rather than silently dropping it", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "amount", budget: 400, budgetMax: 600 }),
    ).toEqual({
      code: "invalid_budget",
      reason: "A set amount is one number. Pick a range if you want a low and a high.",
    });
  });
});

describe("validateBudgetDeclaration — 'range' needs both ends, in order", () => {
  it("rejects a range missing its high end", () => {
    expect(validateBudgetDeclaration({ budgetType: "range", budget: 300 })).toEqual({
      code: "invalid_budget",
      reason: "A range needs both a low and a high number.",
    });
  });

  it("rejects a range missing its low end", () => {
    expect(validateBudgetDeclaration({ budgetType: "range", budgetMax: 600 })?.reason).toBe(
      "A range needs both a low and a high number.",
    );
  });

  it("rejects a range whose ends aren't real positive numbers", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 0, budgetMax: 600 }),
    ).toEqual({
      code: "invalid_budget",
      reason: "A range needs real numbers bigger than zero.",
    });
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 300, budgetMax: Number.NaN })
        ?.reason,
    ).toBe("A range needs real numbers bigger than zero.");
  });

  it("rejects a high end that isn't above the low one", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 600, budgetMax: 300 }),
    ).toEqual({
      code: "invalid_budget",
      reason: "A range needs a high number bigger than the low one.",
    });
  });

  it("rejects a range whose ends are the same number — that's an amount", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 400, budgetMax: 400 })?.reason,
    ).toBe("A range needs a high number bigger than the low one.");
  });
});

describe("validateBudgetDeclaration — the numberless states reject stray numbers", () => {
  it("rejects a number attached to open to proposals", () => {
    expect(validateBudgetDeclaration({ budgetType: "proposals", budget: 400 })).toEqual({
      code: "invalid_budget",
      reason: "Open to proposals means no number attached. Clear it, or post the amount instead.",
    });
  });

  it("rejects a high end attached to open to proposals", () => {
    expect(validateBudgetDeclaration({ budgetType: "proposals", budgetMax: 600 })?.code).toBe(
      "invalid_budget",
    );
  });

  it("rejects a number attached to volunteer — that's the ambiguity the states exist to stop", () => {
    expect(validateBudgetDeclaration({ budgetType: "volunteer", budget: 400 })).toEqual({
      code: "invalid_budget",
      reason: "Volunteer work has no budget attached. Clear the number, or say what it pays.",
    });
  });
});
