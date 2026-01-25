import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

export const getMyLinks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return [];

    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    return links.sort((a, b) => a.order - b.order);
  },
});

export const add = mutation({
  args: {
    label: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Get current max order
    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    const maxOrder =
      links.length > 0 ? Math.max(...links.map((l) => l.order)) : -1;

    return await ctx.db.insert("links", {
      profileId: profile._id,
      label: args.label,
      url: args.url,
      order: maxOrder + 1,
    });
  },
});

export const update = mutation({
  args: {
    linkId: v.id("links"),
    label: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");

    // Verify ownership
    const profile = await ctx.db.get(link.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.linkId, {
      label: args.label,
      url: args.url,
    });
  },
});

export const remove = mutation({
  args: { linkId: v.id("links") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Link not found");

    // Verify ownership
    const profile = await ctx.db.get(link.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.linkId);
  },
});

export const reorder = mutation({
  args: {
    linkIds: v.array(v.id("links")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    for (let i = 0; i < args.linkIds.length; i++) {
      const link = await ctx.db.get(args.linkIds[i]);
      if (link) {
        await ctx.db.patch(args.linkIds[i], { order: i });
      }
    }
  },
});
