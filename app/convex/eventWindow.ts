// When an event is over, and how long it stays on the lists (Rick,
// 2026-10-07: "keep events showing all the way through the following day for
// now so people know what they missed"; they used to vanish at the start, so
// nobody could join late). Pure rules, shared by the backend lists and the
// app, so a list and a page never disagree.
//
// Days are the platform's home zone, Pacific: events store no zone of their
// own, the server runs on UTC, and reminders already speak Pacific
// (announcements.ts). A viewer elsewhere sees the same cutoff a few hours
// earlier or later on their clock, which is fine for "the day after".

import { zonedTimeToEpoch } from "./garden/gigRules";

export const EVENT_HOME_ZONE = "America/Los_Angeles";

/** An event with no end time is taken to run this long. */
export const DEFAULT_EVENT_LENGTH_MS = 3 * 60 * 60 * 1000;

type Timed = { datetime: number; endTime?: number | null };

/** When it ends: its end time, or three hours after it starts. */
export function eventEndsAt(event: Timed): number {
  return event.endTime ?? event.datetime + DEFAULT_EVENT_LENGTH_MS;
}

/** Started: its start time has come. A Table host marks who came from
 *  here on, never before. */
export function eventHasStarted(event: Timed, now: number): boolean {
  return event.datetime <= now;
}

/** Over: it has ended. One that's on right now hasn't, so a person can still
 *  join late. */
export function eventHasEnded(event: Timed, now: number): boolean {
  return eventEndsAt(event) < now;
}

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: EVENT_HOME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Midnight at the end of the day after it ends, Pacific. An event that
 *  ends Tuesday evening stays listed until Wednesday turns to Thursday. */
export function eventListedUntil(event: Timed): number {
  const parts = Object.fromEntries(
    DAY_PARTS.formatToParts(new Date(eventEndsAt(event))).map((p) => [p.type, p.value]),
  );
  // Two days on from the end's calendar day, by date arithmetic, so a
  // daylight-saving change in between can't shift it by an hour.
  const twoOn = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 2));
  const date = twoOn.toISOString().slice(0, 10);
  return zonedTimeToEpoch(date, "00:00", EVENT_HOME_ZONE);
}

/** Still on the lists (upcoming, happening, or ended yesterday). The Past
 *  lists are exactly the rest. */
export function isEventListed(event: Timed, now: number): boolean {
  return now < eventListedUntil(event);
}
