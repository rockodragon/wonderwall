// Which tabs a project page has, and which one the URL's ?tab= names
// (routes/projects.$id.tsx). Pure, so the rules can be tested.
//
// A project has About, Team, Updates and Support. A gig is booked date by
// date rather than staffed, so its second tab is Dates. Support is for
// projects, not hires: a job or a gig has three tabs.

export type ProjectTab = "about" | "team" | "dates" | "updates" | "support";

/** The first tab; the URL leaves ?tab= off for it. */
export const DEFAULT_PROJECT_TAB: ProjectTab = "about";

export function projectTabs(opts: {
  isGig: boolean;
  isPassion: boolean;
  /** Join requests waiting on the owner; 0 for anyone else. */
  requests: number;
}): { id: ProjectTab; label: string }[] {
  const team = opts.requests > 0 ? `Team · ${opts.requests} ${opts.requests === 1 ? "request" : "requests"}` : "Team";
  return [
    { id: "about", label: "About" },
    opts.isGig ? { id: "dates", label: "Dates" } : { id: "team", label: team },
    { id: "updates", label: "Updates" },
    ...(opts.isPassion ? [{ id: "support" as const, label: "Support" }] : []),
  ];
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
