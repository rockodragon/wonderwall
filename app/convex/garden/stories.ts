// Public story pages (W3/W5, spec §1.7) — …/story/{slug}: photo hero,
// updates timeline, backer + sponsor credit lines. getStoryPage is what the
// CF Pages Function (architect §5, ssr:false + ConvexHttpClient) calls
// directly — its return shape stays JSON-plain, no Ids beyond what the page
// needs, so a bare fetch can render it without pulling in Convex client
// machinery.
//
// Pure core (slug generation/dedup + sponsor-line derivation from rows) is
// unit-tested without Convex in stories.test.ts; wrappers below are thin,
// same split as garden/coverage.ts and garden/allocations.ts.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import { shapeCredits } from "./allocations";

// ——————————————————————————————————————————————————————————————
// Pure core: slug generation/dedup
// ——————————————————————————————————————————————————————————————

/**
 * kebab-case a project title for the public story URL. Diacritics are
 * stripped, runs of non-alphanumerics collapse to one hyphen, and leading/
 * trailing hyphens are trimmed. A title that yields nothing usable (e.g.
 * all-emoji, all-punctuation) falls back to "story" rather than an empty
 * slug — every project must get a usable URL.
 */
export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "story";
}

/**
 * Appends -2, -3, … until `slugExists` reports the candidate free. Async
 * (not sync-pure) so the exact same algorithm drives both an in-memory Set
 * in tests and the real by_storySlug index in ensureStorySlug below — the
 * same pure-core/Db-interface split stripeHandlers.ts uses.
 */
export async function resolveAvailableSlug(
  base: string,
  slugExists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let n = 2;
  while (await slugExists(candidate)) {
    candidate = `${base}-${n}`;
    n++;
  }
  return candidate;
}

// ——————————————————————————————————————————————————————————————
// Pure core: sponsor-line derivation
// ——————————————————————————————————————————————————————————————

export interface MembershipForSponsor {
  status: string;
  coveredByCodeId?: unknown;
}

export interface CodeForSponsor {
  hostOrgId: unknown;
}

/**
 * "seat covered by {name}" appears only for a membership that is BOTH
 * covered (coveredByCodeId set) AND currently active — a past_due or
 * canceled covered membership gets no sponsor credit line here. This is a
 * display-only judgment call: entitlements.ts's grace period still protects
 * the creative's actual access during past_due; the credit line is stricter
 * on purpose (a lapsed-looking sponsor credit reads worse than none).
 */
export function deriveSponsorLine(
  memberships: MembershipForSponsor[],
  codeById: Map<string, CodeForSponsor>,
  orgNameById: Map<string, string>,
): string | undefined {
  const covered = memberships.find((m) => m.status === "active" && m.coveredByCodeId);
  if (!covered?.coveredByCodeId) return undefined;
  const code = codeById.get(String(covered.coveredByCodeId));
  if (!code) return undefined;
  const orgName = orgNameById.get(String(code.hostOrgId));
  if (!orgName) return undefined;
  return `seat covered by ${orgName}`;
}

// ——————————————————————————————————————————————————————————————
// Pure core: update body + ownership gate
// ——————————————————————————————————————————————————————————————

export function normalizeUpdateBody(body: string): string {
  return body.trim();
}

/** Project OWNER only. Throws the warm denial; returns void on success. */
export function assertStoryOwner(
  project: { userId: unknown } | null,
  userId: unknown,
): void {
  if (!project) {
    throw new ConvexError({ code: "not_found", reason: "That project doesn't exist." });
  }
  if (String(project.userId) !== String(userId)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "Only the project's owner can post updates here.",
    });
  }
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

/** Internal — called when a project's story page is first needed (e.g. on
 * first publish/update) and storySlug isn't set yet. Idempotent: a project
 * that already has a slug just returns it. */
export const ensureStorySlug = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError({ code: "not_found", reason: "That project doesn't exist." });
    }
    if (project.storySlug) return project.storySlug;

    const base = slugifyTitle(project.title);
    const slug = await resolveAvailableSlug(base, async (candidate) => {
      const hit = await ctx.db
        .query("projects")
        .withIndex("by_storySlug", (q) => q.eq("storySlug", candidate))
        .unique();
      return hit !== null;
    });

    await ctx.db.patch(args.projectId, { storySlug: slug, updatedAt: Date.now() });
    return slug;
  },
});

/** Project OWNER only (userId match) — warm error otherwise. */
export const postStoryUpdate = mutation({
  args: {
    projectId: v.id("projects"),
    body: v.string(),
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const project = await ctx.db.get(args.projectId);
    assertStoryOwner(project, userId);

    const body = normalizeUpdateBody(args.body);
    if (!body) {
      throw new ConvexError({
        code: "empty_body",
        reason: "An update needs a few words — even a line will do.",
      });
    }

    const id = await ctx.db.insert("storyUpdates", {
      projectId: args.projectId,
      authorUserId: userId,
      body,
      mediaUrl: args.mediaUrl,
      createdAt: Date.now(),
    });
    return { storyUpdateId: id };
  },
});

/**
 * Public, unauthenticated — the CF Pages Function's data source (architect
 * §5). Returns null for an unknown slug so the Function can 404 cleanly;
 * returns full, empty-shaped sub-objects (updates: [], credits.allocations:
 * [], sponsorLine: undefined) for a real project with nothing posted yet —
 * same empty-state care as getFundPage.
 */
export const getStoryPage = query({
  args: { storySlug: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_storySlug", (q) => q.eq("storySlug", args.storySlug))
      .unique();
    if (!project) return null;

    const [ownerProfile, updateRows, allocationRows, memberships] = await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", project.userId))
        .unique(),
      ctx.db
        .query("storyUpdates")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect(),
      ctx.db
        .query("allocations")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect(),
      ctx.db
        .query("memberships")
        .withIndex("by_userId", (q) => q.eq("userId", project.userId))
        .collect(),
    ]);

    // Covered+active memberships' coverage codes, to resolve the sponsor line.
    const codeIds = [
      ...new Set(
        memberships
          .filter(
            (m): m is Doc<"memberships"> & { coveredByCodeId: Id<"coverageCodes"> } =>
              m.status === "active" && m.coveredByCodeId !== undefined,
          )
          .map((m) => m.coveredByCodeId),
      ),
    ];
    const codes = await Promise.all(codeIds.map((id) => ctx.db.get(id)));
    const codeById = new Map<string, CodeForSponsor>();
    for (const code of codes) {
      if (code) codeById.set(String(code._id), { hostOrgId: code.hostOrgId });
    }

    // hostOrg names — allocations' funds + any sponsor's org, batched together.
    const orgIds = new Set<Id<"hostOrgs">>(allocationRows.map((a) => a.hostOrgId));
    for (const code of codes) if (code) orgIds.add(code.hostOrgId);
    const hostOrgs = await Promise.all([...orgIds].map((id) => ctx.db.get(id)));
    const orgNameById = new Map<string, string>();
    for (const org of hostOrgs) {
      if (org) orgNameById.set(String(org._id), org.name);
    }

    const sponsorLine = deriveSponsorLine(memberships, codeById, orgNameById);

    return {
      project: {
        title: project.title,
        blurb: project.blurb,
        kind: project.kind,
        goal: project.goal,
        raisedCents: project.raisedCents,
        photoUrl: project.photoUrl,
        byName: ownerProfile?.name ?? "",
      },
      updates: [...updateRows]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((u) => ({ body: u.body, mediaUrl: u.mediaUrl, createdAt: u.createdAt })),
      credits: {
        allocations: shapeCredits(allocationRows, orgNameById),
        sponsorLine,
      },
    };
  },
});
