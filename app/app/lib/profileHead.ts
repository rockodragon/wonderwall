// What a person's page says about itself to a search engine or a link
// preview: the title, one line, the one address. Shared by the page
// (routes/profile.tsx ProfileHead) and the edge (functions/[handle].ts), so a
// crawler that runs no JavaScript reads the same words the browser shows.
// Pure: the edge bundles it.

import { GARDEN_ORIGIN, PLATFORM_NAME } from "../../convex/garden/brandHosts";
import { SITE_ORIGIN } from "./eventCalendar";

/** A preview card shows about this much. */
export const DESCRIPTION_MAX = 200;

/** The canonical address: one per person, on the main site, whichever host
 * the page was reached on. */
export function publicProfileUrl(handle: string): string {
  return `${SITE_ORIGIN}/@${handle}`;
}

/** The address search engines should rank, whichever host the page was
 *  reached on: The Garden's for its members (Rick, 2026-10-25), so they're
 *  found under createthegarden.com; the main site's for everyone else. */
export function canonicalProfileUrl(handle: string, inGarden?: boolean): string {
  return inGarden ? `${GARDEN_ORIGIN}/@${handle}` : publicProfileUrl(handle);
}

/** "Ana Reyes (@ana) — TheCreative.exchange"; with no address, the name alone. */
export function profileTitle(name: string, handle?: string | null): string {
  return `${name}${handle ? ` (@${handle})` : ""} — ${PLATFORM_NAME}`;
}

/** The first line of the bio; without one, what they do and where; without
 * either, that they're here. Cut to DESCRIPTION_MAX. */
export function profileDescription(profile: {
  bio?: string | null;
  interests?: readonly string[] | null;
  location?: string | null;
}): string {
  const firstLine = profile.bio?.trim().split(/\r?\n/)[0]?.trim();
  const words =
    firstLine ||
    [profile.interests?.slice(0, 3).join(", "), profile.location?.trim()].filter(Boolean).join(" · ") ||
    `On ${PLATFORM_NAME}.`;
  return words.length > DESCRIPTION_MAX ? `${words.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : words;
}
