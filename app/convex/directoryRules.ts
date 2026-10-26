// The People directory's rules (profiles.directory): who comes first, and how
// many people one call may return.
//
// Work stays public: a person's page (/@handle) opens for anyone. The
// directory is like Instagram's: open to look at, but browsing it at scale
// takes an account. A member sees DIRECTORY_PAGE people at a time and loads
// more (up to DIRECTORY_MAX). A visitor (signed out) gets one page at most,
// however they page or search, a search of one letter counts as none, and
// they never see anyone who turned on "Hide my profile from search
// engines". The server applies the cap, because the query can be called
// over HTTP without the page.
//
// No Convex imports, so the pages (lib/useDirectory.ts) and the tests use
// the same numbers. Unit-tested in directory.test.ts.

import { isShownProject } from "./moderationRules";
import { hasRealName } from "./names";

/** How many people one page holds: what Load more adds, and all a visitor gets. */
export const DIRECTORY_PAGE = 24;

/**
 * Each person's latest post, keyed by user id: the newest createdAt of a
 * project they lead that their profile shows (isShownProject), or of a
 * published event they organize. Someone who has posted neither isn't in
 * the map.
 */
export function latestPostAt(
  projects: readonly { userId: string; status?: string; createdAt: number }[],
  events: readonly { organizerId: string; status?: string; createdAt: number }[],
): Map<string, number> {
  const latest = new Map<string, number>();
  const note = (userId: string, at: number) => {
    const was = latest.get(userId);
    if (was === undefined || at > was) latest.set(userId, at);
  };
  for (const project of projects) if (isShownProject(project)) note(String(project.userId), project.createdAt);
  for (const event of events) if (event.status === "published") note(String(event.organizerId), event.createdAt);
  return latest;
}

/**
 * Latest activity first: everyone who has posted, newest post first, then
 * everyone who hasn't, newest member (profile createdAt) first.
 */
export function byLatestActivity<T extends { userId: string; createdAt: number }>(
  people: readonly T[],
  latest: ReadonlyMap<string, number>,
): T[] {
  return [...people].sort((a, b) => {
    const postA = latest.get(String(a.userId));
    const postB = latest.get(String(b.userId));
    if (postA !== undefined && postB !== undefined && postA !== postB) return postB - postA;
    if (postA !== undefined && postB === undefined) return -1;
    if (postA === undefined && postB !== undefined) return 1;
    return b.createdAt - a.createdAt;
  });
}

/** Whether a profile is in the directory for this caller: never before
 * the person has named themselves (convex/names.ts); then always for a
 * member, and for a visitor unless the person hid it from search. */
export function listedFor(profile: { name?: string; hideFromSearch?: boolean }, signedIn: boolean): boolean {
  return hasRealName(profile.name) && (signedIn || !profile.hideFromSearch);
}

/** The most people one call returns to a member, however many pages they
 * have loaded: past it, a call would cost more than a person can scroll. */
export const DIRECTORY_MAX = 1000;

/** How many people one call returns: as many as a member asked for (one
 * page when they didn't say), up to DIRECTORY_MAX, and never more than one
 * page for a visitor. */
export function directoryLimit(requested: number | undefined, signedIn: boolean): number {
  const asked =
    requested !== undefined && Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : DIRECTORY_PAGE;
  return Math.min(asked, signedIn ? DIRECTORY_MAX : DIRECTORY_PAGE);
}

/** The shortest search a visitor's is taken as one, trimmed. */
export const VISITOR_MIN_QUERY = 2;

/** The text a caller's search is run with. A visitor's one-letter search is
 * no search at all (the first page, as with none), so a sweep through the
 * alphabet can't page the directory 24 at a time. A member's runs as typed,
 * however short. */
export function searchedText(query: string | undefined, signedIn: boolean): string | undefined {
  if (!query) return undefined;
  if (!signedIn && query.trim().length < VISITOR_MIN_QUERY) return undefined;
  return query;
}
