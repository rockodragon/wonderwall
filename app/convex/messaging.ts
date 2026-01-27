import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { auth } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";

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

// Helper to get blocked user IDs for a user
async function getBlockedUserIds(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Set<Id<"users">>> {
  // Get users this user has blocked
  const blockedByUser = await ctx.db
    .query("blocks")
    .withIndex("by_blockerId", (q) => q.eq("blockerId", userId))
    .collect();

  // Get users who have blocked this user
  const blockedUser = await ctx.db
    .query("blocks")
    .withIndex("by_blockedId", (q) => q.eq("blockedId", userId))
    .collect();

  const blockedIds = new Set<Id<"users">>();
  for (const block of blockedByUser) {
    blockedIds.add(block.blockedId);
  }
  for (const block of blockedUser) {
    blockedIds.add(block.blockerId);
  }

  return blockedIds;
}

/**
 * Get or create a conversation between the current user and another user.
 * Returns the existing conversation if one exists, otherwise creates a new one.
 */
export const getOrCreateConversation = mutation({
  args: {
    otherUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Cannot create conversation with self
    if (userId === args.otherUserId) {
      throw new Error("Cannot create conversation with yourself");
    }

    // Check if conversation already exists
    const allConversations = await ctx.db.query("conversations").collect();
    const existing = allConversations.find(
      (c) =>
        c.participants.includes(userId) &&
        c.participants.includes(args.otherUserId),
    );

    if (existing) {
      return existing;
    }

    // Create new conversation
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      participants: [userId, args.otherUserId],
      lastMessageAt: now,
      createdAt: now,
    });

    const conversation = await ctx.db.get(conversationId);
    return conversation;
  },
});

/**
 * Send a message to another user.
 * Gets or creates a conversation between sender and recipient.
 * Validates content and enforces rate limiting.
 */
export const sendMessage = mutation({
  args: {
    recipientId: v.id("users"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Cannot send message to self
    if (userId === args.recipientId) {
      throw new Error("Cannot send message to yourself");
    }

    // Validate content is not empty
    const trimmedContent = args.content.trim();
    if (!trimmedContent) {
      throw new Error("Message content cannot be empty");
    }

    // Validate content length
    if (trimmedContent.length > 2000) {
      throw new Error("Message content must be 2000 characters or less");
    }

    // Check if either user has blocked the other
    const blockByMe = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", userId).eq("blockedId", args.recipientId),
      )
      .first();

    if (blockByMe) {
      throw new Error("You have blocked this user");
    }

    const blockByThem = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", args.recipientId).eq("blockedId", userId),
      )
      .first();

    if (blockByThem) {
      throw new Error("You cannot send messages to this user");
    }

    // Rate limit: max 5 messages per day per user
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_senderId", (q) => q.eq("senderId", userId))
      .filter((q) => q.gte(q.field("createdAt"), oneDayAgo))
      .collect();

    if (recentMessages.length >= 5) {
      throw new Error(
        "Rate limit exceeded. You can only send 5 messages per day.",
      );
    }

    // Get or create conversation
    const allConversations = await ctx.db.query("conversations").collect();
    let conversation = allConversations.find(
      (c) =>
        c.participants.includes(userId) &&
        c.participants.includes(args.recipientId),
    );

    const now = Date.now();

    let conversationId: Id<"conversations">;

    if (!conversation) {
      // Create new conversation
      conversationId = await ctx.db.insert("conversations", {
        participants: [userId, args.recipientId],
        lastMessageAt: now,
        createdAt: now,
      });
    } else {
      conversationId = conversation._id;
    }

    // Create the message
    await ctx.db.insert("messages", {
      conversationId,
      senderId: userId,
      content: trimmedContent,
      createdAt: now,
    });

    // Update conversation's lastMessageAt
    await ctx.db.patch(conversationId, {
      lastMessageAt: now,
    });

    return conversationId;
  },
});

/**
 * Mark all messages in a conversation as read.
 * Only marks messages where the current user is not the sender and readAt is null.
 */
export const markConversationRead = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify user is a participant in the conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    if (!conversation.participants.includes(userId)) {
      throw new Error("You are not a participant in this conversation");
    }

    // Get all unread messages sent by the other user
    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("senderId"), userId),
          q.eq(q.field("readAt"), undefined),
        ),
      )
      .collect();

    // Mark each message as read
    const now = Date.now();
    for (const message of unreadMessages) {
      await ctx.db.patch(message._id, {
        readAt: now,
      });
    }

    return { markedCount: unreadMessages.length };
  },
});

/**
 * Get all conversations for the current user
 * Returns conversations sorted by lastMessageAt (newest first)
 * Includes other participant's profile info, last message preview, and unread count
 * Excludes conversations with blocked users
 */
export const getConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    // Get blocked user IDs
    const blockedUserIds = await getBlockedUserIds(ctx, userId);

    // Get all conversations and filter to ones where user is a participant
    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .collect();

    const userConversations = allConversations.filter((conv) =>
      conv.participants.includes(userId),
    );

    // Build conversation data with participant info, last message, and unread count
    const conversationsWithDetails = await Promise.all(
      userConversations.map(async (conversation) => {
        // Get the other participant's userId
        const otherUserId = conversation.participants.find((p) => p !== userId);
        if (!otherUserId) return null;

        // Skip conversations with blocked users
        if (blockedUserIds.has(otherUserId)) return null;

        // Get other participant's profile
        const otherProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", otherUserId))
          .first();

        if (!otherProfile) return null;

        // Resolve profile image URL
        const imageUrl = await resolveImageUrl(ctx, otherProfile);

        // Get the last message for preview
        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversationId_createdAt", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .order("desc")
          .first();

        // Get unread count (messages from other user that haven't been read)
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .collect();

        const unreadCount = messages.filter(
          (m) => m.senderId !== userId && m.readAt === undefined,
        ).length;

        // Create last message preview (first 50 chars)
        const lastMessagePreview = lastMessage
          ? lastMessage.content.length > 50
            ? lastMessage.content.substring(0, 50) + "..."
            : lastMessage.content
          : null;

        return {
          _id: conversation._id,
          lastMessageAt: conversation.lastMessageAt,
          createdAt: conversation.createdAt,
          participant: {
            userId: otherUserId,
            profileId: otherProfile._id,
            name: otherProfile.name,
            imageUrl,
          },
          lastMessagePreview,
          lastMessageSenderId: lastMessage?.senderId ?? null,
          unreadCount,
        };
      }),
    );

    // Filter out null values (from blocked users or missing profiles)
    return conversationsWithDetails.filter(
      (conv): conv is NonNullable<typeof conv> => conv !== null,
    );
  },
});

/**
 * Get messages in a conversation with cursor-based pagination
 * Verifies user is a participant
 * Returns messages sorted by createdAt (oldest first for display)
 */
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return { messages: [], nextCursor: null };

    // Get the conversation and verify user is a participant
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return { messages: [], nextCursor: null };

    if (!conversation.participants.includes(userId)) {
      return { messages: [], nextCursor: null };
    }

    const limit = args.limit ?? 50;

    // Get messages for this conversation
    const messagesQuery = ctx.db
      .query("messages")
      .withIndex("by_conversationId_createdAt", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc"); // Get newest first for pagination

    const allMessages = await messagesQuery.collect();

    // If cursor provided, find the position and start from there
    let startIndex = 0;
    if (args.cursor) {
      const cursorIndex = allMessages.findIndex((m) => m._id === args.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    // Get the requested page of messages
    const pageMessages = allMessages.slice(startIndex, startIndex + limit);

    // Determine next cursor
    const nextCursor =
      startIndex + limit < allMessages.length
        ? (pageMessages[pageMessages.length - 1]?._id ?? null)
        : null;

    // Reverse to get oldest first for display
    const messagesOldestFirst = pageMessages.reverse();

    // Get sender profiles for each message
    const messagesWithSenderInfo = await Promise.all(
      messagesOldestFirst.map(async (message) => {
        const senderProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", message.senderId))
          .first();

        let senderImageUrl: string | null = null;
        if (senderProfile) {
          senderImageUrl = await resolveImageUrl(ctx, senderProfile);
        }

        return {
          ...message,
          sender: senderProfile
            ? {
                userId: message.senderId,
                profileId: senderProfile._id,
                name: senderProfile.name,
                imageUrl: senderImageUrl,
              }
            : null,
          isOwnMessage: message.senderId === userId,
        };
      }),
    );

    return {
      messages: messagesWithSenderInfo,
      nextCursor,
    };
  },
});

/**
 * Get a single conversation by ID with participant details
 * Used for the conversation header
 */
export const getConversation = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    // Verify user is a participant
    if (!conversation.participants.includes(userId)) {
      return null;
    }

    // Get the other participant
    const otherUserId = conversation.participants.find((p) => p !== userId);
    if (!otherUserId) return null;

    // Get other participant's profile
    const otherProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", otherUserId))
      .first();

    if (!otherProfile) return null;

    // Resolve profile image URL
    const imageUrl = await resolveImageUrl(ctx, otherProfile);

    return {
      _id: conversation._id,
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.lastMessageAt,
      participant: {
        userId: otherUserId,
        profileId: otherProfile._id,
        name: otherProfile.name,
        imageUrl,
      },
    };
  },
});

/**
 * Get total unread message count for nav badge
 * Counts all messages where senderId != userId and readAt is null
 * Only counts from conversations where user is a participant
 * Excludes conversations with blocked users
 */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;

    // Get blocked user IDs
    const blockedUserIds = await getBlockedUserIds(ctx, userId);

    // Get all conversations where user is a participant
    const allConversations = await ctx.db.query("conversations").collect();

    const userConversations = allConversations.filter((conv) =>
      conv.participants.includes(userId),
    );

    // Filter out conversations with blocked users
    const validConversations = userConversations.filter((conv) => {
      const otherUserId = conv.participants.find((p) => p !== userId);
      return otherUserId && !blockedUserIds.has(otherUserId);
    });

    // Count unread messages across all valid conversations
    let totalUnread = 0;

    for (const conversation of validConversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId", (q) =>
          q.eq("conversationId", conversation._id),
        )
        .collect();

      const unreadInConversation = messages.filter(
        (m) => m.senderId !== userId && m.readAt === undefined,
      ).length;

      totalUnread += unreadInConversation;
    }

    return totalUnread;
  },
});
