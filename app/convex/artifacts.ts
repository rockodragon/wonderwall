import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";

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

    // Check if current user liked
    const userId = await auth.getUserId(ctx);
    const userLiked = userId ? likes.some((l) => l.userId === userId) : false;

    return {
      ...artifact,
      resolvedMediaUrl,
      profile: profile
        ? {
            _id: profile._id,
            name: profile.name,
            imageUrl: profileImageUrl,
            jobFunctions: profile.jobFunctions,
          }
        : null,
      likeCount: likes.length,
      userLiked,
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

export const create = mutation({
  args: {
    type: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaStorageId: v.optional(v.id("_storage")),
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

    const artifactId = await ctx.db.insert("artifacts", {
      profileId: profile._id,
      type: args.type,
      title: args.title,
      content: args.content,
      mediaUrl: args.mediaUrl,
      mediaStorageId: args.mediaStorageId,
      order: maxOrder + 1,
      createdAt: Date.now(),
    });

    // Schedule embedding generation for text-based artifacts
    if (args.title || args.content) {
      await ctx.scheduler.runAfter(0, api.embeddings.embedArtifact, {
        artifactId,
      });
    }

    // Schedule og:image fetching for link-type artifacts
    if (args.type === "link" && args.mediaUrl) {
      await ctx.scheduler.runAfter(0, api.artifacts.fetchOgImage, {
        artifactId,
        url: args.mediaUrl,
      });
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

    // Delete associated storage file
    if (artifact.mediaStorageId) {
      await ctx.storage.delete(artifact.mediaStorageId);
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

// Fetch og:image from a URL and update the artifact
export const fetchOgImage = action({
  args: {
    artifactId: v.id("artifacts"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Fetch the page HTML
      const response = await fetch(args.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Wonderwall/1.0; +https://wonderwall.community)",
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        console.log(`Failed to fetch ${args.url}: ${response.status}`);
        return;
      }

      const html = await response.text();

      // Extract og:image using regex (works for most cases)
      const ogImageMatch = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      );
      const ogImageMatchAlt = html.match(
        /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i,
      );

      const ogImageUrl = ogImageMatch?.[1] || ogImageMatchAlt?.[1];

      if (ogImageUrl) {
        // Handle relative URLs
        let absoluteUrl = ogImageUrl;
        if (ogImageUrl.startsWith("/")) {
          const urlObj = new URL(args.url);
          absoluteUrl = `${urlObj.origin}${ogImageUrl}`;
        } else if (!ogImageUrl.startsWith("http")) {
          const urlObj = new URL(args.url);
          absoluteUrl = `${urlObj.origin}/${ogImageUrl}`;
        }

        await ctx.runMutation(internal.artifacts.updateOgImage, {
          artifactId: args.artifactId,
          ogImageUrl: absoluteUrl,
        });
      }
    } catch (error) {
      console.log(`Error fetching og:image for ${args.url}:`, error);
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

// Internal mutation to update og:image URL
export const updateOgImage = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    ogImageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.artifactId, {
      ogImageUrl: args.ogImageUrl,
    });
  },
});
