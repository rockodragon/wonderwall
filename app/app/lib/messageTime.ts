// When a message thread shows the time. Good chat apps keep the time out of
// the bubble: a small centered label appears when the day changes or after a
// pause, and the exact time is a tooltip on the bubble. Pure rules, no React,
// so each one can be tested on its own.

/** A pause this long between two messages starts a new stretch. */
export const STRETCH_GAP_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Newer ICU puts a narrow no-break space before AM/PM; a plain one reads the same. */
function plain(text: string): string {
  return text.replace(/[  ]/g, " ");
}

function clock(ms: number): string {
  return plain(new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
}

/** The first message, a new day, or a pause of an hour or more. */
export function startsStretch(prevAt: number | null | undefined, at: number): boolean {
  if (prevAt == null) return true;
  if (startOfDay(prevAt) !== startOfDay(at)) return true;
  return at - prevAt >= STRETCH_GAP_MS;
}

/** The divider's label: "Today 2:33 PM", "Yesterday 9:05 AM", "Mon 2:45 PM"
 * for the last week, "Sep 28" after that (with the year if it isn't this one). */
export function stretchLabel(at: number, now: number): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (daysAgo === 0) return `Today ${clock(at)}`;
  if (daysAgo === 1) return `Yesterday ${clock(at)}`;
  const date = new Date(at);
  if (daysAgo > 1 && daysAgo < 7) {
    return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${clock(at)}`;
  }
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** The exact time, for a bubble's tooltip: "Mon, Sep 28, 2026, 2:45 PM". */
export function exactTime(at: number): string {
  return plain(
    new Date(at).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
}
