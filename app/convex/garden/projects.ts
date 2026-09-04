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
import type { Id } from "../_generated/dataModel";
import { slugifyTitle, resolveAvailableSlug } from "./stories";
import { assertCommunityMember } from "./communities";

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
    // The community this project is posted INTO (optional — content stays
    // owned by the creator, this only tags it; community-groups.md §0).
    // Membership is checked before the tag is ever written.
    hostOrgId: v.optional(v.id("hostOrgs")),
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

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    const now = Date.now();
    const storySlug = await generateStorySlug(ctx, args.title);
    const id = await ctx.db.insert("projects", {
      userId,
      kind: "passion",
      origin: "posted",
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
      hostOrgId: args.hostOrgId,
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
    const projects = allProjects.filter(
      // Portfolio-origin rows (artifacts.create's companion-project side
      // effect — a quick single-artifact share, not a deliberate post) don't
      // belong on the main browse grid; they already have a home at /works.
      // Only an EXPLICIT "portfolio" excludes — a project with no origin at
      // all (predates this field, migration hasn't run) is treated as
      // "posted" so real projects never vanish defensively.
      (p) => VISIBLE_STATUSES.has(p.status) && p.origin !== "portfolio",
    );

    // Batch the hostOrgs lookups: one ctx.db.get per DISTINCT community, not
    // one per project (several posted projects can share a community).
    const hostOrgIds = [...new Set(projects.map((p) => p.hostOrgId).filter((id): id is Id<"hostOrgs"> => !!id))];
    const hostOrgs = await Promise.all(hostOrgIds.map((id) => ctx.db.get(id)));
    const communityById = new Map<string, { name: string; slug: string }>();
    hostOrgIds.forEach((id, i) => {
      const org = hostOrgs[i];
      if (org) communityById.set(String(id), { name: org.name, slug: org.slug });
    });

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
          community: project.hostOrgId ? (communityById.get(String(project.hostOrgId)) ?? null) : null,
        };
      }),
    );

    return withDetails.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Single-project fetch for the detail page (routes/projects.$id.tsx). Same
// per-row shape as listProjects above (resolved media, creator, supportCount,
// community) — deliberately the ONE source of truth for that shape, rather
// than the older garden/projectsPublic.ts:getProject, which predates
// communities/media-array/support and was only ever called by the retired
// projects.$id.tsx GardenPage shell (grepped — no other caller). This is the
// current module (create/update/list all live here), so the single-item
// getter belongs beside them, not in a separate legacy file.
// `projectId` is v.string() rather than v.id("projects") so a malformed or
// foreign id normalizes to null instead of throwing — a plain 404 for a bad
// URL, same convention as garden/offerings.ts's getOffering.
export const getProject = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("projects", args.projectId);
    if (!id) return null;
    const project = await ctx.db.get(id);
    if (!project) return null;

    const [user, media, support, communityOrg] = await Promise.all([
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
      project.hostOrgId ? ctx.db.get(project.hostOrgId) : Promise.resolve(null),
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
        ? { _id: user._id, name: user.name, imageUrl: user.imageUrl, interests: user.interests, location: user.location }
        : null,
      media: resolvedMedia,
      supportCount: support.length,
      community: communityOrg ? { name: communityOrg.name, slug: communityOrg.slug } : null,
    };
  },
});

// The guardrail on paid projects (plan §2.3) is that a creative always knows
// what they're walking into. This used to be enforced as a required number:
// `budget: v.number()`, anything else rejected with "Paid projects need a
// declared budget — a number, not a range." That kept unfunded "exposure"
// gigs off the board, but it also blocked honest postings — a church with a
// small budget, a poster who genuinely doesn't know the number yet, a real
// volunteer ask.
//
// So what's required is CLARITY, not a number. Every paid posting declares
// one of four money states, and a required state carries the original intent
// better than the required number did: an unpaid ask can no longer masquerade
// as paid work, because it has to label itself "volunteer", and a poster with
// a small or unknown budget is no longer blocked from posting at all.
//
//   "amount"    — a set number, e.g. $400 (the encouraged default)
//   "range"     — a low and a high number, e.g. $300–600
//   "proposals" — open to proposals: the poster wants to hear what it costs
//   "volunteer" — explicitly unpaid, said plainly
//
// Display side: app/app/lib/budgetLabel.ts (badge) and
// convex/garden/projectsPublic.ts's resolveMoneyLine (money line).
const BUDGET_TYPES = new Set(["amount", "range", "proposals", "volunteer"]);

function isRealAmount(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Validates a paid posting's declared money state. Returns the ConvexError
 * payload to throw, or null when the declaration is coherent. Pure, so it's
 * unit-tested without Convex (projects.test.ts) — same pure-core split as
 * projectsPublic.ts and stories.ts.
 *
 * The states that take no numbers REJECT stray ones rather than dropping them
 * silently: someone who typed an amount and then picked "open to proposals"
 * meant one of the two, and quietly discarding their number is how a posting
 * ends up saying something its poster didn't.
 */
export function validateBudgetDeclaration(args: {
  budgetType: string;
  budget?: number;
  budgetMax?: number;
}): { code: string; reason: string } | null {
  const { budgetType, budget, budgetMax } = args;

  if (!BUDGET_TYPES.has(budgetType)) {
    return {
      code: "invalid_budget_type",
      reason:
        "Say how this one pays: a set amount, a range, open to proposals, or volunteer.",
    };
  }

  if (budgetType === "amount") {
    if (!isRealAmount(budget)) {
      return {
        code: "invalid_budget",
        reason: "A set amount needs a real number bigger than zero.",
      };
    }
    if (budgetMax !== undefined) {
      return {
        code: "invalid_budget",
        reason: "A set amount is one number. Pick a range if you want a low and a high.",
      };
    }
    return null;
  }

  if (budgetType === "range") {
    if (budget === undefined || budgetMax === undefined) {
      return {
        code: "invalid_budget",
        reason: "A range needs both a low and a high number.",
      };
    }
    if (!isRealAmount(budget) || !isRealAmount(budgetMax)) {
      return {
        code: "invalid_budget",
        reason: "A range needs real numbers bigger than zero.",
      };
    }
    if (budgetMax <= budget) {
      return {
        code: "invalid_budget",
        reason: "A range needs a high number bigger than the low one.",
      };
    }
    return null;
  }

  // "proposals" and "volunteer" — no numbers attached, by definition.
  if (budget !== undefined || budgetMax !== undefined) {
    return {
      code: "invalid_budget",
      reason:
        budgetType === "volunteer"
          ? "Volunteer work has no budget attached. Clear the number, or say what it pays."
          : "Open to proposals means no number attached. Clear it, or post the amount instead.",
    };
  }
  return null;
}

export const createPaidProject = mutation({
  args: {
    title: v.string(),
    blurb: v.optional(v.string()),
    // What's required is the declared money state, not a number — see
    // validateBudgetDeclaration above. `budget` is the amount for "amount"
    // and the low end for "range"; `budgetMax` is a range's high end.
    budgetType: v.string(),
    budget: v.optional(v.number()),
    budgetMax: v.optional(v.number()),
    photoUrl: v.optional(v.string()),
    // The project's own declared topics (canonical INTERESTS list) —
    // independent of the creator's profile interests. See the schema
    // comment on `projects.interests`.
    interests: v.optional(v.array(v.string())),
    // See createPassionProject's hostOrgId comment.
    hostOrgId: v.optional(v.id("hostOrgs")),
    ...locationArgs,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const budgetError = validateBudgetDeclaration(args);
    if (budgetError) throw new ConvexError(budgetError);

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    const now = Date.now();
    const storySlug = await generateStorySlug(ctx, args.title);
    const id = await ctx.db.insert("projects", {
      userId,
      kind: "paid",
      origin: "posted",
      title: args.title,
      blurb: args.blurb,
      budgetType: args.budgetType,
      budget: args.budget,
      budgetMax: args.budgetMax,
      status: "active",
      photoUrl: args.photoUrl,
      storySlug,
      interests: args.interests,
      hostOrgId: args.hostOrgId,
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
