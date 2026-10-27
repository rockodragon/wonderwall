// What a maker writes about a portfolio piece (artifacts.description): one
// short plain-text field. The cap lives here so the composer, the page and
// the server agree; the browser imports this file, so it stays free of
// server code.

import { fail } from "./errors";

/** The most a piece's description can hold, the same as a gig or team note. */
export const MAX_DESCRIPTION_LENGTH = 500;

/** The description as stored: trimmed, and undefined when blank. Refuses
 * one past the cap with a reason the page shows. */
export function cleanDescription(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    fail("invalid_input", `Keep it under ${MAX_DESCRIPTION_LENGTH} characters.`);
  }
  return trimmed;
}
