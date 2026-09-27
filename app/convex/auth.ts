import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Phone } from "@convex-dev/auth/providers/Phone";
import Google from "@auth/core/providers/google";
import { ConvexError, v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { isAdminEmail } from "./adminEmails";
import { normalizePhone } from "./phone";

const TELNYX_SEND_URL = "https://api.telnyx.com/v2/messages";
const CODE_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

// SMS-pumping guard: caps how many codes go out to a single number per
// hour. @convex-dev/auth's own authRateLimits table only throttles *failed
// verification attempts* on an identifier (rateLimit.js,
// DEFAULT_MAX_SIGN_IN_ATTEMPTS_PER_HOUR = 10) — nothing in the library
// limits how many codes get SENT to a number, which is the actual pumping
// surface. See phoneSendLimits in schema.ts.
const MAX_SMS_SENDS_PER_HOUR = 5;
const SMS_SEND_WINDOW_MS = 60 * 60 * 1000;

// Internal: records this send and reports whether the number is still
// under its hourly cap. Lives here (not phone.ts) because phone.ts stays a
// pure, Convex-free module so it can be unit-tested and shared with the
// client; this needs ctx.db.
export const recordAndCheckPhoneSendLimit = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const since = Date.now() - SMS_SEND_WINDOW_MS;
    const recent = await ctx.db
      .query("phoneSendLimits")
      .withIndex("by_phone_sentAt", (q) => q.eq("phone", phone).gt("sentAt", since))
      .collect();
    if (recent.length >= MAX_SMS_SENDS_PER_HOUR) {
      return false;
    }
    await ctx.db.insert("phoneSendLimits", { phone, sentAt: Date.now() });
    return true;
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password<DataModel>({
      profile(params) {
        return {
          email: params.email as string,
          name: (params.name as string) || undefined,
        };
      },
    }),
    Google,
    Phone({
      id: "phone",
      maxAge: CODE_MAX_AGE_SECONDS,
      // The server is the authority on phone format (US/Canada only, the
      // SMS-pumping guard in convex/phone.ts) — the client normalizes too,
      // for a friendlier error before a round trip, but this is what
      // actually gates what a code gets sent to.
      normalizeIdentifier(identifier) {
        const result = normalizePhone(identifier);
        if (!result.ok) {
          throw new ConvexError(result.reason);
        }
        return result.value;
      },
      // Convex Auth treats any token shorter than 24 characters as needing
      // the original identifier to re-check against (see Phone.d.ts) — a
      // 6-digit code always requires the matching phone number, which is
      // exactly the behavior we want.
      async generateVerificationToken() {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const code = array[0] % 1_000_000;
        return code.toString().padStart(6, "0");
      },
      async sendVerificationRequest({ identifier, token }, ctx) {
        const allowed = await ctx.runMutation(
          internal.auth.recordAndCheckPhoneSendLimit,
          { phone: identifier },
        );
        if (!allowed) {
          throw new ConvexError(
            "Too many codes requested for this number. Try again in an hour.",
          );
        }

        const message = `Your creatives.exchange code is ${token}. It expires in 10 minutes.`;

        const apiKey = process.env.TELNYX_API_KEY;
        const from = process.env.TELNYX_FROM;
        if (!apiKey) {
          // No Telnyx credentials configured (local/dev backend) — log
          // instead of sending so sign-in still works without them.
          console.log(`[dev SMS] to ${identifier}: ${message}`);
          return;
        }

        const response = await fetch(TELNYX_SEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: identifier, text: message }),
        });

        if (!response.ok) {
          // Status only, never the body — the body can echo request
          // content back in error payloads.
          throw new Error(`Telnyx send failed with status ${response.status}`);
        }
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      // Only run for new user creation
      if (args.existingUserId) return;

      const userId = args.userId;

      // Get the user to extract name
      const user = await ctx.db.get(userId);
      const name = (user as { name?: string })?.name || "New User";
      const email = (user as { email?: string })?.email;
      // A phone-only signup has no email — email stays undefined here,
      // same as it always could for a partially-filled OAuth profile, and
      // isAdminEmail(undefined) already returns false rather than throwing.
      // The phone number itself lives on the `users` table (authTables'
      // built-in `phone` field, set automatically by the Phone provider) —
      // profiles.ts's schema has no phone field to mirror it into, so it
      // isn't duplicated onto the profile here. Add one to schema.ts if a
      // profile-level phone is ever needed (e.g. to show/search on).

      // Check if profile already exists
      const existingProfile = await (ctx.db as any)
        .query("profiles")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .first();

      if (!existingProfile) {
        const now = Date.now();
        await (ctx.db as any).insert("profiles", {
          userId,
          name,
          interests: [],
          // Auto-grants the standing admin group (adminEmails.ts) on first
          // signup. Accounts that predate a given email's addition to that
          // list are backfilled instead by admin.ts's syncAdminGroup.
          ...(isAdminEmail(email) ? { isAdmin: true } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    },
  },
});
