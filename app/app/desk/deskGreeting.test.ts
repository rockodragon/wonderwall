import { describe, expect, it } from "vitest";
import { countLabel, greetingFor, greetingWord } from "./deskGreeting";

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
