import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Submit a comment on an artifact
export const submitComment = mutation({
  args: {
    artifactId: v.id("artifacts"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Validate content
    const content = args.content.trim();
    if (!content) throw new Error("Comment cannot be empty");
    if (content.length > 1000) throw new Error("Comment too long (max 1000 characters)");

    return await ctx.db.insert("artifactComments", {
      artifactId: args.artifactId,
      commenterId: userId,
      content,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});

// Get public comments + user's own pending comments
export const getPublicComments = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);

    const allComments = await ctx.db
      .query("artifactComments")
      .withIndex("by_artifactId", (q) => q.eq("artifactId", args.artifactId))
      .collect();

    // Filter to public comments + current user's own comments
    const visibleComments = allComments.filter(
      (c) => c.isPublic || (userId && c.commenterId === userId),
    );

    // Get commenter profiles for display
    const commentsWithProfiles = await Promise.all(
      visibleComments.map(async (comment) => {
        const commenterProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", comment.commenterId))
          .first();

        return {
          ...comment,
          commenterName: commenterProfile?.name || "Anonymous",
          commenterImageUrl: commenterProfile?.imageStorageId
            ? await ctx.storage.getUrl(commenterProfile.imageStorageId)
            : commenterProfile?.imageUrl || null,
          commenterProfileId: commenterProfile?._id || null,
          isOwnComment: userId === comment.commenterId,
        };
      }),
    );

    return commentsWithProfiles.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// For artifact owner - get all comments (including pending)
export const getAllComments = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return [];

    // Verify ownership
    const profile = await ctx.db.get(artifact.profileId);
    if (!profile || profile.userId !== userId) {
      return [];
    }

    const allComments = await ctx.db
      .query("artifactComments")
      .withIndex("by_artifactId", (q) => q.eq("artifactId", args.artifactId))
      .collect();

    // Get commenter profiles for display
    const commentsWithProfiles = await Promise.all(
      allComments.map(async (comment) => {
        const commenterProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", comment.commenterId))
          .first();

        return {
          ...comment,
          commenterName: commenterProfile?.name || "Anonymous",
          commenterImageUrl: commenterProfile?.imageStorageId
            ? await ctx.storage.getUrl(commenterProfile.imageStorageId)
            : commenterProfile?.imageUrl || null,
          commenterProfileId: commenterProfile?._id || null,
          isOwnComment: userId === comment.commenterId,
        };
      }),
    );

    return commentsWithProfiles.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Toggle comment public/private (artifact owner only)
export const toggleCommentPublic = mutation({
  args: {
    commentId: v.id("artifactComments"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    const artifact = await ctx.db.get(comment.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Verify ownership of artifact
    const profile = await ctx.db.get(artifact.profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.commentId, {
      isPublic: !comment.isPublic,
    });
  },
});

// Delete a comment (artifact owner or commenter can delete)
export const deleteComment = mutation({
  args: {
    commentId: v.id("artifactComments"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");

    const artifact = await ctx.db.get(comment.artifactId);
    if (!artifact) throw new Error("Artifact not found");

    // Check if user is artifact owner or commenter
    const profile = await ctx.db.get(artifact.profileId);
    const isArtifactOwner = profile && profile.userId === userId;
    const isCommenter = comment.commenterId === userId;

    if (!isArtifactOwner && !isCommenter) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(args.commentId);
  },
});
