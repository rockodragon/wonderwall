// Garden projects — W1 ships the minimal gated create (the W1 exit criterion:
// pay $10 in test mode → membership active → THIS mutation allows). Full
// CRUD + jobs migration land in W2 (spec §5).
//
// ctx typed loosely until first `npx convex dev` codegen — see entitlements.ts.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

// V1 (docs/the-exchange-v1-prd.md §6, §15): posting is free and voluntary,
// never gated behind paid membership — "money is never the only door" is a
// stated V1 principle, not just old Garden-era decoration. The capability
// matrix these used to call through (assertCanPure/getGardenUser, still in
// entitlements.ts + capabilities.ts) is real, tested infrastructure for the
// deferred Host/Table tier system (PRD §16) — intentionally not deleted,
// just not enforced at these two call sites until that system is back.

export const createPassionProject = mutation({
  args: {
    title: v.string(),
    blurb: v.optional(v.string()),
    goal: v.optional(v.number()),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const now = Date.now();
    const id = await ctx.db.insert("projects", {
      userId,
      kind: "passion",
      title: args.title,
      blurb: args.blurb,
      goal: args.goal,
      raisedCents: 0,
      status: "active",
      photoUrl: args.photoUrl,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: id };
  },
});

// V1 (docs/the-exchange-v1-prd.md §7): the public Projects browse surface.
// Joins each project to its creator profile and, if it was created through
// the artifacts.create path, its attached media — passion and paid projects
// mixed together, newest first. Small-scale by design (a handful of V1
// users): a full table scan is simpler and fast enough, no index tuning yet.
export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const withDetails = await Promise.all(
      projects.map(async (project) => {
        const [user, media, support] = await Promise.all([
          ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", project.userId))
            .unique(),
          ctx.db
            .query("artifacts")
            .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
            .collect(),
          ctx.db
            .query("projectSupport")
            .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
            .filter((q) => q.eq(q.field("status"), "confirmed"))
            .collect(),
        ]);

        const resolvedMedia = await Promise.all(
          media.map(async (artifact) => ({
            ...artifact,
            resolvedMediaUrl: artifact.mediaStorageId
              ? await ctx.storage.getUrl(artifact.mediaStorageId)
              : artifact.mediaUrl || null,
          })),
        );

        return {
          ...project,
          creator: user
            ? { _id: user._id, name: user.name, imageUrl: user.imageUrl }
            : null,
          media: resolvedMedia,
          supportCount: support.length,
        };
      }),
    );

    return withDetails.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createPaidProject = mutation({
  args: {
    title: v.string(),
    blurb: v.optional(v.string()),
    // The guardrail on paid projects is a REAL declared budget (plan §2.3) —
    // required here, not optional.
    budget: v.number(),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    if (!Number.isFinite(args.budget) || args.budget <= 0) {
      throw new ConvexError({
        code: "invalid_budget",
        reason: "Paid projects need a declared budget — a number, not a range.",
      });
    }

    const now = Date.now();
    const id = await ctx.db.insert("projects", {
      userId,
      kind: "paid",
      title: args.title,
      blurb: args.blurb,
      budget: args.budget,
      status: "active",
      photoUrl: args.photoUrl,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: id };
  },
});
