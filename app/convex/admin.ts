import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

export const getAllUsersWithInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Get current user's email from the users table
    const currentUser = await ctx.db.get(userId);
    const userEmail =
      currentUser && "email" in currentUser ? currentUser.email : null;
    if (!userEmail || userEmail !== "rickmoy@gmail.com") {
      throw new Error("Unauthorized - Admin access only");
    }

    // Get all profiles
    const profiles = await ctx.db.query("profiles").collect();

    // Get all invites to build invite relationships
    const invites = await ctx.db.query("invites").collect();

    // Build a map of userId -> inviter userId
    const inviteMap = new Map();
    for (const invite of invites) {
      if (invite.usedBy) {
        inviteMap.set(invite.usedBy, invite.inviterId);
      }
    }

    // Get all auth users to fetch emails
    const users = await Promise.all(
      profiles.map(async (profile) => {
        const authUser = await ctx.db.get(profile.userId);
        const inviterId = inviteMap.get(profile.userId);
        let inviterProfile = null;
        let inviterEmail = null;

        if (inviterId) {
          const inviterAuth = await ctx.db.get(inviterId);
          inviterProfile = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", inviterId))
            .first();
          inviterEmail =
            inviterAuth && "email" in inviterAuth
              ? inviterAuth.email
              : undefined;
        }

        return {
          _id: profile._id,
          userId: profile.userId,
          name: profile.name,
          email: authUser && "email" in authUser ? authUser.email : undefined,
          inviteSlug: profile.inviteSlug,
          inviteUsageCount: profile.inviteUsageCount || 0,
          createdAt: profile.createdAt,
          invitedBy: inviterProfile
            ? {
                name: inviterProfile.name,
                email: inviterEmail,
              }
            : null,
        };
      }),
    );

    // Sort by creation date (newest first)
    return users.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Debug query to check invite records
export const debugInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db.get(userId);
    const userEmail =
      currentUser && "email" in currentUser ? currentUser.email : null;
    if (!userEmail || userEmail !== "rickmoy@gmail.com") {
      throw new Error("Unauthorized - Admin access only");
    }

    const invites = await ctx.db.query("invites").collect();

    return {
      totalInvites: invites.length,
      usedInvites: invites.filter((i) => i.usedBy).length,
      unusedInvites: invites.filter((i) => !i.usedBy).length,
      invites: invites.map((inv) => ({
        code: inv.code,
        inviterId: inv.inviterId,
        usedBy: inv.usedBy,
        usedAt: inv.usedAt,
        createdAt: inv.createdAt,
      })),
    };
  },
});

// Manual backfill mutation to link a user to their inviter
export const manuallyLinkInvite = mutation({
  args: {
    inviteeUserId: v.id("users"),
    inviterUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db.get(userId);
    const userEmail =
      currentUser && "email" in currentUser ? currentUser.email : null;
    if (!userEmail || userEmail !== "rickmoy@gmail.com") {
      throw new Error("Unauthorized - Admin access only");
    }

    // Get inviter profile to increment their usage count
    const inviterProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.inviterUserId))
      .first();

    if (!inviterProfile) {
      throw new Error("Inviter profile not found");
    }

    // Check if invite record already exists
    const existingInvite = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", args.inviterUserId))
      .filter((q) => q.eq(q.field("usedBy"), args.inviteeUserId))
      .first();

    if (existingInvite) {
      return { message: "Invite link already exists", existing: true };
    }

    // Create invite record
    await ctx.db.insert("invites", {
      inviterId: args.inviterUserId,
      code: inviterProfile.inviteSlug || "manual-backfill",
      usedBy: args.inviteeUserId,
      usedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Increment inviter's usage count
    const currentCount = inviterProfile.inviteUsageCount || 0;
    await ctx.db.patch(inviterProfile._id, {
      inviteUsageCount: currentCount + 1,
    });

    return { message: "Successfully linked invite", existing: false };
  },
});

// Delete user and all their data
export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const adminUserId = await auth.getUserId(ctx);
    if (!adminUserId) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db.get(adminUserId);
    const userEmail =
      currentUser && "email" in currentUser ? currentUser.email : null;
    if (!userEmail || userEmail !== "rickmoy@gmail.com") {
      throw new Error("Unauthorized - Admin access only");
    }

    // Get user's profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!profile) {
      throw new Error("Profile not found");
    }

    // Delete all artifacts (works)
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();
    for (const artifact of artifacts) {
      await ctx.db.delete(artifact._id);
    }

    // Delete all wonderings
    const wonderings = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();
    for (const wondering of wonderings) {
      await ctx.db.delete(wondering._id);
    }

    // Delete all invites created by this user
    const createdInvites = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", args.userId))
      .collect();
    for (const invite of createdInvites) {
      await ctx.db.delete(invite._id);
    }

    // Delete all invites used by this user
    const usedInvites = await ctx.db
      .query("invites")
      .filter((q) => q.eq(q.field("usedBy"), args.userId))
      .collect();
    for (const invite of usedInvites) {
      await ctx.db.delete(invite._id);
    }

    // Delete all favorites
    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const favorite of favorites) {
      await ctx.db.delete(favorite._id);
    }

    // Delete profile
    await ctx.db.delete(profile._id);

    // Delete auth user
    await ctx.db.delete(args.userId);

    return { success: true, message: "User deleted successfully" };
  },
});
