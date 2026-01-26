import { query } from "./_generated/server";
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
