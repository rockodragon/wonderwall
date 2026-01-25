import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export const getMyWondering = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return null;

    const wondering = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId_active", (q) =>
        q.eq("profileId", profile._id).eq("isActive", true),
      )
      .first();

    if (!wondering) return null;

    // Resolve image URL from storage
    const imageUrl = wondering.imageStorageId
      ? await ctx.storage.getUrl(wondering.imageStorageId)
      : null;

    return {
      ...wondering,
      imageUrl,
    };
  },
});

export const create = mutation({
  args: {
    prompt: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Check for existing active wondering (free plan limit)
    const existing = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId_active", (q) =>
        q.eq("profileId", profile._id).eq("isActive", true),
      )
      .first();

    // Check plan from profile (defaults to free)
    const isPaidPlan = profile.plan === "paid";

    if (existing && !isPaidPlan) {
      throw new Error(
        "Free plan allows only one active wondering. Archive current one first.",
      );
    }

    const now = Date.now();

    return await ctx.db.insert("wonderings", {
      profileId: profile._id,
      prompt: args.prompt.trim(),
      imageStorageId: args.imageStorageId,
      expiresAt: isPaidPlan ? undefined : now + TWO_WEEKS_MS,
      isPermanent: isPaidPlan,
      isActive: true,
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    wonderingId: v.id("wonderings"),
    prompt: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const wondering = await ctx.db.get(args.wonderingId);
    if (!wondering) throw new Error("Wondering not found");

    // Verify ownership
    const profile = await ctx.db.get(wondering.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.wonderingId, {
      prompt: args.prompt.trim(),
      imageStorageId: args.imageStorageId,
    });
  },
});

export const archive = mutation({
  args: {
    wonderingId: v.id("wonderings"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const wondering = await ctx.db.get(args.wonderingId);
    if (!wondering) throw new Error("Wondering not found");

    // Verify ownership
    const profile = await ctx.db.get(wondering.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.wonderingId, {
      isActive: false,
    });
  },
});

// For wondering owner - get all responses
export const getResponses = query({
  args: { wonderingId: v.id("wonderings") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const wondering = await ctx.db.get(args.wonderingId);
    if (!wondering) return [];

    // Verify ownership
    const profile = await ctx.db.get(wondering.profileId);
    if (!profile || profile.userId !== userId) {
      return [];
    }

    return await ctx.db
      .query("wonderingResponses")
      .withIndex("by_wonderingId", (q) => q.eq("wonderingId", args.wonderingId))
      .collect();
  },
});

// For profile page - get public responses + user's own pending response
export const getPublicResponses = query({
  args: { wonderingId: v.id("wonderings") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);

    const allResponses = await ctx.db
      .query("wonderingResponses")
      .withIndex("by_wonderingId", (q) => q.eq("wonderingId", args.wonderingId))
      .collect();

    // Filter to public responses + current user's own response
    const visibleResponses = allResponses.filter(
      (r) => r.isPublic || (userId && r.responderId === userId),
    );

    // Get responder profiles for display
    const responsesWithProfiles = await Promise.all(
      visibleResponses.map(async (response) => {
        const responderProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", response.responderId))
          .first();

        return {
          ...response,
          responderName: responderProfile?.name || "Anonymous",
          responderImageUrl: responderProfile?.imageStorageId
            ? await ctx.storage.getUrl(responderProfile.imageStorageId)
            : responderProfile?.imageUrl || null,
          isOwnResponse: userId === response.responderId,
        };
      }),
    );

    return responsesWithProfiles.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const submitResponse = mutation({
  args: {
    wonderingId: v.id("wonderings"),
    mediaType: v.string(),
    content: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const wondering = await ctx.db.get(args.wonderingId);
    if (!wondering) throw new Error("Wondering not found");

    // Check if wondering is still accepting responses
    if (!wondering.isActive) {
      throw new Error("This wondering is no longer accepting responses");
    }

    if (wondering.expiresAt && Date.now() > wondering.expiresAt) {
      throw new Error("This wondering has expired");
    }

    return await ctx.db.insert("wonderingResponses", {
      wonderingId: args.wonderingId,
      responderId: userId,
      mediaType: args.mediaType,
      content: args.content,
      mediaUrl: args.mediaUrl,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});

export const toggleResponsePublic = mutation({
  args: {
    responseId: v.id("wonderingResponses"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const response = await ctx.db.get(args.responseId);
    if (!response) throw new Error("Response not found");

    const wondering = await ctx.db.get(response.wonderingId);
    if (!wondering) throw new Error("Wondering not found");

    // Verify ownership of wondering
    const profile = await ctx.db.get(wondering.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.responseId, {
      isPublic: !response.isPublic,
    });
  },
});
