// The days this browser has opened Today, for the one-time invite card on
// the third (components/InviteNudge.tsx; Rick, 2026-10-07: "after people
// ... click around a few times"). Days, not clicks: by the third day
// someone comes back, they know what the place is and who'd like it.

export const VISIT_DAYS_KEY = "today.visitDays";
/** Which day back the invite card shows on. */
export const NUDGE_ON_DAY = 3;

/** A local calendar day, "2026-10-07". */
export function dayKey(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The days seen, with today added once. Only the last few are kept. */
export function addVisitDay(days: readonly string[], today: string): string[] {
  if (days.includes(today)) return [...days];
  return [...days, today].slice(-NUDGE_ON_DAY);
}

/** Note today's visit; how many different days this browser has come. */
export function recordVisitDay(now = new Date()): number {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(VISIT_DAYS_KEY) ?? "[]");
    const days = Array.isArray(stored) ? stored.filter((d): d is string => typeof d === "string") : [];
    const next = addVisitDay(days, dayKey(now));
    localStorage.setItem(VISIT_DAYS_KEY, JSON.stringify(next));
    return next.length;
  } catch {
    // Storage blocked: no count, no card.
    return 0;
  }
}
