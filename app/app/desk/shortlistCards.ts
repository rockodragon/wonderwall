// A Shortlist item as an opened card (docs/handoff/favorites-redesign/
// README.md, "Three levels", level 3): the desk's own opened card, plus a
// status line and one action that follows the item's state. Pure: Desk.tsx
// opens the card, OpenedCard.tsx draws it, ShortlistActions.tsx runs its
// buttons.
//
// The Shortlist carries what it needs to sort and decide; the desk already
// holds the rest for anything public and upcoming. A project's blurb, an
// event's hosts and whether it sells tickets come from the desk's own cards
// (projectCard, eventCard) when the desk has them, so nothing more is asked
// of the server.
//
// | State                      | Action                                    |
// |----------------------------|-------------------------------------------|
// | Invited                    | Accept, with Decline as text              |
// | Join request on yours      | Accept, with Decline as text              |
// | Request to attend yours    | Approve, with Decline as text             |
// | Leading                    | Review requests                           |
// | Applied or asked to join   | Withdraw request                          |
// | Saved role                 | Apply                                     |
// | Saved event                | I'm going                                 |
// | Going                      | You're going (disabled)                   |
// | Person                     | See profile                               |

import type { FavoriteTargetType } from "../../convex/favorites";
import { addressName, KIND_LABEL, whenLabel } from "../components/shortlist/rowModel";
import { cardIdOf, type ShortlistItem } from "../components/shortlist/items";
import { shortDay } from "../lib/dates";
import { withProjectTab } from "../lib/projectTabs";
import { payText } from "../lib/shortlist/model";
import type { ShortlistEvent, ShortlistFollow, ShortlistProject, ShortlistRequest } from "../lib/shortlist/types";
import { stageLabel } from "../lib/stage";
import {
  dateKicker,
  eventCard,
  projectCard,
  timeLabel,
  toneFor,
  venueName,
  type DeskCard,
  type DeskEventInput,
  type DeskFact,
  type DeskProjectInput,
} from "./deskCards";

// ——————————————————————————————————————————————————————————————
// Buttons
// ——————————————————————————————————————————————————————————————

/** The mutation a button runs, with its arguments as the server takes them. */
export type ShortlistCall =
  | { fn: "respondToInvite"; projectId: string; accept: boolean }
  | { fn: "decideRequest"; memberId: string; accept: boolean }
  | { fn: "withdrawRequest"; projectId: string }
  | { fn: "updateApplicationStatus"; applicationId: string; status: "accepted" | "declined" }
  | { fn: "apply"; eventId: string }
  | { fn: "unsave"; targetType: FavoriteTargetType; targetId: string };

/** A button on a Shortlist card. Solid yellow is the one action; the rest
 *  are text. */
export type ShortlistButton =
  /** Runs a mutation, then says `done` in a toast. */
  | { kind: "call"; label: string; solid: boolean; call: ShortlistCall; done: string }
  | { kind: "link"; label: string; solid: boolean; href: string }
  /** Already true: "You're going", disabled. */
  | { kind: "state"; label: string };

const call = (label: string, solid: boolean, c: ShortlistCall, done: string): ShortlistButton => ({
  kind: "call",
  label,
  solid,
  call: c,
  done,
});
const link = (label: string, solid: boolean, href: string): ShortlistButton => ({ kind: "link", label, solid, href });

const projectHref = (id: string) => `/projects/${id}`;
// The project page's Team tab: open roles to apply for, requests to answer.
const teamHref = (id: string) => `/projects/${id}?${withProjectTab(new URLSearchParams(), "team")}`;
const eventHref = (id: string) => `/events/${id}`;

const REMOVE = "Remove from shortlist";
const REMOVED = "Removed from your shortlist.";

// ——————————————————————————————————————————————————————————————
// The card
// ——————————————————————————————————————————————————————————————

export interface ShortlistCardContext {
  now: number;
  /** The app's money formatter (garden/ui formatMoney). */
  money: (cents: number) => string;
  /** The desk's upcoming events and projects (deskInput), for what the
   *  Shortlist doesn't carry. */
  events: readonly DeskEventInput[];
  projects: readonly DeskProjectInput[];
}

/** The opened card for a Shortlist item. */
export function shortlistCard(item: ShortlistItem, ctx: ShortlistCardContext): DeskCard {
  switch (item.type) {
    case "project":
      return projectRowCard(item.row, ctx);
    case "request":
      return requestCard(item.request);
    case "event":
      return eventRowCard(item.event, ctx);
    case "person":
      return personCard(item.person);
  }
}

function base(item: ShortlistItem): Pick<DeskCard, "id" | "sections" | "note" | "tone"> {
  const id = cardIdOf(item);
  // On no view's surface: it's opened from a row, and waits off the page.
  return { id, sections: [], note: false, tone: toneFor(id) };
}

function facts(...pairs: [string, string | null | undefined][]): DeskFact[] {
  return pairs.flatMap(([label, value]) => (value ? [{ label, value }] : []));
}

// ——— Projects and roles ———

function projectStatus(row: ShortlistProject): string {
  const lead = addressName(row.lead.name);
  const since = shortDay(row.since);
  switch (row.relation) {
    case "invited":
      return `${lead} invited you ${since} · Waiting on you`;
    case "leading":
      return row.pendingRequests
        ? `You lead this · ${row.pendingRequests} ${row.pendingRequests === 1 ? "request" : "requests"} waiting`
        : "You lead this";
    case "team":
      return `You joined ${since} · On the team`;
    case "waiting":
      // A request on a posted role is an application; with none, an ask to join.
      return `${row.role?.id ? "You applied" : "You asked to join"} ${since} · Waiting on ${lead}`;
    case "backing":
      return `You back this · Since ${since}`;
    case "saved":
      return row.role?.neededBy
        ? `You saved this ${since} · Closes ${shortDay(row.role.neededBy)}`
        : `You saved this ${since}`;
    case "closed":
      return row.closedReason === "finished"
        ? "This project has finished"
        : row.closedReason === "filled"
          ? "This role has been filled"
          : "This one's closed";
  }
}

function projectButtons(row: ShortlistProject): ShortlistButton[] {
  const { projectId, title } = row;
  const roleId = row.role?.id;
  const unsave = call(REMOVE, false, roleId ? { fn: "unsave", targetType: "role", targetId: roleId } : { fn: "unsave", targetType: "project", targetId: projectId }, REMOVED);
  switch (row.relation) {
    case "invited":
      return [
        call("Accept", true, { fn: "respondToInvite", projectId, accept: true }, `You're on the team for ${title}.`),
        call("Decline", false, { fn: "respondToInvite", projectId, accept: false }, `Declined. ${addressName(row.lead.name)} will see it.`),
      ];
    case "leading":
      return [link(row.pendingRequests ? "Review requests" : "See team", true, teamHref(projectId)), link("Project page →", false, projectHref(projectId))];
    case "team":
    case "backing":
      return [link("See project", true, projectHref(projectId))];
    case "waiting":
      return [call("Withdraw request", false, { fn: "withdrawRequest", projectId }, "Request withdrawn."), link("Project page →", false, projectHref(projectId))];
    case "saved":
      return roleId ? [link("Apply", true, teamHref(projectId)), unsave] : [link("See project", true, projectHref(projectId)), unsave];
    case "closed":
      // A filled role is still a save: it can be let go.
      return row.closedReason === "filled" ? [link("Project page →", false, projectHref(projectId)), unsave] : [link("Project page →", false, projectHref(projectId))];
  }
}

function projectRowCard(row: ShortlistProject, ctx: ShortlistCardContext): DeskCard {
  const item: ShortlistItem = { type: "project", row };
  const kind = KIND_LABEL[row.kind];
  const pay = payText(row);
  const stage = row.stage ? stageLabel(row.stage) : null;
  const leading = row.relation === "leading";
  const known = ctx.projects.find((p) => p._id === row.projectId);
  const lead = leading ? "you" : row.lead.name;
  return {
    ...base(item),
    kind: "project",
    image: row.coverUrl,
    face: { kicker: kind, title: row.title, foot: `Led by ${lead}` },
    detail: {
      meta: [leading ? "You lead" : kind, pay ?? stage].filter(Boolean).join(" · "),
      status: projectStatus(row),
      title: row.role?.title ?? row.title,
      host: row.role ? `${row.title}, led by ${lead}` : leading ? "Led by you" : `By ${lead}`,
      description: known ? projectCard(known, [], ctx.money).detail.description : "",
      facts: facts(["Pay", pay], ["Stage", stage], ["Closes", row.role?.neededBy ? shortDay(row.role.neededBy) : null]),
      aside:
        row.relation === "invited"
          ? `${addressName(row.lead.name)} is waiting on your reply`
          : row.relation === "waiting"
            ? `Sent ${shortDay(row.since)}`
            : null,
      action: { kind: "shortlist", buttons: projectButtons(row) },
    },
    href: projectHref(row.projectId),
    projectId: row.projectId,
  };
}

// ——— Requests ———

function requestCard(request: ShortlistRequest): DeskCard {
  const { on, person, message, at, requestId } = request;
  const first = addressName(person.name);
  const pay = on.type === "project" ? payText(on) : null;
  const buttons: ShortlistButton[] =
    on.type === "project"
      ? [
          call("Accept", true, { fn: "decideRequest", memberId: requestId, accept: true }, `${first} joined ${on.title} as ${on.roleTitle}.`),
          call("Decline", false, { fn: "decideRequest", memberId: requestId, accept: false }, `Declined. ${first} will see it.`),
        ]
      : [
          call("Approve", true, { fn: "updateApplicationStatus", applicationId: requestId, status: "accepted" }, `${first} is coming to ${on.title}.`),
          call("Decline", false, { fn: "updateApplicationStatus", applicationId: requestId, status: "declined" }, `Declined ${first}'s request.`),
        ];
  const what = on.type === "project" ? "Join request" : "Request to attend";
  return {
    ...base({ type: "request", request }),
    kind: "person",
    image: person.imageUrl,
    face: { kicker: what, title: person.name, foot: person.interests.filter((t) => !t.startsWith("other:")).join(" · ") || null },
    detail: {
      meta: `${what} · ${on.title}`,
      status: `${first} asked ${shortDay(at)} · Waiting on you`,
      title: person.name,
      host:
        on.type === "project"
          ? [`Wants to join as ${on.roleTitle}`, pay].filter(Boolean).join(" · ")
          : `Wants to come to ${on.title}, ${shortDay(on.datetime)}`,
      description: message ? `“${message}”` : "",
      aside: `${first} is waiting on your reply`,
      action: { kind: "shortlist", buttons },
    },
    href: person.profileId ? `/profile/${person.profileId}` : on.type === "project" ? teamHref(on.id) : eventHref(on.id),
    // The bio fills in when there's no note with the request.
    profileId: person.profileId ?? undefined,
  };
}

// ——— Events ———

function isPast(event: ShortlistEvent, now: number): boolean {
  return event.cancelled || event.datetime < now;
}

function eventStatus(event: ShortlistEvent, now: number): string {
  if (isPast(event, now)) return event.cancelled ? "Cancelled by the host" : "This event has passed";
  const when = whenLabel(event.datetime);
  switch (event.relation) {
    case "hosting":
      return `You're hosting · ${when}`;
    case "going":
      return `You're going · ${when}`;
    case "requested":
      return "You requested a place · Waiting on the host";
    case "saved":
      return `You saved this ${shortDay(event.since)}`;
  }
}

function eventButtons(event: ShortlistEvent, known: DeskCard | null, now: number): ShortlistButton[] {
  const { eventId, title, relation } = event;
  const unsave = call(REMOVE, false, { fn: "unsave", targetType: "event", targetId: eventId }, REMOVED);
  if (isPast(event, now)) return relation === "saved" ? [unsave] : [];
  switch (relation) {
    case "hosting":
      return [link(event.pendingRequests ? "Review requests" : "Manage event", true, `${eventHref(eventId)}?tab=guests`)];
    case "going":
      return [{ kind: "state", label: "You're going" }];
    case "requested":
      return [{ kind: "state", label: "Requested" }];
    case "saved": {
      // The desk's own answer for this event: free (join here), approval or
      // tickets (on its page). An event the desk doesn't list goes to its page.
      const action = known?.detail.action;
      const go =
        action?.kind === "rsvp"
          ? call(action.label, true, { fn: "apply", eventId }, `You're going to ${title}.`)
          : action?.kind === "link"
            ? link(action.label, true, action.href)
            : null;
      return go ? [go, unsave] : [unsave];
    }
  }
}

function eventRowCard(event: ShortlistEvent, ctx: ShortlistCardContext): DeskCard {
  const desk = ctx.events.find((e) => e._id === event.eventId);
  const known = desk ? eventCard(desk, []) : null;
  const venue = venueName(event.location) || null;
  return {
    ...base({ type: "event", event }),
    kind: "event",
    image: event.coverUrl ?? known?.image ?? null,
    face: known?.face ?? { kicker: dateKicker(event.datetime), title: event.title, foot: venue },
    detail: {
      meta: known?.detail.meta ?? [dateKicker(event.datetime), timeLabel(event.datetime), venue?.toUpperCase()].filter(Boolean).join(" · "),
      status: eventStatus(event, ctx.now),
      title: event.title,
      host: known?.detail.host ?? null,
      description: known?.detail.description ?? "",
      aside: event.goingCount > 0 ? `${event.goingCount} going` : null,
      action: { kind: "shortlist", buttons: eventButtons(event, known, ctx.now) },
    },
    href: eventHref(event.eventId),
    eventId: event.eventId,
  };
}

// ——— People ———

function personCard(person: ShortlistFollow): DeskCard {
  const interests = person.interests.filter((t) => !t.startsWith("other:"));
  const first = addressName(person.name);
  return {
    ...base({ type: "person", person }),
    kind: "person",
    image: person.imageUrl,
    face: { kicker: "Following", title: person.name, foot: interests[0] ?? null },
    detail: {
      meta: ["Following", interests[0]].filter(Boolean).join(" · "),
      status: `You followed ${first} ${shortDay(person.since)}`,
      title: person.name,
      host: interests.join(" · ") || null,
      // The bio isn't on the Shortlist; the opened card asks for the profile.
      description: "",
      aside: null,
      action: {
        kind: "shortlist",
        buttons: [
          link("See profile", true, `/profile/${person.profileId}`),
          call("Unfollow", false, { fn: "unsave", targetType: "profile", targetId: person.profileId }, `Unfollowed ${person.name}.`),
        ],
      },
    },
    href: `/profile/${person.profileId}`,
    profileId: person.profileId,
  };
}
