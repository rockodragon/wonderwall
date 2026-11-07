// Dates the way the app writes them. One home, so "Oct 7" reads the same on
// the desk, the Shortlist and the Updates admin.

/** "Thu, Nov 5, 6:00 PM", in the viewer's time zone. */
export function weekdayAndTime(ms: number): string {
  return new Date(ms)
    .toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    // Newer ICU puts a narrow no-break space before AM/PM.
    .replace(/[\u202f\u00a0]/g, " ");
}

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

/** A length of time in whole minutes as a short span, for how long a wait
 *  was: "under 1m", "35m", "2h", "3d". The nearest whole unit, so 90 minutes
 *  reads "2h" and 25 hours reads "1d". */
export function formatWait(minutes: number): string {
  if (minutes < 1) return "under 1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** The last millisecond of a calendar date's day, for "has it closed yet". */
export function calendarDayEnd(ms: number): number {
  const day = new Date(ms);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1) - 1;
}

/** An instant as the "yyyy-mm-dd" an <input type="date"> holds, in the
 *  viewer's zone. Not toISOString(), which is UTC and reads a day early for
 *  an evening time anywhere west of it. "" for none. */
export function toDateInputValue(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
