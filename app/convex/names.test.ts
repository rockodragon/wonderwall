// "Has this person named themselves yet" — the one rule (convex/names.ts)
// that hides a half-finished signup from other members.

import { describe, expect, it } from "vitest";
import { PLACEHOLDER_NAME, hasRealName } from "./names";

describe("hasRealName", () => {
  it("is false for no name at all", () => {
    expect(hasRealName(undefined)).toBe(false);
    expect(hasRealName(null)).toBe(false);
    expect(hasRealName("")).toBe(false);
  });

  it("is false for a blank name", () => {
    expect(hasRealName("   ")).toBe(false);
    expect(hasRealName("\n\t ")).toBe(false);
  });

  it("is false for the placeholder, in any case and with padding", () => {
    expect(hasRealName(PLACEHOLDER_NAME)).toBe(false);
    expect(hasRealName("New User")).toBe(false);
    expect(hasRealName("new user")).toBe(false);
    expect(hasRealName("  NEW USER  ")).toBe(false);
  });

  it("is true for a real name", () => {
    expect(hasRealName("Dana Reyes")).toBe(true);
    expect(hasRealName("  Dana  ")).toBe(true);
    expect(hasRealName("Sophia")).toBe(true);
  });

  it("is true for a name that only contains the placeholder", () => {
    expect(hasRealName("New Userton")).toBe(true);
    expect(hasRealName("Renew User")).toBe(true);
    expect(hasRealName("New User Jr")).toBe(true);
  });
});
