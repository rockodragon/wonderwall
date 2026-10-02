// What /people (routes/search.tsx) and the desk's People view do to the
// profiles the server returns: the Discipline multi-select, then Near me.
// The text search itself runs on the server (api.profiles.search), so it is
// not here.

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

/**
 * A person's name or one of their interests contains `query`. That is all a
 * row from the list of people you follow carries (no bio or place), so it is
 * what Following searches by; Everyone's search runs on the server, which also
 * reads bio, place, organization and what they are wondering.
 */
export function matchesPersonQuery(p: { name: string; interests: readonly string[] }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.name.toLowerCase().includes(q) || p.interests.some((interest) => interest.toLowerCase().includes(q));
}
