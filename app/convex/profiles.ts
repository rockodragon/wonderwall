import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return null;

    // Get attributes
    const attributes = await ctx.db
      .query("attributes")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get links
    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    return {
      ...profile,
      attributes: Object.fromEntries(attributes.map((a) => [a.key, a.value])),
      links: links.sort((a, b) => a.order - b.order),
    };
  },
});

export const getProfile = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;

    // Get attributes
    const attributes = await ctx.db
      .query("attributes")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get links
    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get artifacts
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get active wondering
    const wondering = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId_active", (q) =>
        q.eq("profileId", profile._id).eq("isActive", true),
      )
      .first();

    return {
      ...profile,
      attributes: Object.fromEntries(attributes.map((a) => [a.key, a.value])),
      links: links.sort((a, b) => a.order - b.order),
      artifacts: artifacts.sort((a, b) => a.order - b.order),
      wondering,
    };
  },
});

export const upsertProfile = mutation({
  args: {
    name: v.string(),
    bio: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    jobFunctions: v.array(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        bio: args.bio,
        imageUrl: args.imageUrl,
        jobFunctions: args.jobFunctions,
        location: args.location,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("profiles", {
        userId,
        name: args.name,
        bio: args.bio,
        imageUrl: args.imageUrl,
        jobFunctions: args.jobFunctions,
        location: args.location,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const updateAttribute = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    const existing = await ctx.db
      .query("attributes")
      .withIndex("by_profileId_key", (q) =>
        q.eq("profileId", profile._id).eq("key", args.key),
      )
      .first();

    if (existing) {
      if (args.value) {
        await ctx.db.patch(existing._id, { value: args.value });
      } else {
        await ctx.db.delete(existing._id);
      }
    } else if (args.value) {
      await ctx.db.insert("attributes", {
        profileId: profile._id,
        key: args.key,
        value: args.value,
      });
    }
  },
});

export const search = query({
  args: {
    query: v.optional(v.string()),
    jobFunction: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // For now, simple text search - will be replaced with vector search
    let profiles = await ctx.db.query("profiles").collect();

    if (args.jobFunction) {
      profiles = profiles.filter((p) =>
        p.jobFunctions.includes(args.jobFunction!),
      );
    }

    if (args.location) {
      profiles = profiles.filter((p) =>
        p.location?.toLowerCase().includes(args.location!.toLowerCase()),
      );
    }

    if (args.query) {
      const q = args.query.toLowerCase();
      profiles = profiles.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.bio?.toLowerCase().includes(q) ||
          p.jobFunctions.some((jf) => jf.toLowerCase().includes(q)),
      );
    }

    return profiles.slice(0, 20);
  },
});
