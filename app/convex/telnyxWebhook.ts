// What Telnyx tells us after a text (POST /telnyx/webhook in http.ts, after
// the signature check): a reply (STOP / START, kept per phone number; START
// and HELP get a text back, convex/serviceTexts.ts) and the final delivery
// status of a text we sent.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { replyToHelp, welcomeAfterStart } from "./serviceTexts";
import { isHelpWord, isStartWord, isStopWord } from "./textConsentWording";

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => (value && typeof value === "object" ? (value as Obj) : {});
const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

/** Telnyx's error code for a text it blocked because the number replied STOP. */
const BLOCKED_STOP_CODE = "40300";

/** The event out of a webhook body: `{ data: { event_type, payload } }`.
 * Null for bad JSON or an event_type that isn't a string. */
export function telnyxEventOf(rawBody: string): { eventType: string; payload: unknown } | null {
  try {
    const data = obj(obj(JSON.parse(rawBody)).data);
    return typeof data.event_type === "string" ? { eventType: data.event_type, payload: data.payload ?? {} } : null;
  } catch {
    return null;
  }
}

/** Whether the phone's latest word is STOP: no START after it (a tie is STOP). */
const stopped = (row: { optedOutAt: number; optedInAt?: number }) =>
  row.optedInAt === undefined || row.optedInAt <= row.optedOutAt;

/** A STOP for the phone, whether a reply or Telnyx's "blocked" error. A second
 * STOP changes nothing. */
async function recordOptOut(ctx: MutationCtx, phone: string, now: number) {
  const row = await ctx.db.query("smsOptOuts").withIndex("by_phone", q => q.eq("phone", phone)).first();
  if (!row) await ctx.db.insert("smsOptOuts", { phone, optedOutAt: now });
  else if (!stopped(row)) await ctx.db.patch(row._id, { optedOutAt: now });
}

export const applyTelnyxEvent = internalMutation({
  args: { eventType: v.string(), payload: v.any() },
  handler: async (ctx, { eventType, payload }): Promise<null> => {
    const body = obj(payload);
    const now = Date.now();

    if (eventType === "message.received") {
      const phone = str(obj(body.from).phone_number);
      if (!phone) return null;
      if (isStopWord(body.text)) await recordOptOut(ctx, phone, now);
      else if (isStartWord(body.text)) {
        const row = await ctx.db.query("smsOptOuts").withIndex("by_phone", q => q.eq("phone", phone)).first();
        if (row && stopped(row)) {
          await ctx.db.patch(row._id, { optedInAt: now });
          await welcomeAfterStart(ctx, phone, now);
        }
      } else if (isHelpWord(body.text)) {
        await replyToHelp(ctx, phone, now, str(obj(Array.isArray(body.to) ? body.to[0] : undefined).phone_number));
      }
      return null;
    }

    if (eventType === "message.finalized") {
      const id = str(body.id);
      if (!id) return null;
      // A message alert, or a welcome or HELP reply.
      const text: Doc<"messageTexts"> | Doc<"serviceTexts"> | null =
        (await ctx.db.query("messageTexts").withIndex("by_telnyxId", q => q.eq("telnyxId", id)).first())
        ?? (await ctx.db.query("serviceTexts").withIndex("by_telnyxId", q => q.eq("telnyxId", id)).first());
      if (!text) return null;
      const status = str(obj(Array.isArray(body.to) ? body.to[0] : undefined).status);
      const code = str(obj(Array.isArray(body.errors) ? body.errors[0] : undefined).code);
      await ctx.db.patch(text._id, {
        ...(status ? { deliveryStatus: status } : {}),
        ...(code ? { deliveryDetail: code } : {}),
      });
      // Blocked because they replied STOP (maybe to a number we never saw).
      if (code === BLOCKED_STOP_CODE && text.phone) await recordOptOut(ctx, text.phone, now);
    }
    return null;
  },
});
