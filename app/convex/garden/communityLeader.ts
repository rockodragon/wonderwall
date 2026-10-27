// Who is a "community leader": the one rule behind the crimson sprout badge
// that sits beside a person's name on their page and in the People
// directory. A person is one if either
//   - they are a platform admin (helpers.ts isAdminProfile), or
//   - they hold an ACTIVE communityMembers row whose role is a leader's
//     (communityLookup.ts isLeaderRole: "host", the owner or an admin of a
//     community; "moderator" deliberately isn't one).
// A pending request and a removed member don't count.
//
// Only the yes/no leaves the server. A page that shows the badge gets
// `isLeader`, never the isAdmin flag it is partly made of. Both forms read
// by index (the profile by userId, the memberships by userId), never a whole
// table, so a page of people costs two small reads each.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getProfileByUserId, isAdminProfile } from "../helpers";
import { activeCommunityMemberships, isLeaderRole } from "./communityLookup";

type Ctx = QueryCtx | MutationCtx;

/**
 * Whether this person leads a community. Pass `profile` (their own profile
 * row, `null` for none) when the caller already has it, to skip the lookup;
 * leave it out and it is read.
 */
export async function isCommunityLeader(
  ctx: Ctx,
  userId: Id<"users">,
  profile?: Doc<"profiles"> | null,
): Promise<boolean> {
  const theirs = profile === undefined ? await getProfileByUserId(ctx, userId) : profile;
  if (isAdminProfile(theirs)) return true;
  return (await activeCommunityMemberships(ctx, userId)).some((m) => isLeaderRole(m.role));
}

/**
 * The leaders among these people, as a set of user ids (strings): the form
 * for a list, where each row asks `leaders.has(String(userId))`. Each
 * distinct person is read once, however often they are listed.
 */
export async function leaderUserIds(ctx: Ctx, userIds: readonly Id<"users">[]): Promise<Set<string>> {
  const distinct = [...new Map(userIds.map((id) => [String(id), id])).values()];
  const flags = await Promise.all(distinct.map((id) => isCommunityLeader(ctx, id)));
  return new Set(distinct.filter((_, i) => flags[i]).map(String));
}
