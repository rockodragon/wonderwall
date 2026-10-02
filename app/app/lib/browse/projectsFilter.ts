// What /projects (routes/projects.tsx) and the desk's Projects view do to the
// projects the server returns: which of the two views a project belongs to,
// the stage / "show" pills, the interest tags, the soft "matches first"
// signal, and (desk) a text search. Pure; the page keeps the URL reading and
// the rendering.

import { isStage, resolveStage, stageLabel, type Stage } from "../stage";
import { richDocPlainText } from "../richText";

// Two views, split by what the VISITOR wants rather than how the poster
// filed it (docs/features/project-ia.md): Projects is things to back or
// join; Work is things to get hired for — paid postings, gig dates, and the
// open roles on projects. A project with open roles shows in both.
export type ProjectsView = "projects" | "work";
export const PROJECT_VIEWS: { label: string; value: ProjectsView }[] = [
  { label: "Projects", value: "projects" },
  { label: "Work", value: "work" },
];

// The stages a visitor browsing for something to back or join cares about —
// the same ids and labels as the stage pill on every card (lib/stage.ts).
// Paused / completed / cancelled aren't things to back or join, so no pill.
export const BROWSE_STAGES: Stage[] = ["planning", "raising", "forming", "working", "releasing"];

export const SHOW_FILTERS: Record<ProjectsView, { label: string; value: string }[]> = {
  projects: [
    { label: "All", value: "" },
    ...BROWSE_STAGES.map((s) => ({ label: stageLabel(s), value: s })),
  ],
  work: [
    { label: "All", value: "" },
    { label: "Jobs", value: "jobs" },
    // Live booking (docs/features/live-booking.md §5): a recurring paid gig
    // is a paid project with a schedule attached (`gig` on the row). Labelled
    // "Shows" because "Gigs" read as the name of the whole Work view; the
    // value stays `gigs` so existing links keep landing here.
    { label: "Shows", value: "gigs" },
    { label: "Roles on projects", value: "roles" },
  ],
};

export function hasOpenRoles(p: any): boolean {
  return (p.openRoles?.length ?? 0) > 0;
}

// Older backends don't send `raising` yet — the goal and stage alone are a
// fair reading until they do.
export function isRaising(p: any): boolean {
  if (p.gig) return false;
  return p.raising ?? ((p.goal ?? 0) > 0 || p.stage === "raising");
}

export function inView(p: any, view: ProjectsView): boolean {
  return view === "projects" ? p.kind === "passion" : p.kind === "paid" || hasOpenRoles(p);
}

// A stage pill matches the stage the card's own pill shows (resolveStage) —
// except Raising, which matches isRaising: a project with a goal or active
// tiers shows the "Raising" badge and the "Back this" button whatever its
// stage, so the pill has to agree with them.
export function matchesShow(p: any, show: string): boolean {
  switch (show) {
    case "raising":
      return isRaising(p);
    case "jobs":
      return p.kind === "paid" && !p.gig;
    case "gigs":
      return !!p.gig;
    case "roles":
      return p.kind === "passion" && hasOpenRoles(p);
    default:
      return isStage(show) ? resolveStage(p) === show : true;
  }
}

/**
 * The view and its pill from the URL's raw values. The old ?kind=passion|paid|
 * gigs links still land in the right place, and the old ?show=people (Looking
 * for people) lands on Forming team. An unknown value reads as "All" ("").
 *
 * `view` is the page's ?view=; the desk, whose own ?view= names the tool, passes
 * null and says "work" through `work`.
 */
export function readProjectsView(raw: {
  view?: string | null;
  kind?: string | null;
  show?: string | null;
  work?: boolean;
}): { view: ProjectsView; show: string } {
  const legacyKind = raw.kind || "";
  const view: ProjectsView =
    raw.work || raw.view === "work" || legacyKind === "paid" || legacyKind === "gigs" ? "work" : "projects";
  const rawShow = raw.show || (legacyKind === "gigs" ? "gigs" : "");
  const showParam = rawShow === "people" ? "forming" : rawShow;
  const show = SHOW_FILTERS[view].some((f) => f.value === showParam) ? showParam : "";
  return { view, show };
}

// A project's own declared interests win when it has any; a project with
// none set (nothing selected at creation, or an older project from before
// this field existed) falls back to its creator's interests so existing/
// untagged projects don't just vanish from every filter.
export function projectTopics(p: any): string[] {
  return p.interests?.length ? p.interests : (p.creator?.interests ?? []);
}

// Interests/location are a soft signal, not a hard filter — with a small
// friend-group-scale catalog, excluding non-matches outright would too
// easily show an empty page. Matching projects float to the top instead.
// A project's own location wins over its creator's when the project set
// one; remote !== false (covers both true and unset) always satisfies a
// location filter — a remote-friendly project matches anywhere.
export function isMatch(p: any, soft: { interests: readonly string[]; location: string }): boolean {
  const interestHit =
    soft.interests.length > 0 && projectTopics(p).some((fn: string) => soft.interests.includes(fn));
  const locationText = p.remote === false ? (p.location ?? p.creator?.location) : null;
  const creatorLoc = locationText?.toLowerCase();
  const filterLoc = soft.location.toLowerCase();
  // Bidirectional substring: "Nashville, TN" vs "Nashville" should match
  // either way round, not just filter-is-shorter.
  const locationHit =
    !!soft.location &&
    (p.remote !== false || (!!creatorLoc && (creatorLoc.includes(filterLoc) || filterLoc.includes(creatorLoc))));
  return interestHit || locationHit;
}

/** The title, summary or full text of the project contains `query` (already
 * lower-cased). */
export function matchesProjectQuery(p: any, query: string): boolean {
  return (
    String(p.title ?? "").toLowerCase().includes(query) ||
    String(p.blurb ?? "").toLowerCase().includes(query) ||
    richDocPlainText(p.body).toLowerCase().includes(query)
  );
}

/**
 * The projects to show: those in the view and under its pill, then (each
 * optional) a community, a text search, the hard interest tags, and finally
 * the soft interest/location signal floating its matches to the top.
 */
export function filterProjects<T>(
  projects: readonly T[],
  opts: {
    view: ProjectsView;
    show: string;
    /** Keep only projects in the chosen community. Omit for all of them. */
    inCommunity?: ((p: T) => boolean) | null;
    /** Text search (any case). The /projects page has none; the desk does. */
    query?: string;
    /** Hard filter: the project's topics include one of these. */
    tags?: readonly string[];
    /** Soft signal: matches sort first. */
    soft?: { interests: readonly string[]; location: string } | null;
  },
): T[] {
  let list = projects.filter((p) => inView(p, opts.view) && matchesShow(p, opts.show));
  if (opts.inCommunity) list = list.filter(opts.inCommunity);
  const q = (opts.query ?? "").trim().toLowerCase();
  if (q) list = list.filter((p) => matchesProjectQuery(p, q));
  const tags = opts.tags ?? [];
  if (tags.length > 0) {
    list = list.filter((p) => projectTopics(p).some((fn: string) => tags.includes(fn)));
  }
  const soft = opts.soft;
  if (soft && (soft.interests.length > 0 || soft.location)) {
    list = [...list].sort((a, b) => Number(isMatch(b, soft)) - Number(isMatch(a, soft)));
  }
  return list;
}
