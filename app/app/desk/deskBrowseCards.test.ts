import { describe, expect, it } from "vitest";
import {
  directoryCard,
  eventsCards,
  everyoneCards,
  orgsCards,
  pastEventCard,
  peopleCards,
  peopleNoun,
  projectsCards,
  spreadEvenly,
  type ProfileRow,
} from "./deskBrowseCards";
import type { DeskEventInput, DeskFundInput, DeskOrgInput, DeskProjectInput } from "./deskCards";

const NOW = new Date(2026, 9, 1, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;
const money = (cents: number) => `$${cents / 100}`;
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

const here = { lat: 36.1627, lng: -86.7816 };
const person = (n: number, extra: Partial<ProfileRow> = {}): ProfileRow => ({
  _id: `u${n}`,
  name: `Person ${n}`,
  imageUrl: null,
  interests: ["Music"],
  ...extra,
});

describe("directoryCard", () => {
  it("labels only the people the member follows; the rest open on their discipline", () => {
    expect(directoryCard(person(1), false).face.kicker).toBe("");
    expect(directoryCard(person(1), false).detail.meta).toBe("MUSIC");
    expect(directoryCard(person(1), true).face.kicker).toBe("FOLLOWING");
  });
  it("belongs to People only, so it never lands in Favorites", () => {
    expect(directoryCard(person(1), true).sections).toEqual(["people"]);
  });
  it("prefixes the foot with the distance when Near me measured one", () => {
    expect(directoryCard({ ...person(1), _distance: 12.4 }, false).face.foot).toBe("12 mi · Music");
    expect(directoryCard({ ...person(1), _distance: Infinity }, false).face.foot).toBe("Music");
    expect(directoryCard(person(1, { interests: [] }), false).face.foot).toBeNull();
  });
});

describe("peopleCards", () => {
  const rows = [
    person(1, { interests: ["Music"], coordinates: { lat: 36.1627, lng: -86.7816 } }),
    person(2, { interests: ["Film"], coordinates: { lat: 40.7, lng: -74 } }),
    person(3, { name: "Maya Lin", interests: ["Visual Art"] }),
  ];
  const base = { rows, followedIds: new Set(["u3"]), following: false, query: "", interests: [] as string[], near: null };

  it("shows everyone the server returned, marking the ones the member follows", () => {
    const cards = peopleCards(base);
    expect(ids(cards)).toEqual(["person:u1", "person:u2", "person:u3"]);
    expect(cards.map((c) => c.face.kicker)).toEqual(["", "", "FOLLOWING"]);
  });
  it("takes the Discipline filter and Near me the way /people does", () => {
    expect(ids(peopleCards({ ...base, interests: ["Film", "Visual Art"] }))).toEqual(["person:u2", "person:u3"]);
    expect(ids(peopleCards({ ...base, near: { pos: here, radius: 25 } }))).toEqual(["person:u1"]);
  });
  it("searches the people you follow by name and interest, with no Near me", () => {
    const followed = { ...base, following: true, near: { pos: here, radius: 1 } };
    expect(ids(peopleCards({ ...followed, query: "maya" }))).toEqual(["person:u3"]);
    expect(ids(peopleCards({ ...followed, query: "film" }))).toEqual(["person:u2"]);
    expect(ids(peopleCards(followed))).toEqual(["person:u1", "person:u2", "person:u3"]);
    expect(peopleCards(followed).every((c) => c.face.kicker === "FOLLOWING")).toBe(true);
  });
});

const org = (n: number, extra: Partial<DeskOrgInput> = {}): DeskOrgInput => ({
  _id: `o${n}`,
  name: `Org ${n}`,
  slug: `org-${n}`,
  category: "Collective",
  tagline: null,
  location: null,
  logoUrl: null,
  peopleCount: 1,
  ...extra,
});

describe("orgsCards", () => {
  const rows = [
    org(1, { name: "Abiding Practice", tagline: "Spiritual formation for artists" }),
    org(2, { name: "Reveal Brand", category: "Other" }),
    org(3, { name: "Grove", category: "Church", location: "Poway, CA" }),
  ];
  it("lists the organizations in the server's order, as org cards", () => {
    expect(ids(orgsCards(rows, ""))).toEqual(["org:o1", "org:o2", "org:o3"]);
    expect(orgsCards(rows, "").every((c) => c.kind === "org" && c.sections.includes("people"))).toBe(true);
  });
  it("searches the name, category, place and tagline, as the Organizations tab does", () => {
    expect(ids(orgsCards(rows, "reveal"))).toEqual(["org:o2"]);
    expect(ids(orgsCards(rows, "church"))).toEqual(["org:o3"]);
    expect(ids(orgsCards(rows, "poway"))).toEqual(["org:o3"]);
    expect(ids(orgsCards(rows, "artists"))).toEqual(["org:o1"]);
    expect(ids(orgsCards(rows, "nothing like it"))).toEqual([]);
  });
});

describe("spreadEvenly", () => {
  const people = Array.from({ length: 30 }, (_, i) => `p${i + 1}`);
  it("puts one after every sixth of thirty when there are four to place", () => {
    const mixed = spreadEvenly(people, ["o1", "o2", "o3", "o4"]);
    expect(mixed).toHaveLength(34);
    expect(["o1", "o2", "o3", "o4"].map((o) => mixed.indexOf(o))).toEqual([6, 13, 20, 27]);
  });
  it("keeps each list in its own order", () => {
    const mixed = spreadEvenly(people, ["o1", "o2", "o3", "o4"]);
    expect(mixed.filter((x) => x.startsWith("p"))).toEqual(people);
    expect(mixed.filter((x) => x.startsWith("o"))).toEqual(["o1", "o2", "o3", "o4"]);
  });
  it("puts a lone organization in the middle", () => {
    expect(spreadEvenly(["a", "b", "c", "d"], ["X"])).toEqual(["a", "b", "X", "c", "d"]);
    expect(spreadEvenly(["a", "b"], ["X"])).toEqual(["a", "X", "b"]);
  });
  it("keeps a person first whenever there is one", () => {
    expect(spreadEvenly(["a"], ["X", "Y", "Z"])).toEqual(["a", "X", "Y", "Z"]);
  });
  it("is whichever list is there when the other is empty", () => {
    expect(spreadEvenly([], ["X", "Y"])).toEqual(["X", "Y"]);
    expect(spreadEvenly(["a", "b"], [])).toEqual(["a", "b"]);
    expect(spreadEvenly([], [])).toEqual([]);
  });
});

describe("everyoneCards", () => {
  const rows = [person(1), person(2, { interests: ["Film"] }), person(3), person(4)];
  const people = peopleCards({ rows, followedIds: new Set<string>(), following: false, query: "", interests: [], near: null });
  const orgs = [org(1, { name: "Reveal Brand" }), org(2, { name: "Grove" })];

  it("mixes the organizations in among the people", () => {
    const cards = everyoneCards(people, orgs, { query: "", peopleOnly: false });
    expect(ids(cards)).toEqual(["person:u1", "person:u2", "org:o1", "person:u3", "org:o2", "person:u4"]);
  });
  it("searches the organizations by the same text (the server has searched the people)", () => {
    expect(ids(everyoneCards(people, orgs, { query: "grove", peopleOnly: false }))).toEqual(["person:u1", "person:u2", "org:o2", "person:u3", "person:u4"]);
    expect(ids(everyoneCards(people, orgs, { query: "zzz", peopleOnly: false }))).toEqual(["person:u1", "person:u2", "person:u3", "person:u4"]);
  });
  it("lets the organizations step aside when Discipline or Near me narrows to people", () => {
    expect(ids(everyoneCards(people, orgs, { query: "", peopleOnly: true }))).toEqual(["person:u1", "person:u2", "person:u3", "person:u4"]);
  });
  it("is just the organizations when there are no people", () => {
    expect(ids(everyoneCards([], orgs, { query: "", peopleOnly: false }))).toEqual(["org:o1", "org:o2"]);
  });
  it("does not change the people's own cards", () => {
    const cards = everyoneCards(people, orgs, { query: "", peopleOnly: false });
    expect(cards.filter((c) => c.kind === "person")).toEqual(people);
  });
});

describe("peopleNoun", () => {
  it("names what an empty People view lacks", () => {
    expect(peopleNoun("", false)).toBe("people or organizations");
    expect(peopleNoun("orgs", false)).toBe("organizations");
    expect(peopleNoun("following", false)).toBe("people");
    expect(peopleNoun("", true)).toBe("people");
  });
});

function project(id: string, extra: Partial<DeskProjectInput> = {}): DeskProjectInput {
  return { _id: id, kind: "passion", status: "active", title: `Project ${id}`, blurb: "Making a thing.", media: [], creator: { name: "Dana Lee" }, community: null, ...extra };
}
const FUND: DeskFundInput = { slug: "abiding-practice", name: "The Sophia Grant Fund", orgName: "Abiding Practice", availableCents: 1_000_000, openCall: null };

describe("projectsCards", () => {
  const rows = [
    project("a", { stage: "working", title: "Harbor Mural" }),
    project("b", { stage: "planning", community: { name: "Other", slug: "elsewhere" } }),
    project("c", { kind: "paid", title: "Cover band", budgetType: "amount", budget: 300 }),
  ];
  const base = { rows, lens: "projects" as const, stage: "", query: "", community: "exchange" as const, fund: FUND, money };

  it("lists the Projects chip in the server's order, without the fund in The Exchange", () => {
    expect(ids(projectsCards(base))).toEqual(["project:a", "project:b"]);
  });
  it("puts the fund note first in The Garden, and keeps The Garden's own and unplaced projects", () => {
    expect(ids(projectsCards({ ...base, community: "garden" }))).toEqual(["fund", "project:a"]);
  });
  it("drops the fund once a stage, a search or another chip narrows the list", () => {
    const garden = { ...base, community: "garden" as const };
    expect(ids(projectsCards({ ...garden, stage: "working" }))).toEqual(["project:a"]);
    expect(ids(projectsCards({ ...garden, query: "harbor" }))).toEqual(["project:a"]);
    expect(ids(projectsCards({ ...garden, lens: "work" }))).toEqual(["project:c"]);
    expect(ids(projectsCards({ ...garden, lens: "funding" }))).not.toContain("fund");
    expect(ids(projectsCards({ ...garden, lens: "people" }))).not.toContain("fund");
  });
  it("narrows by what a project is asking for, together with its stage", () => {
    const asking = [
      project("a", { stage: "planning", goal: 500 }),
      project("b", { stage: "planning" }),
      project("c", { stage: "working", openRoles: [{ title: "Writer", budgetType: "volunteer" }] }),
      project("d", { stage: "working", goal: 500, openRoles: [{ title: "Writer", budgetType: "volunteer" }] }),
    ];
    const pick = (lens: "projects" | "funding" | "people" | "work", stage: string) => ids(projectsCards({ ...base, rows: asking, lens, stage }));
    expect(pick("funding", "")).toEqual(["project:a", "project:d"]);
    expect(pick("funding", "planning")).toEqual(["project:a"]);
    expect(pick("people", "")).toEqual(["project:c", "project:d"]);
    expect(pick("people", "working")).toEqual(["project:c", "project:d"]);
    expect(pick("people", "planning")).toEqual([]);
    expect(pick("projects", "planning")).toEqual(["project:a", "project:b"]);
  });
  it("Jobs and gigs: jobs, recurring gigs and projects with a paid role; unpaid postings go to Seeking people", () => {
    const gig = { status: "open", cadence: "Every Friday", timeRange: "8–10pm" };
    const mixed = [
      project("job", { kind: "paid", budgetType: "amount", budget: 400 }),
      project("gig", { kind: "paid", budgetType: "amount", budget: 150, gig }),
      project("vol", { kind: "paid", budgetType: "volunteer" }),
      project("roles", { openRoles: [{ title: "Drummer", budgetType: "amount", budget: 200 }] }),
      project("unpaid", { openRoles: [{ title: "Stagehand", budgetType: "volunteer" }] }),
      project("plain"),
    ];
    const work = projectsCards({ ...base, rows: mixed, lens: "work" });
    expect(ids(work)).toEqual(["project:job", "project:gig", "project:roles"]);
    expect(work.map((c) => c.face.kicker)).toEqual(["JOB", "RECURRING GIG · FRIDAYS 8–10PM", "ROLE ON PROJECT ROLES · PAID"]);
    expect(ids(projectsCards({ ...base, rows: mixed, lens: "people" }))).toEqual(["project:vol", "project:roles", "project:unpaid"]);
    expect(ids(projectsCards({ ...base, rows: mixed, lens: "projects" }))).toEqual(["project:roles", "project:unpaid", "project:plain"]);
  });
  it("Jobs and gigs: a project with a paid role leads with that role and its pay, and only here", () => {
    const withRole = project("roles", {
      title: "Harbor Mural",
      openRoles: [{ title: "Drummer", budgetType: "amount", budget: 200 }],
    });
    const [lead] = projectsCards({ ...base, rows: [withRole], lens: "work" });
    expect(lead.face).toEqual({ kicker: "ROLE ON HARBOR MURAL · PAID", title: "Drummer", foot: "$200 · Dana Lee" });
    expect(lead.detail.meta).toBe("ROLE ON HARBOR MURAL · PAID · THE GARDEN");
    expect(lead.detail.title).toBe("Drummer");
    expect(lead.detail.facts).toContainEqual({ label: "Paid role", value: "Drummer · $200" });
    expect(lead.href).toBe("/projects/roles");
    // The same project under Seeking people is the project.
    const [plain] = projectsCards({ ...base, rows: [withRole], lens: "people" });
    expect(plain.face.title).toBe("Harbor Mural");
    expect(plain.face.kicker).toBe("PLANNING");
    expect(plain.detail.facts?.some((f) => f.label === "Paid role")).toBe(false);
  });
  it("searches the title and description", () => {
    expect(ids(projectsCards({ ...base, query: "making" }))).toEqual(["project:a", "project:b"]);
    expect(ids(projectsCards({ ...base, query: "nothing like it" }))).toEqual([]);
  });
  it("gives every card the Projects section", () => {
    expect(projectsCards(base).every((c) => c.sections.includes("projects"))).toBe(true);
  });
});

function event(n: number, extra: Partial<DeskEventInput & { tags: string[] }> = {}): DeskEventInput & { tags: string[] } {
  return { _id: `e${n}`, title: `Event ${n}`, description: "A night of songs.", datetime: NOW + n * DAY, location: "Light Church, Carlsbad", attendeeCount: 0, hosts: [], community: null, tags: [], ...extra };
}

describe("eventsCards", () => {
  const rows = [
    event(1, { title: "Open Mic" }),
    event(2, { title: "Pottery Night", description: "Wheel throwing", community: { name: "Other", slug: "elsewhere" } }),
    event(3, { title: "Film Social", coordinates: { lat: 36.17, lng: -86.78 } } as Partial<DeskEventInput & { tags: string[] }>),
  ];
  const base = { rows, tab: null, query: "", community: "exchange" as const, near: null, favoriteIds: new Set(["e3"]), now: NOW };

  it("lists upcoming events in the server's order", () => {
    expect(ids(eventsCards(base))).toEqual(["event:e1", "event:e2", "event:e3"]);
  });
  it("applies the community rule: The Garden's own and unplaced events", () => {
    expect(ids(eventsCards({ ...base, community: "garden" }))).toEqual(["event:e1", "event:e3"]);
  });
  it("searches, and shows only the hearted events under Saved", () => {
    expect(ids(eventsCards({ ...base, query: "wheel" }))).toEqual(["event:e2"]);
    expect(ids(eventsCards({ ...base, tab: "favorites" }))).toEqual(["event:e3"]);
    expect(ids(eventsCards({ ...base, tab: "favorites", query: "pottery" }))).toEqual([]);
  });
  it("takes Near me", () => {
    expect(ids(eventsCards({ ...base, near: { pos: here, radius: 25 } }))).toEqual(["event:e3"]);
  });
  it("gives every card the Events section", () => {
    expect(eventsCards(base).every((c) => c.sections.includes("events"))).toBe(true);
  });
  it("turns an archive event into a card with no RSVP", () => {
    const [card] = eventsCards({ ...base, tab: "past", rows: [event(-3, { title: "Last Month", attendeeCount: 12 })] });
    expect(card.detail.action).toEqual({ kind: "link", label: "See event", href: "/events/e-3" });
    expect(card.detail.aside).toBe("12 went");
  });
});

describe("pastEventCard", () => {
  it("adds the year to the date only when it is not this year", () => {
    const thisYear = pastEventCard(event(-5), NOW);
    expect(thisYear.face.kicker).toBe("SEP 26");
    const lastYear = pastEventCard(event(0, { datetime: new Date(2025, 2, 14, 19).getTime() }), NOW);
    expect(lastYear.face.kicker).toBe("MAR 14 · 2025");
    expect(lastYear.detail.meta.startsWith("MAR 14 · 2025 · ")).toBe(true);
  });
  it("says nothing about attendance when nobody came", () => {
    expect(pastEventCard(event(-5), NOW).detail.aside).toBeNull();
  });
});
