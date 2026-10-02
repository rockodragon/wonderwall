import { describe, expect, it } from "vitest";
import { INTERESTS } from "../../constants/interests";
import { INTEREST_OPTIONS, filterProfiles, matchesPersonQuery, onlyIds } from "./peopleFilter";
import { distanceLabel, withinRadius } from "./nearMe";

// Around Nashville: about 0 mi, ~3 mi, ~ 20 mi, and far away.
const here = { lat: 36.1627, lng: -86.7816 };
const people = [
  { _id: "a", interests: ["Music"], coordinates: { lat: 36.1627, lng: -86.7816 } },
  { _id: "b", interests: ["Film"], coordinates: { lat: 36.2, lng: -86.8 } },
  { _id: "c", interests: ["Music", "Film"], coordinates: { lat: 36.45, lng: -86.8 } },
  { _id: "d", interests: ["Music"], coordinates: { lat: 40.7, lng: -74 } },
  { _id: "e", interests: ["Music"] },
];
const ids = (xs: readonly { _id: string }[]) => xs.map((x) => x._id);

describe("INTEREST_OPTIONS", () => {
  it("is the canonical interests list, label and value the same", () => {
    expect(INTEREST_OPTIONS.map((o) => o.value)).toEqual([...INTERESTS]);
    expect(INTEREST_OPTIONS.every((o) => o.label === o.value)).toBe(true);
  });
});

describe("filterProfiles", () => {
  it("returns everyone when nothing is chosen", () => {
    expect(ids(filterProfiles(people, { interests: [] }))).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("keeps people with any of the chosen interests", () => {
    expect(ids(filterProfiles(people, { interests: ["Film"] }))).toEqual(["b", "c"]);
    expect(ids(filterProfiles(people, { interests: ["Film", "Music"] }))).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("narrows to a radius, nearest first, dropping people with no location", () => {
    const out = filterProfiles(people, { interests: [], near: { pos: here, radius: 25 } });
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect((out[0] as { _distance: number })._distance).toBeCloseTo(0, 5);
  });
  it("combines an interest with a radius", () => {
    expect(ids(filterProfiles(people, { interests: ["Film"], near: { pos: here, radius: 5 } }))).toEqual(["b"]);
  });
});

describe("withinRadius", () => {
  it("widens with the radius", () => {
    expect(ids(withinRadius(people, { pos: here, radius: 5 }))).toEqual(["a", "b"]);
    expect(ids(withinRadius(people, { pos: here, radius: 3000 }))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("onlyIds", () => {
  it("keeps the listed ids in the list's own order", () => {
    expect(ids(onlyIds(people, new Set(["d", "a"])))).toEqual(["a", "d"]);
    expect(onlyIds(people, new Set())).toEqual([]);
  });
});

describe("distanceLabel", () => {
  it("rounds to miles, says under one mile, and says nothing for no location", () => {
    expect(distanceLabel(0.4)).toBe("< 1 mi");
    expect(distanceLabel(12.4)).toBe("12 mi");
    expect(distanceLabel(Infinity)).toBeNull();
    expect(distanceLabel(undefined)).toBeNull();
  });
});

describe("matchesPersonQuery", () => {
  const p = { name: "Maya Lin", interests: ["Visual Art", "other:Ceramics"] };
  it("matches a name or an interest, ignoring case and padding", () => {
    expect(matchesPersonQuery(p, "  maya ")).toBe(true);
    expect(matchesPersonQuery(p, "visual")).toBe(true);
    expect(matchesPersonQuery(p, "ceramics")).toBe(true);
    expect(matchesPersonQuery(p, "drummer")).toBe(false);
  });
  it("matches everyone for an empty search", () => {
    expect(matchesPersonQuery(p, "")).toBe(true);
    expect(matchesPersonQuery(p, "   ")).toBe(true);
  });
});
