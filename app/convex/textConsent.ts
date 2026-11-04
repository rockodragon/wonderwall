// Message texts are opt-in (convex/messageAlerts.ts). Only an account with a
// verified phone and no email can switch them on: the 10/29 rule that a text
// goes out only when there is no other way to reach someone. Switching on
// saves the consent, with the wording the person saw and the number it was for.
// A changed number needs a new yes. STOP (convex/telnyxWebhook.ts) is kept
// per phone, not per account.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getUserEmail } from "./emailHelpers";
import { fail } from "./errors";
import { currentUserId, requireUserId } from "./helpers";
import { consentWordingFor } from "./textConsentWording";

export {
  TEXT_CONSENT_LABEL, TEXT_CONSENT_LINE, TEXT_CONSENT_QUESTION, TEXT_CONSENT_WORDING, isStartWord, isStopWord,
} from "./textConsentWording";

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

async function consentRow(ctx: ReadCtx, userId: Id<"users">): Promise<Doc<"textConsents"> | null> {
  return await ctx.db.query("textConsents").withIndex("by_userId", q => q.eq("userId", userId)).first();
}

function isActive(row: Doc<"textConsents"> | null, phone: string): row is Doc<"textConsents"> {
  return !!row && row.agreedAt !== undefined && row.phone === phone
    && !(row.revokedAt !== undefined && row.revokedAt >= row.agreedAt);
}

/** The person's consent, when it is on and for `phone` (their current
 * verified number). Null otherwise. */
export async function activeConsentFor(
  ctx: ReadCtx,
  userId: Id<"users">,
  phone: string,
): Promise<Doc<"textConsents"> | null> {
  const row = await consentRow(ctx, userId);
  return isActive(row, phone) ? row : null;
}

/** Whether `phone` has an active STOP on record. */
export async function isOptedOut(ctx: ReadCtx, phone: string): Promise<boolean> {
  const row = await ctx.db.query("smsOptOuts").withIndex("by_phone", q => q.eq("phone", phone)).first();
  return !!row && (row.optedInAt === undefined || row.optedInAt <= row.optedOutAt);
}

export type TextPhone =
  | { ok: true; phone: string }
  | { ok: false; reason: "unknown_user" | "has_email" | "unverified_phone"; phone?: string };

/** The one rule for who can have message texts: a verified phone and no
 * email (the 10/29 "only when there's no other way" rule). Gives the phone,
 * or the reason not (with the phone, when known). */
export async function textPhoneFor(ctx: ReadCtx, userId: Id<"users">): Promise<TextPhone> {
  const user = await ctx.db.get(userId);
  if (!user) return { ok: false, reason: "unknown_user" };
  const phone = user.phone || undefined;
  // Anyone with an address on file gets email, even one that bounced.
  if (await getUserEmail(ctx as QueryCtx, userId)) return { ok: false, reason: "has_email", phone };
  if (!phone || !user.phoneVerificationTime) return { ok: false, reason: "unverified_phone", phone };
  return { ok: true, phone };
}

async function textPhoneOf(ctx: ReadCtx, userId: Id<"users">): Promise<string | null> {
  const found = await textPhoneFor(ctx, userId);
  return found.ok ? found.phone : null;
}

export const getMyTextSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const phone = await textPhoneOf(ctx, userId);
    const row = await consentRow(ctx, userId);
    return {
      available: phone !== null,
      on: phone !== null && isActive(row, phone),
      optedOut: phone !== null && (await isOptedOut(ctx, phone)),
      // Turned on, off or "Not now": the Canvas card is closed for good.
      decided: !!row && (row.agreedAt !== undefined || row.revokedAt !== undefined || row.dismissedAt !== undefined),
      updatesNumber: process.env.TELNYX_UPDATES_FROM ?? null,
    };
  },
});

export const setMyTexts = mutation({
  // from: which words the person saw, saved with the consent (default Settings').
  args: { on: v.boolean(), from: v.optional(v.union(v.literal("settings"), v.literal("card"))) },
  handler: async (ctx, { on, from }) => {
    const userId = await requireUserId(ctx);
    const row = await consentRow(ctx, userId);
    const now = Date.now();
    if (!on) {
      // Always allowed, even once the account can't switch on any more.
      if (row) await ctx.db.patch(row._id, { revokedAt: now });
      else await ctx.db.insert("textConsents", { userId, revokedAt: now });
      return null;
    }
    const phone = await textPhoneOf(ctx, userId);
    if (!phone) fail("texts_unavailable", "Texts are for accounts with a verified phone number and no email.");
    const wording = consentWordingFor(from ?? "settings");
    if (row) await ctx.db.patch(row._id, { phone, agreedAt: now, wording, revokedAt: undefined });
    else await ctx.db.insert("textConsents", { userId, phone, agreedAt: now, wording });
    return null;
  },
});

/** "Not now" on the Canvas card. */
export const dismissTextsAsk = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await consentRow(ctx, userId);
    const now = Date.now();
    if (row) await ctx.db.patch(row._id, { dismissedAt: now });
    else await ctx.db.insert("textConsents", { userId, dismissedAt: now });
    return null;
  },
});
