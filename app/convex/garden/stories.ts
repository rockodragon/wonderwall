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
import { notifyFollowers } from "../follows";
import {
  normalizeRichDoc,
  orphanedStorageIds,
  resolveRichDocMedia,
  richDocExcerpt,
  richDocPlainText,
  richDocValidator,
  type RichDoc,
} from "./richText";

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

/**
 * Derives the two things every update row stores from what the composer
 * sent. `bodyDoc` is the rich version; `body` is its plain-text rendering,
 * which stays a real column because notifications, excerpts and every row
 * written before bodyDoc existed read it directly.
 *
 * An update with only a photo in it is valid and its plain text is legitimately
 * empty — that is a post, not a mistake — so "is this empty?" asks the
 * document, not the string. The plain-text-only path (`body` with no
 * `bodyDoc`) is what the seeds and any older caller still use.
 */
export function shapeUpdateContent(args: {
  body?: string;
  bodyDoc?: RichDoc;
}): { body: string; bodyDoc: RichDoc | undefined } {
  const bodyDoc = normalizeRichDoc(args.bodyDoc);
  if (bodyDoc) return { body: richDocPlainText(bodyDoc), bodyDoc };

  const body = normalizeUpdateBody(args.body ?? "");
  if (!body) {
    throw new ConvexError({
      code: "empty_body",
      reason: "An update needs a few words or a photo — either one will do.",
    });
  }
  return { body, bodyDoc: undefined };
}

/** Project OWNER only (userId match) — warm error otherwise. */
export const postStoryUpdate = mutation({
  args: {
    projectId: v.id("projects"),
    // Optional since the rich composer sends `bodyDoc` instead. Exactly one
    // of the two has to carry something; shapeUpdateContent enforces it.
    body: v.optional(v.string()),
    bodyDoc: v.optional(richDocValidator),
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const project = await ctx.db.get(args.projectId);
    assertStoryOwner(project, userId);

    const { body, bodyDoc } = shapeUpdateContent(args);

    const id = await ctx.db.insert("storyUpdates", {
      projectId: args.projectId,
      authorUserId: userId,
      body,
      bodyDoc,
      mediaUrl: args.mediaUrl,
      createdAt: Date.now(),
    });

    // Same fan-out a new project gets (docs/features/following.md §1 #5):
    // an update nobody hears about is a diary entry. Fire-and-forget — a
    // notification failure must never roll back the post itself.
    try {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      const name = profile?.name || "Someone";
      const excerpt = richDocExcerpt(bodyDoc, 140) || body.slice(0, 140);
      await notifyFollowers(ctx, userId, {
        type: "project_update",
        title: `${name} posted an update on ${project!.title}`,
        message: excerpt,
        linkUrl: `/projects/${args.projectId}`,
      });
    } catch {
      // notifying is a nicety; posting is the job
    }

    return { storyUpdateId: id };
  },
});

/** The update's AUTHOR only. Rewrites content in place and stamps editedAt,
    so the timeline can say "edited" rather than changing silently under
    people who already read it. */
export const editStoryUpdate = mutation({
  args: {
    storyUpdateId: v.id("storyUpdates"),
    body: v.optional(v.string()),
    bodyDoc: v.optional(richDocValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const update = await ctx.db.get(args.storyUpdateId);
    if (!update) {
      throw new ConvexError({ code: "not_found", reason: "That update isn't here anymore." });
    }
    if (String(update.authorUserId) !== String(userId)) {
      throw new ConvexError({
        code: "forbidden",
        reason: "Only the person who posted an update can edit it.",
      });
    }

    const { body, bodyDoc } = shapeUpdateContent(args);

    // Same orphan sweep updateProject does — an edit that removes a photo
    // should not leave the file behind.
    for (const storageId of orphanedStorageIds(update.bodyDoc, bodyDoc)) {
      try {
        await ctx.storage.delete(storageId as Id<"_storage">);
      } catch {
        // already gone
      }
    }

    await ctx.db.patch(args.storyUpdateId, { body, bodyDoc, editedAt: Date.now() });
    return { ok: true };
  },
});

/** The update's AUTHOR only. Takes its uploaded media with it. */
export const deleteStoryUpdate = mutation({
  args: { storyUpdateId: v.id("storyUpdates") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const update = await ctx.db.get(args.storyUpdateId);
    if (!update) return { ok: true }; // already gone — deleting twice is fine
    if (String(update.authorUserId) !== String(userId)) {
      throw new ConvexError({
        code: "forbidden",
        reason: "Only the person who posted an update can delete it.",
      });
    }

    for (const storageId of orphanedStorageIds(update.bodyDoc, undefined)) {
      try {
        await ctx.storage.delete(storageId as Id<"_storage">);
      } catch {
        // already gone
      }
    }

    await ctx.db.delete(args.storyUpdateId);
    return { ok: true };
  },
});

/**
 * The in-app timeline on /projects/:id. Separate from getStoryPage (which
 * serves the public /story/:slug page and returns a deliberately flattened,
 * Id-free shape for the Pages Function): this one carries row ids, because
 * the author needs to edit and delete from here, and author identity,
 * because the in-app page shows who posted.
 */
export const listProjectUpdates = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const projectId = ctx.db.normalizeId("projects", args.projectId);
    if (!projectId) return [];

    const rows = await ctx.db
      .query("storyUpdates")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect();

    const authorIds = [...new Set(rows.map((r) => String(r.authorUserId)))];
    const authorProfiles = await Promise.all(
      authorIds.map((id) =>
        ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", id as Id<"users">))
          .unique(),
      ),
    );
    const authorById = new Map<string, { name: string; imageUrl?: string; profileId: string }>();
    for (const profile of authorProfiles) {
      if (profile) {
        authorById.set(String(profile.userId), {
          name: profile.name,
          imageUrl: profile.imageUrl,
          profileId: String(profile._id),
        });
      }
    }

    return await Promise.all(
      [...rows]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (row) => ({
          _id: row._id,
          body: row.body,
          bodyDoc: await resolveRichDocMedia(ctx.storage, row.bodyDoc),
          mediaUrl: row.mediaUrl,
          createdAt: row.createdAt,
          editedAt: row.editedAt,
          authorUserId: row.authorUserId,
          author: authorById.get(String(row.authorUserId)) ?? null,
        })),
    );
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
        body: await resolveRichDocMedia(ctx.storage, project.body),
        kind: project.kind,
        goal: project.goal,
        raisedCents: project.raisedCents,
        photoUrl: project.photoUrl,
        byName: ownerProfile?.name ?? "",
      },
      updates: await Promise.all(
        [...updateRows]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(async (u) => ({
            body: u.body,
            bodyDoc: await resolveRichDocMedia(ctx.storage, u.bodyDoc),
            mediaUrl: u.mediaUrl,
            createdAt: u.createdAt,
            editedAt: u.editedAt,
          })),
      ),
      credits: {
        allocations: shapeCredits(allocationRows, orgNameById),
        sponsorLine,
      },
    };
  },
});
