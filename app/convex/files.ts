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
