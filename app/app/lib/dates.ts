// Dates the way the app writes them. One home, so "Oct 7" reads the same on
// the desk, the Shortlist and the Updates admin.

/** "Oct 7", in the viewer's time zone. */
export function shortDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
