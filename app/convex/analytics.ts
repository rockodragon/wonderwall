import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Record a profile view
export const recordProfileView = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const viewerId = await auth.getUserId(ctx);

    // Don't record if viewing own profile
    const profile = await ctx.db.get(args.profileId);
    if (profile && profile.userId === viewerId) {
      return;
    }

    // Throttle: don't record same viewer viewing same profile within 1 hour
    if (viewerId) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const recentView = await ctx.db
        .query("profileViews")
        .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
        .filter((q) =>
          q.and(
            q.eq(q.field("viewerId"), viewerId),
            q.gt(q.field("createdAt"), oneHourAgo),
          ),
        )
        .first();

      if (recentView) return;
    }

    await ctx.db.insert("profileViews", {
      profileId: args.profileId,
      viewerId: viewerId || undefined,
      createdAt: Date.now(),
    });
  },
});

// Get profile view count
export const getProfileViewCount = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const views = await ctx.db
      .query("profileViews")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .collect();

    return views.length;
  },
});

// Toggle like on a profile
export const toggleProfileLike = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Don't allow liking own profile
    const profile = await ctx.db.get(args.profileId);
    if (profile && profile.userId === userId) {
      throw new Error("Cannot like your own profile");
    }

    // Check if already liked
    const existing = await ctx.db
      .query("profileLikes")
      .withIndex("by_profileId_userId", (q) =>
        q.eq("profileId", args.profileId).eq("userId", userId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    } else {
      await ctx.db.insert("profileLikes", {
        profileId: args.profileId,
        userId,
        createdAt: Date.now(),
      });
      return { liked: true };
    }
  },
});

// Get profile like count and whether current user has liked
export const getProfileLikeStatus = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);

    const likes = await ctx.db
      .query("profileLikes")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .collect();

    const userLiked = userId
      ? likes.some((like) => like.userId === userId)
      : false;

    return {
      count: likes.length,
      userLiked,
    };
  },
});

// Get analytics summary for a profile (for profile owner)
export const getMyProfileAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return null;

    // Get view count
    const views = await ctx.db
      .query("profileViews")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get like count
    const likes = await ctx.db
      .query("profileLikes")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get views in last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentViews = views.filter((v) => v.createdAt > sevenDaysAgo);

    return {
      totalViews: views.length,
      recentViews: recentViews.length,
      totalLikes: likes.length,
    };
  },
});
