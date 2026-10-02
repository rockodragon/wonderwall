// The Shortlist's groups, counts and next steps: what the overview tiles, an
// area's rows and the palette stack show (docs/handoff/favorites-redesign/
// README.md, "The model" and "Three levels"). Pure functions of (data, now),
// like needsYou beside it.
//
// Rows group by one thing, the member's relationship to the item, so a row
// lands in exactly one group: the folded group once it's over, else Needs you
// (This week, for events) when needsYou picked it, else its relation's own
// group. Labels, folding, breakdown nouns and order all come from
// SHORTLIST_GROUPS, and the counts read the same placement, so a row counts
// once and only while it's live.

import { calendarDay, calendarDayEnd, shortDay } from "../dates";
import { firstNameOf } from "../names";
import { budgetAmountLabel, budgetKindLabel, type BudgetDeclaration } from "../budgetLabel";
import { groupFollows } from "../groupFollows";
import { closesAt, hasEnded, isAppearance, needsYou, needsYouArea, needsYouKey, type NeedsYouItem } from "./needsYou";
import type {
  ProjectKind,
  ShortlistData,
  ShortlistEvent,
  ShortlistFollow,
  ShortlistProject,
  ShortlistRequest,
} from "./types";

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
  /** The tile's breakdown noun, one and many. Counted by relation, so an
   *  invite in Needs you is still "1 invite". */
  noun: readonly [one: string, many: string] | null;
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
    { key: "needs", label: "Needs you", folded: false, needsYou: true, relation: "invited", noun: ["invite", "invites"] },
    { key: "leading", label: "Leading", folded: false, relation: "leading", noun: ["leading", "leading"], order: newestFirst },
    { key: "team", label: "On the team", folded: false, relation: "team", noun: ["on the team", "on the team"], order: newestFirst },
    { key: "waiting", label: "Waiting to hear", folded: false, relation: "waiting", noun: ["waiting", "waiting"], order: newestFirst },
    { key: "backing", label: "Backing", folded: false, relation: "backing", noun: ["backing", "backing"], order: newestFirst },
    { key: "saved", label: "Saved", folded: false, relation: "saved", noun: ["saved", "saved"], order: closingFirst },
    { key: "closed", label: "Closed", folded: true, relation: "closed", noun: null, order: newestFirst },
  ],
  events: [
    { key: "week", label: "This week", folded: false, needsYou: true, relation: null, noun: null },
    { key: "hosting", label: "Hosting", folded: false, relation: "hosting", noun: ["hosting", "hosting"], order: soonestFirst },
    { key: "going", label: "Going", folded: false, relation: "going", noun: ["going", "going"], order: soonestFirst },
    { key: "requested", label: "Requested", folded: false, relation: "requested", noun: ["requested", "requested"], order: soonestFirst },
    { key: "saved", label: "Saved", folded: false, relation: "saved", noun: ["saved", "saved"], order: soonestFirst, byMonth: true },
    { key: "past", label: "Past", folded: true, relation: null, noun: null, order: latestFirst },
  ],
} as const satisfies {
  projects: readonly GroupConfig<string, ShortlistProject>[];
  events: readonly GroupConfig<string, ShortlistEvent>[];
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
  /** The breakdown line, in group order: "1 invite", "2 leading". The UI joins them with " · ". */
  parts: string[];
  /** The tile's one next step, or null when there's none. */
  next: string | null;
}

export interface ShortlistSummary {
  /** Live items across the three areas: the header and the palette stack. */
  total: number;
  projects: AreaSummary & { kinds: Record<ProjectKind, number> };
  events: AreaSummary;
  people: AreaSummary;
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

function plural(n: number, [one, many]: readonly [string, string]): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "1 invite · 2 leading · …": live rows by relation, in group order, zeros left out. */
function breakdown<Key extends string, Row extends { relation: string }>(placed: Placed<Key, Row>[]): string[] {
  const live = liveRows(placed);
  return placed.flatMap(({ group: { noun, relation } }) => {
    const n = noun ? live.filter((row) => row.relation === relation).length : 0;
    return noun && n ? [plural(n, noun)] : [];
  });
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
  if (item.type === "project") return item.row.kind;
  return item.request.on.type === "project" ? item.request.on.kind : null;
}

// `kind` filters by projects.kind, so a paid role on a passion project stays
// under Passion.
function projectArea(data: ShortlistData, needs: NeedsYouItem[], kind?: ProjectKind | null) {
  const projectNeeds = needs.filter(isProjectNeed).filter((item) => !kind || kindOf(item) === kind);
  const rows = data.projects.filter((row) => !kind || row.kind === kind);
  return { needs: projectNeeds, placed: place(SHORTLIST_GROUPS.projects, rows, new Set(projectNeeds.map(needsYouKey))) };
}

/** The Projects area's groups, empty ones left out. */
export function projectGroups(data: ShortlistData, now: number, kind?: ProjectKind | null): ProjectGroup[] {
  const { needs, placed } = projectArea(data, needsYou(data, now), kind);
  return placed
    .map((entry) => toGroup<ProjectGroupKey, ShortlistProject, ProjectItem>(entry, needs, (row) => ({ type: "project", row })))
    .filter((group) => group.items.length > 0);
}

// A reply owed comes first, in needsYou's order; else the next saved role to
// close, even past Needs you's week.
function projectNext(needs: ProjectNeed[], rows: ShortlistProject[], now: number): string | null {
  const reply = needs.find((item) => item.rule === 1);
  if (reply?.type === "project") {
    return `Reply to ${firstName(reply.row.lead.name)} · ${reply.row.role?.title ?? reply.row.title}`;
  }
  if (reply?.type === "request") {
    return `Review ${firstName(reply.request.person.name)}'s request · ${reply.request.on.title}`;
  }
  const isOpen = (row: ShortlistProject) => {
    const at = closesAt(row);
    return at !== null && calendarDayEnd(at) >= now;
  };
  const [closing] = rows.filter(isOpen).sort(closingFirst);
  const at = closing && closesAt(closing);
  return at ? `Apply by ${calendarDay(at)} · ${closing.role?.title ?? closing.title}` : null;
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

function eventNext(events: ShortlistEvent[], now: number): string | null {
  const [next] = events.filter((event) => isAppearance(event) && !isPast(event, now)).sort(soonestFirst);
  if (!next) return null;
  return `${next.relation === "hosting" ? "Hosting" : "Next"}: ${next.title}, ${shortDay(next.datetime)}`;
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

function peopleSummary(people: ShortlistFollow[]): AreaSummary {
  if (people.length === 0) return { count: 0, needsYou: 0, parts: [], next: null };
  // Threshold 1, so every follow lands in its interest group and the groups
  // can be counted with groupFollows' own Other rule.
  const interests = groupFollows(asFollows(people), 1).groups.length;
  const latest = people.reduce((a, b) => (b.since > a.since ? b : a));
  return {
    count: people.length,
    needsYou: 0,
    parts: [`Across ${plural(interests, ["interest", "interests"])}`],
    next: `Latest: ${latest.name}, ${shortDay(latest.since)}`,
  };
}

// ——————————————————————————————————————————————————————————————
// Summary
// ——————————————————————————————————————————————————————————————

/** The overview: each area's count, breakdown and next step, and the total. */
export function summary(data: ShortlistData, now: number): ShortlistSummary {
  const needs = needsYou(data, now);
  const needsIn = (area: "projects" | "events") => needs.filter((item) => needsYouArea(item) === area).length;

  const projectsArea = projectArea(data, needs);
  const liveProjects = liveRows(projectsArea.placed);
  const projects = {
    count: liveProjects.length,
    needsYou: needsIn("projects"),
    parts: breakdown(projectsArea.placed),
    next: projectNext(projectsArea.needs, data.projects, now),
    kinds: {
      paid: liveProjects.filter((row) => row.kind === "paid").length,
      passion: liveProjects.filter((row) => row.kind === "passion").length,
    },
  };

  const eventsArea = eventArea(data, needs, now);
  const events = {
    count: liveRows(eventsArea.placed).length,
    needsYou: needsIn("events"),
    parts: breakdown(eventsArea.placed),
    next: eventNext(data.events, now),
  };

  const people = peopleSummary(data.people);

  return { total: projects.count + events.count + people.count, projects, events, people };
}
