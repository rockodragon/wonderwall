import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Generate a URL-friendly slug from a name
function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_UNUSED_INVITES = 3;

// Progressive invite rewards system
// Start with 3, then unlock 5 more, then 10 more, etc.
function getInviteLimit(usageCount: number): number {
  if (usageCount < 3) return 3;
  if (usageCount < 8) return 8; // 3 + 5
  if (usageCount < 18) return 18; // 8 + 10
  if (usageCount < 38) return 38; // 18 + 20
  return usageCount + 20; // Keep expanding by 20
}

export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Check how many unused invites the user has
    const existingInvites = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", userId))
      .collect();

    const unusedCount = existingInvites.filter((i) => !i.usedBy).length;

    if (unusedCount >= MAX_UNUSED_INVITES) {
      throw new Error(
        `You can only have ${MAX_UNUSED_INVITES} unused invites at a time`,
      );
    }

    const code = generateCode();

    await ctx.db.insert("invites", {
      inviterId: userId,
      code,
      createdAt: Date.now(),
    });

    return code;
  },
});

export const getMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const invites = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", userId))
      .collect();

    // Only return unused invites
    return invites.filter((invite) => !invite.usedBy);
  },
});

export const validate = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!invite) return { valid: false, reason: "Invalid invite code" };
    if (invite.usedBy) return { valid: false, reason: "Invite already used" };

    return { valid: true };
  },
});

export const redeem = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!invite) throw new Error("Invalid invite code");
    if (invite.usedBy) throw new Error("Invite already used");

    await ctx.db.patch(invite._id, {
      usedBy: userId,
      usedAt: Date.now(),
    });

    return true;
  },
});

// Get invitation stats for a user
export const getInviteStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Find who invited this user
    const invite = await ctx.db
      .query("invites")
      .filter((q) => q.eq(q.field("usedBy"), args.userId))
      .first();

    let invitedBy = null;
    if (invite) {
      const inviterProfile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", invite.inviterId))
        .first();
      if (inviterProfile) {
        invitedBy = {
          userId: invite.inviterId,
          name: inviterProfile.name,
          profileId: inviterProfile._id,
        };
      }
    }

    // Count direct invitees (people who used this user's invites)
    const directInvites = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", args.userId))
      .filter((q) => q.neq(q.field("usedBy"), undefined))
      .collect();

    const directInvitees = directInvites.length;

    // Calculate downstream count (recursive)
    // Get all used invites to traverse
    const allInvites = await ctx.db.query("invites").collect();
    const usedInvites = allInvites.filter((i) => i.usedBy);

    // Build a map of inviter -> invitees
    const inviterToInvitees = new Map<string, string[]>();
    for (const inv of usedInvites) {
      const invitees = inviterToInvitees.get(inv.inviterId) || [];
      invitees.push(inv.usedBy!);
      inviterToInvitees.set(inv.inviterId, invitees);
    }

    // Count downstream recursively (excluding direct)
    function countDownstream(userId: string, visited: Set<string>): number {
      if (visited.has(userId)) return 0;
      visited.add(userId);

      const directInvs = inviterToInvitees.get(userId) || [];
      let count = 0;
      for (const invitee of directInvs) {
        count += 1 + countDownstream(invitee, visited);
      }
      return count;
    }

    const totalDownstream = countDownstream(args.userId, new Set());

    // Network size includes: self (1) + inviter (if any) + all downstream
    const networkSize = 1 + (invitedBy ? 1 : 0) + totalDownstream;

    return {
      invitedBy,
      directInvitees,
      downstreamCount: totalDownstream - directInvitees, // Exclude direct
      networkSize,
    };
  },
});

// ===== NEW INVITE LINK SYSTEM =====

// Get or create a user's personal invite link
export const getMyInviteLink = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) return null;

    // If profile doesn't have a slug yet, we'll need to create one
    if (!profile.inviteSlug) {
      return {
        slug: null,
        usageCount: 0,
        remainingUses: 3,
        currentLimit: 3,
      };
    }

    const usageCount = profile.inviteUsageCount || 0;
    const currentLimit = profile.unlimitedInvites
      ? Infinity
      : getInviteLimit(usageCount);
    return {
      slug: profile.inviteSlug,
      usageCount,
      remainingUses: profile.unlimitedInvites
        ? Infinity
        : Math.max(0, currentLimit - usageCount),
      currentLimit,
      unlimitedInvites: profile.unlimitedInvites || false,
    };
  },
});

// Generate invite slug for a user (called once during profile creation)
export const generateInviteSlug = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");
    if (profile.inviteSlug) return profile.inviteSlug; // Already has one

    // Generate slug from name
    let slug = generateSlugFromName(profile.name);

    // Check if slug is unique, add number if not
    let attempt = 0;
    let finalSlug = slug;
    while (true) {
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", finalSlug))
        .first();

      if (!existing) break;

      attempt++;
      finalSlug = `${slug}-${attempt}`;
    }

    // Update profile with slug
    await ctx.db.patch(profile._id, {
      inviteSlug: finalSlug,
      inviteUsageCount: 0,
    });

    return finalSlug;
  },
});

// Get inviter information by slug
export const getInviterInfo = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", args.slug))
      .first();

    if (!profile) return null;

    const usageCount = profile.inviteUsageCount || 0;
    const hasUnlimited = profile.unlimitedInvites || false;
    const currentLimit = hasUnlimited ? Infinity : getInviteLimit(usageCount);
    const remainingUses = hasUnlimited
      ? Infinity
      : Math.max(0, currentLimit - usageCount);

    // Get the 2 most recent people who accepted this person's invite
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", profile.userId))
      .filter((q) => q.neq(q.field("usedBy"), undefined))
      .collect();

    // Sort by usedAt descending and take top 2
    const recentInvites = invites
      .sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0))
      .slice(0, 2);

    // Get profiles for recent invitees
    const recentInvitees = [];
    for (const invite of recentInvites) {
      if (!invite.usedBy) continue;
      const inviteeProfile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", invite.usedBy!))
        .first();
      if (inviteeProfile) {
        recentInvitees.push({
          name: inviteeProfile.name,
          imageUrl: inviteeProfile.imageUrl,
          jobFunctions: inviteeProfile.jobFunctions,
        });
      }
    }

    return {
      name: profile.name,
      imageUrl: profile.imageUrl,
      jobFunctions: profile.jobFunctions,
      usageCount,
      remainingUses,
      canAcceptMore: remainingUses > 0,
      recentInvitees,
    };
  },
});

// Debug: Check profile's unlimited status
export const debugUnlimitedStatus = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const allUsers = await ctx.db.query("users").collect();
    const user = allUsers.find((u) => "email" in u && u.email === args.email);

    if (!user) return { error: "User not found", email: args.email };

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) return { error: "Profile not found", userId: user._id };

    return {
      userId: user._id,
      profileId: profile._id,
      name: profile.name,
      unlimitedInvites: profile.unlimitedInvites,
      inviteUsageCount: profile.inviteUsageCount,
    };
  },
});

// Admin: Set unlimited invites for a profile by email
export const setUnlimitedInvites = mutation({
  args: { email: v.string(), unlimited: v.boolean() },
  handler: async (ctx, args) => {
    // Get all users and find one with matching email
    const allUsers = await ctx.db.query("users").collect();
    const user = allUsers.find((u) => "email" in u && u.email === args.email);

    if (!user) throw new Error(`User not found with email: ${args.email}`);

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch(profile._id, {
      unlimitedInvites: args.unlimited,
    });

    return {
      success: true,
      email: args.email,
      unlimited: args.unlimited,
      profileName: profile.name,
    };
  },
});

// Redeem invite by slug (called during signup)
export const redeemBySlug = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Find the inviter profile
    const inviterProfile = await ctx.db
      .query("profiles")
      .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", args.slug))
      .first();

    if (!inviterProfile) throw new Error("Invalid invite link");

    const usageCount = inviterProfile.inviteUsageCount || 0;
    const currentLimit = getInviteLimit(usageCount);
    // Skip limit check for accounts with unlimited invites
    if (!inviterProfile.unlimitedInvites && usageCount >= currentLimit) {
      throw new Error(
        "This invite link has reached its current limit. The owner needs to wait for more invites to unlock.",
      );
    }

    // Create an invite record (for backward compatibility with stats)
    await ctx.db.insert("invites", {
      inviterId: inviterProfile.userId,
      code: args.slug, // Store slug as code for now
      usedBy: userId,
      usedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Increment usage count
    await ctx.db.patch(inviterProfile._id, {
      inviteUsageCount: usageCount + 1,
    });

    // Get the new user's profile info for the notification
    // Note: Profile may not exist yet at signup time, so we'll get it later or use user info
    const newUserProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const newUserName = newUserProfile?.name || "Someone";
    const newUserImageUrl = newUserProfile?.imageUrl;

    // Create notification for the inviter
    await ctx.db.insert("notifications", {
      userId: inviterProfile.userId,
      type: "invite_accepted",
      title: "New member joined!",
      message: `${newUserName} joined Wonderwall using your invite link.`,
      linkUrl: newUserProfile?.inviteSlug
        ? `/profile/${newUserProfile.inviteSlug}`
        : undefined,
      imageUrl: newUserImageUrl,
      relatedUserId: userId,
      createdAt: Date.now(),
    });

    return true;
  },
});
