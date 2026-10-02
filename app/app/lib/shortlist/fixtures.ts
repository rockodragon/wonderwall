// Test fixtures for the Shortlist's pure logic, shared by needsYou.test.ts and
// model.test.ts. sampleShortlist() mirrors the spec's sample data
// (docs/handoff/favorites-redesign/mockup.html): Mara's Sound Mixer invite,
// Hana's request, the Copy Editor role closing in 5 days, and the rest.
// Dates are local, so the "Oct 7" a test expects is the day it was built on;
// a role's deadline is a calendar date (day()), as the app stores it.

import type { BudgetDeclaration } from "../budgetLabel";
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

export const DAY = 24 * 60 * 60 * 1000;

/** A local date in 2026 unless `year` says otherwise. Noon by default. */
export function on(month: number, day: number, hour = 12, year = 2026): number {
  return new Date(year, month - 1, day, hour).getTime();
}

/** Fri Oct 2, 2026, noon: the mockup's today. */
export const NOW = on(10, 2);

/** A calendar date the way the app stores one (a role's neededBy): that
 *  day's UTC midnight. */
export function day(month: number, date: number, year = 2026): number {
  return Date.UTC(year, month - 1, date);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export const amount = (budget: number): BudgetDeclaration => ({ budgetType: "amount", budget });
export const range = (budget: number, budgetMax: number): BudgetDeclaration => ({ budgetType: "range", budget, budgetMax });
export const VOLUNTEER: BudgetDeclaration = { budgetType: "volunteer" };
export const PROPOSALS: BudgetDeclaration = { budgetType: "proposals" };

/** A role to hang on a project row. */
export function role(title: string, neededBy: number | null = null): NonNullable<ShortlistProject["role"]> {
  return { id: slug(title), title, neededBy };
}

/** A project row; give it a `role` to make it a role row. */
export function project(
  relation: ProjectRelation,
  title: string,
  extra: Partial<ShortlistProject> = {},
): ShortlistProject {
  const projectId = extra.projectId ?? slug(title);
  const role = extra.role;
  return {
    key: role ? `${relation}:${projectId}:${role.id ?? "member"}` : `${relation}:${projectId}`,
    relation,
    kind: "passion",
    projectId,
    title,
    stage: null,
    lead: { name: "Dana Wells", profileId: "dana" },
    coverUrl: null,
    role: null,
    pay: null,
    since: NOW - DAY,
    ...extra,
  };
}

export function projectRequest(
  name: string,
  projectTitle: string,
  extra: { kind?: ProjectKind; roleTitle?: string; pay?: BudgetDeclaration | null; at?: number } = {},
): ShortlistRequest {
  const id = `${slug(name)}-${slug(projectTitle)}`;
  return {
    key: `request:project:${id}`,
    requestId: id,
    on: {
      type: "project",
      id: slug(projectTitle),
      title: projectTitle,
      kind: extra.kind ?? "passion",
      roleTitle: extra.roleTitle ?? "Member",
      pay: extra.pay ?? null,
    },
    person: person(name),
    message: null,
    at: extra.at ?? NOW - DAY,
  };
}

export function eventRequest(
  name: string,
  eventTitle: string,
  datetime: number,
  at = NOW - DAY,
  endTime: number | null = null,
): ShortlistRequest {
  const id = `${slug(name)}-${slug(eventTitle)}`;
  return {
    key: `request:event:${id}`,
    requestId: id,
    on: { type: "event", id: slug(eventTitle), title: eventTitle, datetime, endTime },
    person: person(name),
    message: null,
    at,
  };
}

export function event(
  relation: EventRelation,
  title: string,
  datetime: number,
  extra: Partial<ShortlistEvent> = {},
): ShortlistEvent {
  const eventId = extra.eventId ?? slug(title);
  return {
    key: `${relation}:${eventId}`,
    relation,
    eventId,
    title,
    datetime,
    endTime: null,
    location: null,
    coverUrl: null,
    goingCount: 0,
    cancelled: false,
    since: NOW - 10 * DAY,
    ...extra,
  };
}

function person(name: string, interests: string[] = []) {
  return { profileId: slug(name), name, imageUrl: null, interests };
}

export function follow(name: string, interests: string[], since: number): ShortlistFollow {
  return { ...person(name, interests), since };
}

export function shortlist(extra: Partial<ShortlistData> = {}): ShortlistData {
  return { projects: [], requests: [], events: [], people: [], ...extra };
}

/** The spec's sample member on Fri Oct 2: 15 live projects (7 paid, 8
 *  passion), 10 live events, 14 follows. */
export function sampleShortlist(): ShortlistData {
  return {
    projects: [
      project("invited", "Hollow Creek Field Recordings", {
        kind: "paid",
        role: role("Sound Mixer"),
        lead: { name: "Mara Lin", profileId: "mara-lin" },
        pay: amount(1200),
        since: on(9, 30),
      }),
      // A paid role on a passion project: it stays under Passion.
      project("saved", "Psalms Zine, Vol. 3", {
        role: role("Copy Editor", day(10, 7)),
        lead: { name: "Jo Alvarez", profileId: "jo-alvarez" },
        pay: amount(300),
        since: on(9, 21),
      }),
      project("leading", "Hymns for the Commons", { pendingRequests: 1, since: on(9, 4) }),
      project("leading", "Photographer for the Advent Catalog", { kind: "paid", pay: amount(900), since: on(9, 12) }),
      project("team", "Neighborhood Portraits", {
        kind: "paid",
        role: role("Photographer"),
        pay: range(1500, 2000),
        since: on(8, 14),
      }),
      project("team", "Garden Mural at 5th & Alder", { role: role("Painter"), pay: VOLUNTEER, since: on(7, 2) }),
      project("waiting", "Advent Liturgy Films", {
        kind: "paid",
        role: role("Motion Designer", day(10, 30)),
        pay: amount(1200),
        since: on(9, 27),
      }),
      project("waiting", "Harvest Supper 2026", {
        kind: "paid",
        role: role("Poster Illustrator", day(10, 9)),
        pay: amount(600),
        since: on(9, 30),
      }),
      project("waiting", "Choir for the Commons", { role: role("Alto"), pay: VOLUNTEER, since: on(9, 29) }),
      project("backing", "The Long Table podcast", { backing: { amountCents: 1500, recurring: true }, since: on(8, 3) }),
      project("backing", "Street Choir Recordings", { backing: { amountCents: 5000, recurring: false }, since: on(6, 12) }),
      project("saved", "The Lantern Café rebrand", {
        kind: "paid",
        role: role("Brand Designer", day(11, 1)),
        pay: range(2500, 4000),
        since: on(9, 18),
      }),
      project("saved", "The Wind in the Willows", {
        kind: "paid",
        role: role("Set Builder", day(11, 20)),
        pay: PROPOSALS,
        since: on(9, 9),
      }),
      project("saved", "Icons for the Everyday", { since: on(9, 14) }),
      project("saved", "Quiet Hours Zine", { since: on(9, 24) }),
      project("closed", "Okafor–Lin wedding", {
        kind: "paid",
        role: role("Wedding Videographer"),
        closedReason: "declined",
        since: on(8, 20),
      }),
      project("closed", "Wren, Low Country", {
        kind: "paid",
        role: role("Album Cover Artist"),
        closedReason: "declined",
        since: on(7, 10),
      }),
      project("closed", "Easter Sunrise Installation", { closedReason: "finished", since: on(3, 1) }),
    ],
    requests: [
      projectRequest("Hana Cho", "Hymns for the Commons", { roleTitle: "Cellist", pay: VOLUNTEER, at: on(9, 30) }),
    ],
    events: [
      event("going", "Open Studio Night", on(10, 3, 19)),
      event("going", "Printmaking Workshop", on(10, 8, 18)),
      event("going", "Harvest Supper", on(10, 17, 17)),
      event("hosting", "Zine Workshop", on(10, 15, 18)),
      event("requested", "Poetry & Prayer Salon", on(10, 22, 19)),
      event("saved", "Film Night: Babette's Feast", on(10, 24, 19)),
      event("saved", "Makers Market", on(10, 31, 10)),
      event("saved", "Songwriters in the Round", on(11, 8, 20)),
      event("saved", "Icon Writing Retreat", on(11, 14, 9)),
      event("saved", "Advent Lessons & Carols", on(12, 6, 17)),
      event("going", "Plein Air Morning", on(9, 26, 8), { cancelled: true }),
      event("going", "Late Summer Potluck", on(9, 19, 18)),
      event("saved", "Darkroom Basics", on(9, 12, 13)),
    ],
    people: [
      follow("Kofi Mensah", ["Design", "Production"], on(9, 30)),
      follow("Dana Wells", ["Design", "Business"], on(8, 2)),
      follow("Sam Ito", ["Photography", "Teaching"], on(7, 12)),
      follow("Ana Reyes", ["Photography", "Craft"], on(6, 3)),
      follow("Theo Okafor", ["Filmmaking", "Writing"], on(5, 20)),
      follow("Jo Alvarez", ["Writing", "Poetry"], on(9, 2)),
      follow("Esther Park", ["Writing", "Audio"], on(8, 18)),
      follow("Miriam Cole", ["Writing", "Ministry"], on(4, 9)),
      follow("Luis Romero", ["Art", "Leadership"], on(7, 1)),
      follow("Lydia Shore", ["Art", "Worship"], on(3, 15)),
      follow("Grace Mun", ["Music", "Worship"], on(9, 28)),
      follow("Nate Fuller", ["Music", "Audio"], on(6, 21)),
      follow("Ruth Benton", ["Worship", "Teaching"], on(5, 2)),
      follow("Mara Lin", ["Audio", "Filmmaking"], on(9, 10)),
    ],
  };
}
