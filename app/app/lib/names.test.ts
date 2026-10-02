import { describe, expect, it } from "vitest";
import { firstNameOf } from "./names";

describe("firstNameOf", () => {
  it("takes the first word of the name", () => {
    expect(firstNameOf("Rick Moy")).toBe("Rick");
    expect(firstNameOf("  Dana   Lee ")).toBe("Dana");
    expect(firstNameOf("Sophia")).toBe("Sophia");
  });

  it("has none for a missing name or the New User placeholder", () => {
    expect(firstNameOf(undefined)).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
    expect(firstNameOf("New User")).toBeNull();
    expect(firstNameOf("new user")).toBeNull();
  });
});
