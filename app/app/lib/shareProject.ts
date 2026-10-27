// Sharing a project is the first thing a new member does once their page is
// set up (docs/features/activation-onboarding-audit.md, Rick 2026-10-09; the
// profile now comes first, 2026-10-27). The plain logic behind that: the
// front door's link, the project step's choices (routes/onboarding.tsx), and
// the title stashed from the front door, which fills that step in.

import { signupHref, takePendingIntent, setPendingIntent } from "./pendingIntent";
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

/** The typed title a "start a project" visit carries, if it has one. */
function titleIn(path: string): string | null {
  if (!isShareProjectIntent(path)) return null;
  return new URL(path, "http://local.test").searchParams.get("title")?.trim() || null;
}

/** The title stashed by stashProjectTitle, read and left where it is: the
 *  project step fills itself in from it, possibly after a reload, and
 *  dropShareProjectIntent clears it when the member leaves. */
export function peekStashedProjectTitle(): string | null {
  const path = takePendingIntent();
  if (!path) return null;
  setPendingIntent(path);
  return titleIn(path);
}

/** True when a visit is stashed with a typed project title in it. */
export function hasStashedProjectTitle(path: string | null | undefined): boolean {
  return !!path && !!titleIn(path);
}

/** A new account shares its project on the onboarding screens, so the stashed
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
  return projects.some((p) => p.userId === profile.userId);
}
