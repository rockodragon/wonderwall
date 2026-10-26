// How a page of the People directory ends (convex/directoryRules.ts): a
// member with more to see gets Load more; a visitor who has seen all they
// may gets how many more there are and a way to join. Pure; the paging
// itself is lib/useDirectory.ts, and /people and the desk draw the end in
// their own styles.

import { DIRECTORY_MAX } from "../../../convex/directoryRules";
import type { NearMe } from "./nearMe";

/** What follows the last card. null: nothing, everyone who matches is shown
 * (or a member has as many as one call returns, DIRECTORY_MAX). */
export type DirectoryEnd = { kind: "more"; remaining: number } | { kind: "join"; remaining: number } | null;

export function directoryEnd(page: { people: readonly unknown[]; total: number; visitor: boolean } | undefined): DirectoryEnd {
  if (!page) return null;
  const remaining = page.total - page.people.length;
  if (remaining <= 0) return null;
  if (page.visitor) return { kind: "join", remaining };
  return page.people.length >= DIRECTORY_MAX ? null : { kind: "more", remaining };
}

/** "12 more creatives here." */
export function moreCreativesLine(remaining: number): string {
  return `${remaining} more ${remaining === 1 ? "creative" : "creatives"} here.`;
}

/** The link after it, to sign up and come back (lib/pendingIntent signupHref). */
export const JOIN_TO_SEE_EVERYONE = "Join free to see everyone.";

/** Near me as the directory query takes it. The position is rounded to two
 * decimals (about 1 km), the precision profiles are measured at
 * (toPublicProfile), so the visitor's exact location never leaves the page. */
export function directoryNear(near: NearMe | null | undefined): { lat: number; lng: number; radius: number } | undefined {
  if (!near) return undefined;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { lat: round(near.pos.lat), lng: round(near.pos.lng), radius: near.radius };
}
