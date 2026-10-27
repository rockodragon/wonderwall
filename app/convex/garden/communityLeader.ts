// Who is a "community leader": the one rule behind the crimson sprout badge
// that sits beside a person's name on their page and in the People
// directory. A person is one if either
//   - they are a platform admin (helpers.ts isAdminProfile), or
//   - they hold an ACTIVE communityMembers row whose role is a leader's
//     (communityLookup.ts isLeaderRole: "host", the owner or an admin of a
//     community; "moderator" deliberately isn't one) in an OPEN community
//     (communityLookup.ts isActiveCommunityOrg). A pending request and a
//     removed member don't count, and neither does a host whose community
//     isn't open: applying for a community makes you its host at once
//     (communities.ts applyForCommunity), but you lead nothing until an
//     operator approves it, and not after it is declined or archived.
//
// Only the yes/no leaves the server. A page that shows the badge gets
// `isLeader`, never the isAdmin flag it is partly made of. Every read is by
// id or index (the profile and the memberships by userId, each community by
// id), never a whole table, and a list fetches each community once however
// many of its people are on show.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getProfileByUserId, isAdminProfile } from "../helpers";
import { activeCommunityMemberships, isActiveCommunityOrg, isLeaderRole } from "./communityLookup";

type Ctx = QueryCtx | MutationCtx;

/** What makes a person a leader, before the communities are looked at: an
 * admin needs none; anyone else leads if one of these is open. */
type Claim = { admin: boolean; hosted: Id<"hostOrgs">[] };

async function claimOf(ctx: Ctx, userId: Id<"users">, profile?: Doc<"profiles"> | null): Promise<Claim> {
  const theirs = profile === undefined ? await getProfileByUserId(ctx, userId) : profile;
  if (isAdminProfile(theirs)) return { admin: true, hosted: [] };
  const rows = await activeCommunityMemberships(ctx, userId);
  return { admin: false, hosted: rows.filter((m) => isLeaderRole(m.role)).map((m) => m.hostOrgId) };
}

/** Which of these communities are open, as a set of ids (strings): each
 * distinct one fetched once. */
async function openCommunities(ctx: Ctx, orgIds: readonly Id<"hostOrgs">[]): Promise<Set<string>> {
  const distinct = [...new Map(orgIds.map((id) => [String(id), id])).values()];
  const orgs = await Promise.all(distinct.map((id) => ctx.db.get(id)));
  return new Set(distinct.filter((_, i) => orgs[i] && isActiveCommunityOrg(orgs[i]!)).map(String));
}

const leads = (claim: Claim, open: ReadonlySet<string>) => claim.admin || claim.hosted.some((id) => open.has(String(id)));

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
  const claim = await claimOf(ctx, userId, profile);
  if (claim.admin || claim.hosted.length === 0) return claim.admin;
  return leads(claim, await openCommunities(ctx, claim.hosted));
}

/**
 * The leaders among these people, as a set of user ids (strings): the form
 * for a list, where each row asks `leaders.has(String(userId))`. Each
 * distinct person is read once, and each community once, however often they
 * are listed.
 */
export async function leaderUserIds(ctx: Ctx, userIds: readonly Id<"users">[]): Promise<Set<string>> {
  const distinct = [...new Map(userIds.map((id) => [String(id), id])).values()];
  const claims = await Promise.all(distinct.map((id) => claimOf(ctx, id)));
  const open = await openCommunities(ctx, claims.flatMap((c) => c.hosted));
  return new Set(distinct.filter((_, i) => leads(claims[i], open)).map(String));
}
