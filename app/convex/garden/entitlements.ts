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
}): GardenUser {
  const entitled = args.memberships.filter((m) => ENTITLED_STATUSES.has(m.status));
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

/** The one gate. Throws ConvexError carrying the denial anatomy. */
export function assertCanPure(user: GardenUser, capability: Capability): CanResult {
  const result = can(user, capability);
  if (!result.allowed) {
    throw new ConvexError({
      code: "entitlement_denied",
      capability,
      reason: result.reason,
      limit: result.limit,
      used: result.used,
      upgradePath: result.upgradePath,
    });
  }
  return result;
}

// ——— Convex wrapper (requires codegen'd types; keep thin) ———
// Usage in a mutation:
//   const gardenUser = await getGardenUser(ctx, userId);
//   assertCanPure(gardenUser, "project.create.passion");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGardenUser(ctx: any, userId: any): Promise<GardenUser> {
  const [profile, memberships, activePassion] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("memberships")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("projects")
      .withIndex("by_userId_kind_status", (q: any) =>
        q.eq("userId", userId).eq("kind", "passion").eq("status", "active"),
      )
      .collect(),
  ]);
  return deriveGardenUser({
    userId: String(userId),
    profile,
    memberships,
    activePassionProjects: activePassion.length,
  });
}
