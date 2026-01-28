import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";
import type { Doc } from "./_generated/dataModel";

// Helper to resolve image URL from storage or external URL
async function resolveImageUrl(
  ctx: QueryCtx,
  profile: Doc<"profiles">,
): Promise<string | null> {
  if (profile.imageStorageId) {
    return await ctx.storage.getUrl(profile.imageStorageId);
  }
  return profile.imageUrl || null;
}

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

    // Resolve image URL
    const imageUrl = await resolveImageUrl(ctx, profile);

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
      imageUrl,
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

    // Resolve image URL
    const imageUrl = await resolveImageUrl(ctx, profile);

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
    const artifactsWithUrls = await Promise.all(
      artifacts.map(async (artifact) => {
        // Resolve storage URL if exists
        const resolvedMediaUrl = artifact.mediaStorageId
          ? await ctx.storage.getUrl(artifact.mediaStorageId)
          : artifact.mediaUrl || null;

        return {
          ...artifact,
          mediaUrl: resolvedMediaUrl, // The displayable media (uploaded image or external URL)
          linkUrl: artifact.mediaUrl || null, // The original link URL (if any)
        };
      }),
    );

    // Get active wondering
    const wondering = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId_active", (q) =>
        q.eq("profileId", profile._id).eq("isActive", true),
      )
      .first();

    // Resolve wondering image URL if exists
    let wonderingWithImage = null;
    if (wondering) {
      const wonderingImageUrl = wondering.imageStorageId
        ? await ctx.storage.getUrl(wondering.imageStorageId)
        : null;
      wonderingWithImage = {
        ...wondering,
        imageUrl: wonderingImageUrl,
      };
    }

    return {
      ...profile,
      imageUrl,
      attributes: Object.fromEntries(attributes.map((a) => [a.key, a.value])),
      links: links.sort((a, b) => a.order - b.order),
      artifacts: artifactsWithUrls.sort((a, b) => a.order - b.order),
      wondering: wonderingWithImage,
    };
  },
});

export const upsertProfile = mutation({
  args: {
    name: v.string(),
    bio: v.optional(v.string()),
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

    let profileId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        bio: args.bio,
        jobFunctions: args.jobFunctions,
        location: args.location,
        updatedAt: now,
      });
      profileId = existing._id;
    } else {
      profileId = await ctx.db.insert("profiles", {
        userId,
        name: args.name,
        bio: args.bio,
        jobFunctions: args.jobFunctions,
        location: args.location,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Schedule embedding generation
    await ctx.scheduler.runAfter(0, api.embeddings.embedProfile, { profileId });

    return profileId;
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

export const updateWonderingHistoryVisibility = mutation({
  args: {
    showWonderingHistory: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch(profile._id, {
      showWonderingHistory: args.showWonderingHistory,
      updatedAt: Date.now(),
    });
  },
});

export const search = query({
  args: {
    query: v.optional(v.string()),
    jobFunction: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all profiles with their wonderings pre-fetched
    const profiles = await ctx.db.query("profiles").collect();

    // Fetch all active wonderings to search
    const wonderings = await ctx.db
      .query("wonderings")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Create a map of profileId -> wondering for quick lookup
    const wonderingMap = new Map<string, (typeof wonderings)[0]>();
    for (const w of wonderings) {
      wonderingMap.set(w.profileId, w);
    }

    // Filter profiles
    let filteredProfiles = profiles;

    if (args.jobFunction) {
      filteredProfiles = filteredProfiles.filter((p) =>
        p.jobFunctions.includes(args.jobFunction!),
      );
    }

    if (args.location) {
      filteredProfiles = filteredProfiles.filter((p) =>
        p.location?.toLowerCase().includes(args.location!.toLowerCase()),
      );
    }

    if (args.query) {
      const q = args.query.toLowerCase();
      filteredProfiles = filteredProfiles.filter((p) => {
        const wondering = wonderingMap.get(p._id);
        return (
          p.name.toLowerCase().includes(q) ||
          p.bio?.toLowerCase().includes(q) ||
          p.jobFunctions.some((jf) => jf.toLowerCase().includes(q)) ||
          p.location?.toLowerCase().includes(q) ||
          wondering?.prompt.toLowerCase().includes(q)
        );
      });
    }

    // Fetch active wondering and resolve image URL for each profile
    const profilesWithData = await Promise.all(
      filteredProfiles.slice(0, 30).map(async (profile) => {
        const wondering = wonderingMap.get(profile._id) || null;

        // Resolve profile image URL
        const imageUrl = await resolveImageUrl(ctx, profile);

        // Resolve wondering image URL if exists
        let wonderingImageUrl: string | null = null;
        if (wondering?.imageStorageId) {
          wonderingImageUrl = await ctx.storage.getUrl(
            wondering.imageStorageId,
          );
        }

        return {
          ...profile,
          imageUrl,
          wondering: wondering
            ? {
                prompt: wondering.prompt,
                _id: wondering._id,
                imageUrl: wonderingImageUrl,
              }
            : null,
        };
      }),
    );

    return profilesWithData;
  },
});
