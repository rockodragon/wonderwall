import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarDay, calendarDayEnd, shortDay, timeAgo } from "./dates";

// West of UTC, where a calendar date's UTC midnight is the evening before.
// Node rereads TZ when it's set; it's put back after, so it stays in this file.
const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  // Assigning undefined would set TZ to the string "undefined" (UTC).
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

const OCT_7 = Date.UTC(2026, 9, 7);

describe("a calendar date in Los Angeles", () => {
  it("really is read in Los Angeles here", () => {
    // 5PM on Oct 6, Pacific daylight time.
    expect(new Date(OCT_7).getHours()).toBe(17);
    expect(shortDay(OCT_7)).toBe("Oct 6");
  });

  it("calendarDay: the stored day, not the evening before", () => {
    expect(calendarDay(OCT_7)).toBe("Oct 7");
    expect(calendarDay(Date.UTC(2027, 0, 1))).toBe("Jan 1");
    expect(calendarDay(Date.UTC(2026, 11, 31))).toBe("Dec 31");
  });

  it("calendarDayEnd: the day's last millisecond, in UTC", () => {
    const end = calendarDayEnd(OCT_7);
    expect(end).toBe(Date.UTC(2026, 9, 8) - 1);
    expect(calendarDay(end)).toBe("Oct 7");
    expect(calendarDay(end + 1)).toBe("Oct 8");
  });

  it("calendarDayEnd: any moment of the day ends it the same way", () => {
    expect(calendarDayEnd(OCT_7 + 12 * 60 * 60 * 1000)).toBe(calendarDayEnd(OCT_7));
    expect(calendarDayEnd(Date.UTC(2026, 9, 8) - 1)).toBe(calendarDayEnd(OCT_7));
  });

  it("calendarDayEnd: across a month and a year", () => {
    expect(calendarDayEnd(Date.UTC(2026, 9, 31))).toBe(Date.UTC(2026, 10, 1) - 1);
    expect(calendarDayEnd(Date.UTC(2026, 11, 31))).toBe(Date.UTC(2027, 0, 1) - 1);
  });
});

describe("timeAgo", () => {
  const NOW = Date.UTC(2026, 9, 25, 12);
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;
  it("counts down from the biggest whole unit", () => {
    expect(timeAgo(NOW - 30_000, NOW)).toBe("just now");
    expect(timeAgo(NOW - 5 * MIN, NOW)).toBe("5m ago");
    expect(timeAgo(NOW - 59 * MIN, NOW)).toBe("59m ago");
    expect(timeAgo(NOW - 3 * 60 * MIN, NOW)).toBe("3h ago");
    expect(timeAgo(NOW - DAY, NOW)).toBe("1d ago");
    expect(timeAgo(NOW - 6 * DAY, NOW)).toBe("6d ago");
    expect(timeAgo(NOW - 15 * DAY, NOW)).toBe("2w ago");
    expect(timeAgo(NOW - 95 * DAY, NOW)).toBe("3mo ago");
    expect(timeAgo(NOW - 800 * DAY, NOW)).toBe("2y ago");
  });

  it("reads a clock a little ahead as just now", () => {
    expect(timeAgo(NOW + 5 * MIN, NOW)).toBe("just now");
  });
});
