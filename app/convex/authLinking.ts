// Pure decision logic for convex/auth.ts's `createOrUpdateUser` callback.
//
// Problem this exists to solve: @convex-dev/auth's default account-linking
// only links a new sign-in to an existing user when the *incoming* sign-in
// is itself verified (an OAuth email, or a phone code) AND it matches
// exactly one existing user whose OWN emailVerificationTime/
// phoneVerificationTime is already set. A password sign-up never sets
// emailVerificationTime — Convex Auth's Password provider has no email
// step — so a later "Sign in with Google" using the same address never
// matches the default lookup, and creates a second, disconnected user.
//
// The fix (implemented in auth.ts) looks up ANY existing user by email
// (verified or not) when a Google sign-in proves that email is real, and
// links to it if there's exactly one. This module is just the decision
// table for that: kept pure and separate so it's unit-testable without a
// database.
export type AuthLinkDecision = "link" | "create";

export function decideCreateOrUpdateUser(params: {
  /** True only for Google's OAuth sign-in (the only OAuth provider this app
   * has); false for password, phone, or any other provider type. */
  isGoogleOAuth: boolean;
  /** True for the "email-otp" provider (a 6-digit code sent to the address,
   * used by the event RSVP form). Entering the code proves the person
   * controls the address, exactly as Google's email_verified claim does, so
   * it follows the same linking rules. Optional so existing callers stay
   * valid. */
  isEmailOtp?: boolean;
  /** Whether the identity provider itself vouches the email is real —
   * for Google this is the `email_verified` claim; for email-otp it is true
   * because the account is unusable until the code is entered (see
   * auth.ts). */
  emailVerified: boolean;
  /** How many existing `users` rows have this email address, regardless of
   * their own emailVerificationTime. */
  matchingUserCount: number;
  /** True only when the matching user's sign-in methods are password
   * accounts and nothing else, and one of those passwords was registered
   * with this same email. A phone-only (or phone + password) account can
   * type any email into onboarding unverified; linking Google into one of
   * those would hand the real email owner's identity to whoever holds that
   * phone. So those never auto-link — a human merges them if they're real. */
  matchIsPasswordOnlyForThisEmail: boolean;
}): AuthLinkDecision {
  // A sign-in method that proves control of the email address: Google with a
  // verified email, or an emailed one-time code.
  const isVerifiedEmailSignIn = params.isGoogleOAuth || params.isEmailOtp === true;
  if (
    isVerifiedEmailSignIn &&
    params.emailVerified &&
    params.matchingUserCount === 1 &&
    params.matchIsPasswordOnlyForThisEmail
  ) {
    return "link";
  }
  // Zero matches: nothing to link to, create as usual. More than one match:
  // ambiguous — don't guess which account is the "real" one, create/update
  // as default and let a human sort it out (the caller logs a warning with
  // the user ids in this case).
  return "create";
}
