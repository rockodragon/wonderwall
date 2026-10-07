import { describe, expect, it } from "vitest";
import { NUDGE_ON_DAY, addVisitDay, dayKey } from "./visitDays";

describe("visit days", () => {
  it("counts a day once", () => {
    expect(addVisitDay(["2026-10-05"], "2026-10-05")).toEqual(["2026-10-05"]);
    expect(addVisitDay(["2026-10-05"], "2026-10-06")).toEqual(["2026-10-05", "2026-10-06"]);
  });
  it("reaches the third day and keeps only the last few", () => {
    const days = ["2026-10-01", "2026-10-03", "2026-10-07"].reduce<string[]>((d, t) => addVisitDay(d, t), []);
    expect(days).toHaveLength(NUDGE_ON_DAY);
    expect(addVisitDay(days, "2026-10-09")).toEqual(["2026-10-03", "2026-10-07", "2026-10-09"]);
  });
  it("names a local day", () => {
    expect(dayKey(new Date(2026, 9, 7, 23, 30))).toBe("2026-10-07");
    expect(dayKey(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });
});
