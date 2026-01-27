import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Get notifications for the current user
export const getNotifications = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const limit = args.limit || 20;

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    // Enrich with related user info
    const enriched = await Promise.all(
      notifications.map(async (n) => {
        let relatedUserProfile = null;
        if (n.relatedUserId) {
          relatedUserProfile = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", n.relatedUserId!))
            .first();
        }
        return {
          ...n,
          relatedUserProfile: relatedUserProfile
            ? {
                name: relatedUserProfile.name,
                imageUrl: relatedUserProfile.imageUrl,
                inviteSlug: relatedUserProfile.inviteSlug,
              }
            : null,
        };
      }),
    );

    return enriched;
  },
});

// Get count of unread notifications
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_readAt", (q) =>
        q.eq("userId", userId).eq("readAt", undefined),
      )
      .collect();

    return unread.length;
  },
});

// Mark a single notification as read
export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");
    if (notification.userId !== userId) throw new Error("Not authorized");

    if (!notification.readAt) {
      await ctx.db.patch(args.notificationId, {
        readAt: Date.now(),
      });
    }

    return true;
  },
});

// Mark all notifications as read
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_readAt", (q) =>
        q.eq("userId", userId).eq("readAt", undefined),
      )
      .collect();

    const now = Date.now();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { readAt: now })));

    return unread.length;
  },
});

// Internal helper to create a notification (used by other mutations)
export const createNotification = mutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    linkUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    relatedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      linkUrl: args.linkUrl,
      imageUrl: args.imageUrl,
      relatedUserId: args.relatedUserId,
      createdAt: Date.now(),
    });
  },
});
