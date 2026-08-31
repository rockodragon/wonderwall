import { describe, expect, it } from "vitest";
import {
  budgetAmountLabel,
  budgetKindLabel,
  budgetLabel,
  resolveBudgetType,
} from "./budgetLabel";

describe("budgetLabel — the four declared states", () => {
  it("a set amount reads 'Paid · $400'", () => {
    expect(budgetLabel({ budgetType: "amount", budget: 400 })).toBe("Paid · $400");
  });

  it("a range reads 'Paid · $300–600' — en dash, one dollar sign", () => {
    expect(budgetLabel({ budgetType: "range", budget: 300, budgetMax: 600 })).toBe(
      "Paid · $300–600",
    );
  });

  it("open to proposals says so instead of printing a number it doesn't have", () => {
    expect(budgetLabel({ budgetType: "proposals" })).toBe("Paid · Open to proposals");
  });

  it("volunteer is never labelled 'Paid'", () => {
    expect(budgetLabel({ budgetType: "volunteer" })).toBe("Volunteer");
  });

  it("thousands separators land on both ends of a range", () => {
    expect(budgetLabel({ budgetType: "range", budget: 1200, budgetMax: 3000 })).toBe(
      "Paid · $1,200–3,000",
    );
  });
});

describe("budgetLabel — legacy rows written before budgetType existed", () => {
  it("a budget with no type reads as a set amount", () => {
    expect(budgetLabel({ budget: 400 })).toBe("Paid · $400");
    expect(resolveBudgetType({ budget: 400 })).toBe("amount");
  });

  it("neither a budget nor a type reads as open to proposals", () => {
    expect(budgetLabel({})).toBe("Paid · Open to proposals");
    expect(resolveBudgetType({})).toBe("proposals");
  });
});

describe("resolveBudgetType — defensive cases for rows already in the table", () => {
  it("an unrecognized budgetType falls back to the legacy rules, not a broken badge", () => {
    expect(resolveBudgetType({ budgetType: "negotiable", budget: 400 })).toBe("amount");
    expect(resolveBudgetType({ budgetType: "negotiable" })).toBe("proposals");
  });

  it("a range missing its high end degrades to the low number rather than a dangling dash", () => {
    expect(budgetLabel({ budgetType: "range", budget: 300 })).toBe("Paid · $300");
  });

  it("a range with no numbers at all degrades to open to proposals", () => {
    expect(budgetLabel({ budgetType: "range" })).toBe("Paid · Open to proposals");
  });

  it("an 'amount' with a zero or negative budget is not printed as money", () => {
    expect(budgetLabel({ budgetType: "amount", budget: 0 })).toBe("Paid · Open to proposals");
    expect(budgetLabel({ budgetType: "amount", budget: -50 })).toBe("Paid · Open to proposals");
  });

  it("volunteer stays volunteer even if a stray number rode along", () => {
    expect(resolveBudgetType({ budgetType: "volunteer", budget: 400 })).toBe("volunteer");
    expect(budgetLabel({ budgetType: "volunteer", budget: 400 })).toBe("Volunteer");
  });
});

describe("budgetKindLabel / budgetAmountLabel — the two halves on their own", () => {
  it("every paid state's kind word is 'Paid'", () => {
    expect(budgetKindLabel({ budgetType: "amount", budget: 400 })).toBe("Paid");
    expect(budgetKindLabel({ budgetType: "range", budget: 300, budgetMax: 600 })).toBe("Paid");
    expect(budgetKindLabel({ budgetType: "proposals" })).toBe("Paid");
  });

  it("volunteer's kind word is 'Volunteer'", () => {
    expect(budgetKindLabel({ budgetType: "volunteer" })).toBe("Volunteer");
  });

  it("volunteer has no amount half — there is no number to state", () => {
    expect(budgetAmountLabel({ budgetType: "volunteer" })).toBeNull();
  });

  it("the amount half carries the money without repeating the kind word", () => {
    expect(budgetAmountLabel({ budgetType: "amount", budget: 400 })).toBe("$400");
    expect(budgetAmountLabel({ budgetType: "range", budget: 300, budgetMax: 600 })).toBe(
      "$300–600",
    );
    expect(budgetAmountLabel({ budgetType: "proposals" })).toBe("Open to proposals");
  });
});
