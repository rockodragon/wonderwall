// Convex surfaces a thrown ConvexError's payload on err.data, not
// err.message (that's a generic "Server Error" in production, by design —
// only ConvexError.data is meant to reach the client). Caught via testing:
// a real validation error ("Needs a real amount.") was showing as an opaque
// server error instead of its actual reason.
//
// Moved out of routes/projects.tsx so the desk and the pages that already
// imported it from there share one reader.
export function errorMessage(err: unknown): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "reason" in data) {
    return String((data as { reason: unknown }).reason);
  }
  if (typeof data === "string" && data.length > 0) return data;
  return "Something went wrong — try again.";
}
