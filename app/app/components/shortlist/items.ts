// The Shortlist as lists of rows: each item's card id, the groups an area
// shows, the overview's short list, and the list an opened card steps
// through. Pure, over lib/shortlist/model.ts's groups, so the desk and (later)
// the phone pages list the same rows in the same order.
//
// Card ids follow the desk's URL (deskState DeskCardId): a role row is
// `role:<roleId>`, a row on the member's own free-text role
// `project:<projectId>:member`, the project itself `project:<projectId>`,
// then `request:<id>`, `event:<id>` and `person:<profileId>`. The backend
// keeps one row per posted role, per free-text place and per project
// (types.ts), so each id names one row, and it holds while the row moves
// between groups (an accepted invite is the same role:<id>, now On the team).
// A link from before free-text rows had their own id, `project:<id>` for one,
// still opens it when the project has no row of its own.

import type { DeskCardId, ShortlistArea } from "../../desk/deskState";
import { SHORTLIST_GROUPS, eventGroups, peopleGroups, projectGroups } from "../../lib/shortlist/model";
import { needsYou, type NeedsYouItem } from "../../lib/shortlist/needsYou";
import type {
  ProjectKind,
  ShortlistData,
  ShortlistEvent,
  ShortlistFollow,
  ShortlistProject,
  ShortlistRequest,
} from "../../lib/shortlist/types";

/** One row on the Shortlist. A Needs you item is one of these. */
export type ShortlistItem =
  | { type: "project"; row: ShortlistProject }
  | { type: "request"; request: ShortlistRequest }
  | { type: "event"; event: ShortlistEvent }
  | { type: "person"; person: ShortlistFollow };

/** The areas' names: tiles, chips, the area's title. */
export const AREA_LABEL: Record<ShortlistArea, string> = {
  projects: "Projects",
  events: "Events",
  people: "People",
};

/** The tail of a free-text row's card id: the member's own place, no posting. */
const MEMBER = "member";

/** The card an item opens as. */
export function cardIdOf(item: ShortlistItem): DeskCardId {
  switch (item.type) {
    case "project": {
      const { role, projectId } = item.row;
      if (role?.id) return `role:${role.id}`;
      return role ? `project:${projectId}:${MEMBER}` : `project:${projectId}`;
    }
    case "request":
      return `request:${item.request.requestId}`;
    case "event":
      return `event:${item.event.eventId}`;
    case "person":
      return `person:${item.person.profileId}`;
  }
}

/** The item a card id names, or null when it's not on the Shortlist (any
 *  more: an answered request leaves it). */
export function findItem(data: ShortlistData, id: string): ShortlistItem | null {
  const at = id.indexOf(":");
  const kind = id.slice(0, at);
  const key = id.slice(at + 1);
  if (at < 0 || !key) return null;
  let found: ShortlistItem | undefined;
  switch (kind) {
    case "role": {
      const row = data.projects.find((r) => r.role?.id === key);
      found = row && { type: "project", row };
      break;
    }
    case "project": {
      // The project itself, or with `:member` the member's own place on it.
      const [projectId, place] = key.split(":");
      const on = data.projects.filter((r) => r.projectId === projectId && !r.role?.id);
      const row =
        place === MEMBER ? on.find((r) => r.role) : place === undefined ? (on.find((r) => !r.role) ?? on[0]) : undefined;
      found = row && { type: "project", row };
      break;
    }
    case "request": {
      const request = data.requests.find((r) => r.requestId === key);
      found = request && { type: "request", request };
      break;
    }
    case "event": {
      const event = data.events.find((e) => e.eventId === key);
      found = event && { type: "event", event };
      break;
    }
    case "person": {
      const person = data.people.find((p) => p.profileId === key);
      found = person && { type: "person", person };
      break;
    }
  }
  return found ?? null;
}

// ——————————————————————————————————————————————————————————————
// Groups
// ——————————————————————————————————————————————————————————————

export interface ListGroup {
  /** The model's group key ("needs", "leading", "week", …), or a people
   *  group's interest. */
  key: string;
  /** The heading; "" for a short list of people, which needs none. */
  label: string;
  /** Needs you, or This week: every row in it gets the yellow rule. */
  hot: boolean;
  /** Closed or Past: folded behind "Show N …" and never counted. */
  folded: boolean;
  items: ShortlistItem[];
  /** Saved events past six, by month; null otherwise. */
  months: { key: string; label: string; items: ShortlistItem[] }[] | null;
}

const HOT_GROUPS = new Set<string>(
  [...SHORTLIST_GROUPS.projects, ...SHORTLIST_GROUPS.events].flatMap((g) => ("needsYou" in g ? [g.key] : [])),
);

const asEvent = (event: ShortlistEvent): ShortlistItem => ({ type: "event", event });
const asPerson = (person: ShortlistFollow): ShortlistItem => ({ type: "person", person });

/** An area's groups, in the model's order, empty ones left out. `kind`
 *  narrows Projects to paid or passion work. */
export function areaGroups(data: ShortlistData, now: number, area: ShortlistArea, kind: ProjectKind | null = null): ListGroup[] {
  switch (area) {
    case "projects":
      return projectGroups(data, now, kind).map((g) => ({
        key: g.key,
        label: g.label,
        hot: HOT_GROUPS.has(g.key),
        folded: g.folded,
        items: g.items,
        months: null,
      }));
    case "events":
      return eventGroups(data, now).map((g) => ({
        key: g.key,
        label: g.label,
        hot: HOT_GROUPS.has(g.key),
        folded: g.folded,
        items: g.items.map(asEvent),
        months: g.months?.map((m) => ({ key: m.key, label: m.label, items: m.items.map(asEvent) })) ?? null,
      }));
    case "people": {
      const { groups } = peopleGroups(data);
      return groups
        .filter((g) => g.items.length > 0)
        .map((g) => ({ key: g.label || "all", label: g.label, hot: false, folded: false, items: g.items.map(asPerson), months: null }));
    }
  }
}

/** The saved events in Past: what "Remove past events" lets go of, in one
 *  call. Going, hosting and requested are history, and stay. */
export function pastSaveIds(group: ListGroup): string[] {
  if (group.key !== "past") return [];
  return group.items.flatMap((item) => (item.type === "event" && item.event.relation === "saved" ? [item.event.eventId] : []));
}

/** Every live item, area by area in group order: what the overview lists
 *  under its tiles when there are few. Requests are left out, as they are
 *  from every count: they belong to the project or event you run. */
export function everything(data: ShortlistData, now: number): ShortlistItem[] {
  const live = (area: ShortlistArea) => areaGroups(data, now, area).filter((g) => !g.folded).flatMap((g) => g.items);
  return [...live("projects"), ...live("events"), ...live("people")].filter((item) => item.type !== "request");
}

/** The overview lists everything under its tiles at this many items or fewer. */
export const LIST_ALL_UNDER = 8;

/** Needs you shows this many rows, on the overview and on Today, then "N more". */
export const NEEDS_SHOWN = 3;

/** The events in the Needs you rows Today shows. Today's next-event card
 *  skips these, and only these: an event further down Needs you is out of
 *  sight there, so the card may show it. */
export function todayNeedsEventIds(needs: readonly NeedsYouItem[]): string[] {
  return needs.slice(0, NEEDS_SHOWN).flatMap((item) => (item.type === "event" ? [item.event.eventId] : []));
}

// ——————————————————————————————————————————————————————————————
// Stepping through a list from an opened card
// ——————————————————————————————————————————————————————————————

/** Where a card was opened: an area of the Shortlist (with its kind
 *  filter), the overview (area null), or Today's Needs you rows. */
export type ShortlistScope =
  | { view: "shortlist"; area: ShortlistArea | null; kind: ProjectKind | null }
  | { view: "today" };

/** The list a card opened in `scope` steps through, with ← and →: Needs you
 *  on Today and for a Needs you row on the overview; the overview's short
 *  list for anything else there; else the group of the area that holds it.
 *  Empty when the card is in none of these. */
export function stepIds(data: ShortlistData, now: number, scope: ShortlistScope, id: string): DeskCardId[] {
  const needs = needsYou(data, now).map(cardIdOf);
  if (scope.view === "today") return needs.includes(id as DeskCardId) ? needs : [];
  if (scope.area === null) {
    if (needs.includes(id as DeskCardId)) return needs;
    const listed = everything(data, now);
    if (listed.length <= LIST_ALL_UNDER) {
      const ids = listed.map(cardIdOf);
      if (ids.includes(id as DeskCardId)) return ids;
    }
  }
  const areas = scope.area ? [scope.area] : (["projects", "events", "people"] as const);
  for (const area of areas) {
    for (const group of areaGroups(data, now, area, scope.area ? scope.kind : null)) {
      const ids = group.items.map(cardIdOf);
      if (ids.includes(id as DeskCardId)) return ids;
    }
  }
  return [];
}

/** The card `id` opens in `scope`, with the list it steps through, or null
 *  when the Shortlist doesn't hold it there. Today opens only its Needs you
 *  rows as Shortlist cards; the rest of Today is the desk's own. `id` comes
 *  back as the item's own card id, which an old link may not have used. */
export function openInScope(
  data: ShortlistData,
  now: number,
  scope: ShortlistScope,
  id: string,
): { item: ShortlistItem; id: DeskCardId; ids: DeskCardId[] } | null {
  const item = findItem(data, id);
  if (!item) return null;
  const own = cardIdOf(item);
  const ids = stepIds(data, now, scope, own);
  if (scope.view === "today" && ids.length === 0) return null;
  return { item, id: own, ids };
}
