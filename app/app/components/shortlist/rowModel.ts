// What a Shortlist row says (docs/handoff/favorites-redesign/README.md,
// "Three levels"): a thumbnail or date block, the title and a second line,
// mono meta (pay, going count), the status, and on a Needs you row an outline
// action. Pure, so the copy for every relation lives in one place and is
// tested; ShortlistRow.tsx draws it.
//
// Dates, names and pay come from the app's own helpers (shortDay, calendarDay
// for a role's deadline, firstNameOf, payText) and the desk's (timeLabel,
// venueName).

import { workKind } from "../../lib/shortlist/kind";
import { timeLabel, venueName } from "../../desk/deskCards";
import type { DeskCardId } from "../../desk/deskState";
import { calendarDay, shortDay } from "../../lib/dates";
import { firstNameOf } from "../../lib/names";
import { payText } from "../../lib/shortlist/model";
import { closesAt } from "../../lib/shortlist/needsYou";
import type { ClosedReason, ProjectKind, ShortlistEvent, ShortlistProject } from "../../lib/shortlist/types";
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
  /** A list that mixes areas (the overview, Today) names each row's area. */
  withArea: boolean;
  /** In a folded group. */
  past?: boolean;
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

/** "Oct 3 · 7PM": when an event is, in a row's status or a card's meta. */
export function whenLabel(ms: number): string {
  return `${shortDay(ms)} · ${timeLabel(ms)}`;
}

// ——————————————————————————————————————————————————————————————
// Projects
// ——————————————————————————————————————————————————————————————

function projectStatus(row: ShortlistProject, money: RowContext["money"]): string | null {
  switch (row.relation) {
    case "invited":
      return `Invited · ${shortDay(row.since)}`;
    case "leading":
      return row.pendingRequests ? waiting(row.pendingRequests) : "No requests waiting";
    case "team":
      return "You're on the team";
    case "waiting":
      return `Waiting on ${addressName(row.lead.name)} since ${shortDay(row.since)}`;
    case "backing": {
      const cents = row.backing?.amountCents;
      if (!cents) return "Backing";
      return row.backing?.recurring ? `Backing ${money(cents)} recurring` : `Backed ${money(cents)}`;
    }
    case "saved": {
      // neededBy is a calendar date: calendarDay reads it in UTC, as stored.
      const at = closesAt(row);
      return at ? `Closes ${calendarDay(at)}` : `Saved ${shortDay(row.since)}`;
    }
    case "closed":
      return row.closedReason ? CLOSED[row.closedReason] : "Closed";
  }
}

function projectRow(row: ShortlistProject, ctx: RowContext): Omit<RowModel, "id" | "hot" | "past"> {
  const kind = KIND_LABEL[workKind(row)];
  const sub = row.role
    ? line(kind, row.title, row.lead.name)
    : row.relation === "leading"
      ? line(kind, "You lead")
      : line(kind, `by ${row.lead.name}`);
  return {
    title: row.role?.title ?? row.title,
    sub,
    meta: payText(row) ?? (row.stage ? stageLabel(row.stage) : null),
    status: projectStatus(row, ctx.money),
    thumb: { kind: "cover", url: row.coverUrl, seed: row.projectId },
    // A reply owed, or a saved role about to close.
    action: !ctx.hot ? null : row.relation === "invited" ? "Reply" : row.relation === "saved" ? "Apply" : null,
  };
}

// ——————————————————————————————————————————————————————————————
// Events
// ——————————————————————————————————————————————————————————————

function eventStatus(event: ShortlistEvent, ctx: RowContext): string | null {
  if (ctx.past) return event.cancelled ? "Cancelled" : "Past";
  if (ctx.hot) return whenLabel(event.datetime);
  switch (event.relation) {
    case "hosting":
      return event.pendingRequests ? waiting(event.pendingRequests) : "You're hosting";
    case "going":
      return "You're going";
    case "requested":
      return "Requested";
    case "saved":
      return `Saved ${shortDay(event.since)}`;
  }
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
            ? line(KIND_LABEL[workKind(on)], on.title, `Wants to join as ${on.roleTitle}`)
            : line(ctx.withArea && AREA_LABEL.events, on.title, "Asked to come"),
        meta: on.type === "project" ? payText(on) : shortDay(on.datetime),
        status: `Request · ${shortDay(at)}`,
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
        sub: line(ctx.withArea && AREA_LABEL.events, venueName(event.location), timeLabel(event.datetime)),
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
