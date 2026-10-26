// Who gets sent through /onboarding before anything else (_app.tsx).
//
// onboarding.tsx sets primaryRole on every way off its one screen — Share it,
// Not yet, and "I'm here to back creatives" — so "no role" means they never
// got that far. Members who joined before primaryRole existed have a bio or
// interests and are left alone. The name is NOT part of the test: Google
// fills it in, so a brand new Google account looks exactly like this — a real
// name and nothing else. goesToOnboarding below adds the name.

import { hasRealName } from "../../convex/names";

export function needsOnboarding(
  profile:
    | { primaryRole?: string | null; bio?: string | null; interests?: string[] | null }
    | null
    | undefined,
): boolean {
  return (
    !!profile &&
    !profile.primaryRole &&
    !profile.bio?.trim() &&
    !profile.interests?.length
  );
}

/**
 * Who the app shell sends to /onboarding: a brand-new account
 * (needsOnboarding), and anyone who still has no name (convex/names.ts).
 * Other members don't see an unnamed account, and onboarding is where the
 * name is asked, so this is their way back. That includes members who got
 * through onboarding before it asked for a name (phone sign-in shipped
 * 2026-09-27, the name field 10-01, a skip that kept the placeholder
 * until 10-09): they come back to their own answers with the name field
 * added.
 */
export function goesToOnboarding(
  profile:
    | {
        name?: string | null;
        primaryRole?: string | null;
        bio?: string | null;
        interests?: string[] | null;
      }
    | null
    | undefined,
): boolean {
  return needsOnboarding(profile) || (!!profile && !hasRealName(profile.name));
}
