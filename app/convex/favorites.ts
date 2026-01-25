import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

export const toggle = mutation({
  args: {
    targetType: v.union(v.literal("profile"), v.literal("event")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId_target", (q) =>
        q
          .eq("userId", userId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    } else {
      await ctx.db.insert("favorites", {
        userId,
        targetType: args.targetType,
        targetId: args.targetId,
        createdAt: Date.now(),
      });
      return { favorited: true };
    }
  },
});

export const isFavorited = query({
  args: {
    targetType: v.union(v.literal("profile"), v.literal("event")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return false;

    const existing = await ctx.db
      .query("favorites")
      .withIndex("by_userId_target", (q) =>
        q
          .eq("userId", userId)
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId),
      )
      .first();

    return !!existing;
  },
});

export const getMyFavorites = query({
  args: {
    targetType: v.optional(v.union(v.literal("profile"), v.literal("event"))),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    let query = ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId));

    const favorites = await query.collect();

    // Filter by type if specified
    const filtered = args.targetType
      ? favorites.filter((f) => f.targetType === args.targetType)
      : favorites;

    // Fetch the actual items
    const results = await Promise.all(
      filtered.map(async (fav) => {
        if (fav.targetType === "profile") {
          const profile = await ctx.db.get(fav.targetId as any);
          return profile ? { ...fav, profile } : null;
        } else {
          const event = await ctx.db.get(fav.targetId as any);
          return event ? { ...fav, event } : null;
        }
      }),
    );

    return results.filter(Boolean);
  },
});

export const getFavoriteCount = query({
  args: {
    targetType: v.union(v.literal("profile"), v.literal("event")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .collect();

    return favorites.length;
  },
});
