import { describe, expect, it } from "vitest";
import { filterEvents, matchesEventQuery, onlyFavorites, parseEventsTab } from "./eventsFilter";

const here = { lat: 36.1627, lng: -86.7816 };
const events = [
  { _id: "1", title: "Open Mic", description: "Songs and poetry", location: "The Basement, Nashville", tags: ["Music"], coordinates: { lat: 36.17, lng: -86.78 }, community: { slug: "the-garden" } },
  { _id: "2", title: "Pottery Night", description: "Wheel throwing", location: "Studio 9", tags: ["Visual Art"], coordinates: { lat: 40.7, lng: -74 }, community: { slug: "sd" } },
  { _id: "3", title: "Film Social", description: "", location: null, tags: [], community: null },
];
const ids = (xs: readonly { _id: string }[]) => xs.map((x) => x._id);

describe("parseEventsTab", () => {
  it("reads favorites and past, and anything else as upcoming", () => {
    expect(parseEventsTab("favorites")).toBe("favorites");
    expect(parseEventsTab("past")).toBe("past");
    expect(parseEventsTab("saved")).toBe("all");
    expect(parseEventsTab(null)).toBe("all");
    expect(parseEventsTab(undefined)).toBe("all");
  });
});

describe("matchesEventQuery", () => {
  it("looks in the title, description, place and tags", () => {
    expect(matchesEventQuery(events[0], "open")).toBe(true);
    expect(matchesEventQuery(events[0], "poetry")).toBe(true);
    expect(matchesEventQuery(events[0], "basement")).toBe(true);
    expect(matchesEventQuery(events[0], "music")).toBe(true);
    expect(matchesEventQuery(events[0], "pottery")).toBe(false);
  });
  it("copes with a missing description, place or tags", () => {
    expect(matchesEventQuery({ _id: "x", title: "Bare" }, "bare")).toBe(true);
    expect(matchesEventQuery({ _id: "x", title: "Bare" }, "nope")).toBe(false);
  });
});

describe("filterEvents", () => {
  const none = { query: "", tags: [] as string[] };
  it("returns the list as it came with no filters", () => {
    expect(ids(filterEvents(events, none))).toEqual(["1", "2", "3"]);
  });
  it("trims and ignores the case of the search", () => {
    expect(ids(filterEvents(events, { ...none, query: "  WHEEL " }))).toEqual(["2"]);
  });
  it("keeps events with any chosen tag", () => {
    expect(ids(filterEvents(events, { ...none, tags: ["Music", "Visual Art"] }))).toEqual(["1", "2"]);
    expect(ids(filterEvents(events, { ...none, tags: ["Music"] }))).toEqual(["1"]);
  });
  it("applies the community rule it is given", () => {
    expect(ids(filterEvents(events, { ...none, inCommunity: (e) => e.community?.slug === "sd" }))).toEqual(["2"]);
  });
  it("narrows to a radius, nearest first", () => {
    expect(ids(filterEvents(events, { ...none, near: { pos: here, radius: 25 } }))).toEqual(["1"]);
  });
});

describe("onlyFavorites", () => {
  it("keeps the hearted events in order", () => {
    expect(ids(onlyFavorites(events, new Set(["3", "1"])))).toEqual(["1", "3"]);
  });
});
