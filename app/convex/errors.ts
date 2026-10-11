// The one way to refuse with a line a person can read. Production hides a
// plain Error's message from the page ("Server Error"); a ConvexError's
// `{ code, reason }` reaches it, and the client reads it with errorMessage /
// errorCode (app/lib/convexError.ts).

import { ConvexError } from "convex/values";

/** Throws `ConvexError({ code, reason })`. `code` is for code that branches
 * on it ("not_found", "forbidden", "unauthenticated", "invalid_…"); `reason`
 * is the sentence the page shows. */
export function fail(code: string, reason: string): never {
  // A type alias, not an interface: an interface isn't a valid ConvexError
  // payload type.
  const payload: { code: string; reason: string } = { code, reason };
  throw new ConvexError(payload);
}
