// The Shortlist's groups, counts, previews and next steps: what the overview
// tiles, an area's rows and the palette stack show (docs/handoff/favorites-redesign/
// README.md, "The model" and "Three levels"). Pure functions of (data, now),
// like needsYou beside it.
//
// Rows group by one thing, the member's relationship to the item, so a row
// lands in exactly one group: the folded group once it's over, else Needs you
// (This week, for events) when needsYou picked it, else its relation's own
// group. Labels, folding and order all come from SHORTLIST_GROUPS, and the
// counts read the same placement, so a row counts once and only while it's
// live.
//
// summary() is what the overview's tiles say: each area's count and a preview
// of what's in it, by name, read by the desk's tiles and the phone's alike.

import { dayWord, timeLabel } from "../dates";
import { firstNameOf } from "../names";
import { budgetAmountLabel, budgetKindLabel, type BudgetDeclaration } from "../budgetLabel";
import { workKind } from "./kind";
import { groupFollows } from "../groupFollows";
import { closesAt, hasEnded, needsYou, needsYouArea, needsYouKey, type NeedsYouItem } from "./needsYou";
import type {
  EventRelation,
  ProjectKind,
  ProjectRelation,
  ShortlistData,
  ShortlistEvent,
  ShortlistFollow,
  ShortlistProject,
  ShortlistRequest,
} from "./types";
import type { ShortlistArea } from "./url";

// ——————————————————————————————————————————————————————————————
// The relationships config
// ——————————————————————————————————————————————————————————————

export interface GroupConfig<Key extends string, Row extends { relation: string }> {
  key: Key;
  /** The group's heading, in the spec's words. */
  label: string;
  /** Over for the member (Closed, Past): folded by default and never counted. */
  folded: boolean;
  /** Where this area's Needs you rows sit, in needsYou's order. */
  needsYou?: true;
  /** The relation whose rows land here, unless Needs you or the calendar moves them. */
  relation: Row["relation"] | null;
  /** Row order. The Needs you group keeps needsYou's order instead. */
  order?: (a: Row, b: Row) => number;
  /** Splits into month buckets past MONTHS_AFTER rows. */
  byMonth?: true;
}

const newestFirst = (a: { since: number }, b: { since: number }) => b.since - a.since;
const soonestFirst = (a: ShortlistEvent, b: ShortlistEvent) => a.datetime - b.datetime;
const latestFirst = (a: ShortlistEvent, b: ShortlistEvent) => b.datetime - a.datetime;

/** Soonest to close first, roles with no date after those with one, then the
 *  newest saved. */
function closingFirst(a: ShortlistProject, b: ShortlistProject): number {
  const x = closesAt(a) ?? Infinity;
  const y = closesAt(b) ?? Infinity;
  return (x === y ? 0 : x < y ? -1 : 1) || newestFirst(a, b);
}

/** Each area's groups, in display order. People group by interest instead
 *  (peopleGroups). */
export const SHORTLIST_GROUPS = {
  projects: [
    { key: "needs", label: "Needs you", folded: false, needsYou: true, relation: "invited" },
    { key: "leading", label: "Leading", folded: false, relation: "leading", order: newestFirst },
    { key: "team", label: "On the team", folded: false, relation: "team", order: newestFirst },
    { key: "waiting", label: "Waiting to hear", folded: false, relation: "waiting", order: newestFirst },
    { key: "backing", label: "Backing", folded: false, relation: "backing", order: newestFirst },
    { key: "saved", label: "Saved", folded: false, relation: "saved", order: closingFirst },
    { key: "closed", label: "Closed", folded: true, relation: "closed", order: newestFirst },
  ],
  events: [
    { key: "week", label: "This week", folded: false, needsYou: true, relation: null },
    { key: "hosting", label: "Hosting", folded: false, relation: "hosting", order: soonestFirst },
    { key: "going", label: "Going", folded: false, relation: "going", order: soonestFirst },
    { key: "requested", label: "Requested", folded: false, relation: "requested", order: soonestFirst },
    { key: "saved", label: "Saved", folded: false, relation: "saved", order: soonestFirst, byMonth: true },
    { key: "past", label: "Past", folded: true, relation: null, order: latestFirst },
  ],
} as const satisfies {
  projects: readonly GroupConfig<string, ShortlistProject>[];
  events: readonly GroupConfig<string, ShortlistEvent>[];
};

/** What the member is to an item, in a word: a tile's preview and an event
 *  row's second line say it. By relation, so an invite in Needs you is still
 *  "Invited". */
export const PROJECT_WORD: Record<ProjectRelation, string> = {
  invited: "Invited",
  leading: "Leading",
  team: "On the team",
  waiting: "Waiting",
  backing: "Backing",
  saved: "Saved",
  closed: "Closed",
};
export const EVENT_WORD: Record<EventRelation, string> = {
  hosting: "Hosting",
  going: "Going",
  requested: "Requested",
  saved: "Saved",
};

export type ProjectGroupKey = (typeof SHORTLIST_GROUPS.projects)[number]["key"];
export type EventGroupKey = (typeof SHORTLIST_GROUPS.events)[number]["key"];

/** Saved events split into months once there are more than this many. */
export const MONTHS_AFTER = 6;

// ——————————————————————————————————————————————————————————————
// Types
// ——————————————————————————————————————————————————————————————

export interface ShortlistGroup<Key extends string, Item> {
  key: Key;
  label: string;
  folded: boolean;
  items: Item[];
}

/** A row in the Projects area: a project or role row, or a request on a
 *  project you lead (only ever in Needs you). */
export type ProjectItem = { type: "project"; row: ShortlistProject } | { type: "request"; request: ShortlistRequest };

export type ProjectGroup = ShortlistGroup<ProjectGroupKey, ProjectItem>;

export interface MonthBucket {
  /** "2026-10". */
  key: string;
  /** "October", or "January 2027" outside this year. */
  label: string;
  items: ShortlistEvent[];
}

export interface EventGroup extends ShortlistGroup<EventGroupKey, ShortlistEvent> {
  /** Saved past MONTHS_AFTER events, by month; null otherwise. */
  months: MonthBucket[] | null;
}

export interface PeopleGroups {
  grouped: boolean;
  groups: { label: string; items: ShortlistFollow[] }[];
}

export interface AreaSummary {
  /** Live items only: never past or closed, never a request. */
  count: number;
  /** This area's Needs you rows, requests included: the tile's flag and the chip's dot. */
  needsYou: number;
}

/** What a tile says of Projects or Events: up to PREVIEW_LINES lines, then
 *  how many more there are. */
export interface LinesPreview {
  items: PreviewLine[];
  more: number;
}

/** One line in a Projects or Events tile, "Zine Workshop · Hosting · Today
 *  7PM": the item's name, then what to know of it. */
export interface PreviewLine {
  key: string;
  name: string;
  note: string;
}

/** What the People tile says: the faces of the PREVIEW_FACES people followed
 *  most recently, and their names, "Kofi, Grace, Jo and 11 more". */
export interface FacesPreview {
  items: { profileId: string; name: string; imageUrl: string | null }[];
  line: string;
}

export interface ShortlistSummary {
  /** Live items across the three areas: the header and the palette stack. */
  total: number;
  projects: AreaSummary & { kinds: Record<ProjectKind, number>; preview: LinesPreview };
  events: AreaSummary & { preview: LinesPreview };
  people: AreaSummary & { preview: FacesPreview };
}

/** A Projects or Events tile names this many items, then "and N more". */
export const PREVIEW_LINES = 3;

/** The People tile shows this many faces, and names this many of them. */
export const PREVIEW_FACES = 5;
export const PREVIEW_NAMES = 3;

/** An area's live count: Projects narrowed by kind when a kind is on. The
 *  header's count on the desk and the phone. */
export function areaCount(summary: ShortlistSummary, area: ShortlistArea, kind: ProjectKind | null): number {
  return area === "projects" && kind ? summary.projects.kinds[kind] : summary[area].count;
}

// ——————————————————————————————————————————————————————————————
// Placement
// ——————————————————————————————————————————————————————————————

interface Placed<Key extends string, Row extends { relation: string }> {
  group: GroupConfig<Key, Row>;
  rows: Row[];
}

/** Every group with the rows that land in it, in order. */
function place<Key extends string, Row extends { key: string; relation: string }>(
  config: readonly GroupConfig<Key, Row>[],
  rows: readonly Row[],
  picked: ReadonlySet<string>,
  isOver: (row: Row) => boolean = () => false,
): Placed<Key, Row>[] {
  const over = config.find((group) => group.folded);
  const hot = config.find((group) => group.needsYou);
  const groupOf = (row: Row) =>
    (isOver(row) && over) || (picked.has(row.key) && hot) || config.find((group) => group.relation === row.relation);
  return config.map((group) => {
    const placed = rows.filter((row) => groupOf(row) === group);
    return { group, rows: group.order ? placed.sort(group.order) : placed };
  });
}

function liveRows<Key extends string, Row extends { relation: string }>(placed: Placed<Key, Row>[]): Row[] {
  return placed.flatMap(({ group, rows }) => (group.folded ? [] : rows));
}

function toGroup<Key extends string, Row extends { relation: string }, Item>(
  { group, rows }: Placed<Key, Row>,
  needs: Item[],
  item: (row: Row) => Item,
): ShortlistGroup<Key, Item> {
  return { key: group.key, label: group.label, folded: group.folded, items: group.needsYou ? needs : rows.map(item) };
}

/** The first `n` of a list, as lines, and how many are left out. */
function firstOf<T>(items: T[], n: number, line: (item: T) => PreviewLine): LinesPreview {
  return { items: items.slice(0, n).map(line), more: Math.max(0, items.length - n) };
}

function firstName(name: string): string {
  return firstNameOf(name) ?? name;
}

// ——————————————————————————————————————————————————————————————
// Projects
// ——————————————————————————————————————————————————————————————

type ProjectNeed = Extract<NeedsYouItem, { type: "project" | "request" }>;

function isProjectNeed(item: NeedsYouItem): item is ProjectNeed {
  return needsYouArea(item) === "projects";
}

function kindOf(item: ProjectNeed): ProjectKind | null {
  if (item.type === "project") return workKind(item.row);
  return item.request.on.type === "project" ? workKind(item.request.on) : null;
}

// `kind` filters by what each row pays (workKind), so a paid role on a
// passion project is Paid.
function projectArea(data: ShortlistData, needs: NeedsYouItem[], kind?: ProjectKind | null) {
  const projectNeeds = needs.filter(isProjectNeed).filter((item) => !kind || kindOf(item) === kind);
  const rows = data.projects.filter((row) => !kind || workKind(row) === kind);
  return { needs: projectNeeds, placed: place(SHORTLIST_GROUPS.projects, rows, new Set(projectNeeds.map(needsYouKey))) };
}

/** The Projects area's groups, empty ones left out. */
export function projectGroups(data: ShortlistData, now: number, kind?: ProjectKind | null): ProjectGroup[] {
  const { needs, placed } = projectArea(data, needsYou(data, now), kind);
  return placed
    .map((entry) => toGroup<ProjectGroupKey, ShortlistProject, ProjectItem>(entry, needs, (row) => ({ type: "project", row })))
    .filter((group) => group.items.length > 0);
}

// Needs you's project rows first, in needsYou's order (a request isn't a row:
// it belongs to the project you lead), then the rest in group order. Named by
// the project, whatever the role.
function projectPreview(needs: ProjectNeed[], live: ShortlistProject[]): LinesPreview {
  const urgent = needs.flatMap((item) => (item.type === "project" ? [item.row] : []));
  const rows = [...urgent, ...live.filter((row) => !urgent.includes(row))];
  return firstOf(rows, PREVIEW_LINES, (row) => ({ key: row.key, name: row.title, note: PROJECT_WORD[row.relation] }));
}

/** A row's pay in the app's own words: "$1,200", "$300–600", "Open to
 *  proposals", "Confidential" or "Volunteer". Null when it has none. */
export function payText(row: { pay: BudgetDeclaration | null }): string | null {
  return row.pay ? (budgetAmountLabel(row.pay) ?? budgetKindLabel(row.pay)) : null;
}

// ——————————————————————————————————————————————————————————————
// Events
// ——————————————————————————————————————————————————————————————

/** Past: cancelled, or ended (hasEnded). One that's on now isn't Past yet. */
export function isPast(event: ShortlistEvent, now: number): boolean {
  return event.cancelled || hasEnded(event, now);
}

function eventArea(data: ShortlistData, needs: NeedsYouItem[], now: number) {
  const week = needs.flatMap((item) => (item.type === "event" ? [item.event] : []));
  const placed = place(SHORTLIST_GROUPS.events, data.events, new Set(week.map((event) => event.key)), (event) =>
    isPast(event, now),
  );
  return { week, placed };
}

/** Months in the order the rows already come in. */
function monthBuckets(events: ShortlistEvent[], now: number): MonthBucket[] {
  const thisYear = new Date(now).getFullYear();
  const buckets: MonthBucket[] = [];
  for (const event of events) {
    const day = new Date(event.datetime);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;
    let bucket = buckets.find((b) => b.key === key);
    if (!bucket) {
      const format: Intl.DateTimeFormatOptions =
        day.getFullYear() === thisYear ? { month: "long" } : { month: "long", year: "numeric" };
      bucket = { key, label: day.toLocaleDateString("en-US", format), items: [] };
      buckets.push(bucket);
    }
    bucket.items.push(event);
  }
  return buckets;
}

/** The Events area's groups, empty ones left out. */
export function eventGroups(data: ShortlistData, now: number): EventGroup[] {
  const { week, placed } = eventArea(data, needsYou(data, now), now);
  return placed
    .map((entry) => {
      const group = toGroup(entry, week, (event) => event);
      const split = entry.group.byMonth && group.items.length > MONTHS_AFTER;
      return { ...group, months: split ? monthBuckets(group.items, now) : null };
    })
    .filter((group) => group.items.length > 0);
}

// Soonest first, whatever the relation: "Zine Workshop · Hosting · Today 7PM".
function eventPreview(live: ShortlistEvent[], now: number): LinesPreview {
  const soonest = [...live].sort(soonestFirst);
  return firstOf(soonest, PREVIEW_LINES, (event) => ({
    key: event.key,
    name: event.title,
    note: `${EVENT_WORD[event.relation]} · ${dayWord(event.datetime, now)} ${timeLabel(event.datetime)}`,
  }));
}

// ——————————————————————————————————————————————————————————————
// People
// ——————————————————————————————————————————————————————————————

// groupFollows reads the Following page's shape; this hands it ours.
function asFollows(people: ShortlistFollow[]) {
  return people.map((profile) => ({ favoritedAt: profile.since, profile }));
}

/** Follows by first interest once there are 6 or more (groupFollows). */
export function peopleGroups(data: ShortlistData): PeopleGroups {
  const { grouped, groups } = groupFollows(asFollows(data.people));
  return { grouped, groups: groups.map(({ label, items }) => ({ label, items: items.map((item) => item.profile) })) };
}

/** "Kofi, Grace, Jo and 11 more"; with nobody left over, "Kofi, Grace and Jo". */
function namesLine(names: string[], more: number): string {
  if (more > 0) return `${names.join(", ")} and ${more} more`;
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
}

function peopleSummary(people: ShortlistFollow[]): ShortlistSummary["people"] {
  const recent = [...people].sort((a, b) => b.since - a.since);
  return {
    count: people.length,
    needsYou: 0,
    preview: {
      items: recent.slice(0, PREVIEW_FACES).map(({ profileId, name, imageUrl }) => ({ profileId, name, imageUrl })),
      line: namesLine(
        recent.slice(0, PREVIEW_NAMES).map((person) => firstName(person.name)),
        Math.max(0, people.length - PREVIEW_NAMES),
      ),
    },
  };
}

// ——————————————————————————————————————————————————————————————
// Summary
// ——————————————————————————————————————————————————————————————

/** The overview: each area's count and what's in it (the preview), and the total. */
export function summary(data: ShortlistData, now: number): ShortlistSummary {
  const needs = needsYou(data, now);
  const needsIn = (area: "projects" | "events") => needs.filter((item) => needsYouArea(item) === area).length;

  const projectsArea = projectArea(data, needs);
  const liveProjects = liveRows(projectsArea.placed);
  const projects = {
    count: liveProjects.length,
    needsYou: needsIn("projects"),
    preview: projectPreview(projectsArea.needs, liveProjects),
    kinds: {
      paid: liveProjects.filter((row) => workKind(row) === "paid").length,
      passion: liveProjects.filter((row) => workKind(row) === "passion").length,
    },
  };

  const eventsArea = eventArea(data, needs, now);
  const liveEvents = liveRows(eventsArea.placed);
  const events = {
    count: liveEvents.length,
    needsYou: needsIn("events"),
    preview: eventPreview(liveEvents, now),
  };

  const people = peopleSummary(data.people);

  return { total: projects.count + events.count + people.count, projects, events, people };
}
