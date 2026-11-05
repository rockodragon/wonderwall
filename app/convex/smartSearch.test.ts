// smartSearch.resolveHits: the vector hits turned into entity ids. A hit
// from another model, a missing thing, an unlisted project, or a project the
// caller may not see is dropped, so an id from `rank` never names something
// they couldn't open.

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { rank, resolveHits, takeSearchSlot } from "./smartSearch";
import { SEARCHES_PER_MINUTE, SEARCH_MODEL, VECTOR_CANDIDATES } from "./searchRules";

const embed = vi.hoisted(() => ({ fn: vi.fn(async (_text: string): Promise<number[]> => [0.1, 0.2]) }));
vi.mock("./embeddings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./embeddings")>()),
  generateEmbedding: (text: string) => embed.fn(text),
}));

const ME = "users:me";
const OWNER = "users:owner";
const HID = "hostOrgs:hid";

const project = (id: string, over: Partial<Row> = {}): Row => ({
  _id: `projects:${id}`,
  userId: OWNER,
  kind: "passion",
  title: id,
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const vec = (id: string, entityId: string, over: Partial<Row> = {}): Row => ({
  _id: `embeddings:${id}`,
  entityType: "project",
  entityId,
  vector: [],
  content: "",
  model: SEARCH_MODEL,
  updatedAt: 1,
  ...over,
});

function tables(): Record<string, Row[]> {
  return {
    profiles: [
      { _id: "profiles:me", userId: ME, name: "Me", interests: [], createdAt: 1 },
      { _id: "profiles:ana", userId: OWNER, name: "Ana", interests: [], createdAt: 1 },
    ],
    hostOrgs: [{ _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community", status: "active" }],
    communityMembers: [],
    projects: [
      project("ok"),
      project("draft", { status: "draft" }),
      project("archived", { status: "archived" }),
      project("hidden", { status: "hidden" }),
      project("secret", { hostOrgId: HID }),
    ],
    embeddings: [
      vec("ok", "projects:ok"),
      vec("old", "projects:ok", { model: "text-embedding-ada-002" }),
      vec("nomodel", "projects:ok", { model: undefined }),
      vec("gone", "projects:deleted"),
      vec("draft", "projects:draft"),
      vec("archived", "projects:archived"),
      vec("hidden", "projects:hidden"),
      vec("secret", "projects:secret"),
      vec("junk", "not-an-id"),
      vec("person", "profiles:ana", { entityType: "profile" }),
      vec("nobody", "profiles:gone", { entityType: "profile" }),
    ],
  };
}

const results = (...ids: string[]) => ids.map((id, i) => ({ _id: `embeddings:${id}`, _score: 0.5 - i * 0.01 }));
const resolve = (viewer: string | null, kind: "people" | "projects", ...ids: string[]) =>
  run(resolveHits, makeCtx(tables(), viewer), { kind, results: results(...ids) });

describe("resolveHits — projects", () => {
  it("keeps a listed, visible project with its score", async () => {
    expect(await resolve(ME, "projects", "ok")).toEqual([{ id: "projects:ok", score: 0.5 }]);
  });

  it("drops a vector from another model, or none recorded", async () => {
    expect(await resolve(ME, "projects", "old", "nomodel")).toEqual([]);
  });

  it("drops a project that no longer exists, and an entity id that isn't one", async () => {
    expect(await resolve(ME, "projects", "gone", "junk")).toEqual([]);
  });

  it("drops a draft, an archived and an admin-hidden project", async () => {
    expect(await resolve(ME, "projects", "draft", "archived", "hidden")).toEqual([]);
  });

  it("drops a project in a hidden community for someone who isn't in it, keeps it for a member", async () => {
    expect(await resolve(ME, "projects", "secret")).toEqual([]);
    const t = tables();
    t.communityMembers = [{ _id: "communityMembers:m", hostOrgId: HID, userId: ME, role: "member", status: "active" }];
    const out = await run(resolveHits, makeCtx(t, ME), { kind: "projects", results: results("secret") });
    expect(out.map((h: { id: string }) => h.id)).toEqual(["projects:secret"]);
  });

  it("keeps the good ones among the bad, in order", async () => {
    const out = await resolve(ME, "projects", "draft", "ok", "old", "secret");
    expect(out).toEqual([{ id: "projects:ok", score: 0.49 }]);
  });
});

describe("resolveHits — people", () => {
  it("keeps a profile that exists and drops one that doesn't or from another model", async () => {
    expect(await resolve(ME, "people", "person", "nobody")).toEqual([{ id: "profiles:ana", score: 0.5 }]);
    const t = tables();
    t.embeddings = [vec("person", "profiles:ana", { entityType: "profile", model: "text-embedding-ada-002" })];
    expect(await run(resolveHits, makeCtx(t, ME), { kind: "people", results: results("person") })).toEqual([]);
  });
});

describe("takeSearchSlot", () => {
  const NOW = 1_000_000_000;
  const call = (rows: Row[], viewer: string | null = ME) => {
    const ctx = makeCtx({ searchCalls: rows }, viewer);
    return { ctx, out: run(takeSearchSlot, ctx, {}) };
  };
  const rowsAt = (n: number, at: number, userId = ME): Row[] =>
    Array.from({ length: n }, (_, i) => ({ _id: `searchCalls:${userId}${at}${i}`, userId, at }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("allows SEARCHES_PER_MINUTE a minute and refuses the next", async () => {
    const ctx = makeCtx({ searchCalls: [] }, ME);
    for (let i = 0; i < SEARCHES_PER_MINUTE; i++) expect(await run(takeSearchSlot, ctx, {})).toBe(true);
    expect(await run(takeSearchSlot, ctx, {})).toBe(false);
    expect(ctx.store.searchCalls).toHaveLength(SEARCHES_PER_MINUTE);
  });

  it("deletes rows older than a minute, and frees their slots", async () => {
    const { ctx, out } = call([...rowsAt(SEARCHES_PER_MINUTE, NOW - 61_000), ...rowsAt(2, NOW - 1_000)]);
    expect(await out).toBe(true);
    expect(ctx.store.searchCalls).toHaveLength(3);
    expect(ctx.store.searchCalls.every((r: Row) => r.at > NOW - 60_000)).toBe(true);
  });

  it("counts only the caller's own searches", async () => {
    const { out } = call(rowsAt(SEARCHES_PER_MINUTE, NOW - 1_000, "users:other"));
    expect(await out).toBe(true);
  });

  it("refuses a visitor", async () => {
    const { ctx, out } = call([], null);
    expect(await out).toBe(false);
    expect(ctx.store.searchCalls).toHaveLength(0);
  });
});

describe("rank", () => {
  /** An action ctx over the in-memory db: runMutation/runQuery run the real
   * handlers as the same caller; vectorSearch answers with `vectors`. */
  function actionCtx(viewer: string | null, searchCalls: Row[] = []) {
    const base = makeCtx({ ...tables(), searchCalls }, viewer);
    const vectorSearch = vi.fn(async (_t: string, _i: string, _o: unknown) => [
      { _id: "embeddings:ok", _score: 0.5 },
      { _id: "embeddings:person", _score: 0.4 },
    ]);
    const ctx = {
      ...base,
      vectorSearch,
      runMutation: (_ref: unknown, a: Record<string, unknown>) => run(takeSearchSlot, base, a),
      runQuery: (_ref: unknown, a: Record<string, unknown>) => run(resolveHits, base, a),
    };
    return { ctx, base, vectorSearch };
  }

  beforeEach(() => {
    embed.fn.mockClear();
    embed.fn.mockImplementation(async () => [0.1, 0.2]);
  });

  it("returns hits with scores for a signed-in person, asking for the most vectors Convex allows", async () => {
    const { ctx, vectorSearch } = actionCtx(ME);
    expect(await run(rank, ctx, { kind: "projects", query: "clay pots" })).toEqual([{ id: "projects:ok", score: 0.5 }]);
    expect(vectorSearch.mock.calls[0][2]).toMatchObject({ limit: VECTOR_CANDIDATES });
    expect(VECTOR_CANDIDATES).toBe(256);
  });

  it("returns [] for a visitor and a short search, without calling OpenAI", async () => {
    expect(await run(rank, actionCtx(null).ctx, { kind: "projects", query: "clay pots" })).toEqual([]);
    expect(await run(rank, actionCtx(ME).ctx, { kind: "projects", query: "mu" })).toEqual([]);
    expect(embed.fn).not.toHaveBeenCalled();
  });

  it("returns [] over the per-minute limit, without calling OpenAI", async () => {
    const full: Row[] = Array.from({ length: SEARCHES_PER_MINUTE }, (_, i) => ({
      _id: `searchCalls:${i}`,
      userId: ME,
      at: Date.now(),
    }));
    const { ctx, vectorSearch } = actionCtx(ME, full);
    expect(await run(rank, ctx, { kind: "projects", query: "clay pots" })).toEqual([]);
    expect(embed.fn).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
  });

  it("throws search_unavailable when the embedding call fails, so the page doesn't cache []", async () => {
    embed.fn.mockImplementation(async () => {
      throw new Error("OpenAI 500 secret detail");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await run(rank, actionCtx(ME).ctx, { kind: "projects", query: "clay pots" }).catch((e) => e);
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data).toEqual({ code: "search_unavailable", reason: "Search by meaning is unavailable right now." });
  });
});
