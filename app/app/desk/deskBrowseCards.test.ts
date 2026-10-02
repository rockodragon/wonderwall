import { describe, expect, it } from "vitest";
import { directoryCard, eventsCards, pastEventCard, peopleCards, projectsCards, type ProfileRow } from "./deskBrowseCards";
import type { DeskEventInput, DeskFundInput, DeskProjectInput } from "./deskCards";

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

function project(id: string, extra: Partial<DeskProjectInput> = {}): DeskProjectInput {
  return { _id: id, kind: "passion", status: "active", title: `Project ${id}`, blurb: "Making a thing.", media: [], creator: { name: "Dana Lee" }, community: null, ...extra };
}
const FUND: DeskFundInput = { slug: "abiding-practice", name: "The Sophia Fund", orgName: "Abiding Practice", availableCents: 1_000_000, openCall: null };

describe("projectsCards", () => {
  const rows = [
    project("a", { stage: "working", title: "Harbor Mural" }),
    project("b", { stage: "planning", community: { name: "Other", slug: "elsewhere" } }),
    project("c", { kind: "paid", title: "Cover band" }),
  ];
  const base = { rows, view: "projects" as const, stage: "", query: "", community: "exchange" as const, fund: FUND, money };

  it("lists the Projects view in the server's order, without the fund in The Exchange", () => {
    expect(ids(projectsCards(base))).toEqual(["project:a", "project:b"]);
  });
  it("puts the fund note first in The Garden, and keeps The Garden's own and unplaced projects", () => {
    expect(ids(projectsCards({ ...base, community: "garden" }))).toEqual(["fund", "project:a"]);
  });
  it("drops the fund once a stage, a search or Work narrows the list", () => {
    const garden = { ...base, community: "garden" as const };
    expect(ids(projectsCards({ ...garden, stage: "working" }))).toEqual(["project:a"]);
    expect(ids(projectsCards({ ...garden, query: "harbor" }))).toEqual(["project:a"]);
    expect(ids(projectsCards({ ...garden, view: "work" }))).toEqual(["project:c"]);
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
