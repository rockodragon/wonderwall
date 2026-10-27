// The onboarding flow's plain logic (routes/onboarding.tsx). Rick, 2026-10-27:
// new members only answered "what are you into" and were sent to post a
// project, so their account never got set up. The profile comes first now,
// one question to a screen:
//   1. what brings you here (the door)   2. photo, name, address
//   3. a line about you, the picks, a city, and an email if the account has
//      none                              4. a project (makers only)
// A backer or a partner is done after step 3.

import { HANDLE_MAX_LENGTH, cleanHandle, handleProblem } from "../../convex/handleRules";
import { heldRefusal } from "../../convex/heldHandles";
import { hasRealName } from "../../convex/names";
import type { LocationSuggestion } from "../components/LocationAutocomplete";
import type { Role } from "../constants/roles";
import type { LocationFieldArgs } from "./useLocationField";

export type Step = 1 | 2 | 3 | 4;

/** The steps a door walks, in order. Before one is picked, a maker's: the
 *  longest list, so the count only ever shrinks. */
export function stepsFor(role: Role | null): readonly Step[] {
  return role === "patron" || role === "partner" ? [1, 2, 3] : [1, 2, 3, 4];
}

/** The step after this one, or null when it is the last: where a screen's
 *  button leaves the flow instead of going on. */
export function nextStep(role: Role | null, step: Step): Step | null {
  const steps = stepsFor(role);
  return steps[steps.indexOf(step) + 1] ?? null;
}

/** The step Back goes to, or null on the first. */
export function previousStep(step: Step): Step | null {
  return step > 1 ? ((step - 1) as Step) : null;
}

/** What each step is called under the stepper. */
const STEP_NAMES: Record<Step, string> = {
  1: "You're here to",
  2: "Your page",
  3: "About you",
  4: "Project",
};

/** The stepper at the top of every screen: one segment for each step this
 *  door walks, filled up to the one they're on. A backer or a partner has
 *  three segments, a maker four. */
export function progressFor(role: Role | null, step: Step) {
  const steps = stepsFor(role);
  const at = steps.indexOf(step);
  // A step this door doesn't walk (it can't be opened: reachableStep) reads
  // as the last one.
  const current = at < 0 ? steps.length : at + 1;
  return {
    current,
    total: steps.length,
    /** True for each segment that is filled. */
    segments: steps.map((_, i) => i < current),
    /** The step's short name, said under the segments. */
    name: STEP_NAMES[step],
    /** What a screen reader hears for the bar. */
    label: `Step ${current} of ${steps.length}`,
  };
}

/** Which way a new screen slides in from: from the right going on, from the
 *  left going back. Null when the step hasn't changed. */
export type Slide = "forward" | "back";
export function slideFor(from: Step, to: Step): Slide | null {
  return to === from ? null : to > from ? "forward" : "back";
}

/** Where a step lives. The first is the bare page. */
export function stepHref(step: Step): string {
  return step === 1 ? "/onboarding" : `/onboarding?step=${step}`;
}

/** The step a ?step= asks for. Anything that isn't one is the first. */
export function stepFromParam(raw: string | null): Step {
  const n = Number(raw);
  return n === 2 || n === 3 || n === 4 ? n : 1;
}

/** The furthest step a link may open: none past what's filled in. A door
 *  comes first, then a name (the profile step needs one to save), and a
 *  backer or a partner has no project step. */
export function reachableStep(asked: Step, answers: { role: Role | null; name: string }): Step {
  const steps = stepsFor(answers.role);
  const furthest = !answers.role ? 1 : !hasRealName(answers.name) ? 2 : steps[steps.length - 1];
  return Math.min(asked, furthest) as Step;
}

/** An address to start the field with, made from the name: the letters and
 *  numbers of it, lowercase, no spaces or accents ("Ana-María O'Neil" is
 *  "anamariaoneil"). Empty when nothing usable is left, or what is left is a
 *  name nobody can take through the form (the rules, a reserved or held name,
 *  one too short): a start that is refused at once is worse than a blank. */
export function suggestHandle(name: string): string {
  const letters = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._]/g, "");
  const handle = cleanHandle(letters)
    .replace(/\.{2,}/g, ".")
    .slice(0, HANDLE_MAX_LENGTH)
    .replace(/^\.+|\.+$/g, "");
  return handleProblem(handle) || heldRefusal(handle) ? "" : handle;
}

/** True when the account has no email on it (a phone sign-up made on the
 *  login page: profiles.getMyProfile says `email: null`). Only then does the
 *  profile step ask for one. */
export function lacksEmail(profile: { email?: string | null }): boolean {
  return !profile.email?.trim();
}

/** A city as the profile shows it, the way Settings' profile form writes it
 *  ("San Diego, CA" in the US, "Lisbon, Portugal" elsewhere), not the longer
 *  name the search returns. Falls back to that name when the place has no
 *  city. */
export function cityLabel(place: Pick<LocationSuggestion, "displayName" | "address">): string {
  const { city, stateCode, country, countryCode } = place.address;
  if (!city) return place.displayName;
  if (countryCode === "US" && stateCode) return `${city}, ${stateCode}`;
  if (country && city !== country) return `${city}, ${country}`;
  return city;
}

/** What the profile step's Continue saves, as upsertProfile takes it. A
 *  backer's picks are what they want to support, a partner's what they offer
 *  (and the space or organization they speak for); a maker's are their
 *  interests. Nothing picked leaves what the profile has. The place is the
 *  city field as it stands (useLocationField's toArgs, which starts from the
 *  profile's own), so an untouched one is saved as it was and a cleared one
 *  clears it. The email is sent only when one is given: the server fills in a
 *  missing email and never overwrites one. The role is the door, which is
 *  also what the app reads as "onboarding done" (onboardingGate.ts). */
export function aboutYouArgs(
  role: Role,
  answers: {
    name: string;
    bio: string;
    interests: string[];
    offerings: string[];
    placeName: string;
    place: LocationFieldArgs;
    email?: string;
  },
) {
  const picked = answers.interests.length > 0 ? answers.interests : undefined;
  const email = answers.email?.trim();
  return {
    ...answers.place,
    name: answers.name.trim(),
    bio: answers.bio.trim() || undefined,
    ...(role === "patron"
      ? { supportInterests: picked }
      : role === "partner"
        ? {
            partnerOfferings: answers.offerings.length > 0 ? answers.offerings : undefined,
            orgName: answers.placeName.trim() || undefined,
          }
        : { interests: picked }),
    ...(email ? { email } : {}),
    primaryRole: role,
  };
}
