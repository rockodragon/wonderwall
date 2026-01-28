import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Generate an upload URL for the client to upload a file directly to Convex
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    return await ctx.storage.generateUploadUrl();
  },
});

// Save the uploaded file's storage ID to the user's profile
export const saveProfileImage = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Delete old image if exists
    if (profile.imageStorageId) {
      await ctx.storage.delete(profile.imageStorageId);
    }

    // Update profile with new storage ID and clear external URL
    await ctx.db.patch(profile._id, {
      imageStorageId: args.storageId,
      imageUrl: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Get the URL for a stored file
export const getImageUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Delete profile image
export const deleteProfileImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    if (profile.imageStorageId) {
      await ctx.storage.delete(profile.imageStorageId);
    }

    await ctx.db.patch(profile._id, {
      imageStorageId: undefined,
      imageUrl: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Save profile image from external URL
export const saveProfileImageUrl = mutation({
  args: {
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Delete old storage image if exists
    if (profile.imageStorageId) {
      await ctx.storage.delete(profile.imageStorageId);
    }

    // Update profile with external URL and clear storage ID
    await ctx.db.patch(profile._id, {
      imageUrl: args.imageUrl,
      imageStorageId: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Save wondering background image
export const saveWonderingImage = mutation({
  args: {
    wonderingId: v.id("wonderings"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const wondering = await ctx.db.get(args.wonderingId);
    if (!wondering) throw new Error("Wondering not found");

    // Verify ownership
    const profile = await ctx.db.get(wondering.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    // Delete old image if exists
    if (wondering.imageStorageId) {
      await ctx.storage.delete(wondering.imageStorageId);
    }

    await ctx.db.patch(args.wonderingId, {
      imageStorageId: args.storageId,
    });

    return { success: true };
  },
});

// Delete wondering background image
export const deleteWonderingImage = mutation({
  args: {
    wonderingId: v.id("wonderings"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const wondering = await ctx.db.get(args.wonderingId);
    if (!wondering) throw new Error("Wondering not found");

    // Verify ownership
    const profile = await ctx.db.get(wondering.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    if (wondering.imageStorageId) {
      await ctx.storage.delete(wondering.imageStorageId);
    }

    await ctx.db.patch(args.wonderingId, {
      imageStorageId: undefined,
    });

    return { success: true };
  },
});

// Save event cover image
export const saveEventCoverImage = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    // Delete old image if exists
    if (event.coverImageStorageId) {
      await ctx.storage.delete(event.coverImageStorageId);
    }

    await ctx.db.patch(args.eventId, {
      coverImageStorageId: args.storageId,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Delete event cover image
export const deleteEventCoverImage = mutation({
  args: {
    eventId: v.id("events"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    if (event.coverImageStorageId) {
      await ctx.storage.delete(event.coverImageStorageId);
    }

    await ctx.db.patch(args.eventId, {
      coverImageStorageId: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Add event gallery image (up to 3)
export const addEventGalleryImage = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    const currentImages = event.imageStorageIds || [];
    if (currentImages.length >= 3) {
      throw new Error("Maximum 3 gallery images allowed");
    }

    await ctx.db.patch(args.eventId, {
      imageStorageIds: [...currentImages, args.storageId],
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Remove event gallery image
export const removeEventGalleryImage = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    const currentImages = event.imageStorageIds || [];
    const newImages = currentImages.filter((id) => id !== args.storageId);

    // Delete from storage
    await ctx.storage.delete(args.storageId);

    await ctx.db.patch(args.eventId, {
      imageStorageIds: newImages.length > 0 ? newImages : undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Admin: Set artifact image from storage ID (no auth required)
export const adminSetArtifactImage = mutation({
  args: {
    artifactId: v.id("artifacts"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Delete old image if exists
    if (artifact.mediaStorageId) {
      await ctx.storage.delete(artifact.mediaStorageId);
    }

    await ctx.db.patch(args.artifactId, {
      mediaStorageId: args.storageId,
    });

    const url = await ctx.storage.getUrl(args.storageId);
    return { success: true, url };
  },
});

// Admin: Generate upload URL without auth (for CLI uploads)
export const adminGenerateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Update event cover color
export const updateEventCoverColor = mutation({
  args: {
    eventId: v.id("events"),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    await ctx.db.patch(args.eventId, {
      coverColor: args.color,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
