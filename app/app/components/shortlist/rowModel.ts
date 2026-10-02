// What a Shortlist row says (docs/handoff/favorites-redesign/README.md,
// "Three levels"): a thumbnail or date block, the title and a second line,
// the status, mono meta (pay, going count), and on a Needs you row an outline
// action. Pure, so the copy for every relation lives in one place and is
// tested; ShortlistRow.tsx draws it.
//
// On a Needs you row the second line says what it's about and the status is
// only the need: what to do, or when to show up. A date the row's date block
// already shows is never said again, and a time only once.
//
// Dates, names and pay come from the app's own helpers (shortDay, dayWord,
// timeLabel, calendarDay for a role's deadline, firstNameOf, payText) and the
// desk's venueName.

import { workKind } from "../../lib/shortlist/kind";
import { venueName } from "../../desk/deskCards";
import type { DeskCardId } from "../../desk/deskState";
import { calendarDay, dayWord, relativeDay, shortDay, timeLabel } from "../../lib/dates";
import { firstNameOf } from "../../lib/names";
import { EVENT_WORD, payText } from "../../lib/shortlist/model";
import { closesAt } from "../../lib/shortlist/needsYou";
import type { ClosedReason, EventRelation, ProjectKind, ShortlistEvent, ShortlistProject } from "../../lib/shortlist/types";
import { stageLabel } from "../../lib/stage";
import { AREA_LABEL, cardIdOf, type ShortlistItem } from "./items";

/** Paid or passion: the Projects chips and the start of a project row's second line. */
export const KIND_LABEL: Record<ProjectKind, string> = { paid: "Paid", passion: "Passion" };

export type Thumb =
  /** A project: its picture, else the abstract cover its id picks. */
  | { kind: "cover"; url: string | null; seed: string }
  /** An event: "OCT" over "3". */
  | { kind: "date"; month: string; day: string }
  /** A person: their photo, else their initials. */
  | { kind: "face"; name: string; url: string | null };

export interface RowModel {
  /** The card the row opens. */
  id: DeskCardId;
  title: string;
  sub: string;
  /** Mono, right-aligned: pay, stage, "24 going". */
  meta: string | null;
  status: string | null;
  thumb: Thumb;
  /** The outline button on a Needs you row. It opens the card, where the
   *  action itself is. */
  action: string | null;
  /** In Needs you: the yellow rule and a yellow mono status. */
  hot: boolean;
  /** Folded history (Closed, Past): quieter text. */
  past: boolean;
}

export interface RowContext {
  /** In Needs you or This week. */
  hot: boolean;
  /** A list that mixes areas (the overview, Today) names a person row's area. */
  withArea: boolean;
  /** In a folded group. */
  past?: boolean;
  /** The clock: "Today" and "Tomorrow" are told from it. */
  now: number;
  /** The app's money formatter (garden/ui formatMoney), for what you back. */
  money: (cents: number) => string;
}

/** A first name to address someone by, or their whole name before they've set one. */
export function addressName(name: string): string {
  return firstNameOf(name) ?? name;
}

function line(...parts: (string | null | false | undefined)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function waiting(n: number): string {
  return `${n} ${n === 1 ? "request" : "requests"} waiting`;
}

const CLOSED: Record<ClosedReason, string> = {
  declined: "Declined",
  withdrawn: "Withdrawn",
  left: "You left",
  removed: "Removed",
  finished: "Finished",
  filled: "Filled",
};

/** "Oct 3 · 7PM": when an event is, on its opened card. */
export function whenLabel(ms: number): string {
  return `${shortDay(ms)} · ${timeLabel(ms)}`;
}

/** "Tomorrow · 7PM": when an event is, in a row's status. The day in words and
 *  the time, never the date: the row's date block has that. A week or more out
 *  there's no day word, so the time stands alone. */
export function eventWhen(ms: number, now: number): string {
  return line(relativeDay(ms, now), timeLabel(ms));
}

// What a Needs you row asks of the member, in the yellow line.
const REPLY = "Reply to invite";
const DECIDE = "Approve or decline";

/** "asked Sep 28": when someone sent a request, muted after the need. */
function askedOn(at: number): string {
  return `asked ${shortDay(at)}`;
}

// ——————————————————————————————————————————————————————————————
// Projects
// ——————————————————————————————————————————————————————————————

function projectStatus(row: ShortlistProject, ctx: RowContext): string | null {
  switch (row.relation) {
    case "invited":
      return REPLY;
    case "leading":
      return row.pendingRequests ? waiting(row.pendingRequests) : "No requests waiting";
    case "team":
      return "You're on the team";
    case "waiting":
      return `Waiting on ${addressName(row.lead.name)} since ${shortDay(row.since)}`;
    case "backing": {
      const cents = row.backing?.amountCents;
      if (!cents) return "Backing";
      return row.backing?.recurring ? `Backing ${ctx.money(cents)} recurring` : `Backed ${ctx.money(cents)}`;
    }
    case "saved": {
      // neededBy is a calendar date: calendarDay reads it in UTC, as stored.
      const at = closesAt(row);
      if (at === null) return `Saved ${shortDay(row.since)}`;
      return ctx.hot ? `Apply by ${calendarDay(at)}` : `Closes ${calendarDay(at)}`;
    }
    case "closed":
      return row.closedReason ? CLOSED[row.closedReason] : "Closed";
  }
}

function projectRow(row: ShortlistProject, ctx: RowContext): Omit<RowModel, "id" | "hot" | "past"> {
  const kind = KIND_LABEL[workKind(row)];
  const title = row.role?.title ?? row.title;
  const base = {
    title,
    status: projectStatus(row, ctx),
    thumb: { kind: "cover", url: row.coverUrl, seed: row.projectId } as const,
    // A reply owed, or a saved role about to close.
    action: !ctx.hot ? null : row.relation === "invited" ? "Reply" : row.relation === "saved" ? "Apply" : null,
  };
  // Needs you: what it's about, then (in the status) the need. A bare
  // invite's title is already the project.
  if (row.relation === "invited") {
    return { ...base, sub: line(`${addressName(row.lead.name)} invited you`, row.role && row.title), meta: payText(row) };
  }
  if (ctx.hot && row.relation === "saved") {
    return { ...base, sub: line(row.title, payText(row)), meta: null };
  }
  const sub = row.role
    ? line(kind, row.title, row.lead.name)
    : row.relation === "leading"
      ? line(kind, "You lead")
      : line(kind, `by ${row.lead.name}`);
  return { ...base, sub, meta: payText(row) ?? (row.stage ? stageLabel(row.stage) : null) };
}

// ——————————————————————————————————————————————————————————————
// Events
// ——————————————————————————————————————————————————————————————

function eventStatus(event: ShortlistEvent, ctx: RowContext): string {
  if (ctx.past) return event.cancelled ? "Cancelled" : "Past";
  return eventWhen(event.datetime, ctx.now);
}

// In Needs you the relation is said to the member; under a heading of its
// own it's the label.
const YOURE: Partial<Record<EventRelation, string>> = { hosting: "You're hosting", going: "You're going" };

function eventRelation(event: ShortlistEvent, ctx: RowContext): string {
  return (ctx.hot && YOURE[event.relation]) || EVENT_WORD[event.relation];
}

function dateThumb(ms: number): Thumb {
  const [month = "", day = ""] = shortDay(ms).split(" ");
  return { kind: "date", month: month.toUpperCase(), day };
}

// ——————————————————————————————————————————————————————————————
// The row
// ——————————————————————————————————————————————————————————————

/** What a row says about an item, in the list it's in. */
export function rowModel(item: ShortlistItem, ctx: RowContext): RowModel {
  const id = cardIdOf(item);
  const hot = ctx.hot;
  const past = !!ctx.past;
  switch (item.type) {
    case "project":
      return { id, hot, past, ...projectRow(item.row, ctx) };
    case "request": {
      const { on, person, at } = item.request;
      return {
        id,
        hot,
        past,
        title: person.name,
        sub:
          on.type === "project"
            ? `Wants to join ${on.title} as ${on.roleTitle}`
            : line(`Wants to attend ${on.title}`, dayWord(on.datetime, ctx.now)),
        meta: askedOn(at),
        status: DECIDE,
        thumb: { kind: "face", name: person.name, url: person.imageUrl },
        action: hot ? "Review" : null,
      };
    }
    case "event": {
      const { event } = item;
      return {
        id,
        hot,
        past,
        title: event.title,
        sub: line(eventRelation(event, ctx), venueName(event.location)),
        meta: event.goingCount > 0 ? `${event.goingCount} going` : null,
        status: eventStatus(event, ctx),
        thumb: dateThumb(event.datetime),
        action: null,
      };
    }
    case "person": {
      const { person } = item;
      const interests = person.interests.filter((t) => !t.startsWith("other:")).slice(0, 2);
      return {
        id,
        hot,
        past,
        title: person.name,
        sub: line(ctx.withArea && AREA_LABEL.people, ...interests),
        meta: null,
        status: `Followed ${shortDay(person.since)}`,
        thumb: { kind: "face", name: person.name, url: person.imageUrl },
        action: null,
      };
    }
  }
}
