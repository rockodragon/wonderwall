import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarDay, calendarDayEnd, dayWord, daysFrom, relativeDay, shortDay } from "./dates";

// West of UTC, where a calendar date's UTC midnight is the evening before.
// Node rereads TZ when it's set; it's put back after, so it stays in this file.
const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = zone;
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

// Fri Oct 2, 2026, noon, Pacific daylight time.
const at = (month: number, date: number, hour = 12, minute = 0) => new Date(2026, month - 1, date, hour, minute).getTime();
const NOW = at(10, 2);

describe("daysFrom", () => {
  it("counts calendar days, whatever the hour", () => {
    expect(daysFrom(NOW, at(10, 2, 0))).toBe(0);
    expect(daysFrom(NOW, at(10, 2, 23, 59))).toBe(0);
    expect(daysFrom(NOW, at(10, 3, 0))).toBe(1);
    expect(daysFrom(at(10, 2, 23, 30), at(10, 3, 0, 30))).toBe(1);
    expect(daysFrom(NOW, at(10, 1, 23))).toBe(-1);
    expect(daysFrom(NOW, at(11, 6))).toBe(35);
  });

  it("holds across the clock change, a 25-hour day (Nov 1 in Los Angeles)", () => {
    expect(daysFrom(at(10, 31), at(11, 2))).toBe(2);
    expect(daysFrom(at(11, 1, 0, 30), at(11, 2, 0, 30))).toBe(1);
  });
});

describe("relativeDay and dayWord", () => {
  it("say Today and Tomorrow", () => {
    expect(relativeDay(at(10, 2, 19), NOW)).toBe("Today");
    expect(relativeDay(at(10, 3, 9), NOW)).toBe("Tomorrow");
    expect(dayWord(at(10, 2, 8), NOW)).toBe("Today");
    expect(dayWord(at(10, 3, 19), NOW)).toBe("Tomorrow");
  });

  it("say Today for a moment earlier on the same day, as an event that's on now", () => {
    expect(dayWord(at(10, 2, 9), NOW)).toBe("Today");
  });

  it("name the weekday for the days after tomorrow, up to six out", () => {
    expect(dayWord(at(10, 4, 19), NOW)).toBe("Sun");
    expect(dayWord(at(10, 6, 19), NOW)).toBe("Tue");
    expect(dayWord(at(10, 8, 18), NOW)).toBe("Thu");
    expect(relativeDay(at(10, 8, 18), NOW)).toBe("Thu");
  });

  it("give the date from a week out, where a weekday would be today's own", () => {
    expect(dayWord(at(10, 9, 18), NOW)).toBe("Oct 9");
    expect(relativeDay(at(10, 9, 18), NOW)).toBeNull();
    expect(dayWord(at(11, 6, 19), NOW)).toBe("Nov 6");
    expect(dayWord(at(1, 5, 19), NOW)).toBe("Jan 5");
  });

  it("give the date for a day gone by", () => {
    expect(dayWord(at(10, 1, 19), NOW)).toBe("Oct 1");
    expect(relativeDay(at(9, 28, 19), NOW)).toBeNull();
  });
});
