// Garden projects — W1 ships the minimal gated create (the W1 exit criterion:
// pay $10 in test mode → membership active → THIS mutation allows). Full
// CRUD + jobs migration land in W2 (spec §5).
//
// ctx typed loosely until first `npx convex dev` codegen — see entitlements.ts.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { slugifyTitle, resolveAvailableSlug } from "./stories";

// Slug generation, wired at creation time (review follow-up — stories.ts's
// ensureStorySlug internalMutation existed but nothing called it). It can't
// be reused directly here: Convex's MutationCtx has no runMutation — that's
// action-only — so a mutation can't invoke another mutation mid-transaction.
// This inlines the exact same pure logic (slugifyTitle + resolveAvailableSlug,
// both already unit-tested in stories.test.ts) against this transaction's
// ctx.db instead, computed before insert so the row is created with its slug
// already set — no follow-up patch, no window where a project has none.
async function generateStorySlug(ctx: MutationCtx, title: string): Promise<string> {
  return resolveAvailableSlug(slugifyTitle(title), async (candidate) => {
    const hit = await ctx.db
      .query("projects")
      .withIndex("by_storySlug", (q) => q.eq("storySlug", candidate))
      .unique();
    return hit !== null;
  });
}

// V1 (docs/the-exchange-v1-prd.md §6, §15): posting is free and voluntary,
// never gated behind paid membership — "money is never the only door" is a
// stated V1 principle, not just old Garden-era decoration. The capability
// matrix these used to call through (assertCanPure/getGardenUser, still in
// entitlements.ts + capabilities.ts) is real, tested infrastructure for the
// deferred Host/Table tier system (PRD §16) — intentionally not deleted,
// just not enforced at these two call sites until that system is back.

// Location args block — mirrors the shape already used by profiles.ts's
// upsertProfile and events.ts's create (convex/schema.ts `events`/
// `profiles` tables): `location` is the plain display string everything
// reads/matches on, the rest is structured data from the same Google
// Places pipeline (convex/location.ts + LocationAutocomplete).
const locationArgs = {
  location: v.optional(v.string()),
  locationType: v.optional(v.string()), // "venue" | "city" | "zip" | "address" | "online" | "tbd"
  address: v.optional(
    v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    }),
  ),
  coordinates: v.optional(v.object({ lat: v.number(), lng: v.number() })),
  placeId: v.optional(v.string()),
  remote: v.optional(v.boolean()), // true (default when unset) = anywhere/remote-friendly; false = must be local to `location`
};

export const createPassionProject = mutation({
  args: {
    title: v.string(),
    blurb: v.optional(v.string()),
    goal: v.optional(v.number()),
    photoUrl: v.optional(v.string()),
    // Passion-only campaign fields (review follow-up) — deliberately not on
    // createPaidProject, see the schema comment on `projects.raiseByDate`.
    raiseByDate: v.optional(v.number()),
    benefitsNonprofit: v.optional(v.boolean()),
    nonprofitName: v.optional(v.string()),
    // The project's own declared topics (canonical INTERESTS list) —
    // independent of the creator's profile interests. See the schema
    // comment on `projects.interests`.
    interests: v.optional(v.array(v.string())),
    ...locationArgs,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    if (args.goal !== undefined && (!Number.isFinite(args.goal) || args.goal <= 0)) {
      throw new ConvexError({
        code: "invalid_goal",
        reason: "If you set a support goal, it needs to be a real positive amount.",
      });
    }

    const now = Date.now();
    const storySlug = await generateStorySlug(ctx, args.title);
    const id = await ctx.db.insert("projects", {
      userId,
      kind: "passion",
      title: args.title,
      blurb: args.blurb,
      goal: args.goal,
      raisedCents: 0,
      status: "active",
      photoUrl: args.photoUrl,
      storySlug,
      raiseByDate: args.raiseByDate,
      benefitsNonprofit: args.benefitsNonprofit,
      nonprofitName: args.benefitsNonprofit ? args.nonprofitName : undefined,
      interests: args.interests,
      location: args.location,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      remote: args.remote ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: id, storySlug };
  },
});

// Status transitions allowed per project kind (docs/the-exchange-v1-prd.md
// §7): passion projects have no budget-completion moment in the same sense
// paid work does, so "in_progress" doesn't apply to them.
const ALLOWED_STATUSES: Record<string, Set<string>> = {
  passion: new Set(["active", "completed", "archived"]),
  paid: new Set(["active", "in_progress", "completed", "archived"]),
};

export const updateProjectStatus = mutation({
  args: { projectId: v.id("projects"), status: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError({ code: "not_found" });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (project.userId !== userId && !profile?.isAdmin) {
      throw new ConvexError({
        code: "forbidden",
        reason: "Only the creator or an operator can change this.",
      });
    }

    if (!ALLOWED_STATUSES[project.kind]?.has(args.status)) {
      throw new ConvexError({
        code: "invalid_status",
        reason: `Not a valid status for a ${project.kind} project.`,
      });
    }

    await ctx.db.patch(args.projectId, { status: args.status, updatedAt: Date.now() });
    return { ok: true };
  },
});

// V1 (docs/the-exchange-v1-prd.md §7): the public Projects browse surface.
// Joins each project to its creator profile and, if it was created through
// the artifacts.create path, its attached media — passion and paid projects
// mixed together, newest first. Small-scale by design (a handful of V1
// users): a full table scan is simpler and fast enough, no index tuning yet.
// Statuses a browsing user should ever see. "pending" isn't used yet;
// "archived" is a deliberate hide — a creator/operator took it out of the
// default browse view on purpose.
const VISIBLE_STATUSES = new Set(["active", "in_progress", "completed"]);

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const allProjects = await ctx.db.query("projects").collect();
    const projects = allProjects.filter((p) => VISIBLE_STATUSES.has(p.status));

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
            ? {
                _id: user._id,
                name: user.name,
                imageUrl: user.imageUrl,
                interests: user.interests,
                location: user.location,
              }
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
    // The project's own declared topics (canonical INTERESTS list) —
    // independent of the creator's profile interests. See the schema
    // comment on `projects.interests`.
    interests: v.optional(v.array(v.string())),
    ...locationArgs,
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
    const storySlug = await generateStorySlug(ctx, args.title);
    const id = await ctx.db.insert("projects", {
      userId,
      kind: "paid",
      title: args.title,
      blurb: args.blurb,
      budget: args.budget,
      status: "active",
      photoUrl: args.photoUrl,
      storySlug,
      interests: args.interests,
      location: args.location,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      remote: args.remote ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId: id, storySlug };
  },
});
