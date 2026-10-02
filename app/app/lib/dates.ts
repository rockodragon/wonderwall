// Dates the way the app writes them. One home, so "Oct 7" reads the same on
// the desk, the Shortlist and the Updates admin.

/** "Oct 7", in the viewer's time zone. */
export function shortDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
