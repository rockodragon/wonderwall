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

/** "just now", "5m ago", "3h ago", "4d ago", "2w ago", "3mo ago", "2y ago":
 *  for a list read by scanning, where a date makes you do the subtraction. */
export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 365) return `${Math.floor(days / 365)}y ago`;
  if (days >= 30) return `${Math.floor(days / 30)}mo ago`;
  if (days >= 7) return `${Math.floor(days / 7)}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

/** The last millisecond of a calendar date's day, for "has it closed yet". */
export function calendarDayEnd(ms: number): number {
  const day = new Date(ms);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1) - 1;
}
