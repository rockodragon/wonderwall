// The small reads over hostOrgs and communityMembers that anything may
// import: which row is a community, whether it's open, who belongs to it.
// Kept apart from communities.ts (the community pages and their mutations)
// so the email sender, auth and tablePolicy can use them without pulling
// that file in. communities.ts re-exports COMMUNITY_KIND and
// getCommunityMember, so existing imports from there keep working.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** hostOrgs.kind of a community — the one kind people join and post into.
 * The platform row, funds and churches are other kinds. */
export const COMMUNITY_KIND = "community";

/** An open community: kind COMMUNITY_KIND and active. A missing status reads
 * as active, the same as everywhere else hostOrgs is read (normalizeCommunity
 * in communities.ts). A fund or the platform row isn't one, nor is a pending
 * or archived community. */
export function isActiveCommunityOrg(org: { kind: string; status?: string }): boolean {
  return org.kind === COMMUNITY_KIND && (org.status ?? "active") === "active";
}

/** The person's row in a community, whatever its status (null if none). */
export async function getCommunityMember(
  ctx: Ctx,
  hostOrgId: Id<"hostOrgs">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers"> | null> {
  return ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", hostOrgId).eq("userId", userId))
    .unique();
}

/** Every community row the person has, any status — pending and removed
 * included. For callers that sort those out themselves. */
export async function communityMembershipsOf(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"communityMembers">[]> {
  return ctx.db
    .query("communityMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
}

/** The rows where the person is an ACTIVE member. The orgs behind them
 * aren't checked here — a caller that needs real, open communities loads
 * each and asks isActiveCommunityOrg. */
export async function activeCommunityMemberships(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"communityMembers">[]> {
  return (await communityMembershipsOf(ctx, userId)).filter((m) => m.status === "active");
}

/** Every row of the community, any status — pending and removed included.
 * For callers that need those too (its page, its member list, its reports). */
export async function membersOfCommunity(
  ctx: Ctx,
  hostOrgId: Id<"hostOrgs">,
): Promise<Doc<"communityMembers">[]> {
  return ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", hostOrgId))
    .collect();
}

/** The community's ACTIVE members: who is in it now. Pending requests and
 * removed members aren't. */
export async function activeMembersOfCommunity(
  ctx: Ctx,
  hostOrgId: Id<"hostOrgs">,
): Promise<Doc<"communityMembers">[]> {
  return (await membersOfCommunity(ctx, hostOrgId)).filter((m) => m.status === "active");
}

/** Batches hostOrgs lookups into one Map keyed by hostOrgId string — one
 * ctx.db.get per DISTINCT org, never one per row (several projects, events,
 * classes can share a community). Only real communities (kind COMMUNITY_KIND)
 * come back: the platform org and funds also have a hostOrgId, but they're
 * never shown as a content's `community`. */
export async function resolveCommunities(
  ctx: Ctx,
  hostOrgIds: (Id<"hostOrgs"> | undefined | null)[],
): Promise<Map<string, { name: string; slug: string }>> {
  const distinct = [...new Set(hostOrgIds.filter((id): id is Id<"hostOrgs"> => !!id))];
  const orgs = await Promise.all(distinct.map((id) => ctx.db.get(id)));
  const out = new Map<string, { name: string; slug: string }>();
  distinct.forEach((id, i) => {
    const org = orgs[i];
    if (org && org.kind === COMMUNITY_KIND) out.set(String(id), { name: org.name, slug: org.slug });
  });
  return out;
}
