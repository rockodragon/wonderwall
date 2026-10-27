// Conversation summaries are operational state, not a copy of message content.
// All reads used to seed an old conversation are indexed and bounded.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { blockBetween } from "../blocks";
import { getLoopRow } from "./settings";

type ReadCtx = QueryCtx | MutationCtx;
type Summary = Doc<"conversationParticipants">;

export async function getParticipantSummary(
  ctx: ReadCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<Summary | null> {
  return ctx.db.query("conversationParticipants")
    .withIndex("by_userId_conversationId", q => q.eq("userId", userId).eq("conversationId", conversationId))
    .unique();
}

export async function firstUnansweredUnread(
  ctx: ReadCtx,
  conversationId: Id<"conversations">,
  otherUserId: Id<"users">,
  after?: number,
) {
  return ctx.db.query("messages")
    .withIndex("by_conversationId_senderId_readAt_createdAt", q => {
      const unread = q.eq("conversationId", conversationId).eq("senderId", otherUserId).eq("readAt", undefined);
      return after === undefined ? unread : unread.gt("createdAt", after);
    }).order("asc").first();
}

/** Seed exact first/last state without loading a thread into memory. */
export async function ensureConversationSummaries(ctx: MutationCtx, conversation: Doc<"conversations">) {
  const summaries: Summary[] = [];
  for (const userId of conversation.participants) {
    const otherUserId = conversation.participants.find(id => id !== userId);
    if (!otherUserId) continue;
    const existing = await getParticipantSummary(ctx, conversation._id, userId);
    if (existing?.historyComplete) {
      summaries.push(existing);
      continue;
    }
    const endpoint = (senderId: Id<"users">, order: "asc" | "desc") => ctx.db.query("messages")
      .withIndex("by_conversationId_senderId_createdAt", q => q.eq("conversationId", conversation._id).eq("senderId", senderId))
      .order(order).first();
    const [firstInbound, firstOutbound, lastInbound, lastOutbound, firstMessage] = await Promise.all([
      endpoint(otherUserId, "asc"), endpoint(userId, "asc"), endpoint(otherUserId, "desc"), endpoint(userId, "desc"),
      ctx.db.query("messages").withIndex("by_conversationId_createdAt", q => q.eq("conversationId", conversation._id)).order("asc").first(),
    ]);
    const [unread, waiting] = await Promise.all([
      firstUnansweredUnread(ctx, conversation._id, otherUserId, lastOutbound?.createdAt),
      ctx.db.query("messages")
        .withIndex("by_conversationId_senderId_createdAt", q => {
          const fromOther = q.eq("conversationId", conversation._id).eq("senderId", otherUserId);
          return lastOutbound ? fromOther.gt("createdAt", lastOutbound.createdAt) : fromOther;
        }).order("asc").first(),
    ]);
    const data = {
      conversationId: conversation._id, userId, otherUserId,
      lastMessageAt: Math.max(lastInbound?.createdAt ?? 0, lastOutbound?.createdAt ?? 0, conversation.createdAt),
      firstInboundAt: firstInbound?.createdAt, firstOutboundAt: firstOutbound?.createdAt,
      lastInboundAt: lastInbound?.createdAt, lastOutboundAt: lastOutbound?.createdAt,
      firstReplyAt: firstMessage?.senderId !== userId && firstOutbound ? firstOutbound.createdAt : undefined,
      awaitingReplySince: waiting?.createdAt,
      unreadSince: unread?.createdAt,
      historyComplete: true,
    };
    let id: Id<"conversationParticipants">;
    if (existing) { id = existing._id; await ctx.db.patch(id, data); }
    else id = await ctx.db.insert("conversationParticipants", data);
    const row = await ctx.db.get(id);
    if (row) summaries.push(row);
  }
  return summaries;
}

/** Update both sides inside the same transaction as the message write. */
export async function recordMessageSummary(
  ctx: MutationCtx,
  summaries: Summary[],
  senderId: Id<"users">,
  createdAt: number,
): Promise<boolean> {
  let firstReply = false;
  for (const summary of summaries) {
    if (summary.userId === senderId) {
      firstReply = summary.firstOutboundAt === undefined && summary.firstInboundAt !== undefined;
      await ctx.db.patch(summary._id, {
        lastMessageAt: createdAt,
        firstOutboundAt: summary.firstOutboundAt ?? createdAt,
        lastOutboundAt: createdAt,
        ...(firstReply ? { firstReplyAt: createdAt } : {}),
        awaitingReplySince: undefined, unreadSince: undefined,
      });
    } else {
      await ctx.db.patch(summary._id, {
        lastMessageAt: createdAt,
        firstInboundAt: summary.firstInboundAt ?? createdAt,
        lastInboundAt: createdAt,
        awaitingReplySince: summary.awaitingReplySince ?? createdAt,
        unreadSince: summary.unreadSince ?? createdAt,
      });
    }
  }
  return firstReply;
}

/** Shared by attention preview, queueing and the final dispatch check. */
export async function conversationReminderEligibility(
  ctx: ReadCtx,
  args: { conversationId: Id<"conversations">; userId: Id<"users">; cutoff: number; messageId?: Id<"messages"> },
): Promise<{ eligible: boolean; reason: string; summary?: Summary; messageId?: Id<"messages">; otherUserId?: Id<"users"> }> {
  const summary = await getParticipantSummary(ctx, args.conversationId, args.userId);
  if (!summary?.historyComplete) return { eligible: false, reason: "history_incomplete" };
  const [conversation, user, other] = await Promise.all([
    ctx.db.get(args.conversationId), ctx.db.get(args.userId), ctx.db.get(summary.otherUserId),
  ]);
  if (!conversation?.participants.includes(args.userId) || !conversation.participants.includes(summary.otherUserId) || !user || !other)
    return { eligible: false, reason: "unavailable" };
  if (await blockBetween(ctx, args.userId, summary.otherUserId)) return { eligible: false, reason: "blocked" };
  // Read authoritative message rows again: a reply/read between preview and
  // dispatch must cancel the scheduled contact.
  const lastOutbound = await ctx.db.query("messages")
    .withIndex("by_conversationId_senderId_createdAt", q => q.eq("conversationId", args.conversationId).eq("senderId", args.userId))
    .order("desc").first();
  const unread = await firstUnansweredUnread(ctx, args.conversationId, summary.otherUserId, lastOutbound?.createdAt);
  if (!unread) return { eligible: false, reason: "read_or_replied" };
  if (unread.createdAt > args.cutoff) return { eligible: false, reason: "too_recent" };
  if (args.messageId && unread._id !== args.messageId) return { eligible: false, reason: "source_changed" };
  return { eligible: true, reason: "unread_inbound", summary, messageId: unread._id, otherUserId: summary.otherUserId };
}

/** Operator-run bounded migration. Continue with the returned cursor. */
/** Brings summaries in step after an operator tool moved `from`'s
 * conversations to `to` (admin/mergeUsers.ts, admin/accountToOrganization.ts):
 * a deleted conversation's summaries go; `from`'s passes to `to` (keeping
 * its read state) unless `to` already has one there; each survivor is
 * recomputed from the messages, which may have moved in from another. */
export async function resummarizeConversations(
  ctx: MutationCtx,
  conversationIds: Iterable<Id<"conversations">>,
  from: Id<"users">,
  to: Id<"users">,
) {
  for (const conversationId of new Set(conversationIds)) {
    const rows = await ctx.db.query("conversationParticipants")
      .withIndex("by_conversationId", q => q.eq("conversationId", conversationId))
      .collect();
    const conversation = await ctx.db.get(conversationId);
    const live = conversation && conversation.participants.length > 1 ? conversation : null;
    const seen = new Set<Id<"users">>();
    for (const row of rows.sort((a, b) => Number(b.userId === to) - Number(a.userId === to))) {
      const userId = row.userId === from ? to : row.userId;
      if (!live || !live.participants.includes(userId) || seen.has(userId)) {
        await ctx.db.delete(row._id);
        continue;
      }
      seen.add(userId);
      await ctx.db.patch(row._id, { userId, historyComplete: false });
    }
    if (live) await ensureConversationSummaries(ctx, live);
  }
}

export const backfillConversationSummaries = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("conversations").paginate({ cursor: args.cursor ?? null, numItems: 20 });
    for (const conversation of page.page) await ensureConversationSummaries(ctx, conversation);
    const state = await getLoopRow(ctx, "conversation_summary_backfill");
    const data = { enabled: page.isDone, subject: "Conversation summary migration", body: page.isDone ? "Complete" : page.continueCursor, updatedAt: Date.now() };
    if (state) await ctx.db.patch(state._id, data);
    else await ctx.db.insert("engagementLoops", { key: "conversation_summary_backfill", ...data });
    return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length };
  },
});
