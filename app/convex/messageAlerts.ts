// Telling someone a direct message is waiting (2026-10-30: since the 24h
// contact cooldown arrived, message emails were being cancelled, and people
// who signed up by phone heard nothing at all).
//
// One email-or-text decision, shared by sendMessage and the operator resend
// below: an email whenever there is an address on file, under the "message"
// contact policy (no 24h cooldown and none reserved, every other check);
// otherwise one text to a verified phone. A text never carries the message
// itself, and neither does an analytics event or the resend tool's output.
//
// Texts are OFF until an operator turns them on (setMessageTexts below). They
// would go out from the sign-in number, where a STOP reply also stops sign-in
// codes, so they wait for a separate Telnyx number, notice in Settings and the
// privacy policy, and a 10DLC campaign that covers notifications.
//
// No "use node": sendSms only needs fetch.

import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { escapeHtml } from "./email/template";
import { chooseFromName, cleanDisplayName, defaultSenderFor } from "./email/sender";
import { resolveSenderCommunityName } from "./email/senderCommunity";
import { PLATFORM_NAME } from "./garden/brandHosts";
import { contactEligibility } from "./emailDeliveries";
import { getUserEmail, scheduleNotificationEmail } from "./emailHelpers";
import type { EmailContactMetadata } from "./emailContactPolicy";
import { conversationReminderEligibility } from "./engagement/conversations";
import { getLoopRow } from "./engagement/settings";
import { displayNameOf } from "./helpers";
import { sendSms } from "./smsSender";

/** The engagementLoops row that switches texts on. Missing means off. */
export const MESSAGE_TEXTS_KEY = "message_texts";
export const MESSAGE_TEXT_DAILY_CAP = 3;
const TEXT_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;
const TEXT_SENDER_NAME_MAX = 40;
const RESEND_PREFIX = "message-resend:";
const DELIVERED_EMAIL = new Set(["accepted", "sent", "delivered", "delayed"]);

type ReadCtx = QueryCtx | MutationCtx;

export type MessageAlert = {
  recipientId: Id<"users">;
  /** The first unread message of the burst. */
  messageId: Id<"messages">;
  senderName: string;
  /** message:{id} from sendMessage, message-resend:{id} from the resend. */
  dedupeKey: string;
};

export type MessageAlertOutcome =
  | { channel: "email"; contactId?: Id<"emailDeliveries"> }
  | { channel: "text"; textId?: Id<"messageTexts"> }
  | { channel: "none"; reason: string; textId?: Id<"messageTexts"> };

type TextDecision = { eligible: true; phone: string } | { eligible: false; reason: string; phone?: string };

/** Whether an operator has switched texts on. A missing row is off. */
export async function messageTextsEnabled(ctx: Pick<QueryCtx, "db">): Promise<boolean> {
  return (await getLoopRow(ctx, MESSAGE_TEXTS_KEY))?.enabled ?? false;
}

/**
 * Operator CLI only:
 *   npx convex run messageAlerts:setMessageTexts '{"enabled":true}' --prod
 * Turn texts on only once they go out from their own Telnyx number (a STOP
 * reply to the sign-in number blocks sign-in codes), Settings and the privacy
 * policy mention them, and the 10DLC campaign covers notification texts.
 */
export const setMessageTexts = internalMutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const row = await getLoopRow(ctx, MESSAGE_TEXTS_KEY);
    const data = { enabled, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, data);
    else await ctx.db.insert("engagementLoops", { key: MESSAGE_TEXTS_KEY, subject: "", body: "", ...data });
    return { enabled };
  },
});

function messageEmail(alert: MessageAlert, message: Doc<"messages">) {
  const content = message.content;
  const contact: EmailContactMetadata = {
    dedupeKey: alert.dedupeKey, policy: "message", sourceType: "message", sourceId: message._id,
    conversationId: message.conversationId, messageId: message._id, blockedUserId: message.senderId,
  };
  return {
    userId: alert.recipientId,
    subject: `${alert.senderName} sent you a message`,
    previewText: content.slice(0, 80),
    heading: "New message",
    body: `<strong>${escapeHtml(alert.senderName)}</strong> sent you a message: "${escapeHtml(content.length > 200 ? content.slice(0, 200) + "..." : content)}"`,
    ctaText: "View Message",
    ctaUrl: `/messages/${message.conversationId}`,
    category: "activity" as const,
    contact,
  };
}

/** scheduleNotificationEmail's address check, then the claim's eligibility
 * check, without writing anything: what a dry run reports, and what a live
 * resend checks before it queues. */
async function previewMessageEmail(ctx: ReadCtx, email: ReturnType<typeof messageEmail>) {
  if (!(await getUserEmail(ctx, email.userId))) return { status: "skipped" as const, reason: "no_email" };
  const { contact } = email;
  const decision = await contactEligibility(ctx, {
    userId: email.userId, category: email.category, policy: contact.policy, sourceType: contact.sourceType,
    conversationId: contact.conversationId, messageId: contact.messageId, blockedUserId: contact.blockedUserId,
  });
  return decision.eligible ? { status: "queued" as const } : { status: "skipped" as const, reason: decision.reason };
}

/** Whether a text about `message` may go to `recipientId` now. Run when the
 * text is queued and again when it is sent. The on/off switch is checked by
 * the callers, before this. */
async function textEligibility(
  ctx: ReadCtx,
  recipientId: Id<"users">,
  message: Doc<"messages">,
  now: number,
  excludeTextId?: Id<"messageTexts">,
): Promise<TextDecision> {
  const user = await ctx.db.get(recipientId);
  if (!user) return { eligible: false, reason: "unknown_user" };
  const phone = user.phone || undefined;
  // Anyone with an address on file gets email, even one that bounced.
  if (await getUserEmail(ctx, recipientId)) return { eligible: false, reason: "has_email", phone };
  if (!phone || !user.phoneVerificationTime) return { eligible: false, reason: "unverified_phone", phone };
  const preferences = await ctx.db.query("emailPreferences")
    .withIndex("by_userId", q => q.eq("userId", recipientId)).unique();
  if (preferences?.activity === false) return { eligible: false, reason: "activity_off", phone };
  const thread = await conversationReminderEligibility(ctx, {
    userId: recipientId, conversationId: message.conversationId, messageId: message._id,
    // An alert goes out as the message lands, and sendMessage can stamp a
    // message 1ms ahead of the clock; "too recent" is a reminder's rule.
    cutoff: Math.max(now, message.createdAt),
  });
  if (!thread.eligible) return { eligible: false, reason: thread.reason, phone };
  const recent = await ctx.db.query("messageTexts")
    .withIndex("by_recipientUserId_createdAt", q => q.eq("recipientUserId", recipientId).gt("createdAt", now - TEXT_CAP_WINDOW_MS))
    .order("desc").take(100);
  const counted = recent.filter(row => row._id !== excludeTextId
    && (row.status === "sent" || (row.status === "queued" && row.claimedAt !== undefined)));
  if (counted.length >= MESSAGE_TEXT_DAILY_CAP) return { eligible: false, reason: "daily_cap", phone };
  return { eligible: true, phone };
}

/**
 * Tell the recipient about a message: email when they have an address,
 * else a text to a verified phone (when texts are switched on). Call it once
 * per unread burst, for the burst's first message.
 *
 * `dryRun` reports what would happen and writes nothing. `previewEmail` runs
 * that same check before queueing an email, and queues nothing when it says
 * no: the resend uses it so a live run does what its dry run reported.
 * sendMessage leaves it off, since the claim rechecks moments later.
 */
export async function scheduleMessageAlert(
  ctx: MutationCtx,
  alert: MessageAlert,
  options: { dryRun?: boolean; previewEmail?: boolean } = {},
): Promise<MessageAlertOutcome> {
  const message = await ctx.db.get(alert.messageId);
  if (!message) return { channel: "none", reason: "unavailable" };
  const email = messageEmail(alert, message);
  if (options.dryRun || options.previewEmail) {
    const preview = await previewMessageEmail(ctx, email);
    if (preview.status === "skipped" && preview.reason !== "no_email") return { channel: "none", reason: preview.reason };
    if (preview.status === "queued" && options.dryRun) return { channel: "email" };
  }
  if (!options.dryRun) {
    const emailed = await scheduleNotificationEmail(ctx, email);
    if (emailed.status === "queued") return { channel: "email", contactId: emailed.contactId };
    // Only a missing address leads to a text.
    if (emailed.reason !== "no_email") return { channel: "none", reason: emailed.reason };
  }
  return scheduleMessageText(ctx, alert, message, options.dryRun === true);
}

async function scheduleMessageText(
  ctx: MutationCtx,
  alert: MessageAlert,
  message: Doc<"messages">,
  dryRun: boolean,
): Promise<MessageAlertOutcome> {
  // Switched off: no row, nothing sent.
  if (!(await messageTextsEnabled(ctx))) return { channel: "none", reason: "texts_off" };
  if (!dryRun) {
    const existing = await ctx.db.query("messageTexts")
      .withIndex("by_dedupeKey", q => q.eq("dedupeKey", alert.dedupeKey)).unique();
    if (existing) {
      return existing.status === "skipped" || existing.status === "failed"
        ? { channel: "none", reason: existing.detail ?? existing.status, textId: existing._id }
        : { channel: "text", textId: existing._id };
    }
  }
  const now = Date.now();
  const decision = await textEligibility(ctx, alert.recipientId, message, now);
  if (dryRun) return decision.eligible ? { channel: "text" } : { channel: "none", reason: decision.reason };

  const textId = await ctx.db.insert("messageTexts", {
    recipientUserId: alert.recipientId, phone: decision.phone, conversationId: message.conversationId,
    messageId: message._id, dedupeKey: alert.dedupeKey, createdAt: now,
    ...(decision.eligible ? { status: "queued" as const } : { status: "skipped" as const, detail: decision.reason }),
  });
  if (!decision.eligible) return { channel: "none", reason: decision.reason, textId };
  await ctx.scheduler.runAfter(0, internal.messageAlerts.sendMessageText, { textId });
  return { channel: "text", textId };
}

const LINK_LIKE = /:\/\/|www\.|[\p{L}\p{N}_-]\.\p{L}{2,}/iu;

/** The sender as a text names them. A profile name is free text, so it is
 * tidied, kept to 40 characters, and replaced by "Someone" when blank or when
 * it looks like a link (a link in a text from us would be a phishing gift). */
export function textSenderName(name: string | null | undefined): string {
  const clean = cleanDisplayName(name);
  if (!clean || LINK_LIKE.test(clean)) return "Someone";
  return Array.from(clean).slice(0, TEXT_SENDER_NAME_MAX).join("").trimEnd();
}

/** The name the text goes out under: the recipient's community, chosen as
 * the message email chooses its From name, else the platform's. */
async function textBrand(ctx: ReadCtx, recipientId: Id<"users">): Promise<string> {
  const sender = defaultSenderFor("activity");
  const communityName = sender === "community" ? await resolveSenderCommunityName(ctx, { userId: recipientId }) : null;
  return chooseFromName({ sender, communityName }) ?? PLATFORM_NAME;
}

/** The whole text: who wrote, under which name, and where to read it. Never
 * the message. */
export function messageTextBody(
  args: { senderName: string; brand: string; conversationId: string },
  siteUrl = process.env.SITE_URL || "https://thecreative.exchange",
): string {
  return `${textSenderName(args.senderName)} sent you a message on ${args.brand}: ${siteUrl}/messages/${args.conversationId}\nReply STOP to opt out.`;
}

/** A failed text keeps only Telnyx's status code (sendSms's own error);
 * anything else is just "send_error". */
export function textFailureDetail(error: unknown): string {
  const status = error instanceof Error ? /^Telnyx send failed with status (\d{3})$/.exec(error.message)?.[1] : undefined;
  return status ? `telnyx_${status}` : "send_error";
}

type TextClaim =
  | { claimed: false }
  | { claimed: true; to: string; senderName: string; brand: string; conversationId: Id<"conversations"> };

/** Recheck at send time: texts still on, still no email, still unread and
 * unanswered, not blocked, under the daily cap. A claimed row is never
 * claimed again. */
export const claimMessageText = internalMutation({
  args: { textId: v.id("messageTexts") },
  handler: async (ctx, { textId }): Promise<TextClaim> => {
    const row = await ctx.db.get(textId);
    if (!row || row.status !== "queued" || row.claimedAt !== undefined) return { claimed: false };
    const skip = async (reason: string) => {
      await ctx.db.patch(textId, { status: "skipped", detail: reason });
      return { claimed: false as const };
    };
    if (!(await messageTextsEnabled(ctx))) return skip("texts_off");
    const message = await ctx.db.get(row.messageId);
    if (!message) return skip("unavailable");
    const now = Date.now();
    const decision = await textEligibility(ctx, row.recipientUserId, message, now, textId);
    if (!decision.eligible) return skip(decision.reason);
    await ctx.db.patch(textId, { claimedAt: now, phone: decision.phone });
    return {
      claimed: true, to: decision.phone, conversationId: row.conversationId,
      senderName: await displayNameOf(ctx, message.senderId), brand: await textBrand(ctx, row.recipientUserId),
    };
  },
});

export const finishMessageText = internalMutation({
  args: { textId: v.id("messageTexts"), detail: v.optional(v.string()) },
  handler: async (ctx, { textId, detail }): Promise<null> => {
    const row = await ctx.db.get(textId);
    if (!row || row.status !== "queued") return null;
    await ctx.db.patch(textId, detail ? { status: "failed", detail } : { status: "sent", sentAt: Date.now() });
    return null;
  },
});

/** Sends right away, like the email. A failure is recorded and not retried,
 * so nobody gets the same text twice. */
export const sendMessageText = internalAction({
  args: { textId: v.id("messageTexts") },
  handler: async (ctx, { textId }): Promise<null> => {
    const claim: TextClaim = await ctx.runMutation(internal.messageAlerts.claimMessageText, { textId });
    if (!claim.claimed) return null;
    let detail: string | undefined;
    try {
      await sendSms(claim.to, messageTextBody(claim));
    } catch (error) {
      detail = textFailureDetail(error);
    }
    await ctx.runMutation(internal.messageAlerts.finishMessageText, { textId, ...(detail ? { detail } : {}) });
    return null;
  },
});

type ResendRow = {
  conversationId: Id<"conversations">;
  senderUserId: Id<"users">;
  sender: string;
  recipient: string;
  /** read_or_replied, already_queued, already_delivered, in_flight, … */
  skipped?: string;
  channel?: MessageAlertOutcome["channel"];
  reason?: string;
};

/**
 * Operator CLI only:
 *   npx convex run messageAlerts:resendMissedMessageAlerts '{"senderNames":["David Russo","Christina Bumann"],"since":1793055600000}' --prod
 * (1793055600000 is 2026-10-26 23:00 UTC, just before 88bf36f added the cooldown.)
 *
 * For each conversation in which a named sender wrote since `since` and the
 * recipient has neither read nor answered, sends the alert they missed for
 * the burst's first unread message, through the same helper sendMessage
 * uses. A dry run (the default) sends and writes nothing; pass
 * `"dryRun": false` to send. At most one alert per conversation, and a
 * second run sends nothing new. Each row names the sender's user id, so a
 * name shared by two profiles shows up.
 */
export const resendMissedMessageAlerts = internalMutation({
  args: { senderNames: v.array(v.string()), since: v.number(), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun !== false;
    const now = Date.now();
    // Every name must match before anything is read or sent.
    const senders = new Map<Id<"users">, string>();
    for (const name of args.senderNames) {
      const profiles = await ctx.db.query("profiles").withIndex("by_name", q => q.eq("name", name)).collect();
      if (!profiles.length) throw new Error(`No profile named "${name}"`);
      for (const profile of profiles) if (!senders.has(profile.userId)) senders.set(profile.userId, name);
    }

    // Two named senders can share a conversation; it still gets one row, from
    // the side whose messages are waiting (at most one side can be).
    const conversations = new Map<Id<"conversations">, { senderId: Id<"users">; sender: string; recipientId: Id<"users"> }[]>();
    for (const [senderId, sender] of senders) {
      const threads = await ctx.db.query("conversationParticipants")
        .withIndex("by_userId_lastMessageAt", q => q.eq("userId", senderId).gte("lastMessageAt", args.since))
        .collect();
      for (const thread of threads) {
        if ((thread.lastOutboundAt ?? 0) < args.since) continue;
        const list = conversations.get(thread.conversationId) ?? [];
        list.push({ senderId, sender, recipientId: thread.otherUserId });
        conversations.set(thread.conversationId, list);
      }
    }

    const rows: ResendRow[] = [];
    for (const [conversationId, candidates] of conversations) {
      let row: ResendRow | undefined;
      for (const { senderId, sender, recipientId } of candidates) {
        const result = await resendOne(ctx, { conversationId, senderId, sender, recipientId, since: args.since, now, dryRun });
        if (!row || !result.skipped || row.skipped === "read_or_replied") row = result;
        if (!result.skipped) break;
      }
      if (row) rows.push(row);
    }
    return { dryRun, rows };
  },
});

async function resendOne(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"conversations">; senderId: Id<"users">; sender: string; recipientId: Id<"users">;
    since: number; now: number; dryRun: boolean;
  },
): Promise<ResendRow> {
  const { conversationId, senderId, recipientId } = args;
  const base = {
    conversationId, senderUserId: senderId, sender: args.sender,
    recipient: await displayNameOf(ctx, recipientId, "(no name)"),
  };
  const thread = await conversationReminderEligibility(ctx, { userId: recipientId, conversationId, cutoff: args.now });
  if (!thread.eligible || !thread.messageId) return { ...base, skipped: thread.reason };
  const first = await ctx.db.get(thread.messageId);
  if (!first) return { ...base, skipped: "unavailable" };

  const burst = await ctx.db.query("messages")
    .withIndex("by_conversationId_senderId_readAt_createdAt", q => q
      .eq("conversationId", conversationId).eq("senderId", senderId).eq("readAt", undefined).gte("createdAt", first.createdAt))
    .take(100);
  const inBurst = new Set<Id<"messages">>(burst.map(message => message._id));
  const from = Math.min(args.since, first.createdAt);
  const emails = await ctx.db.query("emailDeliveries")
    .withIndex("by_recipientUserId_createdAt", q => q.eq("recipientUserId", recipientId).gte("createdAt", from))
    .collect();
  const texts = await ctx.db.query("messageTexts")
    .withIndex("by_recipientUserId_createdAt", q => q.eq("recipientUserId", recipientId).gte("createdAt", from))
    .collect();
  // Only this burst's resend counts: an older burst's must not hide a newer one.
  const resendKey = `${RESEND_PREFIX}${first._id}`;
  const resent = (row: { dedupeKey?: string }) => row.dedupeKey === resendKey;
  if (emails.some(resent) || texts.some(resent)) return { ...base, skipped: "already_queued" };
  const emailFor = (row: Doc<"emailDeliveries">) => !!row.messageId && inBurst.has(row.messageId);
  if (emails.some(row => emailFor(row) && DELIVERED_EMAIL.has(row.status))
    || texts.some(row => inBurst.has(row.messageId) && row.status === "sent")) {
    return { ...base, skipped: "already_delivered" };
  }
  // The burst's own alert is still on its way: don't send a second one.
  if (emails.some(row => emailFor(row) && row.status === "queued")
    || texts.some(row => inBurst.has(row.messageId) && row.status === "queued")) {
    return { ...base, skipped: "in_flight" };
  }

  const outcome = await scheduleMessageAlert(ctx, {
    recipientId, messageId: first._id, senderName: await displayNameOf(ctx, senderId), dedupeKey: resendKey,
  }, { dryRun: args.dryRun, previewEmail: true });
  return { ...base, channel: outcome.channel, ...(outcome.channel === "none" ? { reason: outcome.reason } : {}) };
}
