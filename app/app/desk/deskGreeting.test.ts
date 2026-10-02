import { describe, expect, it } from "vitest";
import { countLabel, firstNameOf, greetingFor, greetingWord, peopleCountLabel } from "./deskGreeting";

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

describe("countLabel", () => {
  it("counts the cards shown, with the right plural", () => {
    expect(countLabel("people", 13)).toBe("13 people");
    expect(countLabel("people", 1)).toBe("1 person");
    expect(countLabel("events", 4)).toBe("4 events");
    expect(countLabel("projects", 1)).toBe("1 project");
    expect(countLabel("fav", 2)).toBe("2 favorites");
    expect(countLabel("fav", 1)).toBe("1 favorite");
    expect(countLabel("today", 3)).toBe("3 things");
  });

  it("says zero out loud", () => {
    expect(countLabel("events", 0)).toBe("0 events");
  });

  it("has no count on the home view", () => {
    expect(countLabel("all", 6)).toBe("");
  });
});

describe("peopleCountLabel", () => {
  it("counts people alone when no organization is mixed in", () => {
    expect(peopleCountLabel(30, 0)).toBe("30 people");
    expect(peopleCountLabel(1, 0)).toBe("1 person");
    expect(peopleCountLabel(0, 0)).toBe("0 people");
  });
  it("counts both when both are there", () => {
    expect(peopleCountLabel(30, 4)).toBe("30 people \u00b7 4 organizations");
    expect(peopleCountLabel(1, 1)).toBe("1 person \u00b7 1 organization");
  });
  it("counts organizations alone when only they are there", () => {
    expect(peopleCountLabel(0, 3)).toBe("3 organizations");
  });
  it("on the Organizations toggle, says organizations even at zero", () => {
    expect(peopleCountLabel(0, 5, true)).toBe("5 organizations");
    expect(peopleCountLabel(0, 0, true)).toBe("0 organizations");
    expect(peopleCountLabel(0, 1, true)).toBe("1 organization");
  });
});
