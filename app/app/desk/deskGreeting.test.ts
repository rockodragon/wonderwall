import { describe, expect, it } from "vitest";
import { firstNameOf, greetingFor, greetingWord } from "./deskGreeting";

describe("greetingWord", () => {
  it("is morning until noon, afternoon until five, then evening", () => {
    expect(greetingWord(0)).toBe("morning");
    expect(greetingWord(11)).toBe("morning");
    expect(greetingWord(12)).toBe("afternoon");
    expect(greetingWord(16)).toBe("afternoon");
    expect(greetingWord(17)).toBe("evening");
    expect(greetingWord(23)).toBe("evening");
  });
});

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

describe("greetingFor", () => {
  it("names the member when it can", () => {
    expect(greetingFor(9, "Rick Moy")).toBe("Good morning, Rick.");
    expect(greetingFor(18, "Dana Lee")).toBe("Good evening, Dana.");
  });

  it("drops the name when there isn't one", () => {
    expect(greetingFor(13, "New User")).toBe("Good afternoon.");
    expect(greetingFor(13, undefined)).toBe("Good afternoon.");
  });
});
