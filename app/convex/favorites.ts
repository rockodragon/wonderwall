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

        // Get active wondering if exists
        const wondering = await ctx.db
          .query("wonderings")
          .withIndex("by_profileId_active", (q) =>
            q.eq("profileId", profileId).eq("isActive", true),
          )
          .first();

        let wonderingImageUrl: string | null = null;
        if (wondering?.imageStorageId) {
          wonderingImageUrl = await ctx.storage.getUrl(
            wondering.imageStorageId,
          );
        }

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
                imageUrl: wonderingImageUrl,
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

        // Resolve cover image URL (cover or first gallery image)
        let coverImageUrl: string | null = null;
        if (event.coverImageStorageId) {
          coverImageUrl = await ctx.storage.getUrl(event.coverImageStorageId);
        } else if (event.imageStorageIds && event.imageStorageIds.length > 0) {
          coverImageUrl = await ctx.storage.getUrl(event.imageStorageIds[0]);
        }

        // Get attendee count
        const applications = await ctx.db
          .query("eventApplications")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .filter((q) => q.eq(q.field("status"), "accepted"))
          .collect();

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
            requiresApproval: event.requiresApproval,
            coverImageUrl,
            attendeeCount: applications.length,
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
