import { describe, expect, it } from "vitest";
import { REMINDER_DAY_BEFORE_MS, REMINDER_SOON_MS, upcomingReminderTimes } from "./reminderTimes";

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 7, 2); // Fri Nov 6, 6:00 PM Pacific

describe("upcomingReminderTimes", () => {
  it("is a day before and 2 hours before", () => {
    expect(REMINDER_DAY_BEFORE_MS).toBe(24 * HOUR);
    expect(REMINDER_SOON_MS).toBe(2 * HOUR);
    expect(upcomingReminderTimes(START, START - 48 * HOUR)).toEqual([START - 24 * HOUR, START - 2 * HOUR]);
  });
  it("after the day-before one went out, only the 2-hour one is left", () => {
    expect(upcomingReminderTimes(START, START - 10 * HOUR, [START - 24 * HOUR + 5 * 60 * 1000])).toEqual([START - 2 * HOUR]);
  });
  it("an event posted less than a day ahead gets one on the cron's next tick, then the 2-hour one", () => {
    expect(upcomingReminderTimes(START, START - 10 * HOUR)).toEqual(["now", START - 2 * HOUR]);
  });
  it("inside 2 hours: one on the next tick unless it went, nothing once it started", () => {
    expect(upcomingReminderTimes(START, START - HOUR)).toEqual(["now"]);
    expect(upcomingReminderTimes(START, START - HOUR, [START - 2 * HOUR + 60 * 1000])).toEqual([]);
    expect(upcomingReminderTimes(START, START)).toEqual([]);
  });
  it("a reminder for an earlier start time doesn't count", () => {
    expect(upcomingReminderTimes(START, START - 10 * HOUR, [START - 72 * HOUR])).toEqual(["now", START - 2 * HOUR]);
  });
});
