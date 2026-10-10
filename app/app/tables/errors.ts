import { errorMessage } from "../lib/convexError";

/** The words to show for a failed Tables call. A server refusal
 * (ConvexError) carries its reason on `data`; the message of anything else
 * is the next best thing. */
export function tableErrorMessage(cause: unknown, fallback: string): string {
  return errorMessage(cause, cause instanceof Error && cause.message ? cause.message : fallback);
}
