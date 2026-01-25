import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";
import type { Id } from "./_generated/dataModel";

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
    if (!userId) return { profiles: [], events: [] };

    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Filter by type if specified
    const filtered = args.targetType
      ? favorites.filter((f) => f.targetType === args.targetType)
      : favorites;

    // Separate profiles and events
    const profileFavs = filtered.filter((f) => f.targetType === "profile");
    const eventFavs = filtered.filter((f) => f.targetType === "event");

    // Fetch profile data
    const profiles = await Promise.all(
      profileFavs.map(async (fav) => {
        const profileId = fav.targetId as Id<"profiles">;
        const profile = await ctx.db.get(profileId);
        if (!profile) return null;

        let imageUrl = profile.imageUrl || null;
        if (profile.imageStorageId) {
          imageUrl = await ctx.storage.getUrl(profile.imageStorageId);
        }

        // Get wondering if exists
        const wondering = await ctx.db
          .query("wonderings")
          .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
          .first();

        return {
          favoriteId: fav._id,
          favoritedAt: fav.createdAt,
          profile: {
            _id: profile._id,
            name: profile.name,
            imageUrl,
            jobFunctions: profile.jobFunctions,
          },
          wondering: wondering
            ? {
                _id: wondering._id,
                prompt: wondering.prompt,
              }
            : null,
        };
      }),
    );

    // Fetch event data
    const events = await Promise.all(
      eventFavs.map(async (fav) => {
        const eventId = fav.targetId as Id<"events">;
        const event = await ctx.db.get(eventId);
        if (!event) return null;

        return {
          favoriteId: fav._id,
          favoritedAt: fav.createdAt,
          event: {
            _id: event._id,
            title: event.title,
            datetime: event.datetime,
            location: event.location,
            tags: event.tags,
            status: event.status,
          },
        };
      }),
    );

    return {
      profiles: profiles.filter(Boolean),
      events: events.filter(Boolean),
    };
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
