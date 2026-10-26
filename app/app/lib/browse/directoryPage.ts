// How a page of the People directory ends (convex/directoryRules.ts): a
// member with more to see gets Load more, or, at as many as one call
// returns, how many more there are and to narrow the list; a visitor who
// has seen all they may gets how many more there are and a way to join.
// Pure; the paging itself is lib/useDirectory.ts, and /people and the desk
// draw the end in their own styles.

import { DIRECTORY_MAX, VISITOR_MIN_QUERY, searchedText } from "../../../convex/directoryRules";
import type { NearMe } from "./nearMe";

/** What follows the last card. null: nothing, everyone who matches is shown. */
export type DirectoryEnd =
  | { kind: "more"; remaining: number }
  | { kind: "capped"; remaining: number }
  | { kind: "join"; remaining: number }
  | null;

export function directoryEnd(page: { people: readonly unknown[]; total: number; visitor: boolean } | undefined): DirectoryEnd {
  if (!page) return null;
  const remaining = page.total - page.people.length;
  if (remaining <= 0) return null;
  if (page.visitor) return { kind: "join", remaining };
  return { kind: page.people.length >= DIRECTORY_MAX ? "capped" : "more", remaining };
}

/** "12 more creatives here." */
export function moreCreativesLine(remaining: number): string {
  return `${remaining} more ${remaining === 1 ? "creative" : "creatives"} here.`;
}

/** The link after it, to sign up and come back (lib/pendingIntent signupHref). */
export const JOIN_TO_SEE_EVERYONE = "Join free to see everyone.";

/** A member at DIRECTORY_MAX: "200 more creatives here. Search or pick a discipline to find them." */
export function cappedLine(remaining: number): string {
  return `${moreCreativesLine(remaining)} Search or pick a discipline to find them.`;
}

/** What a visitor is told when their search is too short to run
 * (searchedText): the list under it is everyone's first page, not matches. */
export const SHORT_SEARCH_HINT = `Type ${VISITOR_MIN_QUERY} or more letters to search.`;

export function searchHint(query: string | undefined, visitor: boolean | undefined): string | null {
  return visitor && query?.trim() && searchedText(query, false) === undefined ? SHORT_SEARCH_HINT : null;
}

/** Near me as the directory query takes it. The position is rounded to two
 * decimals (about 1 km), the precision profiles are measured at
 * (toPublicProfile), so the visitor's exact location never leaves the page. */
export function directoryNear(near: NearMe | null | undefined): { lat: number; lng: number; radius: number } | undefined {
  if (!near) return undefined;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { lat: round(near.pos.lat), lng: round(near.pos.lng), radius: near.radius };
}
