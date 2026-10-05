// When an event's start time moves, its end moves with it so the length stays
// the same; the person can still change the end after (Rick, 2026-10-05).
// Times are the "HH:MM" strings a time input gives.

const DAY = 24 * 60;

function minutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function clock(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * The end after the start moves from `prevStart` to `nextStart`. No end, or a
 * start that was or is now blank: the end is left alone.
 * - `overnight` (gigs): an end before the start means the next day, so the
 *   length wraps past midnight and so does the new end.
 * - Otherwise (events, which end the same day): an end at or before the old
 *   start had no length to keep and is left alone, and a new end past
 *   midnight stops at 23:59.
 */
export function shiftEndTime(
  prevStart: string,
  nextStart: string,
  end: string,
  { overnight = false }: { overnight?: boolean } = {},
): string {
  const from = minutes(prevStart);
  const to = minutes(nextStart);
  const until = minutes(end);
  if (from === null || to === null || until === null) return end;
  if (overnight) {
    const length = (until - from + DAY) % DAY;
    return clock((to + length) % DAY);
  }
  if (until <= from) return end;
  return clock(Math.min(to + (until - from), DAY - 1));
}
