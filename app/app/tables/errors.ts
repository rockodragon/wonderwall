import { errorMessage } from "../lib/convexError";

/** A check in the browser that failed with words for the person (a date in
 * the past, say). Its message is shown as is. */
export class TableInputError extends Error {}

/** The words to show for a failed Tables call: a TableInputError's own
 * message, otherwise the server's reason (errorMessage), otherwise
 * `fallback`. Never a raw err.message — for a server error that's
 * "[CONVEX ...] Server Error". */
export function tableErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof TableInputError ? cause.message : errorMessage(cause, fallback);
}
