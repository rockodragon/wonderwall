// Who may see a hidden (test) community, and the one filter every browse
// list, search and direct-link read runs community-linked content through.
// The rule itself is hiddenCommunity.ts (pure); this file loads the viewer
// and applies it. Written to be cheap in the ordinary case: nothing about
// the viewer is read until a hidden community actually turns up.
//
// Usage, per query call:
//   const gate = communityVisibility(ctx);
//   events = await gate.filter(events);              // list: drop hidden-community rows
//   if (!(await gate.idVisible(event.hostOrgId))) return null;  // direct link
//   orgs = await gate.filterOrgs(orgs);              // community directory

import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isAdminProfile } from "../helpers";
import { canSeeCommunity, isHiddenCommunity } from "./hiddenCommunity";

export interface CommunityViewer {
  isAdmin: boolean;
  /** Ids (as strings) of the communities the viewer is an ACTIVE member of. */
  activeCommunityIds: Set<string>;
}

const ANONYMOUS: CommunityViewer = { isAdmin: false, activeCommunityIds: new Set() };

/** The viewer as the community rules see them: admin flag plus active
 * memberships. `userId` undefined means "whoever is signed in"; null is
 * explicitly no one. */
export async function loadCommunityViewer(
  ctx: QueryCtx,
  userId?: Id<"users"> | null,
): Promise<CommunityViewer> {
  const id = userId === undefined ? await getAuthUserId(ctx) : userId;
  if (!id) return ANONYMOUS;
  const [profile, rows] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", id))
      .first(),
    ctx.db
      .query("communityMembers")
      .withIndex("by_userId", (q) => q.eq("userId", id))
      .collect(),
  ]);
  return {
    isAdmin: isAdminProfile(profile),
    activeCommunityIds: new Set(
      rows.filter((m) => m.status === "active").map((m) => String(m.hostOrgId)),
    ),
  };
}

type OrgLike = Pick<Doc<"hostOrgs">, "_id" | "name" | "slug">;

export function communityVisibility(ctx: QueryCtx, userId?: Id<"users"> | null) {
  let viewerPromise: Promise<CommunityViewer> | undefined;
  const viewer = () => (viewerPromise ??= loadCommunityViewer(ctx, userId));
  const byId = new Map<string, Promise<boolean>>();

  /** One community row: ordinary → true; hidden → admins and its members. */
  async function orgVisible(org: OrgLike): Promise<boolean> {
    if (!isHiddenCommunity(org)) return true;
    const v = await viewer();
    return canSeeCommunity(org, {
      isAdmin: v.isAdmin,
      isActiveMember: v.activeCommunityIds.has(String(org._id)),
    });
  }

  /** The community a piece of content is posted into. No community, or one
   * that no longer exists → visible (nothing to hide). */
  function idVisible(hostOrgId: Id<"hostOrgs"> | null | undefined): Promise<boolean> {
    if (!hostOrgId) return Promise.resolve(true);
    const key = String(hostOrgId);
    let hit = byId.get(key);
    if (!hit) {
      hit = ctx.db.get(hostOrgId).then((org) => (org ? orgVisible(org) : true));
      byId.set(key, hit);
    }
    return hit;
  }

  /** Drops content posted into a community the viewer can't see. */
  async function filter<T extends { hostOrgId?: Id<"hostOrgs"> | null }>(items: T[]): Promise<T[]> {
    const keep = await Promise.all(items.map((item) => idVisible(item.hostOrgId)));
    return items.filter((_, i) => keep[i]);
  }

  /** Drops community rows the viewer can't see. */
  async function filterOrgs<T extends OrgLike>(orgs: T[]): Promise<T[]> {
    const keep = await Promise.all(orgs.map((org) => orgVisible(org)));
    return orgs.filter((_, i) => keep[i]);
  }

  return { orgVisible, idVisible, filter, filterOrgs };
}

/** True when this id names a hidden community — viewer-independent, for the
 * places that must stay quiet about content in one no matter who posts it
 * (follower notifications, public counts). */
export async function isHiddenCommunityId(
  ctx: QueryCtx,
  hostOrgId: Id<"hostOrgs"> | null | undefined,
): Promise<boolean> {
  if (!hostOrgId) return false;
  const org = await ctx.db.get(hostOrgId);
  return !!org && isHiddenCommunity(org);
}
