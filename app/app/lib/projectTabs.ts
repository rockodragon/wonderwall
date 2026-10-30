// Which tabs a project page has, and which one the URL's ?tab= names
// (routes/projects.$id.tsx). Pure, so the rules can be tested.
//
// A project has About, and then only the sections with something in them
// (Rick, 2026-10-30): most projects are one person's, and an empty Team,
// Updates or Support tab is noise; nothing is lost by leaving it out. The
// owner also gets Updates (that's where they post one), a Team tab while a
// request waits on them, Support once anyone gave it, and whatever they
// opened from "Next steps" (ownerSections). A gig is booked date by date
// rather than staffed, so its second tab is Dates, always. Support is for
// projects, not hires: a job or a gig never has it. With About alone there
// is no tab row at all.

export type ProjectTab = "about" | "team" | "dates" | "updates" | "support";

/** The first tab; the URL leaves ?tab= off for it. */
export const DEFAULT_PROJECT_TAB: ProjectTab = "about";

/** Whether each optional section is shown to this viewer. */
export type SectionContent = { team: boolean; updates: boolean; support: boolean };

export function projectTabs(opts: {
  isGig: boolean;
  isPassion: boolean;
  /** Join requests waiting on the owner; 0 for anyone else. */
  requests: number;
  /** Everyone who cheered or backed it, shown to every viewer; 0 or left out for none. */
  supporters?: number;
  /** Updates posted, shown on the tab; 0 or left out for none. */
  updates?: number;
  /** Which sections this viewer gets: sectionsWithContent for anyone,
   * ownerSections over it for the owner. */
  has: SectionContent;
}): { id: ProjectTab; label: string }[] {
  const { has } = opts;
  const team = opts.requests > 0 ? `Team · ${opts.requests} ${opts.requests === 1 ? "request" : "requests"}` : "Team";
  return [
    { id: "about", label: "About" },
    ...(opts.isGig
      ? [{ id: "dates" as const, label: "Dates" }]
      : has.team
        ? [{ id: "team" as const, label: team }]
        : []),
    ...(has.updates ? [{ id: "updates" as const, label: opts.updates ? `Updates · ${opts.updates}` : "Updates" }] : []),
    ...(opts.isPassion && has.support
      ? [{ id: "support" as const, label: opts.supporters ? `Support · ${opts.supporters}` : "Support" }]
      : []),
  ];
}

/**
 * What a viewer would find in each section, for projectTabs' `has`. Still
 * loading reads as nothing yet.
 *
 *   Team     someone on it besides the lead (a member or a credit), a listed
 *            role, or the viewer's own request, invite or place on it. A
 *            project that is merely open to people isn't a team yet: "Ask
 *            to join" sits under About instead (Rick, 2026-10-30).
 *   Updates  at least one posted.
 *   Support  the owner asked for it (isRaising: a goal, the raising stage, a
 *            live tier). Cheers and backings alone are the count beside the
 *            heart, and the names sit under About.
 */
export function sectionsWithContent(p: {
  /** api.garden.projectTeam.getTeam. */
  team: { accepted: readonly unknown[]; credits: readonly unknown[]; mine?: unknown } | null | undefined;
  /** api.garden.projectTeam.listRoles. */
  roles: readonly unknown[] | null | undefined;
  /** api.garden.stories.listProjectUpdates. */
  updates: readonly unknown[] | null | undefined;
  raising: boolean;
}): SectionContent {
  const { team } = p;
  const teamHasPeople = !!team && (team.accepted.length > 0 || team.credits.length > 0 || !!team.mine);
  return {
    team: teamHasPeople || (p.roles?.length ?? 0) > 0,
    updates: (p.updates?.length ?? 0) > 0,
    support: p.raising,
  };
}

/** The owner's sections: everything with content, Updates always (the
 * composer lives there), Team while a request waits on them, Support once
 * anyone gave it, and whatever "Next steps" opened this visit. */
export function ownerSections(
  content: SectionContent,
  p: { requests: number; supporters: number; opened: ReadonlySet<ProjectTab> },
): SectionContent {
  return {
    team: content.team || p.requests > 0 || p.opened.has("team"),
    updates: true,
    support: content.support || p.supporters > 0 || p.opened.has("support"),
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
