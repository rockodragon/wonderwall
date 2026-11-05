import { describe, expect, it } from "vitest";
import type { SearchHit } from "./searchRules";
import { CACHE_MAX, cachePut, isCurrent, planRank, rankKey, type Settled } from "./useSmartRank";

const h = (id: string, score = 0.5): SearchHit => ({ id, score });
const base = { enabled: true, signedIn: true, kind: "people" as const, cache: new Map<string, SearchHit[]>(), last: null, failed: null };

describe("rankKey", () => {
  it("is null for a search too short to mean anything", () => {
    expect(rankKey("people", "")).toBeNull();
    expect(rankKey("people", " mu ")).toBeNull();
  });
  it("normalizes case and spacing, and keeps kinds apart", () => {
    expect(rankKey("people", "  Clay   Potter ")).toBe("people:clay potter");
    expect(rankKey("projects", "clay potter")).toBe("projects:clay potter");
  });
});

describe("planRank", () => {
  it("settles at once, names only, for a short search, a visitor, or when off", () => {
    for (const bad of [{ query: "mu" }, { query: "potters", signedIn: false }, { query: "potters", enabled: false }]) {
      const plan = planRank({ ...base, ...bad });
      expect(plan.out).toEqual({ query: bad.query, ranked: undefined, pending: false });
      expect(plan.fetch).toBe(false);
    }
  });
  it("calls once for a new search and keeps the last settled answer while it is in flight", () => {
    const last: Settled = { query: "clay", ranked: [h("a"), h("b")] };
    const plan = planRank({ ...base, query: "clay pots", last });
    expect(plan.fetch).toBe(true);
    expect(plan.out).toEqual({ query: "clay", ranked: [h("a"), h("b")], pending: true });
  });
  it("has nothing to keep on a first search: names only, pending", () => {
    const plan = planRank({ ...base, query: "clay pots" });
    expect(plan.out).toEqual({ query: "clay pots", ranked: undefined, pending: true });
  });
  it("answers from the cache without a call", () => {
    const cache = new Map([["people:clay pots", [h("x")]]]);
    const plan = planRank({ ...base, cache, query: "Clay Pots" });
    expect(plan.fetch).toBe(false);
    expect(plan.out).toEqual({ query: "Clay Pots", ranked: [h("x")], pending: false });
  });
  it("settles as names only after an error, without a retry", () => {
    const plan = planRank({ ...base, query: "clay pots", failed: "people:clay pots", last: { query: "clay", ranked: [h("a")] } });
    expect(plan.fetch).toBe(false);
    expect(plan.out).toEqual({ query: "clay pots", ranked: undefined, pending: false });
  });
});

describe("isCurrent", () => {
  it("drops an answer for a search that is no longer the current one", () => {
    expect(isCurrent("people:clay pots", "people:clay pots")).toBe(true);
    expect(isCurrent("people:clay pots more", "people:clay pots")).toBe(false);
    expect(isCurrent(null, "people:clay pots")).toBe(false);
  });
});

describe("cachePut", () => {
  it("keeps at most CACHE_MAX answers, dropping the oldest", () => {
    const cache = new Map<string, SearchHit[]>();
    for (let i = 0; i < CACHE_MAX + 5; i++) cachePut(cache, `k${i}`, [h(String(i))]);
    expect(cache.size).toBe(CACHE_MAX);
    expect(cache.has("k0")).toBe(false);
    expect(cache.has(`k${CACHE_MAX + 4}`)).toBe(true);
  });
});
