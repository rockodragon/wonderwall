import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_LENGTH_MS,
  eventEndsAt,
  eventHasEnded,
  eventListedUntil,
  isEventListed,
} from "./eventWindow";

const H = 60 * 60 * 1000;
// Pacific wall time, written as UTC offsets: October is PDT (UTC-7).
const pdt = (iso: string) => Date.parse(`${iso}-07:00`);
const pst = (iso: string) => Date.parse(`${iso}-08:00`);

describe("eventEndsAt / eventHasEnded", () => {
  it("uses the end time, or three hours after the start", () => {
    const start = pdt("2026-10-06T13:00:00");
    expect(eventEndsAt({ datetime: start, endTime: start + H })).toBe(start + H);
    expect(eventEndsAt({ datetime: start })).toBe(start + DEFAULT_EVENT_LENGTH_MS);
    expect(eventEndsAt({ datetime: start, endTime: null })).toBe(start + DEFAULT_EVENT_LENGTH_MS);
  });

  it("hasn't ended while it's running, so a person can join late", () => {
    const start = pdt("2026-10-06T13:00:00");
    expect(eventHasEnded({ datetime: start }, start + 30 * 60 * 1000)).toBe(false);
    expect(eventHasEnded({ datetime: start, endTime: start + H }, start + 2 * H)).toBe(true);
  });
});

describe("eventListedUntil", () => {
  it("is midnight at the end of the day after it ends, Pacific", () => {
    // Tue Oct 6, 1-2pm: listed until Thu Oct 8, 00:00 PDT.
    const start = pdt("2026-10-06T13:00:00");
    expect(eventListedUntil({ datetime: start, endTime: start + H })).toBe(pdt("2026-10-08T00:00:00"));
  });

  it("counts from the end, not the start", () => {
    // Starts 10pm, runs past midnight to 1am Wednesday: the day after is Thursday.
    const start = pdt("2026-10-06T22:00:00");
    expect(eventListedUntil({ datetime: start, endTime: pdt("2026-10-07T01:00:00") })).toBe(
      pdt("2026-10-09T00:00:00"),
    );
  });

  it("uses Pacific days, not the server's UTC day", () => {
    // 6pm PDT Oct 6 is already Oct 7 in UTC; it still ends on the 6th here.
    const start = pdt("2026-10-06T18:00:00");
    expect(eventListedUntil({ datetime: start, endTime: start + H })).toBe(pdt("2026-10-08T00:00:00"));
  });

  it("lands on midnight across the end of daylight saving", () => {
    // Clocks fall back Sun Nov 1, 2026. An event Sat Oct 31 stays until Mon Nov 2, 00:00 PST.
    const start = pdt("2026-10-31T19:00:00");
    expect(eventListedUntil({ datetime: start, endTime: start + H })).toBe(pst("2026-11-02T00:00:00"));
  });
});

describe("isEventListed", () => {
  const start = pdt("2026-10-06T13:00:00");
  const event = { datetime: start, endTime: start + H };

  it("is listed before, during, after, and all the next day", () => {
    expect(isEventListed(event, start - 24 * H)).toBe(true);
    expect(isEventListed(event, start + 30 * 60 * 1000)).toBe(true);
    expect(isEventListed(event, pdt("2026-10-07T23:59:00"))).toBe(true);
  });

  it("drops off at midnight after the next day", () => {
    expect(isEventListed(event, pdt("2026-10-08T00:00:00"))).toBe(false);
  });
});
