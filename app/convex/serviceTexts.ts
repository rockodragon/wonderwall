// Texts about the message-alert texts themselves, from the updates number:
// the welcome that confirms an opt-in, and the reply to HELP. Both wordings
// are the ones registered with Telnyx's toll-free verification
// (textConsentWording.ts).
//
// Welcome: after someone switches texts on (textConsent.setMyTexts), once
// per consent. While texts are off it is owed, and goes out when an operator
// switches them on (messageAlerts.setMessageTexts). START after a STOP gets
// one too, when that number still has a consent.
// HELP: answered whether texts are on or not, at most once an hour per
// number, so a reply loop can't run up the bill.
// A number that said STOP gets neither.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { messageTextsEnabled, textFailureDetail } from "./messageAlerts";
import { sendSms } from "./smsSender";
import { activeConsentFor, isOptedOut, textPhoneFor } from "./textConsent";
import { TEXT_HELP_REPLY, TEXT_WELCOME } from "./textConsentWording";

type Kind = Doc<"serviceTexts">["kind"];

/** One welcome a day per number, however often texts are switched off and on. */
export const WELCOME_GAP_MS = 24 * 60 * 60 * 1000;
/** One HELP reply an hour per number; also the gap for a START's welcome. */
export const REPLY_GAP_MS = 60 * 60 * 1000;
const BODY: Record<Kind, string> = { welcome: TEXT_WELCOME, help: TEXT_HELP_REPLY };

/** Whether a text of this kind went (or is going) to the number since `since`. */
async function sentSince(ctx: MutationCtx, phone: string, kind: Kind, since: number): Promise<boolean> {
  const row = await ctx.db
    .query("serviceTexts")
    .withIndex("by_phone_kind_createdAt", q => q.eq("phone", phone).eq("kind", kind).gte("createdAt", since))
    .filter(q => q.neq(q.field("status"), "skipped"))
    .first();
  return row !== null;
}

/** Whether someone whose current number is `phone` has texts switched on. */
async function consentedPhone(ctx: MutationCtx, phone: string): Promise<boolean> {
  for (const row of await ctx.db.query("textConsents").withIndex("by_phone", q => q.eq("phone", phone)).collect()) {
    const found = await textPhoneFor(ctx, row.userId);
    if (found.ok && found.phone === phone && (await activeConsentFor(ctx, row.userId, phone))) return true;
  }
  return false;
}

async function queue(ctx: MutationCtx, phone: string, kind: Kind, now: number): Promise<Id<"serviceTexts">> {
  const id = await ctx.db.insert("serviceTexts", { phone, kind, status: "queued", createdAt: now });
  await ctx.scheduler.runAfter(0, internal.serviceTexts.sendServiceText, { id });
  return id;
}

/** The welcome for a person's consent, if it's on and hasn't had one. Marks
 * it welcomed before anything else, so it is never owed twice. While texts
 * are off it stays owed. */
async function welcomeIfOwed(ctx: MutationCtx, userId: Id<"users">, now: number): Promise<string> {
  const found = await textPhoneFor(ctx, userId);
  if (!found.ok) return found.reason;
  const consent = await activeConsentFor(ctx, userId, found.phone);
  if (!consent || consent.agreedAt === undefined) return "no_consent";
  if (consent.welcomedFor === consent.agreedAt) return "already_welcomed";
  if (!(await messageTextsEnabled(ctx))) return "texts_off";
  // Without a sender it stays owed, rather than being marked and then skipped.
  if (!process.env.TELNYX_UPDATES_FROM) return "no_updates_number";
  await ctx.db.patch(consent._id, { welcomedFor: consent.agreedAt });
  if (await isOptedOut(ctx, found.phone)) return "opted_out";
  if (await sentSince(ctx, found.phone, "welcome", now - WELCOME_GAP_MS)) return "recent";
  await queue(ctx, found.phone, "welcome", now);
  return "queued";
}

/** After setMyTexts switches texts on. */
export const welcomeAfterOptIn = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<string> => welcomeIfOwed(ctx, userId, Date.now()),
});

/** When an operator switches texts on: the welcomes owed while they were off.
 * One pass over every consent: one row per person who ever answered, a few
 * dozen today. Page it if that grows into the thousands. */
export const sendOwedWelcomes = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ queued: number }> => {
    const now = Date.now();
    let queued = 0;
    for (const row of await ctx.db.query("textConsents").collect()) {
      if (row.agreedAt === undefined || row.welcomedFor === row.agreedAt) continue;
      if ((await welcomeIfOwed(ctx, row.userId, now)) === "queued") queued++;
    }
    return { queued };
  },
});

/** START cleared a STOP on the number: confirm it, when the number still
 * has a consent and texts are on. */
export async function welcomeAfterStart(ctx: MutationCtx, phone: string, now: number): Promise<string> {
  if (!(await messageTextsEnabled(ctx))) return "texts_off";
  if (!(await consentedPhone(ctx, phone))) return "no_consent";
  if (await sentSince(ctx, phone, "welcome", now - REPLY_GAP_MS)) return "recent";
  await queue(ctx, phone, "welcome", now);
  return "queued";
}

/** HELP from the number, texted to `to` (the updates number, when Telnyx says). */
export async function replyToHelp(ctx: MutationCtx, phone: string, now: number, to?: string): Promise<string> {
  const updates = process.env.TELNYX_UPDATES_FROM;
  if (!updates) return "no_updates_number";
  if (to !== undefined && to !== updates) return "other_number";
  if (await isOptedOut(ctx, phone)) return "opted_out";
  if (await sentSince(ctx, phone, "help", now - REPLY_GAP_MS)) return "recent";
  await queue(ctx, phone, "help", now);
  return "queued";
}

type Claim = { claimed: false } | { claimed: true; to: string; from: string; body: string };

/** Recheck at send time: still queued, a sender number, no STOP since, and
 * for a welcome, texts still on. */
export const claimServiceText = internalMutation({
  args: { id: v.id("serviceTexts") },
  handler: async (ctx, { id }): Promise<Claim> => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "queued" || row.claimedAt !== undefined) return { claimed: false };
    const skip = async (detail: string) => {
      await ctx.db.patch(id, { status: "skipped", detail });
      return { claimed: false as const };
    };
    const from = process.env.TELNYX_UPDATES_FROM;
    if (!from) return skip("no_updates_number");
    if (await isOptedOut(ctx, row.phone)) return skip("opted_out");
    if (row.kind === "welcome" && !(await messageTextsEnabled(ctx))) return skip("texts_off");
    // Switched off again since it was queued.
    if (row.kind === "welcome" && !(await consentedPhone(ctx, row.phone))) return skip("no_consent");
    await ctx.db.patch(id, { claimedAt: Date.now() });
    return { claimed: true, to: row.phone, from, body: BODY[row.kind] };
  },
});

export const finishServiceText = internalMutation({
  args: { id: v.id("serviceTexts"), detail: v.optional(v.string()), telnyxId: v.optional(v.string()) },
  handler: async (ctx, { id, detail, telnyxId }): Promise<null> => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "queued") return null;
    await ctx.db.patch(id, detail
      ? { status: "failed", detail }
      : { status: "sent", sentAt: Date.now(), ...(telnyxId ? { telnyxId } : {}) });
    return null;
  },
});

/** Sends once. A failure is recorded and not retried. */
export const sendServiceText = internalAction({
  args: { id: v.id("serviceTexts") },
  handler: async (ctx, { id }): Promise<null> => {
    const claim: Claim = await ctx.runMutation(internal.serviceTexts.claimServiceText, { id });
    if (!claim.claimed) return null;
    let detail: string | undefined;
    let telnyxId: string | undefined;
    try {
      telnyxId = (await sendSms(claim.to, claim.body, claim.from)).id;
    } catch (error) {
      detail = textFailureDetail(error);
    }
    await ctx.runMutation(internal.serviceTexts.finishServiceText, {
      id, ...(detail ? { detail } : {}), ...(telnyxId ? { telnyxId } : {}),
    });
    return null;
  },
});
