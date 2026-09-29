// Everyone who has an account is a member of The Garden — it's the one
// community at launch (Rick, 2026-09-29). New accounts join in auth.ts's
// afterUserCreatedOrUpdated; accounts that predate this are added once by
// backfillDefaultCommunity below:
//   npx convex run garden/defaultCommunity:backfillDefaultCommunity '{"dryRun":true}' [--prod]
//   npx convex run garden/defaultCommunity:backfillSeatCommunity '{"dryRun":true}' [--prod]

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const DEFAULT_COMMUNITY_SLUG = "the-garden";

export async function getDefaultCommunity(ctx: QueryCtx | MutationCtx) {
  return ctx.db
    .query("hostOrgs")
    .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_COMMUNITY_SLUG))
    .unique();
}

/** Adds the user to The Garden as an active member. Does nothing when The
 * Garden isn't seeded or the user already has a row — including a
 * "removed" row, so someone a host removed is never quietly re-added. */
export async function joinDefaultCommunity(
  ctx: MutationCtx,
  userId: Id<"users">,
  hostOrgId?: Id<"hostOrgs">,
): Promise<boolean> {
  const orgId = hostOrgId ?? (await getDefaultCommunity(ctx))?._id;
  if (!orgId) return false;
  const existing = await ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", orgId).eq("userId", userId))
    .unique();
  if (existing) return false;
  await ctx.db.insert("communityMembers", {
    hostOrgId: orgId,
    userId,
    role: "member",
    status: "active",
    joinedAt: Date.now(),
  });
  return true;
}

/** One page of users per call; run again with the returned cursor until
 * `isDone`. dryRun counts who would be added without writing. */
export const backfillDefaultCommunity = internalMutation({
  args: {
    dryRun: v.boolean(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const org = await getDefaultCommunity(ctx);
    if (!org) throw new Error(`"${DEFAULT_COMMUNITY_SLUG}" isn't seeded`);

    const page = await ctx.db
      .query("users")
      .paginate({ numItems: 500, cursor: args.cursor ?? null });

    let added = 0;
    let alreadyIn = 0;
    for (const user of page.page) {
      const existing = await ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId_userId", (q) =>
          q.eq("hostOrgId", org._id).eq("userId", user._id),
        )
        .unique();
      if (existing) {
        alreadyIn++;
        continue;
      }
      if (!args.dryRun) await joinDefaultCommunity(ctx, user._id, org._id);
      added++;
    }

    return {
      dryRun: args.dryRun,
      scanned: page.page.length,
      [args.dryRun ? "wouldAdd" : "added"]: added,
      alreadyIn,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

/** Records The Garden on every paid seat that predates per-community tiers
 * (2026-09-29). Behavior doesn't change — a seat with no communityId
 * already counts as The Garden — this just makes the record explicit.
 * Covered seats keep their sponsor in hostOrgId. */
export const backfillSeatCommunity = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const org = await getDefaultCommunity(ctx);
    if (!org) throw new Error(`"${DEFAULT_COMMUNITY_SLUG}" isn't seeded`);
    const rows = await ctx.db.query("memberships").collect();
    const missing = rows.filter((m) => m.communityId === undefined);
    if (!args.dryRun) {
      for (const m of missing) await ctx.db.patch(m._id, { communityId: org._id });
    }
    return {
      dryRun: args.dryRun,
      seats: rows.length,
      [args.dryRun ? "wouldTag" : "tagged"]: missing.length,
    };
  },
});
