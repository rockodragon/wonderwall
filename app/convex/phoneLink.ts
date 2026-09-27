// Settings → "Phone number": lets a signed-in member attach a phone number
// to their EXISTING account (distinct from convex/auth.ts's Phone
// provider, which signs someone in/up fresh). Once confirmed, the same
// number works to sign back into this account via the ordinary "text me a
// code" sign-in form, because it lands in `authAccounts` in the exact
// shape that provider looks up.
import { ConvexError, v } from "convex/values";
import { internalAction, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { normalizePhone } from "./phone";
import { sendSms } from "./smsSender";
import {
  CODE_TTL_MS,
  LINK_START_WINDOW_MS,
  codeFromRandomUint32,
  hasAttemptsRemaining,
  hashCode,
  isCodeExpired,
  isOverStartLimit,
} from "./phoneLinkCore";

/** Masks everything but the last 4 digits, e.g. "+16195550100" -> "•••• 0100". */
function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

export const getMyPhone = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    const phone = (user as { phone?: string } | null)?.phone;
    return phone ? maskPhone(phone) : null;
  },
});

export const startAddPhone = mutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Sign in first.");

    const normalizedResult = normalizePhone(phone);
    if (!normalizedResult.ok) throw new ConvexError(normalizedResult.reason);
    const normalized = normalizedResult.value;

    // Per-user start cap (5/hour), independent of which number(s) they try.
    const since = Date.now() - LINK_START_WINDOW_MS;
    const recentStarts = await ctx.db
      .query("phoneLinkStarts")
      .withIndex("by_userId_startedAt", (q) =>
        q.eq("userId", userId).gt("startedAt", since),
      )
      .collect();
    if (isOverStartLimit(recentStarts.length)) {
      throw new ConvexError("Too many attempts. Try again in an hour.");
    }

    // Per-number send cap (5/hour) — the same table and mutation
    // auth.ts's Phone sign-in provider uses, so this form can't be used to
    // route around the SMS-pumping guard.
    const allowed: boolean = await ctx.runMutation(
      internal.auth.recordAndCheckPhoneSendLimit,
      { phone: normalized },
    );
    if (!allowed) {
      throw new ConvexError(
        "Too many codes requested for this number. Try again in an hour.",
      );
    }

    await ctx.db.insert("phoneLinkStarts", { userId, startedAt: Date.now() });

    // Replace any previous pending row for this user — only one pending
    // code per user at a time.
    const existing = await ctx.db
      .query("phoneLinkCodes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const code = codeFromRandomUint32(randomBytes[0]);
    const codeHash = await hashCode(code);

    await ctx.db.insert("phoneLinkCodes", {
      userId,
      phone: normalized,
      codeHash,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });

    await ctx.scheduler.runAfter(0, internal.phoneLink.sendLinkCode, {
      phone: normalized,
      code,
    });

    return null;
  },
});

// Same message shape and Telnyx/[dev SMS] path as auth.ts's Phone
// provider (factored into convex/smsSender.ts) — this is a different
// mutation but the same kind of code text.
export const sendLinkCode = internalAction({
  args: { phone: v.string(), code: v.string() },
  handler: async (_ctx, { phone, code }) => {
    const message = `Your creatives.exchange code is ${code}. It expires in 10 minutes.`;
    await sendSms(phone, message);
  },
});

export const confirmAddPhone = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Sign in first.");

    const pending = await ctx.db
      .query("phoneLinkCodes")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!pending) throw new ConvexError("Request a code first.");

    if (isCodeExpired(pending.expiresAt, Date.now())) {
      await ctx.db.delete(pending._id);
      throw new ConvexError("That code expired. Request a new one.");
    }

    if (!hasAttemptsRemaining(pending.attempts)) {
      await ctx.db.delete(pending._id);
      throw new ConvexError("Too many attempts. Request a new code.");
    }

    const submittedHash = await hashCode(code.trim());
    if (submittedHash !== pending.codeHash) {
      await ctx.db.patch(pending._id, { attempts: pending.attempts + 1 });
      throw new ConvexError("That code isn't right.");
    }

    // Don't merge automatically — refuse if another account already owns
    // this number.
    const claimedByOther = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "phone").eq("providerAccountId", pending.phone),
      )
      .unique();
    if (claimedByOther && claimedByOther.userId !== userId) {
      await ctx.db.delete(pending._id);
      throw new ConvexError("That number is already on another account.");
    }

    // One phone authAccount per user — replace whichever one they had.
    const existingPhoneAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "phone"),
      )
      .unique();
    if (existingPhoneAccount) {
      if (existingPhoneAccount.providerAccountId === pending.phone) {
        // Already exactly this number confirmed — nothing to relink.
        await ctx.db.delete(pending._id);
        await ctx.db.patch(userId, {
          phone: pending.phone,
          phoneVerificationTime: Date.now(),
        });
        return null;
      }
      await ctx.db.delete(existingPhoneAccount._id);
    }

    // Exact shape the Phone provider's own sign-in looks up
    // (@convex-dev/auth's createOrUpdateAccount): { userId, provider,
    // providerAccountId }.
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "phone",
      providerAccountId: pending.phone,
    });
    await ctx.db.patch(userId, {
      phone: pending.phone,
      phoneVerificationTime: Date.now(),
    });

    await ctx.db.delete(pending._id);
    return null;
  },
});

export const removePhone = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new ConvexError("Sign in first.");

    const phoneAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "phone"),
      )
      .unique();
    if (!phoneAccount) {
      throw new ConvexError("No phone number on this account.");
    }

    const otherAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    const hasOtherSignIn = otherAccounts.some(
      (a) =>
        a._id !== phoneAccount._id &&
        (a.provider === "google" || a.provider === "password"),
    );
    if (!hasOtherSignIn) {
      throw new ConvexError(
        "Add a password or Google sign-in before removing your phone number — you need at least one way in.",
      );
    }

    await ctx.db.delete(phoneAccount._id);
    await ctx.db.patch(userId, {
      phone: undefined,
      phoneVerificationTime: undefined,
    });
    return null;
  },
});
