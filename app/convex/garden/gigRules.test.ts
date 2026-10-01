// Pure-logic tests for live booking's recurrence, clock math, labels and
// payment links. No Convex — plain fixtures, same style as projects.test.ts.

import { describe, expect, it } from "vitest";
import {
  addDays,
  buildPayLinks,
  cadenceLabel,
  cashAppPayUrl,
  daysBetween,
  endLabel,
  expandOccurrences,
  formatClock,
  formatSlotDate,
  formatTimeRange,
  isClipArtifact,
  isValidDate,
  nextResponseAction,
  normalizeHandle,
  paypalMeUrl,
  ruleHasDatesAfter,
  scheduleLabel,
  slotTimes,
  todayIn,
  tzOffsetMs,
  validateSeriesRule,
  venmoPayUrl,
  weekdayOf,
  zonedTimeToEpoch,
  type SeriesRule,
} from "./gigRules";

const LA = "America/Los_Angeles";

const fridays: SeriesRule = {
  weekdays: [5],
  intervalWeeks: 1,
  startDate: "2026-09-18", // a Friday
  endMode: "never",
  startTime: "20:00",
  endTime: "22:00",
  timeZone: LA,
};

describe("date arithmetic", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("26-09-18")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows weekdays and distances", () => {
    expect(weekdayOf("2026-09-18")).toBe(5); // Friday
    expect(weekdayOf("2026-09-20")).toBe(0); // Sunday
    expect(daysBetween("2026-09-18", "2026-09-25")).toBe(7);
    expect(daysBetween("2026-09-25", "2026-09-18")).toBe(-7);
  });
});

describe("zonedTimeToEpoch — venue-local wall clock to an instant", () => {
  it("handles Pacific daylight time", () => {
    // 8pm PDT (UTC−7) on Sep 18 2026 = 03:00Z Sep 19.
    expect(zonedTimeToEpoch("2026-09-18", "20:00", LA)).toBe(Date.UTC(2026, 8, 19, 3, 0));
  });

  it("handles Pacific standard time", () => {
    // 8pm PST (UTC−8) on Dec 4 2026 = 04:00Z Dec 5.
    expect(zonedTimeToEpoch("2026-12-04", "20:00", LA)).toBe(Date.UTC(2026, 11, 5, 4, 0));
  });

  it("lands correctly on the evening of a fall-back day", () => {
    // Nov 1 2026: clocks fall back at 2am; 8pm that night is already PST.
    expect(zonedTimeToEpoch("2026-11-01", "20:00", LA)).toBe(Date.UTC(2026, 10, 2, 4, 0));
  });

  it("lands correctly on the evening of a spring-forward day", () => {
    // Mar 8 2026: clocks spring forward at 2am; 8pm that night is PDT.
    expect(zonedTimeToEpoch("2026-03-08", "20:00", LA)).toBe(Date.UTC(2026, 2, 9, 3, 0));
  });

  it("rolls a time inside the spring-forward gap forward an hour", () => {
    // 2:30am on Mar 8 2026 never happens in LA; expect 3:30am PDT = 10:30Z.
    expect(zonedTimeToEpoch("2026-03-08", "02:30", LA)).toBe(Date.UTC(2026, 2, 8, 10, 30));
  });

  it("works in UTC and east-of-UTC zones", () => {
    expect(zonedTimeToEpoch("2026-09-18", "20:00", "UTC")).toBe(Date.UTC(2026, 8, 18, 20, 0));
    // Tokyo is UTC+9 all year.
    expect(zonedTimeToEpoch("2026-09-18", "20:00", "Asia/Tokyo")).toBe(Date.UTC(2026, 8, 18, 11, 0));
    expect(tzOffsetMs(Date.UTC(2026, 8, 18), "Asia/Tokyo")).toBe(9 * 3_600_000);
  });

  it("reports today on the venue's clock, not the server's", () => {
    // 05:00Z on Sep 19 is still the evening of Sep 18 in LA.
    expect(todayIn(LA, Date.UTC(2026, 8, 19, 5, 0))).toBe("2026-09-18");
    expect(todayIn("Asia/Tokyo", Date.UTC(2026, 8, 18, 20, 0))).toBe("2026-09-19");
  });
});

describe("slotTimes", () => {
  it("ends the same evening when the end time is later", () => {
    const t = slotTimes(fridays, "2026-09-18");
    expect(t.startsAt).toBe(Date.UTC(2026, 8, 19, 3, 0));
    expect(t.endsAt).toBe(Date.UTC(2026, 8, 19, 5, 0));
  });

  it("rolls an end time at or before the start to the next morning", () => {
    const t = slotTimes({ ...fridays, startTime: "21:00", endTime: "01:00" }, "2026-09-18");
    expect(t.endsAt - t.startsAt).toBe(4 * 3_600_000);
  });
});

describe("expandOccurrences", () => {
  it("lists every Friday in a window", () => {
    expect(expandOccurrences(fridays, "2026-09-18", "2026-10-16")).toEqual([
      "2026-09-18",
      "2026-09-25",
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
    ]);
  });

  it("starts at fromDate but counts from startDate for alternate weeks", () => {
    const biweekly = { ...fridays, intervalWeeks: 2 };
    // Sep 18, Oct 2, Oct 16, Oct 30 — asking from Oct 1 skips Sep 25's week.
    expect(expandOccurrences(biweekly, "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-02",
      "2026-10-16",
      "2026-10-30",
    ]);
  });

  it("stops at the end date", () => {
    const until = { ...fridays, endMode: "until" as const, endDate: "2026-10-02" };
    expect(expandOccurrences(until, "2026-09-18", "2026-12-31")).toEqual(["2026-09-18", "2026-09-25", "2026-10-02"]);
  });

  it("counts dates already in the past against a count", () => {
    const three = { ...fridays, endMode: "count" as const, count: 3 };
    // The three dates are Sep 18, 25, Oct 2. From Sep 24, only two remain.
    expect(expandOccurrences(three, "2026-09-24", "2026-12-31")).toEqual(["2026-09-25", "2026-10-02"]);
  });

  it("handles several weekdays", () => {
    const friSat = { ...fridays, weekdays: [5, 6] };
    expect(expandOccurrences(friSat, "2026-09-18", "2026-09-26")).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-25",
      "2026-09-26",
    ]);
  });

  it("returns nothing for a window before the start date", () => {
    expect(expandOccurrences(fridays, "2026-09-01", "2026-09-17")).toEqual([]);
  });

  it("knows whether the rule has dates after a day", () => {
    expect(ruleHasDatesAfter(fridays, "2030-01-01")).toBe(true);
    expect(ruleHasDatesAfter({ ...fridays, endMode: "until", endDate: "2026-10-02" }, "2026-10-02")).toBe(false);
    expect(ruleHasDatesAfter({ ...fridays, endMode: "until", endDate: "2026-10-02" }, "2026-09-30")).toBe(true);
    expect(ruleHasDatesAfter({ ...fridays, endMode: "count", count: 2 }, "2026-09-25")).toBe(false);
    expect(ruleHasDatesAfter({ ...fridays, endMode: "count", count: 2 }, "2026-09-18")).toBe(true);
  });
});

describe("validateSeriesRule", () => {
  const today = "2026-09-17";

  it("accepts a plain weekly series", () => {
    expect(validateSeriesRule(fridays, today)).toBeNull();
  });

  it("accepts a one-date series", () => {
    expect(validateSeriesRule({ ...fridays, endMode: "count", count: 1 }, today)).toBeNull();
  });

  it("rejects no weekdays, bad weekdays, duplicates", () => {
    expect(validateSeriesRule({ ...fridays, weekdays: [] }, today)?.code).toBe("invalid_weekdays");
    expect(validateSeriesRule({ ...fridays, weekdays: [7] }, today)?.code).toBe("invalid_weekdays");
    expect(validateSeriesRule({ ...fridays, weekdays: [5, 5] }, today)?.code).toBe("invalid_weekdays");
  });

  it("rejects an interval we don't offer", () => {
    expect(validateSeriesRule({ ...fridays, intervalWeeks: 3 }, today)?.code).toBe("invalid_interval");
  });

  it("rejects a start in the past but allows today", () => {
    expect(validateSeriesRule({ ...fridays, startDate: "2026-09-16" }, today)?.code).toBe("invalid_start_date");
    expect(validateSeriesRule({ ...fridays, weekdays: [4], startDate: today }, today)).toBeNull();
  });

  it("rejects an end date before the start, and a count out of range", () => {
    expect(validateSeriesRule({ ...fridays, endMode: "until", endDate: "2026-09-01" }, today)?.code).toBe("invalid_end");
    expect(validateSeriesRule({ ...fridays, endMode: "until" }, today)?.code).toBe("invalid_end");
    expect(validateSeriesRule({ ...fridays, endMode: "count", count: 0 }, today)?.code).toBe("invalid_end");
    expect(validateSeriesRule({ ...fridays, endMode: "count", count: 500 }, today)?.code).toBe("invalid_end");
  });

  it("rejects bad times and zones", () => {
    expect(validateSeriesRule({ ...fridays, startTime: "8pm" }, today)?.code).toBe("invalid_time");
    expect(validateSeriesRule({ ...fridays, timeZone: "Mars/Olympus" }, today)?.code).toBe("invalid_time_zone");
  });

  it("rejects a rule that never lands on a date", () => {
    // Fridays only, but the window closes on a Thursday before any Friday.
    expect(
      validateSeriesRule({ ...fridays, startDate: "2026-09-19", endMode: "until", endDate: "2026-09-24" }, today)?.code,
    ).toBe("no_dates");
  });
});

describe("labels", () => {
  it("names the cadence", () => {
    expect(cadenceLabel(fridays)).toBe("Every Friday");
    expect(cadenceLabel({ ...fridays, intervalWeeks: 2 })).toBe("Every other Friday");
    expect(cadenceLabel({ ...fridays, intervalWeeks: 4 })).toBe("Every 4 weeks on Friday");
    expect(cadenceLabel({ ...fridays, weekdays: [5, 6] })).toBe("Fridays and Saturdays");
    expect(cadenceLabel({ ...fridays, weekdays: [4, 5, 6] })).toBe("Thursdays, Fridays, and Saturdays");
    expect(cadenceLabel({ ...fridays, endMode: "count", count: 1 })).toBe("One date");
  });

  it("formats clocks and ranges the way a flyer would", () => {
    expect(formatClock("20:00")).toBe("8pm");
    expect(formatClock("19:30")).toBe("7:30pm");
    expect(formatClock("00:00")).toBe("12am");
    expect(formatClock("12:00")).toBe("12pm");
    expect(formatTimeRange("20:00", "22:00")).toBe("8–10pm");
    expect(formatTimeRange("21:00", "01:00")).toBe("9pm–1am");
    expect(formatTimeRange("11:30", "13:00")).toBe("11:30am–1pm");
    expect(scheduleLabel(fridays)).toBe("Every Friday · 8–10pm");
    expect(formatSlotDate("2026-09-25")).toBe("Fri, Sep 25");
  });

  it("says how the series ends", () => {
    expect(endLabel(fridays)).toBe("no end date · dates open 8 weeks ahead");
    expect(endLabel({ endMode: "until", endDate: "2026-11-27" })).toBe("through Fri, Nov 27");
    expect(endLabel({ endMode: "count", count: 6 })).toBe("6 dates");
    expect(endLabel({ endMode: "count", count: 1 })).toBe("");
  });
});

describe("nextResponseAction", () => {
  it("creates, reactivates a withdrawal, and leaves the rest alone", () => {
    expect(nextResponseAction(undefined)).toBe("create");
    expect(nextResponseAction("withdrawn")).toBe("reactivate");
    expect(nextResponseAction("available")).toBe("no-op");
    expect(nextResponseAction("booked")).toBe("no-op");
  });
});

describe("payout handles", () => {
  it("strips the decoration people paste", () => {
    expect(normalizeHandle("venmo", "@Jane-Doe")).toEqual({ ok: true, value: "Jane-Doe" });
    expect(normalizeHandle("venmo", "https://venmo.com/u/Jane-Doe")).toEqual({ ok: true, value: "Jane-Doe" });
    expect(normalizeHandle("venmo", "account.venmo.com/u/Jane-Doe?x=1")).toEqual({ ok: true, value: "Jane-Doe" });
    expect(normalizeHandle("cashapp", "$janedoe")).toEqual({ ok: true, value: "janedoe" });
    expect(normalizeHandle("cashapp", "https://cash.app/$janedoe")).toEqual({ ok: true, value: "janedoe" });
    expect(normalizeHandle("paypal", "paypal.me/JaneDoe")).toEqual({ ok: true, value: "JaneDoe" });
    expect(normalizeHandle("paypal", "https://www.paypal.com/paypalme/JaneDoe")).toEqual({ ok: true, value: "JaneDoe" });
  });

  it("clears on empty and rejects junk", () => {
    expect(normalizeHandle("venmo", "   ")).toEqual({ ok: true, value: null });
    expect(normalizeHandle("venmo", "jane doe").ok).toBe(false);
    expect(normalizeHandle("venmo", "<script>").ok).toBe(false);
  });

  it("takes an email or phone for Zelle, nothing else", () => {
    expect(normalizeHandle("zelle", "Jane@Example.com")).toEqual({ ok: true, value: "jane@example.com" });
    expect(normalizeHandle("zelle", "(760) 555-0100")).toEqual({ ok: true, value: "(760) 555-0100" });
    expect(normalizeHandle("zelle", "janedoe").ok).toBe(false);
  });

  it("builds links that open the payer's app with the amount filled in", () => {
    expect(venmoPayUrl("Jane-Doe", 300, "Friday set at The Grove")).toBe(
      "https://venmo.com/Jane-Doe?txn=pay&amount=300&note=Friday+set+at+The+Grove",
    );
    expect(venmoPayUrl("Jane-Doe")).toBe("https://venmo.com/Jane-Doe?txn=pay");
    expect(cashAppPayUrl("janedoe", 300)).toBe("https://cash.app/$janedoe/300");
    expect(paypalMeUrl("JaneDoe", 300)).toBe("https://paypal.me/JaneDoe/300USD");
  });

  it("lists every way to pay, Zelle without a link", () => {
    const links = buildPayLinks({ venmo: "Jane-Doe", zelle: "jane@example.com" }, 300, "Fri set");
    expect(links.map((l) => l.kind)).toEqual(["venmo", "zelle"]);
    expect(links[0].handle).toBe("@Jane-Doe");
    expect(links[0].url).toContain("amount=300");
    expect(links[1].url).toBeNull();
    expect(buildPayLinks(undefined)).toEqual([]);
  });
});

describe("isClipArtifact", () => {
  it("counts audio and video always", () => {
    expect(isClipArtifact({ type: "audio" })).toBe(true);
    expect(isClipArtifact({ type: "video", mediaUrl: "https://youtu.be/abc" })).toBe(true);
  });

  it("counts links only where music lives", () => {
    expect(isClipArtifact({ type: "link", mediaUrl: "https://soundcloud.com/jane/track" })).toBe(true);
    expect(isClipArtifact({ type: "link", mediaUrl: "https://open.spotify.com/track/1" })).toBe(true);
    expect(isClipArtifact({ type: "link", mediaUrl: "https://jane.bandcamp.com/album/x" })).toBe(true);
    expect(isClipArtifact({ type: "link", mediaUrl: "https://example.com/about" })).toBe(false);
    expect(isClipArtifact({ type: "link", mediaUrl: "not a url" })).toBe(false);
    expect(isClipArtifact({ type: "image" })).toBe(false);
    expect(isClipArtifact({ type: "text" })).toBe(false);
  });
});
