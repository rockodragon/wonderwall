// Server-side entitlement enforcement (spec §2 — non-negotiable).
// Every gated mutation calls assertCan; denials throw the demo's exact
// denial anatomy so the client renders reason/limit/used/upgradePath verbatim.
//
// deriveGardenUser is PURE (unit-tested tonight, no Convex required);
// getGardenUser is the thin data-fetch wrapper around it.
//
// NOTE: requires `npx convex dev` once (codegen) before typecheck of the
// wrapper passes — the pure core has no such dependency.

import { ConvexError } from "convex/values";
import { can } from "./capabilities";
import type { Capability, CanResult, GardenUser, Level } from "./capabilities";

// ——— Pure core ———

export interface ProfileRow {
  name: string;
  patronRole?: boolean;
  partnerRole?: boolean;
}

export interface MembershipRow {
  level: string; // "seat" | "five" | "host"
  status: string; // "active" | "past_due" | "canceled" | "incomplete"
  coveredByCodeId?: unknown;
  /** The community this tier applies in; unset = the default community. */
  communityId?: unknown;
}

/** Which community a tier check is for. `isDefault` is true for The Garden,
 * where seats written before per-community tiers (no communityId) count. */
export interface TierCommunity {
  id: string;
  isDefault: boolean;
}

/** True when this seat counts in `community`. With no community given
 * (The Garden not seeded — tests, a fresh deployment) every seat counts,
 * which is the pre-2026-09-29 platform-wide behavior. */
export function seatAppliesIn(m: MembershipRow, community?: TierCommunity): boolean {
  if (!community) return true;
  if (m.communityId === undefined || m.communityId === null) return community.isDefault;
  return String(m.communityId) === community.id;
}

const LEVEL_RANK: Record<string, number> = { seat: 1, five: 2, host: 3 };

/** Membership statuses that confer entitlements. past_due keeps access during
 * grace (the reconcile cron + coverage suspension flow decide when it ends) —
 * we never silently strip a seat mid-billing-hiccup. */
const ENTITLED_STATUSES = new Set(["active", "past_due"]);

export function deriveGardenUser(args: {
  userId: string;
  profile: ProfileRow | null;
  memberships: MembershipRow[];
  activePassionProjects: number;
  /** The community the tier is for; omitted = every seat counts. */
  community?: TierCommunity;
}): GardenUser {
  const entitled = args.memberships.filter(
    (m) => ENTITLED_STATUSES.has(m.status) && seatAppliesIn(m, args.community),
  );
  // Highest entitled level wins (e.g. a covered seat + a self-paid host tier).
  let level: Level = args.profile ? "free" : "visitor";
  let coveredBy: string | undefined;
  let best = 0;
  for (const m of entitled) {
    const rank = LEVEL_RANK[m.level] ?? 0;
    if (rank > best) {
      best = rank;
      level = m.level as Level;
      coveredBy = m.coveredByCodeId ? "covered" : undefined;
    }
  }
  return {
    id: args.userId,
    name: args.profile?.name ?? "",
    level,
    coveredBy,
    patronRole: args.profile?.patronRole ?? false,
    partnerRole: args.profile?.partnerRole ?? false,
    activePassionProjects: args.activePassionProjects,
  };
}

/** The single denial-throw shape — every entitlement denial in the system
 * goes through here so the client can rely on one anatomy. */
export function throwDenial(
  capability: Capability,
  result: Pick<CanResult, "reason" | "limit" | "used" | "upgradePath">,
): never {
  throw new ConvexError({
    code: "entitlement_denied",
    capability,
    reason: result.reason,
    limit: result.limit,
    used: result.used,
    upgradePath: result.upgradePath,
  });
}

/** The one gate. Throws ConvexError carrying the denial anatomy. */
export function assertCanPure(user: GardenUser, capability: Capability): CanResult {
  const result = can(user, capability);
  if (!result.allowed) throwDenial(capability, result);
  return result;
}

// ——— Convex wrapper (typed against the generated data model; keep thin) ———
// Usage in a mutation:
//   const gardenUser = await getGardenUser(ctx, userId);
//   assertCanPure(gardenUser, "project.create.passion");

import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { DEFAULT_COMMUNITY_SLUG } from "./defaultCommunity";
// From communityLookup.ts, not communities.ts, which imports this file
// (getGardenUser).
import { COMMUNITY_KIND } from "./communityLookup";
import { getProfileByUserId } from "../helpers";

/** The community a tier check is for. `hostOrgId` is the event's,
 * project's or fund's host org when there is one: if that org is a
 * community, the tier is checked there; anything else (a church, AP, no
 * org at all) falls back to The Garden. */
export async function resolveTierCommunity(
  ctx: QueryCtx,
  hostOrgId?: Id<"hostOrgs"> | null,
): Promise<TierCommunity | undefined> {
  const garden = await ctx.db
    .query("hostOrgs")
    .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_COMMUNITY_SLUG))
    .unique();
  if (hostOrgId && (!garden || hostOrgId !== garden._id)) {
    const org = await ctx.db.get(hostOrgId);
    if (org && org.kind === COMMUNITY_KIND) {
      return { id: String(org._id), isDefault: false };
    }
  }
  return garden ? { id: String(garden._id), isDefault: true } : undefined;
}

/** The viewer's tier in one community — The Garden unless `hostOrgId`
 * names another community (see resolveTierCommunity). */
export async function getGardenUser(
  ctx: QueryCtx,
  userId: Id<"users">,
  hostOrgId?: Id<"hostOrgs"> | null,
): Promise<GardenUser> {
  const [profile, memberships, activePassion, community] = await Promise.all([
    getProfileByUserId(ctx, userId),
    ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("projects")
      .withIndex("by_userId_kind_status", (q) =>
        q.eq("userId", userId).eq("kind", "passion").eq("status", "active"),
      )
      .collect(),
    resolveTierCommunity(ctx, hostOrgId),
  ]);
  return deriveGardenUser({
    userId: String(userId),
    profile,
    memberships,
    activePassionProjects: activePassion.length,
    community,
  });
}

// ——— Is this seat paid? (one rule: ENTITLED_STATUSES above) ———

/** True when this membership row is a paid tier right now (ENTITLED_STATUSES).
 * A covered seat counts: it's a full seat. Pure. */
export function isEntitledMembership(m: Pick<MembershipRow, "status">): boolean {
  return ENTITLED_STATUSES.has(m.status);
}

/** True when the person holds a paid membership in any community, a covered
 * seat included. For what belongs to the platform rather than to one
 * community, like a 3-character @address (handles.handleRefusal). */
export async function hasPaidMembership(ctx: Pick<QueryCtx, "db">, userId: Id<"users">): Promise<boolean> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return memberships.some(isEntitledMembership);
}
