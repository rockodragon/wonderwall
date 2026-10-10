// Convex surfaces a thrown ConvexError's payload on err.data, not
// err.message (that's a generic "Server Error" in production, by design —
// only ConvexError.data is meant to reach the client). Caught via testing:
// a real validation error ("Needs a real amount.") was showing as an opaque
// server error instead of its actual reason.
//
// The one reader for it: a string payload (`new ConvexError("Event is
// full.")`) or an object's `reason` (`{ code, reason }`, the garden
// convention). Pass the line to show when there's neither.
export const GENERIC_ERROR = "Something went wrong — try again.";

export function errorMessage(err: unknown, fallback: string = GENERIC_ERROR): string {
  const data = (err as { data?: unknown } | null | undefined)?.data;
  if (typeof data === "string" && data.length > 0) return data;
  if (data && typeof data === "object" && "reason" in data) {
    const reason = (data as { reason?: unknown }).reason;
    if (reason) return String(reason);
  }
  return fallback;
}

/** The code on a ConvexError's `{ code }` payload, if it has one. */
export function errorCode(err: unknown): string | undefined {
  const data = (err as { data?: unknown } | null | undefined)?.data;
  if (data && typeof data === "object" && "code" in data) {
    const code = (data as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** True when the server refused because the new session hasn't reached the
 * Convex client yet. The server says it two ways — "not_signed_in" and
 * "unauthenticated". A plain `new Error("Not authenticated")` can't be told
 * apart in production (Convex redacts its message), so only the code
 * counts. */
export function isNotSignedIn(err: unknown): boolean {
  const code = errorCode(err);
  return code === "not_signed_in" || code === "unauthenticated";
}
