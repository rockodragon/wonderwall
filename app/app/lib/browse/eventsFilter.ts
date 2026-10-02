// What /events (routes/events.tsx) and the desk's Events view do to the
// events the server returns: the search box and tag pills, a community, Near
// me, and the Favorites cut. Pure.

import { withinRadius, type LatLng, type NearMe, type WithDistance } from "./nearMe";

/** The page's three tabs: upcoming, hearted, and the archive. The desk reads
 * the same ?tab= value and calls them Upcoming, Saved and Past. */
export type EventsTab = "all" | "favorites" | "past";

export function parseEventsTab(raw: string | null | undefined): EventsTab {
  return raw === "favorites" || raw === "past" ? raw : "all";
}

type Searchable = {
  _id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  tags?: readonly string[] | null;
  coordinates?: LatLng | null;
};

/** The event's title, description, place or a tag contains `query` (already
 * lower-cased). */
export function matchesEventQuery(e: Searchable, query: string): boolean {
  return (
    e.title.toLowerCase().includes(query) ||
    (e.description ?? "").toLowerCase().includes(query) ||
    !!(e.location && e.location.toLowerCase().includes(query)) ||
    (e.tags ?? []).some((t) => t.toLowerCase().includes(query))
  );
}

/**
 * Search, then tags (any of), then community, then Near me (within the
 * radius, nearest first; without it the server's order stands).
 */
export function filterEvents<T extends Searchable>(
  events: readonly T[],
  opts: {
    query: string;
    tags: readonly string[];
    /** Keep only events in the chosen community. Omit for all of them. */
    inCommunity?: ((e: T) => boolean) | null;
    near?: NearMe | null;
  },
): (T | WithDistance<T>)[] {
  const q = opts.query.trim().toLowerCase();
  let list: readonly T[] = events;
  if (q) list = list.filter((e) => matchesEventQuery(e, q));
  if (opts.tags.length > 0) {
    list = list.filter((e) => (e.tags ?? []).some((t) => opts.tags.includes(t)));
  }
  if (opts.inCommunity) list = list.filter(opts.inCommunity);
  if (opts.near) return withinRadius(list, opts.near);
  return list as T[];
}

/** The events the member has hearted (or "saved"), in the list's own order. */
export function onlyFavorites<T extends { _id: string }>(events: readonly T[], favoriteIds: ReadonlySet<string>): T[] {
  return events.filter((e) => favoriteIds.has(String(e._id)));
}
