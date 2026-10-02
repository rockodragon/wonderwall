import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes first and last initials", () => {
    expect(initialsOf("Rick Moy")).toBe("RM");
    expect(initialsOf("Ana Maria de la Cruz")).toBe("AC");
  });
  it("takes two letters of a single name", () => {
    expect(initialsOf("Prince")).toBe("PR");
  });
  it("has a mark for no name", () => {
    expect(initialsOf(undefined)).toBe("·");
    expect(initialsOf(null)).toBe("·");
    expect(initialsOf("  ")).toBe("·");
  });
});
