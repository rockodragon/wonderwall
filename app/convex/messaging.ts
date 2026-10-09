import { v, ConvexError } from "convex/values";
import { escapeHtml } from "./email/template";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { auth } from "./auth";
import { scheduleNotificationEmail } from "./emailHelpers";
import type { Doc, Id } from "./_generated/dataModel";
import { isEventHost } from "./eventHosts";

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
 * Whether `guestId` is on the guest list of an event `hostId` hosts —
 * the same three places events.getGuestList reads: a request to join (any
 * status), an RSVP, or a paid ticket. A host writing to their own guests
 * isn't a cold message, so it doesn't count toward the daily limit.
 */
export async function isHostsGuest(
  ctx: QueryCtx,
  hostId: Id<"users">,
  guestId: Id<"users">,
): Promise<boolean> {
  const eventIds = new Set<Id<"events">>();
  for (const a of await ctx.db
    .query("eventApplications")
    .withIndex("by_applicantId", (q) => q.eq("applicantId", guestId))
    .collect()) {
    eventIds.add(a.eventId);
  }
  for (const r of await ctx.db
    .query("eventRsvps")
    .withIndex("by_userId", (q) => q.eq("userId", guestId))
    .collect()) {
    eventIds.add(r.eventId);
  }
  for (const p of await ctx.db
    .query("ticketPurchases")
    .withIndex("by_userId", (q) => q.eq("userId", guestId))
    .collect()) {
    if (p.status === "paid") eventIds.add(p.eventId);
  }
  for (const eventId of eventIds) {
    const event = await ctx.db.get(eventId);
    if (event && isEventHost(event, hostId)) return true;
  }
  return false;
}

/**
 * Get or create a conversation between the current user and another user.
 * Returns the existing conversation if one exists, otherwise creates a new one.
 */
// Messages a day to people who haven't written back yet.
export function coldMessageLimit(isMember: boolean): number {
  return isMember ? 50 : 5;
}

export function coldLimitMessage(isMember: boolean): string {
  return isMember
    ? "You've sent 50 messages today to people who haven't written back. Replies don't count. Try again tomorrow."
    : "You've sent 5 messages today to people who haven't written back. Replies don't count. Members can send 50.";
}

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

    // Refuse in either direction when a block exists (following.md §1 #8 —
    // until now only sendMessage checked; the "Message" button on a profile
    // could still open a thread). Same bidirectional set getConversations
    // filters with. ConvexError so the client can read `data.code`.
    const blockedUserIds = await getBlockedUserIds(ctx, userId);
    if (blockedUserIds.has(args.otherUserId)) {
      throw new ConvexError({ code: "blocked" });
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
      throw new ConvexError("You blocked this person. Unblock them to send a message.");
    }

    const blockByThem = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", args.recipientId).eq("blockedId", userId),
      )
      .first();

    if (blockByThem) {
      throw new ConvexError("You can't message this person.");
    }

    const senderProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    // Get or create conversation
    const allConversations = await ctx.db.query("conversations").collect();
    let conversation = allConversations.find(
      (c) =>
        c.participants.includes(userId) &&
        c.participants.includes(args.recipientId),
    );

    // Daily limit on cold messages — ones to someone who hasn't written
    // back. Replying in a real conversation is never limited. Admins skip it,
    // and so does a host writing to their own event's guests.
    const otherReplied = async (conversationId: Id<"conversations">) =>
      (await ctx.db
        .query("messages")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
        .filter((q) => q.neq(q.field("senderId"), userId))
        .first()) !== null;
    const notCold = async (conversationId: Id<"conversations">) => {
      if (await otherReplied(conversationId)) return true;
      const other = (await ctx.db.get(conversationId))?.participants.find((p) => p !== userId);
      return !!other && (await isHostsGuest(ctx, userId, other));
    };

    if (
      !senderProfile?.isAdmin &&
      !(conversation && (await otherReplied(conversation._id))) &&
      !(await isHostsGuest(ctx, userId, args.recipientId))
    ) {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentMessages = await ctx.db
        .query("messages")
        .withIndex("by_senderId", (q) => q.eq("senderId", userId))
        .filter((q) => q.gte(q.field("createdAt"), oneDayAgo))
        .collect();
      const perConversation = new Map<Id<"conversations">, number>();
      for (const m of recentMessages) {
        perConversation.set(m.conversationId, (perConversation.get(m.conversationId) ?? 0) + 1);
      }
      let coldSent = 0;
      for (const [conversationId, count] of perConversation) {
        if (!(await notCold(conversationId))) coldSent += count;
      }

      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const isMember = memberships.some((m) => m.status === "active" || m.status === "past_due");
      const limit = coldMessageLimit(isMember);
      if (coldSent >= limit) {
        throw new ConvexError(coldLimitMessage(isMember));
      }
    }

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

    // One email per unread burst, not one per message: check (before
    // inserting this message, so the check naturally excludes it) whether
    // the recipient already has another unread message from this sender in
    // this conversation. If so, they already got an email for this burst —
    // this message still gets the in-app notification below, just no
    // second email. No index covers (conversationId, senderId, readAt)
    // together, so this filters on the by_conversationId index.
    const earlierUnreadFromSender = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .filter((q) =>
        q.and(q.eq(q.field("senderId"), userId), q.eq(q.field("readAt"), undefined)),
      )
      .first();

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

    // Notify the recipient (reuse senderProfile from rate limit check)
    const senderName = senderProfile?.name || "Someone";
    await ctx.db.insert("notifications", {
      userId: args.recipientId,
      type: "new_message",
      title: `${senderName} sent you a message`,
      message:
        trimmedContent.length > 100
          ? trimmedContent.slice(0, 100) + "..."
          : trimmedContent,
      linkUrl: `/messages/${conversationId}`,
      relatedUserId: userId,
      createdAt: now,
    });

    // Send email notification — only for the first unread message in a
    // burst (see earlierUnreadFromSender above). A recipient reading
    // messages one at a time as they arrive still gets an email per burst,
    // never per message.
    if (!earlierUnreadFromSender) {
      await scheduleNotificationEmail(ctx, {
        userId: args.recipientId,
        subject: `${senderName} sent you a message`,
        previewText: trimmedContent.slice(0, 80),
        heading: "New message",
        body: `<strong>${escapeHtml(senderName)}</strong> sent you a message: "${escapeHtml(trimmedContent.length > 200 ? trimmedContent.slice(0, 200) + "..." : trimmedContent)}"`,
        ctaText: "View Message",
        ctaUrl: `/messages/${conversationId}`,
        category: "activity",
      });
    }

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

// ——— Blocking (docs/features/following.md §1 #8) ———
//
// The `blocks` table and every read path (getBlockedUserIds, sendMessage,
// getConversations, getUnreadCount) predate this; nothing wrote it. These
// take USERS ids — a block is between two accounts, not two profiles — so a
// client holding a profile (profile.tsx) passes `profile.userId`. listBlocked
// resolves the profile id back for linking, since /profile/:id routes on
// profiles._id.

/**
 * Block a user. Idempotent: a second call finds the existing row via
 * by_blocker_blocked and returns it instead of inserting a duplicate.
 */
export const blockUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const me = await auth.getUserId(ctx);
    if (!me) throw new ConvexError({ code: "unauthenticated" });

    if (me === args.userId) {
      throw new ConvexError({
        code: "invalid_target",
        reason: "You can't block yourself.",
      });
    }

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", me).eq("blockedId", args.userId),
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("blocks", {
      blockerId: me,
      blockedId: args.userId,
      createdAt: Date.now(),
    });
  },
});

/**
 * Unblock a user. No-op when there is no block to remove.
 */
export const unblockUser = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const me = await auth.getUserId(ctx);
    if (!me) throw new ConvexError({ code: "unauthenticated" });

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", me).eq("blockedId", args.userId),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});

/**
 * Have I blocked this user? Only my own direction is reported — whether
 * they've blocked me stays private to them.
 */
export const isBlocked = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const me = await auth.getUserId(ctx);
    if (!me) return { blockedByMe: false };

    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", me).eq("blockedId", args.userId),
      )
      .first();

    return { blockedByMe: existing !== null };
  },
});

/**
 * People I've blocked, most recent first — the "Blocked people" list in
 * Settings. Each row carries both ids: `userId` for unblockUser, `profileId`
 * for linking (null if they have no profile, in which case the name falls
 * back to "Someone"). Image resolved the same way getConversations does.
 */
export const listBlocked = query({
  args: {},
  handler: async (ctx) => {
    const me = await auth.getUserId(ctx);
    if (!me) return [];

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_blockerId", (q) => q.eq("blockerId", me))
      .collect();

    const rows = await Promise.all(
      blocks.map(async (block) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", block.blockedId))
          .first();

        return {
          userId: block.blockedId,
          profileId: profile ? profile._id : null,
          name: profile?.name || "Someone",
          imageUrl: profile ? await resolveImageUrl(ctx, profile) : null,
          blockedAt: block.createdAt,
        };
      }),
    );

    rows.sort((a, b) => b.blockedAt - a.blockedAt);
    return rows;
  },
});

// ——— Starting a conversation ———
//
// "New message" on /messages: an autocomplete over people to write to. The
// people you follow come first. Nothing here is a new rule: it only leaves out
// who getOrCreateConversation would refuse (a block either way) plus yourself
// and unnamed placeholder profiles. The daily limit on messages to people who
// haven't written back is checked when a message is sent (sendMessage), not
// when a conversation is opened, so it doesn't shape this list.

/** Most people one search returns. */
export const PEOPLE_TO_MESSAGE_LIMIT = 8;

/** A typed search this short only narrows the people you follow. From here it
 * also looks through every member. */
export const PEOPLE_SEARCH_MIN_CHARS = 2;

// Follows read, newest first. An empty box needs a few more than it shows (some
// get skipped); a typed one has to see them all to match by name.
const FOLLOWS_READ_EMPTY = 40;
const FOLLOWS_READ_TYPED = 500;

/** What's typed, ready to compare: trimmed and lowercased. */
export function normalizePeopleQuery(text: string): string {
  return text.trim().toLowerCase();
}

const PLACEHOLDER_NAME = "new user";

/**
 * Who to offer, and in what order. Pure; searchPeopleToMessage loads the rows.
 *
 *  - Never offered: yourself, anyone in `blockedUserIds`, or a profile with no
 *    name or the "New User" placeholder.
 *  - Nothing typed: the people you follow, in the order `followed` comes
 *    (newest follow first). `members` is ignored.
 *  - One character: the same, narrowed to names containing it.
 *  - Two or more: followed people whose name contains the text, then other
 *    members whose name does. Case doesn't matter.
 *  - Inside each group a name that starts with the text comes first, then one
 *    with a word that starts with it, then any other match. Ties keep the
 *    order given for followed people (newest follow first) and go A to Z for
 *    other members.
 *  - Up to `limit` in all. `following` says which group a row came from.
 */
export function rankPeopleToMessage<T extends { userId: string; name: string }>(args: {
  followed: readonly T[];
  members: readonly T[];
  query: string;
  selfUserId: string;
  blockedUserIds: ReadonlySet<string>;
  limit?: number;
}): Array<T & { following: boolean }> {
  const limit = args.limit ?? PEOPLE_TO_MESSAGE_LIMIT;
  const needle = normalizePeopleQuery(args.query);

  // 0: name starts with it. 1: a word in it does. 2: it's somewhere inside.
  // null: no match. Nothing typed matches everyone, in the order given.
  const matchRank = (name: string): number | null => {
    if (!needle) return 0;
    const at = name.toLowerCase().indexOf(needle);
    if (at === -1) return null;
    if (at === 0) return 0;
    return /[^\p{L}\p{N}]/u.test(name[at - 1]) ? 1 : 2;
  };

  const pick = (people: readonly T[], aToZ: boolean): T[] => {
    const seen = new Set<string>();
    const hits: { person: T; rank: number; order: number }[] = [];
    people.forEach((person, order) => {
      const name = person.name.trim();
      if (
        !name ||
        name.toLowerCase() === PLACEHOLDER_NAME ||
        person.userId === args.selfUserId ||
        args.blockedUserIds.has(person.userId) ||
        seen.has(person.userId)
      ) {
        return;
      }
      const rank = matchRank(name);
      if (rank === null) return;
      seen.add(person.userId);
      hits.push({ person, rank, order });
    });
    hits.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (aToZ) {
        const an = a.person.name.trim().toLowerCase();
        const bn = b.person.name.trim().toLowerCase();
        if (an !== bn) return an < bn ? -1 : 1;
      }
      return a.order - b.order;
    });
    return hits.map((h) => h.person);
  };

  const followedIds = new Set(args.followed.map((p) => p.userId));
  const followedHits = pick(args.followed, false);
  const memberHits =
    needle.length >= PEOPLE_SEARCH_MIN_CHARS
      ? pick(
          args.members.filter((p) => !followedIds.has(p.userId)),
          true,
        )
      : [];

  return [
    ...followedHits.map((p) => ({ ...p, following: true })),
    ...memberHits.map((p) => ({ ...p, following: false })),
  ].slice(0, limit);
}

/**
 * People to start a conversation with, for the New message box. Signed out:
 * none. The people you follow (a `favorites` row with targetType "profile")
 * are read by index; every profile is only read for a typed search of two or
 * more characters. Order and caps are rankPeopleToMessage's. Each row has
 * what getConversations gives for a participant (uploaded photos resolved the
 * same way) plus `following`.
 */
export const searchPeopleToMessage = query({
  args: {
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await auth.getUserId(ctx);
    if (!me) return [];

    const text = args.query ?? "";
    const needle = normalizePeopleQuery(text);
    const blockedUserIds = await getBlockedUserIds(ctx, me);

    type Candidate = {
      userId: Id<"users">;
      profileId: Id<"profiles">;
      name: string;
      profile: Doc<"profiles">;
    };
    const candidate = (profile: Doc<"profiles">): Candidate => ({
      userId: profile.userId,
      profileId: profile._id,
      name: profile.name,
      profile,
    });

    // Who I follow, newest first. targetId is a PROFILE id.
    const follows = await ctx.db
      .query("favorites")
      .withIndex("by_userId_type", (q) => q.eq("userId", me).eq("targetType", "profile"))
      .order("desc")
      .take(needle ? FOLLOWS_READ_TYPED : FOLLOWS_READ_EMPTY);
    const followedProfiles = await Promise.all(
      follows.map((f) => {
        const profileId = ctx.db.normalizeId("profiles", f.targetId);
        return profileId ? ctx.db.get(profileId) : null;
      }),
    );
    const followed = followedProfiles
      .filter((p): p is Doc<"profiles"> => p !== null)
      .map(candidate);

    // Everyone else, only for a real search. The read is every profile; only
    // the ones whose name contains the text are kept.
    const members: Candidate[] = [];
    if (needle.length >= PEOPLE_SEARCH_MIN_CHARS) {
      for await (const profile of ctx.db.query("profiles")) {
        if (profile.name.toLowerCase().includes(needle)) members.push(candidate(profile));
      }
    }

    const ranked = rankPeopleToMessage({
      followed,
      members,
      query: text,
      selfUserId: me,
      blockedUserIds,
    });

    return await Promise.all(
      ranked.map(async (p) => ({
        userId: p.userId,
        profileId: p.profileId,
        name: p.name,
        imageUrl: await resolveImageUrl(ctx, p.profile),
        following: p.following,
      })),
    );
  },
});
