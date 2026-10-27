import { describe, expect, it } from "vitest";
import { cutAtWord, monthGrid, whatsOn } from "./GardenHome";

describe("cutAtWord", () => {
  it("keeps whole words and drops trailing punctuation", () => {
    expect(cutAtWord("Help design, build and plant The Garden together", 20)).toBe("Help design, build…");
    expect(cutAtWord("Supercalifragilisticexpialidocious", 10)).toBe("Supercalif…");
  });
});

describe("whatsOn", () => {
  it("says what's going on, from real counts only", () => {
    expect(whatsOn({ projects: 34, events: 3, fund: "$10,420" })).toBe("34 projects · 3 events coming up · $10,420 to grant");
    expect(whatsOn({ projects: 1, events: 1 })).toBe("1 project · 1 event coming up");
  });

  it("leaves out what hasn't loaded, or is nothing", () => {
    expect(whatsOn({ projects: undefined, events: 0, fund: "$10,420" })).toBe("$10,420 to grant");
    expect(whatsOn({})).toBe("");
  });
});

describe("monthGrid", () => {
  const now = new Date(2026, 9, 27, 12); // Tuesday, October 27, 2026

  it("lays out the month: Sunday first, every day, today known", () => {
    const grid = monthGrid(now, []);
    expect(grid.label).toBe("October 2026");
    expect(grid.lead).toBe(4); // October 1, 2026 is a Thursday
    expect(grid.days).toBe(31);
    expect(grid.today).toBe(27);
    expect(grid.marked.size).toBe(0);
  });

  it("marks the days with an event this month, and not other months", () => {
    const grid = monthGrid(now, [
      new Date(2026, 9, 31, 19).getTime(),
      new Date(2026, 9, 31, 21).getTime(),
      new Date(2026, 10, 7, 18).getTime(),
      new Date(2025, 9, 2, 18).getTime(),
    ]);
    expect([...grid.marked]).toEqual([31]);
  });
});
