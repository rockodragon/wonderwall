// Dates the way the app writes them. One home, so "Oct 7" reads the same on
// the desk, the Shortlist and the Updates admin.

/** "Oct 7", in the viewer's time zone. */
export function shortDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "7PM", "7:30PM", in the viewer's time zone. */
export function timeLabel(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" ", "")
    .toUpperCase();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from `now`'s day to `ms`'s day, in the viewer's zone: 0 for
 *  today, 1 for tomorrow, negative for a day gone by. Rounded, as a day is 23
 *  or 25 hours across a clock change. */
export function daysFrom(now: number, ms: number): number {
  const midnight = (t: number) => {
    const day = new Date(t);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  };
  return Math.round((midnight(ms) - midnight(now)) / DAY_MS);
}

/** "Today", "Tomorrow", or a weekday ("Sat") through the days after: how an
 *  upcoming moment is told in words. Null a week or more out (a weekday then
 *  would be today's own) and for a day gone by: those are only dates. */
export function relativeDay(ms: number, now: number): string | null {
  const days = daysFrom(now, ms);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return new Date(ms).toLocaleDateString("en-US", { weekday: "short" });
  return null;
}

/** relativeDay, else the date: "Today", "Tomorrow", "Sat", "Oct 24". */
export function dayWord(ms: number, now: number): string {
  return relativeDay(ms, now) ?? shortDay(ms);
}

// A calendar date (a role's `neededBy`) is stored as that day's UTC midnight,
// the way <input type="date"> parses. Read in the viewer's zone it would be
// the day before anywhere west of UTC, so it's read in UTC: the same day for
// everyone, and over at the end of that day.

/** "Oct 7" for a calendar date. */
export function calendarDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The last millisecond of a calendar date's day, for "has it closed yet". */
export function calendarDayEnd(ms: number): number {
  const day = new Date(ms);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1) - 1;
}
