import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { scheduleNotificationEmail } from "../emailHelpers";
import { contactEligibility } from "../emailDeliveries";
import { escapeHtml } from "../email/template";
import { conversationReminderEligibility } from "./conversations";
import { readUnreadReminder, UNREAD_REMINDER_DELAY_MS, UNREAD_REMINDER_KEY } from "./reminderSettings";

/** One reminder per unanswered episode. A partial read cannot start a second run. */
export const runUnreadReminder = internalMutation({
  args: { cursor: v.optional(v.string()), cutoff: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scanned: number; queued: number; isDone: boolean }> => {
    const settings = await readUnreadReminder(ctx);
    if (!settings.enabled) return { scanned: 0, queued: 0, isDone: true };
    const cutoff = args.cutoff ?? Date.now() - UNREAD_REMINDER_DELAY_MS;
    const page = await ctx.db.query("conversationParticipants")
      .withIndex("by_unreadSince", q => q.gt("unreadSince", 0).lte("unreadSince", cutoff))
      .paginate({ cursor: args.cursor ?? null, numItems: 25 });
    let queued = 0;
    for (const summary of page.page) {
      const source = await conversationReminderEligibility(ctx, { conversationId: summary.conversationId, userId: summary.userId, cutoff });
      if (!source.eligible || !source.messageId || !source.otherUserId || summary.awaitingReplySince === undefined) continue;
      const journeyRunId = `unread:${summary.conversationId}:${summary.awaitingReplySince}`;
      const previous = await ctx.db.query("emailDeliveries").withIndex("by_dedupeKey", q => q.eq("dedupeKey", journeyRunId)).unique();
      if (previous) continue;
      const eligibility = await contactEligibility(ctx, {
        userId: summary.userId, category: "activity", goal: "unread_message", conversationId: summary.conversationId,
        messageId: source.messageId, blockedUserId: source.otherUserId, journeyKey: UNREAD_REMINDER_KEY,
      });
      if (!eligibility.eligible) continue;
      const logId = await ctx.db.insert("nudgeLog", { loopKey: UNREAD_REMINDER_KEY, userId: summary.userId, status: "queued", at: Date.now() });
      const result = await scheduleNotificationEmail(ctx, {
        userId: summary.userId, category: "activity", subject: settings.subject, heading: "Your inbox",
        previewText: settings.body, body: `<p>${escapeHtml(settings.body)}</p>`, ctaText: "Open inbox", ctaUrl: "/messages",
        contact: { dedupeKey: journeyRunId, journeyRunId, journeyKey: UNREAD_REMINDER_KEY, sourceType: "conversation",
          sourceId: summary.conversationId, goal: "unread_message", conversationId: summary.conversationId,
          messageId: source.messageId, blockedUserId: source.otherUserId, nudgeLogId: logId },
      });
      if (result.status === "queued") { await ctx.db.patch(logId, { contactId: result.contactId }); queued++; }
      else await ctx.db.patch(logId, { status: "skipped", reason: result.reason });
    }
    if (!page.isDone && page.continueCursor && page.continueCursor !== args.cursor) {
      await ctx.scheduler.runAfter(1_000, internal.engagement.unreadReminder.runUnreadReminder, { cursor: page.continueCursor, cutoff });
    }
    return { scanned: page.page.length, queued, isDone: page.isDone };
  },
});
