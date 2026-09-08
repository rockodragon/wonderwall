// Following — docs/features/following.md. There is no follows table: a
// `favorites` row with targetType "profile" IS a follow. The catch that
// every fan-out here has to respect is that `favorites.targetId` for those
// rows is a PROFILE id (profiles._id), not a user id, while the follower's
// `favorites.userId` is a users id. Projects and events only know their
// owner's users id (`userId` / `organizerId`), so resolving followers is
// always: users id → profiles.by_userId → favorites.by_target
// ("profile", profile._id). Skip the profile hop and nothing ever fires.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";

/** Short date for "is hosting <title>, <date>" copy (spec §1 #6). Pure so
 * it can be unit-tested; Convex's runtime formats in UTC. */
export function formatFollowedEventDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Fan a notification out to everyone following `ownerUserId`. Plain helper
 * (not a Convex function) — called from inside createPaidProject,
 * createPassionProject and events.create in the same transaction as the
 * row they just inserted. Writes are direct `ctx.db.insert("notifications")`
 * in the likesDigest.ts shape; `relatedUserId` is the owner so
 * getNotifications can enrich with their profile. In-app only — no email
 * (spec §2). Returns the number of notifications written; 0 when the owner
 * has no profile or no followers, never throws for either.
 */
export async function notifyFollowers(
  ctx: MutationCtx,
  ownerUserId: Id<"users">,
  n: { type: string; title: string; message: string; linkUrl: string },
): Promise<number> {
  // users id → profile id: favorites point at the profile, not the user.
  const ownerProfile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", ownerUserId))
    .first();
  if (!ownerProfile) return 0;

  const follows = await ctx.db
    .query("favorites")
    .withIndex("by_target", (q) =>
      q.eq("targetType", "profile").eq("targetId", ownerProfile._id),
    )
    .collect();

  const now = Date.now();
  let count = 0;
  for (const follow of follows) {
    // favorites.userId is the follower's users id — no hop needed here.
    if (follow.userId === ownerUserId) continue;
    await ctx.db.insert("notifications", {
      userId: follow.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      linkUrl: n.linkUrl,
      relatedUserId: ownerUserId,
      createdAt: now,
    });
    count++;
  }
  return count;
}

/**
 * Does the person who owns `profileId` follow the current viewer? Powers the
 * "Follows you" line on profile.tsx (spec §1 #2) — private to the pair, so
 * it only ever answers about the viewer. False when signed out, when the
 * viewer has no profile yet, or on the viewer's own profile.
 *
 * Direction, spelled out: the row we look for has `userId` = the viewed
 * person's users id (their profile's `userId`) and `targetId` = the
 * viewer's PROFILE id — not the viewer's users id.
 */
export const followsMe = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return false;

    const viewedProfile = await ctx.db.get(args.profileId);
    if (!viewedProfile) return false;
    if (viewedProfile.userId === userId) return false;

    const myProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!myProfile) return false;

    const follow = await ctx.db
      .query("favorites")
      .withIndex("by_userId_target", (q) =>
        q
          .eq("userId", viewedProfile.userId)
          .eq("targetType", "profile")
          .eq("targetId", myProfile._id),
      )
      .first();

    return follow !== null;
  },
});
