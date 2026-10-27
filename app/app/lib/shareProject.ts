// Sharing a project is the first thing a new member does (docs/features/
// activation-onboarding-audit.md, Rick 2026-10-09). The plain logic behind
// that: the front door's link, the one onboarding screen's choices and exits
// (routes/onboarding.tsx), and the stashed visit that screen replaces.

import { signupHref, takePendingIntent, setPendingIntent } from "./pendingIntent";
import { isProjectOwner } from "./projectPick";
import { isStage, type Stage } from "./stage";

/** Where "Share your project" goes for someone with an account: the form. */
export const SHARE_PROJECT_PATH = "/projects?new=project";

/** The call's link. Signed out it asks for an account, not a sign-in: The
 *  Garden is invite-only for now, so a visitor has no account yet. Signup
 *  keeps ?redirect= as a stashed visit (routes/signup.tsx), so someone who
 *  already has an account and signs in instead still lands on the form. */
export function shareProjectHref(signedIn: boolean): string {
  return signedIn ? SHARE_PROJECT_PATH : signupHref(SHARE_PROJECT_PATH);
}

/** True when a stashed visit is "start a project": /projects with ?new=project. */
export function isShareProjectIntent(path: string | null | undefined): boolean {
  if (!path) return false;
  try {
    const url = new URL(path, "http://local.test");
    return url.pathname === "/projects" && url.searchParams.get("new") === "project";
  } catch {
    return false;
  }
}

/** The home page's "What are you working on?" box: the typed title rides in
 *  the same stashed visit (lib/pendingIntent.ts) as the "start a project"
 *  visit, as ?title=. Nothing else is stored. */
export function stashProjectTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  setPendingIntent(`${SHARE_PROJECT_PATH}&title=${encodeURIComponent(t)}`);
  return true;
}

/** The title stashed by stashProjectTitle, read and cleared. A stashed visit
 *  that carries no title is put back for _app.tsx to replay. */
export function takeStashedProjectTitle(): string | null {
  const path = takePendingIntent();
  if (!path) return null;
  if (isShareProjectIntent(path)) {
    const title = new URL(path, "http://local.test").searchParams.get("title")?.trim();
    if (title) return title;
  }
  setPendingIntent(path);
  return null;
}

/** True when a visit is stashed with a typed project title in it. */
export function hasStashedProjectTitle(path: string | null | undefined): boolean {
  if (!path || !isShareProjectIntent(path)) return false;
  return !!new URL(path, "http://local.test").searchParams.get("title")?.trim();
}

/** A new account shares its project on the onboarding screen, so the stashed
 *  "start a project" visit must not open the form a second time on the way
 *  into the app. Any other stashed visit (a ticket, a membership) stays. */
export function dropShareProjectIntent(): void {
  const path = takePendingIntent();
  if (path && !isShareProjectIntent(path)) setPendingIntent(path);
}

/** "Thinking about it", "Working on it" and "Finished it": the stages a
 *  first project can start in. None chosen leaves the server's default,
 *  Planning. Finished it posts a completed project, which is the profile's
 *  Portfolio (docs/features/project-ia.md, "Projects, not Portfolios"). */
export const START_STAGES = [
  { value: "planning", label: "Thinking about it" },
  { value: "working", label: "Working on it" },
  { value: "completed", label: "Finished it" },
] as const satisfies readonly { value: Stage; label: string }[];

export type StartStage = (typeof START_STAGES)[number]["value"];

/** The start form opened on finished work: ?stage=completed rides on the
 *  form's own link (/projects?new=project, or the Canvas's ?create=project)
 *  and the form posts a completed project. */
export const FINISHED_STAGE: Stage = "completed";
export function withFinishedStage(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}stage=${FINISHED_STAGE}`;
}

/** The stage a start link asked for, if it's one a project can be in. */
export function readStartStage(params: URLSearchParams): Stage | undefined {
  const raw = params.get("stage");
  return isStage(raw) ? raw : undefined;
}

/** A start link used up. /projects?new=project opens the form once: the form
 *  takes the link's stage (as state, not from the URL) and ?new and ?stage
 *  both leave the URL. On that page ?stage= is also the Stage menu's word, so
 *  a start link's stage left behind would filter the list to it, behind the
 *  form and after it closes. A ?stage= with no ?new is the menu's own choice
 *  and stays. Returns a copy; `params` is not changed. */
export function spendStartLink(params: URLSearchParams): { stage: Stage | undefined; rest: URLSearchParams } {
  const rest = new URLSearchParams(params);
  if (params.get("new") !== "project") return { stage: undefined, rest };
  rest.delete("new");
  rest.delete("stage");
  return { stage: readStartStage(params), rest };
}

/** Whether this member has a project up, read off the public list the
 *  phone's Today and the Canvas already load (garden/projects:listProjects:
 *  posted, not archived or hidden), so it takes no query of its own. null
 *  while either side is still loading, or signed out, so nothing flashes.
 *  The Canvas asks for a project until this is true
 *  (components/ShareProjectCard.tsx). */
export function ownsAProject(
  projects: readonly { userId?: string }[] | undefined,
  profile: { userId?: string } | null | undefined,
): boolean | null {
  if (projects === undefined || !profile) return null;
  return projects.some((p) => isProjectOwner(p, profile));
}

/** The ways off the onboarding screen: a maker shares a project or not
 *  yet; a backer and a partner continue. */
export type OnboardingExit = "shared" | "not_yet" | "backer" | "partner";

/** The role each exit records. primaryRole is what the app reads as
 *  "onboarding done" (onboardingGate.ts, oauth-callback.tsx), so every exit
 *  sets one. A maker is a creative, which is also what a profile with no
 *  role has always been counted as (convex/garden/stats.ts
 *  isCreativeProfile). */
export function roleForExit(exit: OnboardingExit): "creative" | "patron" | "partner" {
  return exit === "backer" ? "patron" : exit === "partner" ? "partner" : "creative";
}

/** A name is the one thing the screen insists on, and only when the account
 *  has none (a phone sign-in made on the login page). */
export function hasNameIfNeeded(needsName: boolean, name: string): boolean {
  return !needsName || name.trim().length > 0;
}

/** upsertProfile writes every field it is given, so an omitted bio or
 *  location would be blanked. These are the ones the screen doesn't ask
 *  about, passed back as they are. */
export function keepProfileFields<Address, Coordinates>(profile: {
  bio?: string;
  location?: string;
  locationType?: string;
  address?: Address;
  coordinates?: Coordinates;
  placeId?: string;
}) {
  const { bio, location, locationType, address, coordinates, placeId } = profile;
  return { bio, location, locationType, address, coordinates, placeId };
}
