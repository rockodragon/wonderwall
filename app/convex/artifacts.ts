import { v } from "convex/values";
import { action, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { canonicalMediaUrl, schedulePreviewFetch, wantsPreviewFetch } from "./linkPreview";
import { toEmbedUrl } from "./videoEmbed";
import { deriveProjectTitle } from "./garden/artifactsMigration";
import { slugifyTitle, resolveAvailableSlug } from "./garden/stories";
import { normalizeUrl, isSafeHttpUrl } from "./garden/richText";
import { parseOgMeta } from "./ogParse";

export const getMyArtifacts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return [];

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Resolve storage URLs
    const withUrls = await Promise.all(
      artifacts.map(async (artifact) => {
        let resolvedMediaUrl = artifact.mediaUrl || null;
        if (artifact.mediaStorageId) {
          resolvedMediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
        }
        return { ...artifact, resolvedMediaUrl };
      }),
    );

    return withUrls.sort((a, b) => a.order - b.order);
  },
});

// Get single artifact with full details
export const get = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return null;

    // Resolve media URL
    let resolvedMediaUrl = artifact.mediaUrl || null;
    if (artifact.mediaStorageId) {
      resolvedMediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
    }

    // Get profile info
    const profile = await ctx.db.get(artifact.profileId);
    let profileImageUrl = profile?.imageUrl || null;
    if (profile?.imageStorageId) {
      profileImageUrl = await ctx.storage.getUrl(profile.imageStorageId);
    }

    // Get like count
    const likes = await ctx.db
      .query("artifactLikes")
      .withIndex("by_artifactId", (q) => q.eq("artifactId", args.artifactId))
      .collect();

    // Check if current user liked and if they own this artifact
    const userId = await auth.getUserId(ctx);
    const userLiked = userId ? likes.some((l) => l.userId === userId) : false;
    const isOwner = userId && profile ? profile.userId === userId : false;

    return {
      ...artifact,
      resolvedMediaUrl,
      profile: profile
        ? {
            _id: profile._id,
            name: profile.name,
            imageUrl: profileImageUrl,
            interests: profile.interests,
          }
        : null,
      likeCount: likes.length,
      userLiked,
      isOwner,
    };
  },
});

// Toggle like on artifact
export const toggleLike = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("artifactLikes")
      .withIndex("by_artifactId_userId", (q) =>
        q.eq("artifactId", args.artifactId).eq("userId", userId),
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { liked: false };
    } else {
      await ctx.db.insert("artifactLikes", {
        artifactId: args.artifactId,
        userId,
        createdAt: Date.now(),
      });
      return { liked: true };
    }
  },
});

// What a link needs fetched so its card has a still (docs/features/
// creator-media-cross-post.md). One place for the rule, called by create and
// by refetchOgImage. Scheduled, never awaited: the post lands first.
async function schedulePreview(
  ctx: MutationCtx,
  artifactId: Id<"artifacts">,
  url: string | undefined,
  type: string,
) {
  if (!url || (type !== "link" && type !== "video")) return;
  // Instagram and TikTok stills come through convex/linkPreview.ts (which
  // knows how to ask each provider); YouTube's comes from the resolver
  // (img.youtube.com); Vimeo has none we can reach without a key and embeds
  // fine without one. Anything else gets the plain og:image scrape below.
  if (wantsPreviewFetch(url)) {
    await schedulePreviewFetch(ctx, "artifact", artifactId, url);
    return;
  }
  const embed = toEmbedUrl(url);
  if (embed) return;
  await ctx.scheduler.runAfter(0, api.artifacts.fetchOgImage, { artifactId, url });
}

export const create = mutation({
  args: {
    type: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
    // An image the creative uploaded beside a pasted reel or video link — its
    // cover, not the work (docs/features/creator-media-cross-post.md). Stored
    // as `ogImageUrl` so every card reads it like any other preview.
    coverStorageId: v.optional(v.id("_storage")),
    // "Still working on it" in the composer. A shared piece is finished
    // work by default, so its project lands in the profile's Portfolio
    // (docs/features/project-ia.md); true leaves the project in progress.
    inProgress: v.optional(v.boolean()),
    // Location for the companion passion project this mutation creates as a
    // side effect (docs/the-exchange-v1-prd.md §7). Optional and unused by
    // CreateWorkComposer.tsx / onboarding.tsx today — those composers stay
    // low-friction; a location picker there is a follow-on UI decision, not
    // this one. Same shape as convex/schema.ts's `events`/`profiles` tables.
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
    // Interests for the companion passion project this mutation creates as a
    // side effect (docs/the-exchange-v1-prd.md §7) — same precedent as the
    // location args above: optional and unused by CreateWorkComposer.tsx /
    // onboarding.tsx today, an interests picker there is a follow-on UI
    // decision, not this one. See the schema comment on `projects.interests`.
    interests: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Validate type
    const validTypes = ["text", "image", "video", "audio", "link"];
    if (!validTypes.includes(args.type)) {
      throw new Error("Invalid artifact type");
    }

    // Get current max order
    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    const maxOrder =
      existing.length > 0 ? Math.max(...existing.map((a) => a.order)) : -1;

    // A pasted Instagram, TikTok, YouTube or Vimeo link is stored in its
    // canonical form — share tokens (`?stkn=`, `?igsh=`) and mobile hosts
    // stripped — so the same reel pasted by two people is the same string,
    // and anything that isn't http(s) is refused (convex/linkPreview.ts).
    const mediaUrl = canonicalMediaUrl(args.mediaUrl);
    const coverUrl = args.coverStorageId
      ? await ctx.storage.getUrl(args.coverStorageId)
      : null;

    const createdAt = Date.now();
    const artifactId = await ctx.db.insert("artifacts", {
      profileId: profile._id,
      type: args.type,
      title: args.title,
      content: args.content,
      mediaUrl,
      mediaStorageId: args.mediaStorageId,
      ogImageUrl: coverUrl ?? undefined,
      coverStorageId: args.coverStorageId,
      order: maxOrder + 1,
      createdAt,
    });

    // V1 (docs/the-exchange-v1-prd.md §7): every new artifact is a passion
    // project, not just a portfolio piece — this is what makes "post to your
    // portfolio" the same action as "post a project" without a separate flow.
    const projectTitle = deriveProjectTitle({ type: args.type, title: args.title, content: args.content });
    // Slug generation (review follow-up, same reasoning as garden/projects.ts:
    // Convex's MutationCtx has no runMutation — a mutation can't call another
    // mutation like stories.ts's ensureStorySlug mid-transaction — so this
    // inlines the same pure logic from stories.ts against this ctx.db instead).
    const storySlug = await resolveAvailableSlug(slugifyTitle(projectTitle), async (candidate) => {
      const hit = await ctx.db
        .query("projects")
        .withIndex("by_storySlug", (q) => q.eq("storySlug", candidate))
        .unique();
      return hit !== null;
    });
    const projectId = await ctx.db.insert("projects", {
      userId,
      kind: "passion",
      origin: "portfolio",
      title: projectTitle,
      blurb: args.type === "text" ? args.content : undefined,
      status: "active",
      photoUrl: args.type === "image" ? mediaUrl : undefined,
      storySlug,
      interests: args.interests,
      location: args.location,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      remote: args.remote ?? true,
      stage: args.inProgress ? undefined : "completed",
      stageChangedAt: args.inProgress ? undefined : createdAt,
      createdAt,
      updatedAt: createdAt,
    });
    await ctx.db.patch(artifactId, { projectId });

    // Schedule embedding generation for text-based artifacts
    if (args.title || args.content) {
      await ctx.scheduler.runAfter(0, api.embeddings.embedArtifact, {
        artifactId,
      });
    }

    // A still for the card, unless the resolver already has one — or the
    // creative uploaded a cover beside the link, which is the picture they
    // chose: a fetched still would delete it and take its place. The owner's
    // explicit Refresh Preview (refetchOgImage) may still do that.
    if (!args.coverStorageId) {
      await schedulePreview(ctx, artifactId, mediaUrl, args.type);
    }

    return artifactId;
  },
});

export const update = mutation({
  args: {
    artifactId: v.id("artifacts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Verify ownership
    const profile = await ctx.db.get(artifact.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    // Delete old storage file if replacing
    if (args.mediaStorageId && artifact.mediaStorageId) {
      await ctx.storage.delete(artifact.mediaStorageId);
    }

    await ctx.db.patch(args.artifactId, {
      title: args.title,
      content: args.content,
      mediaUrl: args.mediaUrl,
      mediaStorageId: args.mediaStorageId,
    });

    // Schedule embedding regeneration if content changed
    if (args.title || args.content) {
      await ctx.scheduler.runAfter(0, api.embeddings.embedArtifact, {
        artifactId: args.artifactId,
      });
    }
  },
});

export const remove = mutation({
  args: {
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Verify ownership
    const profile = await ctx.db.get(artifact.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    // Delete associated storage files — the work and any stored cover
    if (artifact.mediaStorageId) {
      await ctx.storage.delete(artifact.mediaStorageId);
    }
    if (artifact.coverStorageId) {
      await ctx.storage.delete(artifact.coverStorageId);
    }

    await ctx.db.delete(args.artifactId);
  },
});

export const reorder = mutation({
  args: {
    artifactIds: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Update order for each artifact
    for (let i = 0; i < args.artifactIds.length; i++) {
      const artifact = await ctx.db.get(args.artifactIds[i]);
      if (artifact && artifact.profileId === profile._id) {
        await ctx.db.patch(args.artifactIds[i], { order: i });
      }
    }
  },
});

// Get all artifacts for the Works gallery
export const getAllArtifacts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const artifacts = await ctx.db.query("artifacts").collect();

    // Resolve storage URLs and get profile info
    const withDetails = await Promise.all(
      artifacts.map(async (artifact) => {
        let resolvedMediaUrl = artifact.mediaUrl || null;
        if (artifact.mediaStorageId) {
          resolvedMediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
        }

        const profile = await ctx.db.get(artifact.profileId);
        let profileImageUrl = profile?.imageUrl || null;
        if (profile?.imageStorageId) {
          profileImageUrl = await ctx.storage.getUrl(profile.imageStorageId);
        }

        return {
          ...artifact,
          resolvedMediaUrl,
          profile: profile
            ? {
                _id: profile._id,
                displayName: profile.name,
                imageUrl: profileImageUrl,
              }
            : null,
        };
      }),
    );

    return withDetails;
  },
});

// Fetch a plain website's og:image/title/description and update the
// artifact. Robustness notes (fixes the David Russo / abidingpractice.com
// case, docs/features/creator-media-cross-post.md follow-up):
//  - Legacy artifacts (and anything pasted before canonicalMediaUrl existed)
//    can have a schemeless URL like "abidingpractice.com" stored. `fetch()`
//    throws immediately on that (invalid URL), which the old code's blanket
//    try/catch swallowed silently and permanently — normalizeUrl fixes the
//    input before it ever reaches fetch.
//  - `response.url` (the URL after following redirects) is used as the base
//    for resolving a relative og:image, not the URL that was pasted — a
//    relative image is relative to where the page actually ended up.
export const fetchOgImage = action({
  args: {
    artifactId: v.id("artifacts"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const url = normalizeUrl(args.url);
    if (!isSafeHttpUrl(url)) {
      console.log(`Refusing to fetch og:image for unsafe URL: ${args.url}`);
      return;
    }
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      if (!response.ok) {
        console.log(`Failed to fetch ${url}: ${response.status}`);
        return;
      }

      const html = await response.text();
      const baseUrl = response.url || url;
      const { title, description, imageUrl } = parseOgMeta(html, baseUrl);

      if (!imageUrl && !title && !description) {
        console.log(`No preview metadata found for ${url}`);
        return;
      }

      await ctx.runMutation(internal.artifacts.updateOgImage, {
        artifactId: args.artifactId,
        ogImageUrl: imageUrl,
        ogTitle: title,
        ogDescription: description,
      });
      console.log(
        `Fetched preview for ${url}: image=${imageUrl ?? "none"} title=${title ?? "none"}`,
      );
    } catch (error) {
      console.log(`Error fetching og:image for ${url}:`, error);
    }
  },
});

// Internal mutation to fix artifact data (type and URL)
export const fixArtifact = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    type: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, string> = {};
    if (args.type) updates.type = args.type;
    if (args.mediaUrl) updates.mediaUrl = args.mediaUrl;
    await ctx.db.patch(args.artifactId, updates);
  },
});

// Internal mutation to update a link artifact's fetched preview (image,
// title, description). Also mirrors the image onto the companion project's
// photoUrl when that project doesn't already have a real image — see
// mapArtifactToProject's photoUrl bug (garden/artifactsMigration.ts): a
// migrated "link" project can be stuck with the raw page URL (not an image)
// as its photoUrl, which renders as a broken <img>.
export const updateOgImage = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    ogImageUrl: v.optional(v.string()),
    ogTitle: v.optional(v.string()),
    ogDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return;

    const patch: Record<string, string> = {};
    if (args.ogImageUrl) patch.ogImageUrl = args.ogImageUrl;
    if (args.ogTitle) patch.ogTitle = args.ogTitle;
    if (args.ogDescription) patch.ogDescription = args.ogDescription;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.artifactId, patch);
    }

    if (args.ogImageUrl && artifact.projectId) {
      const project = await ctx.db.get(artifact.projectId);
      // A photoUrl that isn't http(s) is the bug's signature (the raw
      // schemeless link, or the page URL, stored as if it were an image) —
      // always replace that. A real photoUrl (an upload, or an already-good
      // fetched image) is left alone.
      const hasRealPhoto = !!project?.photoStorageId || /^https?:\/\//.test(project?.photoUrl ?? "");
      if (project && !hasRealPhoto) {
        await ctx.db.patch(project._id, { photoUrl: args.ogImageUrl, updatedAt: Date.now() });
      }
    }
  },
});

// Backfill for ordinary website links created (or migrated) before this
// module fetched title/description, or whose fetch failed the first time —
// e.g. because the stored URL was schemeless (fixed by fetchOgImage now
// normalizing it first). Idempotent: only artifacts missing both an image
// and a title are re-fetched, spaced a second apart. Safe to run on dev now;
// Rick runs it on prod once this ships:
//   npx convex run --prod artifacts:backfillLinkPreviews
export const backfillLinkPreviews = internalMutation({
  args: {},
  handler: async (ctx) => {
    const artifacts = await ctx.db.query("artifacts").collect();
    let scheduled = 0;
    for (const a of artifacts) {
      if (a.type !== "link" || !a.mediaUrl) continue;
      if (a.ogImageUrl || a.ogTitle) continue; // already has a preview
      if (wantsPreviewFetch(a.mediaUrl) || toEmbedUrl(a.mediaUrl)) continue; // handled by linkPreview.ts / embeds
      await ctx.scheduler.runAfter(scheduled * 1000, api.artifacts.fetchOgImage, {
        artifactId: a._id,
        url: a.mediaUrl,
      });
      scheduled += 1;
    }
    return { scheduled };
  },
});

// Mutation to manually trigger og:image refetch for an artifact
export const refetchOgImage = mutation({
  args: {
    artifactId: v.id("artifacts"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Verify ownership
    const profile = await ctx.db.get(artifact.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    if (!artifact.mediaUrl) {
      throw new Error("Artifact has no URL to fetch og:image from");
    }

    await schedulePreview(ctx, args.artifactId, artifact.mediaUrl, artifact.type);

    return { success: true };
  },
});
