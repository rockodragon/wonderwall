import { internalMutation } from "./_generated/server";

/**
 * Cron job: aggregate recent likes and send batched notifications.
 * Runs 3x/day. Groups profile + artifact likes per recipient since last digest.
 */
export const sendLikesDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all profiles to check for new likes
    const profiles = await ctx.db.query("profiles").collect();

    for (const profile of profiles) {
      const since = profile.lastLikeNotifiedAt || 0;

      // Count profile likes since last notification
      const profileLikes = await ctx.db
        .query("profileLikes")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .filter((q) => q.gt(q.field("createdAt"), since))
        .collect();

      // Count artifact likes since last notification
      const artifacts = await ctx.db
        .query("artifacts")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .collect();

      let artifactLikeCount = 0;
      for (const artifact of artifacts) {
        const likes = await ctx.db
          .query("artifactLikes")
          .withIndex("by_artifactId", (q) => q.eq("artifactId", artifact._id))
          .filter((q) => q.gt(q.field("createdAt"), since))
          .collect();
        artifactLikeCount += likes.length;
      }

      const totalLikes = profileLikes.length + artifactLikeCount;

      if (totalLikes === 0) continue;

      // Build notification message
      const parts: string[] = [];
      if (profileLikes.length > 0) {
        parts.push(
          `${profileLikes.length} profile like${profileLikes.length > 1 ? "s" : ""}`,
        );
      }
      if (artifactLikeCount > 0) {
        parts.push(
          `${artifactLikeCount} work like${artifactLikeCount > 1 ? "s" : ""}`,
        );
      }

      await ctx.db.insert("notifications", {
        userId: profile.userId,
        type: "likes_digest",
        title: `${totalLikes} new like${totalLikes > 1 ? "s" : ""} on your profile`,
        message: parts.join(" and "),
        linkUrl: `/profile/${profile._id}`,
        createdAt: now,
      });

      // Update last notified timestamp
      await ctx.db.patch(profile._id, { lastLikeNotifiedAt: now });
    }
  },
});
