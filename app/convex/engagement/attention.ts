import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getProfileByUserId, requireAdminCtx } from "../helpers";
import { fail } from "../errors";
import { blockBetween } from "../blocks";
import { contactEligibility } from "../emailDeliveries";
import { isPostedProject } from "./rules";
import { getLoopRow } from "./settings";
import { readUnreadReminder, UNREAD_REMINDER_DELAY_MS, UNREAD_REMINDER_KEY } from "./reminderSettings";

const reasonValidator = v.union(v.literal("unanswered"), v.literal("newcomer"), v.literal("invite"));
type Reason = "unanswered" | "newcomer" | "invite";
type ReadCtx = QueryCtx | MutationCtx;
const PAGE_SIZE = 25;
const WINDOW_MS = 14 * UNREAD_REMINDER_DELAY_MS;

/** An incomplete sample never establishes that somebody is inactive. */
async function activation(ctx: ReadCtx, userId: Id<"users">) {
  const [projects, follows, conversations] = await Promise.all([
    ctx.db.query("projects").withIndex("by_userId", q => q.eq("userId", userId)).take(26),
    ctx.db.query("favorites").withIndex("by_userId_type", q => q.eq("userId", userId).eq("targetType", "profile")).take(26),
    ctx.db.query("conversationParticipants").withIndex("by_userId_lastMessageAt", q => q.eq("userId", userId)).take(26),
  ]);
  if (projects.some(isPostedProject) || follows.some(row => row.origin === "user") ||
    conversations.some(row => row.firstInboundAt !== undefined && row.firstOutboundAt !== undefined)) return "active";
  if (projects.length > 25 || follows.length > 25 || conversations.length > 25 ||
    follows.some(row => row.origin === undefined) || conversations.some(row => !row.historyComplete)) return "unknown";
  return "inactive";
}

async function migrationComplete(ctx: ReadCtx) {
  // The operator marks completion only after following the bounded migration cursor.
  const row = await getLoopRow(ctx, "conversation_summary_backfill");
  return row?.enabled === true;
}

async function candidate(ctx: ReadCtx, reason: Reason, sourceId: string, now: number) {
  let userId: Id<"users">;
  let sourceAt: number;
  let conversationId: Id<"conversations"> | undefined;
  let inviterId: Id<"users"> | undefined;
  if (reason === "unanswered") {
    const row = await ctx.db.get(sourceId as Id<"conversationParticipants">);
    if (!row?.historyComplete || row.awaitingReplySince === undefined || row.awaitingReplySince > now - UNREAD_REMINDER_DELAY_MS) return null;
    if (await blockBetween(ctx, row.userId, row.otherUserId)) return null;
    const conversation = await ctx.db.get(row.conversationId);
    if (!conversation?.participants.includes(row.userId) || !conversation.participants.includes(row.otherUserId)) return null;
    userId = row.userId; sourceAt = row.awaitingReplySince; conversationId = row.conversationId;
  } else if (reason === "newcomer") {
    const row = await ctx.db.get(sourceId as Id<"profiles">);
    if (!row) return null;
    userId = row.userId; sourceAt = row.createdAt;
  } else {
    const row = await ctx.db.get(sourceId as Id<"invites">);
    if (!row?.usedBy || row.usedAt === undefined) return null;
    if (await blockBetween(ctx, row.usedBy, row.inviterId)) return null;
    userId = row.usedBy; sourceAt = row.usedAt; inviterId = row.inviterId;
  }
  if (reason !== "unanswered") {
    if (sourceAt > now - UNREAD_REMINDER_DELAY_MS || sourceAt < now - WINDOW_MS) return null;
    if (!(await migrationComplete(ctx))) return { unknown: true as const };
    const state = await activation(ctx, userId);
    if (state === "unknown") return { unknown: true as const };
    if (state !== "inactive") return null;
  }
  const profile = await getProfileByUserId(ctx, userId);
  if (!profile || !(await ctx.db.get(userId))) return null;
  const candidateKey = JSON.stringify([reason, sourceId]);
  const meta = await ctx.db.query("engagementAttention").withIndex("by_candidateKey", q => q.eq("candidateKey", candidateKey)).unique();
  const contact = await contactEligibility(ctx, {
    userId, category: "activity", ...(conversationId ? { goal: "unread_message" as const, conversationId, journeyKey: UNREAD_REMINDER_KEY } : {}),
  }, now);
  const recent = await ctx.db.query("emailDeliveries")
    .withIndex("by_recipientUserId_createdAt", q => q.eq("recipientUserId", userId)).order("desc").first();
  return {
    unknown: false as const, candidateKey, reason, userId, profileId: profile._id, name: profile.name,
    sourceAt, conversationId, inviterId, ownerId: meta?.ownerId,
    snoozedUntil: meta?.snoozedUntil, reviewedAt: meta?.reviewedAt,
    lastContact: recent ? { status: recent.status, at: recent.acceptedAt ?? recent.createdAt } : null,
    contact: { eligible: contact.eligible, reason: contact.reason },
  };
}

export const list = query({
  args: { reason: reasonValidator, cursor: v.optional(v.string()) },
  handler: async (ctx, { reason, cursor }) => {
    await requireAdminCtx(ctx);
    const now = Date.now();
    const cutoff = now - UNREAD_REMINDER_DELAY_MS;
    const options = { cursor: cursor ?? null, numItems: PAGE_SIZE };
    const page = reason === "unanswered"
      ? await ctx.db.query("conversationParticipants").withIndex("by_awaitingReplySince", q => q.gt("awaitingReplySince", 0).lte("awaitingReplySince", cutoff)).paginate(options)
      : reason === "newcomer"
        ? await ctx.db.query("profiles").withIndex("by_createdAt", q => q.gte("createdAt", now - WINDOW_MS).lte("createdAt", cutoff)).paginate(options)
        : await ctx.db.query("invites").withIndex("by_usedAt", q => q.gte("usedAt", now - WINDOW_MS).lte("usedAt", cutoff)).paginate(options);
    const items: NonNullable<Awaited<ReturnType<typeof candidate>>>[] = [];
    let unknown = 0;
    for (const row of page.page) {
      const item = await candidate(ctx, reason, row._id, now);
      if (item?.unknown) unknown++;
      else if (item && (item.snoozedUntil ?? 0) <= now && (item.reviewedAt ?? 0) < item.sourceAt) items.push(item);
    }
    return {
      items: items.filter((item): item is Exclude<typeof item, { unknown: true }> => !item.unknown),
      nextCursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, asOf: now,
      coverage: { scanned: page.page.length, returned: items.length, unknown, bounded: true as const, migrationComplete: await migrationComplete(ctx) },
    };
  },
});

export const update = mutation({
  args: { candidateKey: v.string(), action: v.union(v.literal("claim"), v.literal("snooze"), v.literal("review")) },
  handler: async (ctx, { candidateKey, action }) => {
    const operator = await requireAdminCtx(ctx);
    let item: Awaited<ReturnType<typeof candidate>> = null;
    try {
      const [reason, sourceId] = JSON.parse(candidateKey);
      if (!["unanswered", "newcomer", "invite"].includes(reason) || typeof sourceId !== "string") fail("invalid_argument", "Choose a current attention item.");
      item = await candidate(ctx, reason, sourceId, Date.now());
    } catch { fail("invalid_argument", "Choose a current attention item."); }
    if (!item || item.unknown || item.candidateKey !== candidateKey) fail("not_found", "This item no longer needs attention.");
    const existing = await ctx.db.query("engagementAttention").withIndex("by_candidateKey", q => q.eq("candidateKey", candidateKey)).unique();
    const data = { candidateKey, userId: item.userId, reason: item.reason, updatedAt: Date.now(), updatedBy: operator,
      ...(action === "claim" ? { ownerId: operator } : action === "snooze" ? { snoozedUntil: Date.now() + UNREAD_REMINDER_DELAY_MS } : { reviewedAt: Date.now() }) };
    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert("engagementAttention", data);
  },
});

export const getUnreadReminder = query({
  args: {}, handler: async ctx => { await requireAdminCtx(ctx); return readUnreadReminder(ctx); },
});

export const setUnreadReminder = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const updatedBy = await requireAdminCtx(ctx);
    const current = await readUnreadReminder(ctx);
    const row = await getLoopRow(ctx, UNREAD_REMINDER_KEY);
    const data = { ...current, enabled, updatedBy, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, data);
    else await ctx.db.insert("engagementLoops", { key: UNREAD_REMINDER_KEY, ...data });
  },
});
