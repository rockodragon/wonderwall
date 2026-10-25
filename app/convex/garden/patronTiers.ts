import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { currentUserId, requireOwner } from "../helpers";
import { projectVisibleTo } from "./projectVisibility";

export const listTiers = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // The project page is public: a project not shown to this viewer
    // (admin-hidden, or in a hidden community) has no tiers to them.
    const project = await ctx.db.get(args.projectId);
    if (!project || !(await projectVisibleTo(ctx, project, await currentUserId(ctx)))) return [];
    const tiers = await ctx.db
      .query("patronTiers")
      .withIndex("by_projectId_sortOrder", (q) => q.eq("projectId", args.projectId))
      .collect();
    return tiers.filter((t) => t.isActive);
  },
});

export const listAllTiers = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { userId, row: project } = await requireOwner(ctx, "projects", args.projectId);

    return await ctx.db
      .query("patronTiers")
      .withIndex("by_projectId_sortOrder", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const createTier = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    billing: v.optional(v.union(v.literal("one_time"), v.literal("monthly"))),
    benefits: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { userId, row: project } = await requireOwner(ctx, "projects", args.projectId);

    if (args.name.length > 60) {
      throw new ConvexError({ code: "invalid_input", reason: "Name must be 60 characters or fewer." });
    }
    if (args.description && args.description.length > 500) {
      throw new ConvexError({ code: "invalid_input", reason: "Description must be 500 characters or fewer." });
    }
    if (args.priceCents < 500) {
      throw new ConvexError({ code: "invalid_input", reason: "Minimum price is $5 (500 cents)." });
    }
    if (args.benefits) {
      if (args.benefits.length > 8) {
        throw new ConvexError({ code: "invalid_input", reason: "Maximum 8 benefits allowed." });
      }
      for (const b of args.benefits) {
        if (b.length > 200) {
          throw new ConvexError({ code: "invalid_input", reason: "Each benefit must be 200 characters or fewer." });
        }
      }
    }

    const existing = await ctx.db
      .query("patronTiers")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    if (existing.length >= 10) {
      throw new ConvexError({ code: "limit_reached", reason: "Maximum 10 tiers per project." });
    }

    const maxSort = existing.reduce((max, t) => Math.max(max, t.sortOrder), -1);
    const now = Date.now();

    return await ctx.db.insert("patronTiers", {
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      priceCents: args.priceCents,
      billing: args.billing,
      benefits: args.benefits,
      sortOrder: maxSort + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTier = mutation({
  args: {
    tierId: v.id("patronTiers"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    billing: v.optional(v.union(v.literal("one_time"), v.literal("monthly"))),
    benefits: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const tier = await ctx.db.get(args.tierId);
    if (!tier) throw new ConvexError({ code: "not_found" });
    const { userId, row: project } = await requireOwner(ctx, "projects", tier.projectId);

    if (args.name !== undefined && args.name.length > 60) {
      throw new ConvexError({ code: "invalid_input", reason: "Name must be 60 characters or fewer." });
    }
    if (args.description !== undefined && args.description.length > 500) {
      throw new ConvexError({ code: "invalid_input", reason: "Description must be 500 characters or fewer." });
    }
    if (args.priceCents !== undefined && args.priceCents < 500) {
      throw new ConvexError({ code: "invalid_input", reason: "Minimum price is $5 (500 cents)." });
    }
    if (args.benefits !== undefined) {
      if (args.benefits.length > 8) {
        throw new ConvexError({ code: "invalid_input", reason: "Maximum 8 benefits allowed." });
      }
      for (const b of args.benefits) {
        if (b.length > 200) {
          throw new ConvexError({ code: "invalid_input", reason: "Each benefit must be 200 characters or fewer." });
        }
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name;
    if (args.description !== undefined) patch.description = args.description;
    if (args.priceCents !== undefined) patch.priceCents = args.priceCents;
    if (args.billing !== undefined) patch.billing = args.billing;
    if (args.benefits !== undefined) patch.benefits = args.benefits;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.tierId, patch);
  },
});

export const deleteTier = mutation({
  args: { tierId: v.id("patronTiers") },
  handler: async (ctx, args) => {
    const tier = await ctx.db.get(args.tierId);
    if (!tier) throw new ConvexError({ code: "not_found" });
    const { userId, row: project } = await requireOwner(ctx, "projects", tier.projectId);

    const linkedSupport = await ctx.db
      .query("projectSupport")
      .withIndex("by_projectId", (q) => q.eq("projectId", tier.projectId))
      .filter((q) => q.eq(q.field("tierId"), args.tierId))
      .filter((q) => q.eq(q.field("status"), "confirmed"))
      .first();

    if (linkedSupport) {
      throw new ConvexError({ code: "in_use", reason: "Tier has confirmed supporters and cannot be deleted." });
    }

    await ctx.db.delete(args.tierId);
  },
});

export const reorderTiers = mutation({
  args: {
    projectId: v.id("projects"),
    tierIds: v.array(v.id("patronTiers")),
  },
  handler: async (ctx, args) => {
    const { userId, row: project } = await requireOwner(ctx, "projects", args.projectId);

    for (let i = 0; i < args.tierIds.length; i++) {
      const tier = await ctx.db.get(args.tierIds[i]);
      if (!tier || tier.projectId !== args.projectId) {
        throw new ConvexError({ code: "invalid_input", reason: "Tier does not belong to this project." });
      }
      await ctx.db.patch(args.tierIds[i], { sortOrder: i, updatedAt: Date.now() });
    }
  },
});
