import { describe, expect, it } from "vitest";
import { workKind } from "./kind";

describe("workKind", () => {
  it("is paid when the work states pay", () => {
    expect(workKind({ pay: { budgetType: "amount", budget: 300 } })).toBe("paid");
    expect(workKind({ pay: { budgetType: "range", budget: 40, budgetMax: 60 } })).toBe("paid");
    expect(workKind({ pay: { budgetType: "proposals" } })).toBe("paid");
    expect(workKind({ pay: { budgetType: "confidential" } })).toBe("paid");
  });

  it("reads a paid posting with no budget fields as paid, the way its card does", () => {
    expect(workKind({ pay: {} })).toBe("paid");
  });

  it("is passion for volunteer work and for anything without pay", () => {
    expect(workKind({ pay: { budgetType: "volunteer" } })).toBe("passion");
    expect(workKind({ pay: null })).toBe("passion");
  });
});
