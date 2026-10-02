// What /projects (routes/projects.tsx) and the desk's Projects view do to the
// projects the server returns: which chip a project answers to, the Stage
// menu, the interest tags, the soft "matches first" signal, and (desk) a text
// search. Pure; the pages keep the URL reading and the rendering.
//
// One exclusive row of four chips, by what the VISITOR is looking for
// (docs/features/project-ia.md). A project can answer to more than one:
//
//   Projects         things people are making (kind = passion, every stage)
//   Seeking funding  a goal, the Raising stage, or an active tier
//   Seeking people   an open role, paid or volunteer; plus unpaid postings
//   Jobs and gigs    paid postings (one-off jobs and recurring gigs); plus a
//                    project's paid roles
//
// Stage is a menu beside the chips and narrows any of them but Jobs and gigs.

import { resolveStage, stageLabel, type Stage } from "../stage";
import { richDocPlainText } from "../richText";
import { budgetKindLabel } from "../budgetLabel";
import { paidRoles } from "../projectKind";

export type ProjectsLens = "projects" | "funding" | "people" | "work";

/** The chips, in order. The first is the default and carries no URL param. */
export const PROJECT_LENSES: { label: string; value: ProjectsLens }[] = [
  { label: "Projects", value: "projects" },
  { label: "Seeking funding", value: "funding" },
  { label: "Seeking people", value: "people" },
  { label: "Jobs and gigs", value: "work" },
];

export const DEFAULT_LENS: ProjectsLens = "projects";

/** The stages a visitor browsing for something to back or join cares about,
 * with the same ids and labels as the stage pill on every card (lib/stage.ts).
 * Paused / completed / cancelled aren't things to back or join. Raising is
 * something a project is DOING (it has a goal, or active tiers), not a step
 * it is at, so it is "Seeking funding" and not here; an owner can still set
 * the stage to Raising. */
export const BROWSE_STAGES: Stage[] = ["planning", "forming", "working", "releasing"];

/** The Stage menu: "Any stage" first, which carries no URL param. */
export const STAGE_OPTIONS: { label: string; value: string }[] = [
  { label: "Any stage", value: "" },
  ...BROWSE_STAGES.map((s) => ({ label: stageLabel(s), value: s })),
];

/** The menu's caption: "Stage", or the stage that is chosen. */
export function stageCaption(stage: string): string {
  return isBrowseStage(stage) ? stageLabel(stage) : "Stage";
}

function isBrowseStage(value: unknown): value is Stage {
  return typeof value === "string" && (BROWSE_STAGES as readonly string[]).includes(value);
}

/** The create button each chip goes with: Hire someone on Jobs and gigs, Start
 * a project on the rest. */
export function lensCreate(lens: ProjectsLens): { kind: "project" | "hire"; label: string } {
  return lens === "work" ? { kind: "hire", label: "Hire someone" } : { kind: "project", label: "Start a project" };
}

export function hasOpenRoles(p: any): boolean {
  return (p.openRoles?.length ?? 0) > 0;
}

// Older backends don't send `raising` yet — the goal and stage alone are a
// fair reading until they do.
export function isRaising(p: any): boolean {
  if (p.gig) return false;
  return p.raising ?? ((p.goal ?? 0) > 0 || p.stage === "raising");
}

/** Seeking people: a project with an open role (paid or volunteer), or a
 * posting that says plainly it is unpaid. */
export function seeksPeople(p: any): boolean {
  if (p.kind === "paid") return budgetKindLabel(p) === "Volunteer";
  return p.kind === "passion" && hasOpenRoles(p);
}

/** Jobs and gigs: a paid posting, or a project with an open role that pays
 * (only a role that declared its pay, the way its card prints it). */
export function isJobOrGig(p: any): boolean {
  if (p.kind === "paid") return budgetKindLabel(p) !== "Volunteer";
  return p.kind === "passion" && paidRoles(p.openRoles).length > 0;
}

/** Whether a project answers to a chip. */
export function matchesLens(p: any, lens: ProjectsLens): boolean {
  switch (lens) {
    case "projects":
      return p.kind === "passion";
    case "funding":
      return p.kind === "passion" && isRaising(p);
    case "people":
      return seeksPeople(p);
    case "work":
      return isJobOrGig(p);
  }
}

/** A Stage choice matches the stage the card's own pill shows (resolveStage).
 * "" is any stage. */
export function matchesStage(p: any, stage: string): boolean {
  return !isBrowseStage(stage) || resolveStage(p) === stage;
}

// The URL. Canonical: ?show=funding|people|work (absent = Projects) and
// ?stage=planning|forming|working|releasing. Old links keep landing where they
// did, below.
const LENS_WORDS = new Map<string, ProjectsLens>([
  ["projects", "projects"],
  ["funding", "funding"],
  ["raising", "funding"],
  ["people", "people"],
  ["roles", "people"],
  ["work", "work"],
  ["jobs", "work"],
  ["gigs", "work"],
]);

function lensWord(raw: string | null | undefined): ProjectsLens | null {
  return (raw && LENS_WORDS.get(raw)) || null;
}

/**
 * The chip and the Stage choice from the URL's raw values.
 *
 * `show` and `stage` each take either kind of word, because the two pages used
 * to put different things in them: the /projects page's ?show= and the desk's
 * ?stage= both held "gigs", "roles", "raising" or a stage. So:
 *
 *   work     show|stage = work, jobs, gigs · view=work · kind=paid|gigs · the
 *            desk's old Work toggle (`work`)
 *   people   show|stage = people, roles · seek=people
 *   funding  show|stage = funding, raising · seek=funding
 *   projects anything else: view=projects, kind=passion, an unknown word
 *   stage    a stage word in show or stage (an old ?show=working), read with
 *            whichever chip is on
 *
 * An explicit ?seek= beats a chip an old param implies; then show, stage, and
 * last the old view/kind/Work toggle. Jobs and gigs has no Stage.
 *
 * `view` is the page's ?view=; the desk, whose own ?view= names the tool,
 * passes null and says "work" through `work` (its old ?tab=work).
 */
export function readProjectsView(raw: {
  view?: string | null;
  kind?: string | null;
  show?: string | null;
  stage?: string | null;
  seek?: string | null;
  work?: boolean;
}): { lens: ProjectsLens; stage: string } {
  const seekLens = raw.seek === "funding" || raw.seek === "people" ? raw.seek : null;
  const oldView = raw.work || raw.view === "work" || raw.kind === "paid" || raw.kind === "gigs" ? "work" : null;
  const lens = seekLens ?? lensWord(raw.show) ?? lensWord(raw.stage) ?? oldView ?? DEFAULT_LENS;
  const stage = [raw.stage, raw.show].find(isBrowseStage) ?? "";
  return { lens, stage: lens === "work" ? "" : stage };
}

/**
 * The chip and Stage a click on `clicked` leads to. Projects resets both.
 * Another chip keeps the Stage, except Jobs and gigs, which has none.
 */
export function selectLens(
  now: { lens: ProjectsLens; stage: string },
  clicked: ProjectsLens,
): { lens: ProjectsLens; stage: string } {
  if (clicked === DEFAULT_LENS) return { lens: DEFAULT_LENS, stage: "" };
  return { lens: clicked, stage: clicked === "work" ? "" : now.stage };
}

/**
 * Puts a chip and Stage into `params` the way both pages write them. The old
 * params in `legacy` (the page's view / kind / seek; the desk's tab / seek)
 * are dropped, so a click on a chip cleans up a link that used them.
 */
export function writeProjectsView(
  params: URLSearchParams,
  next: { lens: ProjectsLens; stage: string },
  legacy: readonly string[],
): void {
  for (const key of legacy) params.delete(key);
  if (next.lens === DEFAULT_LENS) params.delete("show");
  else params.set("show", next.lens);
  const stage = next.lens === "work" || !isBrowseStage(next.stage) ? "" : next.stage;
  if (stage) params.set("stage", stage);
  else params.delete("stage");
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
 * The projects to show: those under the chip and the Stage choice, then (each
 * optional) a community, a text search, the hard interest tags, and finally
 * the soft interest/location signal floating its matches to the top.
 */
export function filterProjects<T>(
  projects: readonly T[],
  opts: {
    lens: ProjectsLens;
    /** The Stage menu's choice; "" is any. Ignored under Jobs and gigs. */
    stage?: string;
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
  const stage = opts.lens === "work" ? "" : (opts.stage ?? "");
  let list = projects.filter((p) => matchesLens(p, opts.lens) && matchesStage(p, stage));
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
