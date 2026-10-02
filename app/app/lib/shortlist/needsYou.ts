// Needs you: what the member owes a reply or an appearance to
// (docs/handoff/favorites-redesign/README.md, "Needs you rules"). One pure
// function holds the rules and their order, so Today, the Shortlist overview,
// the area chips and the palette dot all read the same list and can't
// disagree. Nothing else qualifies: the Shortlist only holds what the member
// did themselves, so nothing here is a suggestion.

import type { ShortlistData, ShortlistEvent, ShortlistProject, ShortlistRequest } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead rules 2 and 3 look. */
export const NEEDS_YOU_WINDOW_MS = 7 * DAY_MS;

/** From `now` to a week later, both ends included. Earlier is already past;
 *  later can wait for next week. */
export function inNeedsYouWindow(at: number, now: number): boolean {
  return at >= now && at <= now + NEEDS_YOU_WINDOW_MS;
}

/** One row in Needs you, with the rule that put it there. */
export type NeedsYouItem =
  /** Rule 1: an invite to you. Rule 3: a saved role closing within the window. */
  | { type: "project"; rule: 1 | 3; row: ShortlistProject }
  /** Rule 1: a join request on a project you lead, or a request to attend an event you host. */
  | { type: "request"; rule: 1; request: ShortlistRequest }
  /** Rule 2: an event you're going to or hosting, within the window. */
  | { type: "event"; rule: 2; event: ShortlistEvent };

type Reply = Extract<NeedsYouItem, { type: "request" }> | { type: "project"; rule: 1; row: ShortlistProject };

/** Going or hosting, and not cancelled: the events you've said you'll show up to. */
export function isAppearance(event: ShortlistEvent): boolean {
  return (event.relation === "going" || event.relation === "hosting") && !event.cancelled;
}

/** When a saved role stops taking people (`projectRoles.neededBy`). Null for
 *  anything that isn't a saved role, or a role with no date. */
export function closesAt(row: ShortlistProject): number | null {
  return row.relation === "saved" ? (row.role?.neededBy ?? null) : null;
}

/** The row's own key, unique across the Shortlist. */
export function needsYouKey(item: NeedsYouItem): string {
  switch (item.type) {
    case "project":
      return item.row.key;
    case "request":
      return item.request.key;
    case "event":
      return item.event.key;
  }
}

/** The area a Needs you row belongs to: a request sits with the project or
 *  event it's on. */
export function needsYouArea(item: NeedsYouItem): "projects" | "events" {
  if (item.type === "event") return "events";
  if (item.type === "request" && item.request.on.type === "event") return "events";
  return "projects";
}

// Paid invites lead (decision 7: work first), then the other invites, then
// requests. Oldest first within each: the longest wait is owed first.
function replyRank(item: Reply): number {
  if (item.type === "request") return 2;
  return item.row.kind === "paid" ? 0 : 1;
}

function waitingSince(item: Reply): number {
  return item.type === "request" ? item.request.at : item.row.since;
}

/** Everything that needs the member, rule 1 first, then 2, then 3. */
export function needsYou(data: ShortlistData, now: number): NeedsYouItem[] {
  // 1. Someone is waiting on your reply.
  const replies: Reply[] = [
    ...data.projects
      .filter((row) => row.relation === "invited")
      .map((row) => ({ type: "project", rule: 1, row }) as const),
    ...data.requests.map((request) => ({ type: "request", rule: 1, request }) as const),
  ].sort((a, b) => replyRank(a) - replyRank(b) || waitingSince(a) - waitingSince(b));

  // 2. An event you're going to or hosting, soonest first.
  const appearances = data.events
    .filter((event) => isAppearance(event) && inNeedsYouWindow(event.datetime, now))
    .sort((a, b) => a.datetime - b.datetime)
    .map((event) => ({ type: "event", rule: 2, event }) as const);

  // 3. A saved role that closes soon, soonest first.
  const closing = data.projects
    .flatMap((row) => {
      const at = closesAt(row);
      return at !== null && inNeedsYouWindow(at, now) ? [{ row, at }] : [];
    })
    .sort((a, b) => a.at - b.at)
    .map(({ row }) => ({ type: "project", rule: 3, row }) as const);

  return [...replies, ...appearances, ...closing];
}
