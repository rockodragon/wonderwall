// The Shortlist's data contract (docs/handoff/favorites-redesign/README.md).
//
// convex/shortlist.ts returns a ShortlistData; app/lib/shortlist/*.ts turns it
// into groups, counts and Needs you. Types only, with ids as plain strings, so
// both sides can import this file without pulling in the other's runtime.
//
// One row per thing. When a member has several relations to the same thing,
// the backend keeps the first in this order and drops the rest:
//   projects  invited → leading → team → waiting → backing → saved → closed
//   events    hosting → going → requested → saved
// A project holds three kinds of thing: each posted role on it; the member's
// own place through a free-text role (no posting); and the project itself
// (leading, backing, a bare save). So a team row on a free-text role and a
// backing row on the same project both show. A bare saved project drops out
// once the member has a live (not closed) row for that project; a closed one
// doesn't cover it, so a save made after a decline still shows.

import type { BudgetDeclaration } from "../budgetLabel";
import type { Stage } from "../stage";

/** `projects.kind`. Every project is exactly one. */
export type ProjectKind = "paid" | "passion";

/** Where the member stands with a project, or a role on it. */
export type ProjectRelation =
  /** A lead invited you (projectMembers "invited"). Waiting on your reply. */
  | "invited"
  /** You run it (projects.userId). */
  | "leading"
  /** You're on the team (projectMembers "accepted"). */
  | "team"
  /** You applied or asked to join (projectMembers "pending"). */
  | "waiting"
  /** You support it (projectSupport). Once the project finishes, only a
   *  recurring backing stays here: it still charges until you stop it. */
  | "backing"
  /** You saved it (favorites, targetType "project" or "role"). */
  | "saved"
  /** It ended for you: declined, withdrawn, left, removed, the project
   *  finished, or a role you saved was filled or closed. */
  | "closed";

export type ClosedReason = "declined" | "withdrawn" | "left" | "removed" | "finished" | "filled";

export interface ShortlistPerson {
  /** profiles._id, or null for someone without a profile (an email invite). */
  profileId: string | null;
  name: string;
  imageUrl: string | null;
  interests: string[];
}

export interface ShortlistProject {
  /** Unique within the list: `${relation}:${projectId}`, `${relation}:${projectId}:${roleId}`,
   *  or `${relation}:${projectId}:member` for a free-text role. */
  key: string;
  relation: ProjectRelation;
  kind: ProjectKind;
  projectId: string;
  title: string;
  /** resolveStage(project); null when it has none. */
  stage: Stage | null;
  lead: { name: string; profileId: string | null };
  coverUrl: string | null;
  /** The role this row is about, when it is about one. */
  role: { id: string | null; title: string; neededBy: number | null } | null;
  /** The role's pay, else the project's (paid projects), else null. Format with lib/budgetLabel. */
  pay: BudgetDeclaration | null;
  /** When this relation started: invited, applied, joined, backed or saved. */
  since: number;
  /** "leading" only: join requests and applications waiting on you. */
  pendingRequests?: number;
  /** "backing" only. */
  backing?: { amountCents: number | null; recurring: boolean };
  /** "closed" only. */
  closedReason?: ClosedReason;
}

/** Someone waiting on your decision: a join request or application on a
 *  project you lead, or a request to attend an event you host. */
export interface ShortlistRequest {
  /** `request:project:${projectMembersId}` or `request:event:${eventApplicationsId}`. */
  key: string;
  /** projectMembers._id or eventApplications._id, for the accept/decline mutation. */
  requestId: string;
  on:
    | { type: "project"; id: string; title: string; kind: ProjectKind; roleTitle: string; pay: BudgetDeclaration | null }
    | { type: "event"; id: string; title: string; datetime: number; endTime: number | null };
  person: ShortlistPerson;
  message: string | null;
  at: number;
}

export type EventRelation = "hosting" | "going" | "requested" | "saved";

export interface ShortlistEvent {
  /** `${relation}:${eventId}`. */
  key: string;
  relation: EventRelation;
  eventId: string;
  title: string;
  datetime: number;
  /** events.endTime; null when it has none. Ended is `hasEnded` (needsYou.ts). */
  endTime: number | null;
  location: string | null;
  /** Null once the event has ended: a Past row has no picture to show. */
  coverUrl: string | null;
  /** Everyone going, counted as the event page counts them (events.ts
   *  loadGoingCount). 0 once the event has ended: Past isn't counted. */
  goingCount: number;
  cancelled: boolean;
  /** When this relation started. */
  since: number;
  /** "hosting" only: requests to attend waiting on you. 0 once it's
   *  cancelled or has ended: there's nothing left to approve. */
  pendingRequests?: number;
}

export interface ShortlistFollow extends ShortlistPerson {
  profileId: string;
  /** favorites.createdAt. */
  since: number;
}

export interface ShortlistData {
  projects: ShortlistProject[];
  requests: ShortlistRequest[];
  events: ShortlistEvent[];
  people: ShortlistFollow[];
}
