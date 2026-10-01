// Who gets sent through /onboarding before anything else (_app.tsx).
//
// onboarding.tsx sets primaryRole on its details step — Continue and Skip
// both save it — so "no role" means they never got that far. Members who
// joined before primaryRole existed have a bio or interests and are left
// alone. The name is NOT part of the test: Google fills it in, so a brand
// new Google account looks exactly like this — a real name and nothing else.
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
