// The Discipline multi-select, then Near me. The People directory runs these
// on the server (convex/profiles.ts directory), so a page of 24 is cut from
// everyone who matches rather than from the first 24; the desk's Following
// list, which is the member's own, runs them here. The text search itself is
// the server's, so it is not here.

import { INTERESTS } from "../../constants/interests";
import { withinRadius, type LatLng, type NearMe, type WithDistance } from "./nearMe";

/** The Discipline options: the canonical INTERESTS list, label and value the
 * same singular string, so this can never drift from it. */
export const INTEREST_OPTIONS = INTERESTS.map((fn) => ({ label: fn, value: fn }));

type Locatable = { interests: readonly string[]; coordinates?: LatLng | null };

/**
 * Profiles that have any of the chosen interests (none chosen: all of them),
 * then, when Near me is on, those within the radius, nearest first.
 */
export function filterProfiles<T extends Locatable>(
  profiles: readonly T[],
  opts: { interests: readonly string[]; near?: NearMe | null },
): (T | WithDistance<T>)[] {
  let result: readonly T[] = profiles;
  if (opts.interests.length > 0) {
    result = result.filter((profile) => opts.interests.some((interest) => profile.interests.includes(interest)));
  }
  if (opts.near) return withinRadius(result, opts.near);
  return result as T[];
}

/** Only the people whose ids are in `ids`, in the list's own order. */
export function onlyIds<T extends { _id: string }>(items: readonly T[], ids: ReadonlySet<string>): T[] {
  return items.filter((item) => ids.has(String(item._id)));
}
