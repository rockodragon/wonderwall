import { describe, expect, it } from "vitest";
import { filterOrgs, matchesOrgQuery } from "./orgFilter";

const orgs = [
  { _id: "a", name: "Abiding Practice", category: "Collective", location: null, tagline: "Spiritual Formation for Artists" },
  { _id: "b", name: "Reveal Brand", category: "Other", location: null, tagline: "Faith-based lifestyle clothing" },
  { _id: "c", name: "Uncommon [good] Church San Diego", category: "Church", location: "Poway, CA", tagline: null },
];
const ids = (xs: readonly { _id: string }[]) => xs.map((x) => x._id);

describe("matchesOrgQuery", () => {
  it("matches everything when there is no text", () => {
    expect(matchesOrgQuery(orgs[0], "")).toBe(true);
    expect(matchesOrgQuery(orgs[0], "   ")).toBe(true);
  });
  it("matches the name, category, place or tagline, ignoring case", () => {
    expect(matchesOrgQuery(orgs[0], "ABIDING")).toBe(true);
    expect(matchesOrgQuery(orgs[0], "collective")).toBe(true);
    expect(matchesOrgQuery(orgs[0], "artists")).toBe(true);
    expect(matchesOrgQuery(orgs[2], "poway")).toBe(true);
    expect(matchesOrgQuery(orgs[2], "clothing")).toBe(false);
  });
  it("copes with the fields an organization leaves out", () => {
    expect(matchesOrgQuery({ name: "Halo Touring" }, "halo")).toBe(true);
    expect(matchesOrgQuery({ name: "Halo Touring", category: null, location: null, tagline: null }, "poway")).toBe(false);
  });
});

describe("filterOrgs", () => {
  it("keeps the matches in the list's own order", () => {
    expect(ids(filterOrgs(orgs, "church"))).toEqual(["c"]);
    expect(ids(filterOrgs(orgs, "a"))).toEqual(["a", "b", "c"]);
    expect(ids(filterOrgs(orgs, "nothing like it"))).toEqual([]);
  });
});
