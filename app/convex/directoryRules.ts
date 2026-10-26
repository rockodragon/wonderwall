// The People directory's rules (profiles.directory): who comes first, and how
// many people one call may return.
//
// Work stays public: a person's page (/@handle) opens for anyone. The
// directory is like Instagram's: open to look at, but browsing it at scale
// takes an account. A member sees DIRECTORY_PAGE people at a time and loads
// more. A visitor (signed out) gets one page at most, however they page or
// search, and never sees anyone who turned on "Hide my profile from search
// engines". The server applies the cap, because the query can be called
// over HTTP without the page.
//
// No Convex imports, so the pages (lib/useDirectory.ts) and the tests use
// the same numbers. Unit-tested in directory.test.ts.

import { isShownProject } from "./moderationRules";

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

/** Whether a profile is in the directory for this caller: always for a
 * member, and for a visitor unless the person hid it from search. */
export function listedFor(profile: { hideFromSearch?: boolean }, signedIn: boolean): boolean {
  return signedIn || !profile.hideFromSearch;
}

/** How many people one call returns: as many as a member asked for (one
 * page when they didn't say), and never more than one page for a visitor. */
export function directoryLimit(requested: number | undefined, signedIn: boolean): number {
  const asked =
    requested !== undefined && Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : DIRECTORY_PAGE;
  return signedIn ? asked : Math.min(asked, DIRECTORY_PAGE);
}
