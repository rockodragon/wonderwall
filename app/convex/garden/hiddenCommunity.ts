// Hidden (test) communities — pure rule, no server imports, so both the
// Convex functions and the frontend can import it.
//
// An admin names a community with a leading underscore ("_TeamTest") to try
// things in it — Updates aimed at a community, events and projects posted
// into it — without the public ever seeing it. The marker lives in the NAME:
// community slugs are generated lowercase letters, digits and dashes
// (stories.ts's slugifyTitle drops the underscore, and renameCommunity only
// accepts [a-z0-9-]), so "_TeamTest" gets the slug "teamtest". The slug is
// still checked, for a row whose slug was set by hand.
//
// Who may see one is garden/communityVisibility.ts: admins and the
// community's active members. Everyone else gets the same answer as for a
// community that was never created.

export const HIDDEN_COMMUNITY_PREFIX = "_";

/** True when the community's trimmed name, or its slug, starts with "_". */
export function isHiddenCommunity(
  community: { name?: string | null; slug?: string | null } | null | undefined,
): boolean {
  if (!community) return false;
  return (
    (community.name ?? "").trim().startsWith(HIDDEN_COMMUNITY_PREFIX) ||
    (community.slug ?? "").trim().startsWith(HIDDEN_COMMUNITY_PREFIX)
  );
}

/** The single visibility decision: an ordinary community is visible to
 * everyone; a hidden one only to admins and its active members. */
export function canSeeCommunity(
  community: { name?: string | null; slug?: string | null } | null | undefined,
  viewer: { isAdmin: boolean; isActiveMember: boolean },
): boolean {
  if (!isHiddenCommunity(community)) return true;
  return viewer.isAdmin || viewer.isActiveMember;
}
