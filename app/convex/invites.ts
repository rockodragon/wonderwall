import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { scheduleNotificationEmail } from "./emailHelpers";
import { escapeHtml } from "./garden/projectTeam";
import { generateInviteCode } from "./inviteCode";
import { followEachOther } from "./follows";

// A pasted or emailed code can be either kind of invite: a member's own
// inviteSlug, or an admin's fixed waitlist-approval code (adminCode, set by
// waitlist.ts's approveEntry). Both live on the profiles table and both
// land at /signup/:code, so every lookup here tries inviteSlug first —
// the far more common case — and falls back to adminCode.
//
// Old invites got a name-based inviteSlug ("rick-moy"); new ones get a
// short generated code ("K7M4QD", see generateInviteSlug below and
// convex/inviteCode.ts). Both are stored as-is in the same field, so the
// exact-match lookup finds either one — every link already shared keeps
// redeeming forever, nothing was migrated. The uppercased retry only helps
// a short code typed in a different case; it can never accidentally match
// an old lowercase, dashed slug, since uppercasing one of those doesn't
// produce another real slug.
async function findInviterProfile(ctx: QueryCtx | MutationCtx, code: string) {
  const bySlug = await ctx.db
    .query("profiles")
    .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", code))
    .first();
  if (bySlug) return bySlug;

  const upper = code.toUpperCase();
  if (upper !== code) {
    const byUpperSlug = await ctx.db
      .query("profiles")
      .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", upper))
      .first();
    if (byUpperSlug) return byUpperSlug;
  }

  return await ctx.db
    .query("profiles")
    .withIndex("by_adminCode", (q) => q.eq("adminCode", code))
    .first();
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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

    // Short, shareable code (6 chars, no look-alikes — see inviteCode.ts).
    // Retry on the rare collision; a few dozen attempts is effectively
    // unbounded odds against ever looping meaningfully.
    let finalSlug = generateInviteCode();
    for (let attempt = 0; attempt < 20; attempt++) {
      const existing = await ctx.db
        .query("profiles")
        .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", finalSlug))
        .first();

      if (!existing) break;

      finalSlug = generateInviteCode();
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
    const profile = await findInviterProfile(ctx, args.slug);

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
          interests: inviteeProfile.interests,
        });
      }
    }

    return {
      name: profile.name,
      imageUrl: profile.imageUrl,
      interests: profile.interests,
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
    const inviterProfile = await findInviterProfile(ctx, args.slug);

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

    // Accepting an invite is also a mutual follow, so the new member hears
    // about the inviter's next project or event (follows.ts).
    await followEachOther(ctx, inviterProfile.userId, userId);

    // Get the new user's profile info for the notification
    // Note: Profile may not exist yet at signup time, so we'll get it later or use user info
    const newUserProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const newUserName = newUserProfile?.name || "Someone";
    const newUserImageUrl = newUserProfile?.imageUrl;
    // /profile/:id takes a profile id, not the invite slug (favorites.ts
    // and likesDigest.ts link the same way).
    const profileLinkUrl = newUserProfile ? `/profile/${newUserProfile._id}` : undefined;

    // Create notification for the inviter
    await ctx.db.insert("notifications", {
      userId: inviterProfile.userId,
      type: "invite_accepted",
      title: "New member joined!",
      message: `${newUserName} joined creatives.exchange using your invite link.`,
      linkUrl: profileLinkUrl,
      imageUrl: newUserImageUrl,
      relatedUserId: userId,
      createdAt: Date.now(),
    });

    const escapedName = escapeHtml(newUserName);
    await scheduleNotificationEmail(ctx, {
      userId: inviterProfile.userId,
      category: "activity",
      subject: `${newUserName} joined using your invite`,
      previewText: `${newUserName} joined creatives.exchange using your invite link.`,
      heading: `${newUserName} joined`,
      body: `<strong>${escapedName}</strong> joined creatives.exchange using your invite link.`,
      ...(profileLinkUrl ? { ctaText: "See their profile", ctaUrl: profileLinkUrl } : {}),
    });

    return true;
  },
});

// The people behind the "N in network" count, for the Network tab in
// Settings: who invited me, everyone I invited, and everyone downstream of
// them, each with enough to render a clickable row. Walks the same
// `invites` rows getInviteStats counts (a repeat redemption of the same
// pair is shown once). The full-table read is the same trade getInviteStats
// already makes; fine at community scale.
export const getMyNetwork = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const usedInvites = (await ctx.db.query("invites").collect()).filter(
      (i) => i.usedBy && i.usedBy !== i.inviterId,
    );

    // inviter -> invitees (deduped), and invitee -> first inviter.
    const children = new Map<string, Id<"users">[]>();
    const joinedAt = new Map<string, number>();
    let invitedById: Id<"users"> | null = null;
    for (const inv of usedInvites) {
      const invitee = inv.usedBy!;
      if (invitee === userId && !invitedById) invitedById = inv.inviterId;
      const list = children.get(inv.inviterId) ?? [];
      if (!list.includes(invitee)) list.push(invitee);
      children.set(inv.inviterId, list);
      const at = inv.usedAt ?? inv.createdAt;
      if (!joinedAt.has(invitee) || at < joinedAt.get(invitee)!) {
        joinedAt.set(invitee, at);
      }
    }

    async function person(id: Id<"users">) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", id))
        .first();
      if (!profile) return null;
      const imageUrl = profile.imageStorageId
        ? await ctx.storage.getUrl(profile.imageStorageId)
        : profile.imageUrl || null;
      return {
        userId: id,
        profileId: profile._id,
        name: profile.name,
        imageUrl,
        interests: profile.interests.slice(0, 3),
        joinedAt: joinedAt.get(id) ?? profile.createdAt,
        invitedCount: (children.get(id) ?? []).length,
      };
    }

    // Breadth-first from me; `seen` guards against cycles in hand-linked data.
    const seen = new Set<string>([userId]);
    const direct: NonNullable<Awaited<ReturnType<typeof person>>>[] = [];
    const downstream: (NonNullable<Awaited<ReturnType<typeof person>>> & {
      depth: number;
      viaName: string;
      viaProfileId: Id<"profiles">;
    })[] = [];

    let frontier: { id: Id<"users">; depth: number; via: typeof direct[number] | null }[] =
      (children.get(userId) ?? []).map((id) => ({ id, depth: 1, via: null }));
    while (frontier.length > 0) {
      const next: typeof frontier = [];
      for (const { id, depth, via } of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        const p = await person(id);
        if (!p) continue;
        if (depth === 1) direct.push(p);
        else
          downstream.push({
            ...p,
            depth,
            viaName: via!.name,
            viaProfileId: via!.profileId,
          });
        for (const child of children.get(id) ?? []) {
          next.push({ id: child, depth: depth + 1, via: p });
        }
      }
      frontier = next;
    }

    const newestFirst = (a: { joinedAt: number }, b: { joinedAt: number }) =>
      b.joinedAt - a.joinedAt;
    direct.sort(newestFirst);
    downstream.sort((a, b) => a.depth - b.depth || newestFirst(a, b));

    return {
      invitedBy: invitedById ? await person(invitedById) : null,
      direct,
      downstream,
    };
  },
});
