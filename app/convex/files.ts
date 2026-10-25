import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail } from "./errors";
import { requireEventHost } from "./eventHosts";
import { requireOwner, requireOwnProfileRow, requireProfile, requireUserId } from "./helpers";
import { storedFileUrl } from "./images";

// Generate an upload URL for the client to upload a file directly to Convex
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);

    return await ctx.storage.generateUploadUrl();
  },
});

// Save the uploaded file's storage ID to the user's profile
export const saveProfileImage = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const profile = await requireProfile(ctx, userId);

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
    return await storedFileUrl(ctx, args.storageId);
  },
});

// Delete profile image
export const deleteProfileImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const profile = await requireProfile(ctx, userId);

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
    const userId = await requireUserId(ctx);

    const profile = await requireProfile(ctx, userId);

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
    const { userId, row: wondering, profile } = await requireOwnProfileRow(ctx, "wonderings", args.wonderingId);

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
    const { userId, row: wondering, profile } = await requireOwnProfileRow(ctx, "wonderings", args.wonderingId);

    if (wondering.imageStorageId) {
      await ctx.storage.delete(wondering.imageStorageId);
    }

    await ctx.db.patch(args.wonderingId, {
      imageStorageId: undefined,
    });

    return { success: true };
  },
});

// Save project hero image
export const saveProjectImage = mutation({
  args: {
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { row: project } = await requireOwner(ctx, "projects", args.projectId);

    if (project.photoStorageId) {
      await ctx.storage.delete(project.photoStorageId);
    }

    await ctx.db.patch(args.projectId, {
      photoStorageId: args.storageId,
      updatedAt: Date.now(),
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
    const { event } = await requireEventHost(ctx, args.eventId);

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
    const { event } = await requireEventHost(ctx, args.eventId);

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
    const { event } = await requireEventHost(ctx, args.eventId);

    const currentImages = event.imageStorageIds || [];
    if (currentImages.length >= 3) {
      fail("too_many", "Maximum 3 gallery images allowed");
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
    const { event } = await requireEventHost(ctx, args.eventId);

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
// Operator-only (dashboard or `npx convex run`): internal, never callable
// from a browser (it had no sign-in or admin check; found 2026-10-10).
export const adminSetArtifactImage = internalMutation({
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

    const url = await storedFileUrl(ctx, args.storageId);
    return { success: true, url };
  },
});

// Admin: Generate upload URL without auth (for CLI uploads)
// Operator-only (dashboard or `npx convex run`): internal, never callable
// from a browser (it had no sign-in or admin check; found 2026-10-10).
export const adminGenerateUploadUrl = internalMutation({
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
    const { event } = await requireEventHost(ctx, args.eventId);

    await ctx.db.patch(args.eventId, {
      coverColor: args.color,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
