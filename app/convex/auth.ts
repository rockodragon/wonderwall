import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Phone } from "@convex-dev/auth/providers/Phone";
import { Email } from "@convex-dev/auth/providers/Email";
import Google from "@auth/core/providers/google";
import { ConvexError, v } from "convex/values";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./adminEmails";
import { normalizePhone } from "./phone";
import { sendSms } from "./smsSender";
import { decideCreateOrUpdateUser } from "./authLinking";
import { joinDefaultCommunity } from "./garden/defaultCommunity";

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
// client; this needs ctx.db. Also used by convex/phoneLink.ts's
// startAddPhone, which sends the same kind of code.
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

// Same guard for the emailed sign-in code ("email-otp" provider below).
const MAX_EMAIL_SENDS_PER_HOUR = 5;

export const recordAndCheckEmailSendLimit = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const address = email.trim().toLowerCase();
    const since = Date.now() - SMS_SEND_WINDOW_MS;
    const recent = await ctx.db
      .query("emailSendLimits")
      .withIndex("by_email_sentAt", (q) => q.eq("email", address).gt("sentAt", since))
      .collect();
    if (recent.length >= MAX_EMAIL_SENDS_PER_HOUR) {
      return false;
    }
    await ctx.db.insert("emailSendLimits", { email: address, sentAt: Date.now() });
    return true;
  },
});

// ————— createOrUpdateUser / afterUserCreatedOrUpdated —————
//
// Specifying `createOrUpdateUser` below replaces @convex-dev/auth's default
// implementation entirely (its own doc comment: "This callback is only
// called if `createOrUpdateUser` is not specified"). The default is NOT
// exported by the library (server/implementation/users.ts's
// defaultCreateOrUpdateUser is a private function), so `createOrUpdateUser`
// below replicates it — same field names, same account-linking rules — and
// manually invokes `afterUserCreatedOrUpdated` at every point the library
// itself would, so profile creation (and the admin auto-grant) keeps
// working unchanged for phone and password sign-in.
//
// The one behavior change: a Google sign-in whose email the library treats
// as verified (`profile.emailVerified`, from Google's `email_verified`
// claim) is linked to an *existing* user with that email even if that
// user's own `emailVerificationTime` isn't set — which is exactly the case
// for a password sign-up, since Password never verifies email. Without
// this, "Sign up with a password" followed later by "Sign in with Google"
// on the same address creates a second, disconnected user forever. See
// convex/authLinking.ts for the (unit-tested) decision and PR notes for the
// account-takeover reasoning: an unproven password could belong to someone
// who registered with a stolen email, so Google proving ownership revokes
// that password rather than merely coexisting with it.

async function afterUserCreatedOrUpdated(
  ctx: MutationCtx,
  args: { userId: Id<"users">; existingUserId: Id<"users"> | null },
) {
  // Only run for new user creation
  if (args.existingUserId) return;

  const userId = args.userId;

  // Get the user to extract name
  const user = await ctx.db.get(userId);
  const name = (user as { name?: string } | null)?.name || "New User";
  const email = (user as { email?: string } | null)?.email;
  // A phone-only signup has no email — email stays undefined here,
  // same as it always could for a partially-filled OAuth profile, and
  // isAdminEmail(undefined) already returns false rather than throwing.
  // The phone number itself lives on the `users` table (authTables' built-in
  // `phone` field, set automatically by the Phone provider, or by
  // phoneLink.ts's confirmAddPhone for an existing account) — profiles.ts's
  // schema has no phone field to mirror it into, so it isn't duplicated
  // onto the profile here.

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

  // Every account is a member of The Garden (garden/defaultCommunity.ts).
  // Signup and login show its agreements and the platform's beside every
  // way in ("By continuing you agree to…"), so this join counts as agreed.
  await joinDefaultCommunity(ctx, userId, { agreedAt: Date.now() });
}

async function uniqueUserWithVerifiedEmail(ctx: MutationCtx, email: string) {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .filter((q) => q.neq(q.field("emailVerificationTime"), undefined))
    .take(2);
  return users.length === 1 ? users[0] : null;
}

async function uniqueUserWithVerifiedPhone(ctx: MutationCtx, phone: string) {
  const users = await ctx.db
    .query("users")
    .withIndex("phone", (q) => q.eq("phone", phone))
    .filter((q) => q.neq(q.field("phoneVerificationTime"), undefined))
    .take(2);
  return users.length === 1 ? users[0] : null;
}

type CreateOrUpdateUserArgs = {
  existingUserId: Id<"users"> | null;
  type: "oauth" | "credentials" | "email" | "phone" | "verification";
  provider: any;
  profile: Record<string, unknown> & {
    email?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
  shouldLink?: boolean;
};

// Replicates @convex-dev/auth's private `defaultCreateOrUpdateUser`
// (server/implementation/users.ts) exactly, field for field, so phone and
// password sign-in behave exactly as before this file specified a custom
// `createOrUpdateUser`.
async function defaultLikeCreateOrUpdateUser(
  ctx: MutationCtx,
  args: CreateOrUpdateUserArgs,
): Promise<Id<"users">> {
  const { provider } = args;
  const {
    emailVerified: profileEmailVerified,
    phoneVerified: profilePhoneVerified,
    ...profile
  } = args.profile;

  const emailVerified =
    profileEmailVerified ??
    ((provider.type === "oauth" || provider.type === "oidc") &&
      provider.allowDangerousEmailAccountLinking !== false);
  const phoneVerified = profilePhoneVerified ?? false;
  const shouldLinkViaEmail =
    args.shouldLink || emailVerified || provider.type === "email";
  const shouldLinkViaPhone =
    args.shouldLink || phoneVerified || provider.type === "phone";

  let userId = args.existingUserId;
  if (userId === null) {
    const existingUserWithVerifiedEmailId =
      typeof profile.email === "string" && shouldLinkViaEmail
        ? ((await uniqueUserWithVerifiedEmail(ctx, profile.email as string))
            ?._id ?? null)
        : null;
    const existingUserWithVerifiedPhoneId =
      typeof profile.phone === "string" && shouldLinkViaPhone
        ? ((await uniqueUserWithVerifiedPhone(ctx, profile.phone as string))
            ?._id ?? null)
        : null;
    if (
      existingUserWithVerifiedEmailId !== null &&
      existingUserWithVerifiedPhoneId !== null
    ) {
      userId = null;
    } else if (existingUserWithVerifiedEmailId !== null) {
      userId = existingUserWithVerifiedEmailId;
    } else if (existingUserWithVerifiedPhoneId !== null) {
      userId = existingUserWithVerifiedPhoneId;
    } else {
      userId = null;
    }
  }

  const userData: Record<string, unknown> = {
    ...(emailVerified ? { emailVerificationTime: Date.now() } : null),
    ...(phoneVerified ? { phoneVerificationTime: Date.now() } : null),
    ...profile,
  };
  const existingOrLinkedUserId = userId;
  if (userId !== null) {
    await ctx.db.patch(userId, userData);
  } else {
    userId = await ctx.db.insert("users", userData);
  }

  await afterUserCreatedOrUpdated(ctx, {
    userId,
    existingUserId: existingOrLinkedUserId,
  });

  return userId;
}

// Deletes every password sign-in on a user. Used when a sign-in that proves
// control of the email (Google, or the emailed code) lands on an account whose
// email was never verified: the unproven password could belong to someone who
// registered with a stolen email (the classic pre-account-takeover).
async function revokePasswordAccounts(ctx: MutationCtx, userId: Id<"users">) {
  const passwordAccounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "password"))
    .collect();
  for (const account of passwordAccounts) {
    await ctx.db.delete(account._id);
  }
}

const EMAIL_OTP_PROVIDER_ID = "email-otp";

async function createOrUpdateUser(
  ctx: MutationCtx,
  args: CreateOrUpdateUserArgs,
): Promise<Id<"users">> {
  const provider = args.provider;
  const isGoogleOAuth = provider?.type === "oauth" && provider?.id === "google";
  const isEmailOtp = provider?.type === "email" && provider?.id === EMAIL_OTP_PROVIDER_ID;
  const email =
    typeof args.profile.email === "string" ? args.profile.email : undefined;

  // Email one-time code, second half: the person just entered the code, so
  // the address is now proven (args.type === "verification"). If the account
  // they land on never had a verified email (a password-only account linked
  // at code-send time below), that password is now suspect — revoke it, same
  // as Google does. The plain update path below then stamps
  // emailVerificationTime.
  if (
    isEmailOtp &&
    args.type === "verification" &&
    args.existingUserId !== null &&
    args.profile.emailVerified
  ) {
    const user = await ctx.db.get(args.existingUserId);
    if (user && user.emailVerificationTime === undefined) {
      await revokePasswordAccounts(ctx, args.existingUserId);
    }
  }

  // Only the "new sign-in, no linked account yet" path is eligible for the
  // takeover-safe link below — an existing account (existingUserId set)
  // already goes through the plain update path exactly like the default
  // implementation. For email-otp this is the code-SEND step (the library
  // creates the account when it sends the code); linking there is safe
  // because it changes nothing on the existing user and the account can't
  // sign in until the code is entered.
  if (args.existingUserId === null && (isGoogleOAuth || isEmailOtp) && email) {
    // Google normally sets `profile.emailVerified` itself from the
    // `email_verified` claim (same default as the library's own computation
    // in users.ts if absent). An email-otp account is always treated as
    // verified here: see above.
    const emailVerified = isEmailOtp
      ? true
      : (args.profile.emailVerified ??
        (provider.allowDangerousEmailAccountLinking !== false));

    if (emailVerified) {
      const matches = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .take(5);

      // Every way the single match can sign in today. Linking is only
      // safe when that's a password set up with this very email — see
      // matchIsPasswordOnlyForThisEmail in authLinking.ts.
      const matchAccounts =
        matches.length === 1
          ? await ctx.db
              .query("authAccounts")
              .withIndex("userIdAndProvider", (q) => q.eq("userId", matches[0]._id))
              .collect()
          : [];
      const matchIsPasswordOnlyForThisEmail =
        matchAccounts.length > 0 &&
        matchAccounts.every((a) => a.provider === "password") &&
        matchAccounts.some((a) => a.providerAccountId.toLowerCase() === email.toLowerCase());

      const decision = decideCreateOrUpdateUser({
        isGoogleOAuth,
        isEmailOtp,
        emailVerified: true,
        matchingUserCount: matches.length,
        matchIsPasswordOnlyForThisEmail,
      });

      if (decision === "link") {
        const existing = matches[0] as Doc<"users">;

        if (isEmailOtp) {
          // Attach only. Verification (above) revokes the password and
          // stamps emailVerificationTime once the code is entered.
          await afterUserCreatedOrUpdated(ctx, {
            userId: existing._id,
            existingUserId: existing._id,
          });
          return existing._id;
        }

        // Google has proven ownership of this email — the unproven
        // password could belong to someone who registered with a stolen
        // email, so it's revoked rather than left to coexist.
        await revokePasswordAccounts(ctx, existing._id);

        const patch: Record<string, unknown> = {};
        if (existing.emailVerificationTime === undefined) {
          patch.emailVerificationTime = Date.now();
        }
        if (!existing.name && typeof args.profile.name === "string") {
          patch.name = args.profile.name;
        }
        if (!(existing as any).image && typeof args.profile.image === "string") {
          patch.image = args.profile.image;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(existing._id, patch);
        }

        await afterUserCreatedOrUpdated(ctx, {
          userId: existing._id,
          existingUserId: existing._id,
        });

        return existing._id;
      }

      if (matches.length > 1) {
        // Don't guess which of several same-email accounts is "the"
        // account — surface it for a human instead. User ids only: never
        // log email or phone alongside them.
        console.warn(
          "[auth] createOrUpdateUser: multiple users share an email for a verified-email sign-in; not auto-linking.",
          { userIds: matches.map((u) => u._id) },
        );
      }
    }
  }

  return await defaultLikeCreateOrUpdateUser(ctx, args);
}

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

        const message = `TheCreative.exchange sign-in code: ${token}. It expires in 10 minutes.`;
        await sendSms(identifier, message);
      },
    }),
    // Emailed one-time code — the event RSVP form's sign-up (event.tsx). Same
    // shape as the phone provider above: 6 digits, 10 minutes, capped sends.
    // signIn("email-otp", { email }) sends; signIn("email-otp", { email, code })
    // verifies. Email() checks the code is entered with the same `email`
    // (exact match), so the client lowercases and trims it for both calls.
    Email({
      id: EMAIL_OTP_PROVIDER_ID,
      maxAge: CODE_MAX_AGE_SECONDS,
      async generateVerificationToken() {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const code = array[0] % 1_000_000;
        return code.toString().padStart(6, "0");
      },
      // The library passes the action ctx as a second argument to email
      // providers too (signIn.js), but Email()'s type only declares one.
      async sendVerificationRequest({ identifier, token }, actionCtx?: unknown) {
        const ctx = actionCtx as GenericActionCtx<DataModel>;
        const allowed = await ctx.runMutation(
          internal.auth.recordAndCheckEmailSendLimit,
          { email: identifier },
        );
        if (!allowed) {
          throw new ConvexError(
            "Too many codes requested for this address. Try again in an hour.",
          );
        }
        await ctx.runAction(internal.emails.sendSignInCode, {
          to: identifier,
          code: token,
        });
      },
    }),
  ],
  callbacks: {
    createOrUpdateUser,
    // Kept for documentation/parity with the library's shape — with
    // `createOrUpdateUser` specified above, the library itself never calls
    // this; `createOrUpdateUser` and `defaultLikeCreateOrUpdateUser` above
    // call it directly at every point the library would have.
    afterUserCreatedOrUpdated,
  },
});
