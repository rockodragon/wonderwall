// Which tabs a project page has, and which one the URL's ?tab= names
// (routes/projects.$id.tsx). Pure, so the rules can be tested.
//
// A project has About, Team, Updates and Support. A gig is booked date by
// date rather than staffed, so its second tab is Dates. Support is for
// projects, not hires: a job or a gig has three tabs.
//
// The owner (and an admin) gets every tab, empty or not, so there's
// somewhere to fill it in. Anyone else gets only the tabs with something in
// them (Rick, 2026-10-22): the page is public, and an empty tab is noise.

export type ProjectTab = "about" | "team" | "dates" | "updates" | "support";

/** The first tab; the URL leaves ?tab= off for it. */
export const DEFAULT_PROJECT_TAB: ProjectTab = "about";

/** Whether each optional section has something in it for this viewer. */
export type SectionContent = { team: boolean; updates: boolean; support: boolean };

export function projectTabs(opts: {
  isGig: boolean;
  isPassion: boolean;
  /** Join requests waiting on the owner; 0 for anyone else. */
  requests: number;
  /** Everyone who cheered or backed it, shown to every viewer; 0 or left out for none. */
  supporters?: number;
  /** For a viewer who can't edit the project: what each section holds
   * (sectionsWithContent), and the empty ones are left out. Left out for the
   * owner and an admin: every tab. */
  has?: SectionContent;
}): { id: ProjectTab; label: string }[] {
  const has = opts.has ?? { team: true, updates: true, support: true };
  const team = opts.requests > 0 ? `Team · ${opts.requests} ${opts.requests === 1 ? "request" : "requests"}` : "Team";
  return [
    { id: "about", label: "About" },
    ...(opts.isGig
      ? [{ id: "dates" as const, label: "Dates" }]
      : has.team
        ? [{ id: "team" as const, label: team }]
        : []),
    ...(has.updates ? [{ id: "updates" as const, label: "Updates" }] : []),
    ...(opts.isPassion && has.support
      ? [{ id: "support" as const, label: opts.supporters ? `Support · ${opts.supporters}` : "Support" }]
      : []),
  ];
}

/**
 * What a viewer who can't edit the project would find in each section, for
 * projectTabs' `has`. Still loading reads as nothing yet.
 *
 *   Team     someone on it besides the lead (a member or a credit), a listed
 *            role, the viewer's own request, invite or place on it, or a
 *            project still taking people: Ask to join and Apply live there
 *            (Rick, 2026-10-22). A finished project with only its lead has
 *            no Team tab.
 *   Updates  at least one posted.
 *   Support  the owner asked for it (isRaising: a goal, the raising stage, a
 *            live tier), or someone has already cheered or backed it.
 */
export function sectionsWithContent(p: {
  /** api.garden.projectTeam.getTeam. */
  team:
    | { accepted: readonly unknown[]; credits: readonly unknown[]; mine?: unknown; acceptingPeople: boolean }
    | null
    | undefined;
  /** api.garden.projectTeam.listRoles. */
  roles: readonly unknown[] | null | undefined;
  /** api.garden.stories.listProjectUpdates. */
  updates: readonly unknown[] | null | undefined;
  raising: boolean;
  supporters: number;
}): SectionContent {
  const { team } = p;
  const teamHasPeople =
    !!team && (team.accepted.length > 0 || team.credits.length > 0 || !!team.mine || team.acceptingPeople);
  return {
    team: teamHasPeople || (p.roles?.length ?? 0) > 0,
    updates: (p.updates?.length ?? 0) > 0,
    support: p.raising || p.supporters > 0,
  };
}

/** The tab ?tab= names, or the first when it names none of this page's. */
export function readProjectTab(raw: string | null, tabs: readonly { id: ProjectTab }[]): ProjectTab {
  return tabs.find((t) => t.id === raw)?.id ?? DEFAULT_PROJECT_TAB;
}

/** The query string after choosing `next`: the first tab drops the param, and
 * every other param (a Stripe return's ?backed=1) stays. */
export function withProjectTab(current: URLSearchParams, next: ProjectTab): URLSearchParams {
  const params = new URLSearchParams(current);
  if (next === DEFAULT_PROJECT_TAB) params.delete("tab");
  else params.set("tab", next);
  return params;
}
