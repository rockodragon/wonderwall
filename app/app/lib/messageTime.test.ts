import { describe, expect, it } from "vitest";
import { STRETCH_GAP_MS, exactTime, startsStretch, stretchLabel } from "./messageTime";

// Local-time dates, so the tests hold in any time zone.
const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 1, 15, 0); // Thu Oct 1, 3:00 PM

describe("startsStretch", () => {
  it("starts with the first message", () => {
    expect(startsStretch(null, NOW)).toBe(true);
    expect(startsStretch(undefined, NOW)).toBe(true);
  });

  it("starts after a pause of an hour or more, not before", () => {
    const prev = at(2026, 10, 1, 10, 0);
    expect(startsStretch(prev, prev + STRETCH_GAP_MS - 1)).toBe(false);
    expect(startsStretch(prev, prev + STRETCH_GAP_MS)).toBe(true);
    expect(startsStretch(prev, prev + 60_000)).toBe(false);
  });

  it("starts when the day changes, even a minute apart", () => {
    expect(startsStretch(at(2026, 10, 1, 23, 59), at(2026, 10, 2, 0, 1))).toBe(true);
    expect(startsStretch(at(2026, 10, 1, 8, 0), at(2026, 10, 1, 8, 5))).toBe(false);
  });
});

describe("stretchLabel", () => {
  it("says Today and Yesterday with the time", () => {
    expect(stretchLabel(at(2026, 10, 1, 14, 33), NOW)).toBe("Today 2:33 PM");
    expect(stretchLabel(at(2026, 9, 30, 9, 5), NOW)).toBe("Yesterday 9:05 AM");
  });

  it("uses the weekday and time for the rest of the week", () => {
    expect(stretchLabel(at(2026, 9, 28, 14, 45), NOW)).toBe("Mon 2:45 PM");
    expect(stretchLabel(at(2026, 9, 25, 8, 0), NOW)).toBe("Fri 8:00 AM");
  });

  it("uses the date alone from a week back, with the year if it isn't this one", () => {
    expect(stretchLabel(at(2026, 9, 24, 14, 45), NOW)).toBe("Sep 24");
    expect(stretchLabel(at(2026, 1, 5, 14, 45), NOW)).toBe("Jan 5");
    expect(stretchLabel(at(2025, 12, 31, 14, 45), NOW)).toBe("Dec 31, 2025");
  });
});

describe("exactTime", () => {
  it("gives the weekday, date, year and time", () => {
    expect(exactTime(at(2026, 9, 28, 14, 45))).toBe("Mon, Sep 28, 2026, 2:45 PM");
  });
});
