import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getFunctionName } from "convex/server";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import {
  BACKFILL_PAGE_SIZE,
  backfillCoHosts,
  isEventHost,
  MAX_CO_HOSTS,
  planAddCoHost,
  planCoHostSync,
  planDisplayHosts,
  planRemoveCoHost,
  syncCoHosts,
} from "./eventHosts";
import { addCoHost, removeCoHost } from "./events";
import { deleteEvent } from "./moderation";
import { mergeUsers } from "./admin/mergeUsers";

describe("isEventHost", () => {
  const event = { organizerId: "org", coHostIds: ["a", "b"] };
  it("accepts the organizer", () => expect(isEventHost(event, "org")).toBe(true));
  it("accepts a co-host", () => expect(isEventHost(event, "b")).toBe(true));
  it("rejects others and signed-out", () => {
    expect(isEventHost(event, "zzz")).toBe(false);
    expect(isEventHost(event, null)).toBe(false);
    expect(isEventHost(event, undefined)).toBe(false);
  });
  it("works with no coHostIds", () => {
    expect(isEventHost({ organizerId: "org" }, "org")).toBe(true);
    expect(isEventHost({ organizerId: "org" }, "a")).toBe(false);
  });
});

describe("planAddCoHost / planRemoveCoHost", () => {
  it("adds", () => {
    expect(planAddCoHost({ organizerId: "o", coHostIds: ["a"] }, "b")).toEqual({ ok: true, coHostIds: ["a", "b"] });
  });
  it("refuses the organizer, duplicates, and an 11th", () => {
    expect(planAddCoHost({ organizerId: "o" }, "o")).toEqual({ ok: false, reason: "is_organizer" });
    expect(planAddCoHost({ organizerId: "o", coHostIds: ["a"] }, "a")).toEqual({ ok: false, reason: "duplicate" });
    const full = Array.from({ length: MAX_CO_HOSTS }, (_, i) => `u${i}`);
    expect(planAddCoHost({ organizerId: "o", coHostIds: full }, "new")).toEqual({ ok: false, reason: "full" });
  });
  it("removes", () => {
    expect(planRemoveCoHost({ coHostIds: ["a", "b"] }, "a")).toEqual({ ok: true, coHostIds: ["b"] });
    expect(planRemoveCoHost({ coHostIds: ["a"] }, "x")).toEqual({ ok: false, reason: "not_a_co_host" });
  });
});

describe("planDisplayHosts", () => {
  it("keeps order", () => {
    const refs = [{ kind: "org" as const, id: "o" }, { kind: "user" as const, id: "u" }];
    expect(planDisplayHosts(refs)).toEqual({ ok: true, refs });
  });
  it("refuses repeats and more than 10", () => {
    expect(planDisplayHosts([{ kind: "user", id: "u" }, { kind: "user", id: "u" }])).toEqual({ ok: false, reason: "duplicate" });
    const many = Array.from({ length: 11 }, (_, i) => ({ kind: "user" as const, id: String(i) }));
    expect(planDisplayHosts(many)).toEqual({ ok: false, reason: "full" });
  });
  it("same id as user and org is fine", () => {
    expect(planDisplayHosts([{ kind: "user", id: "x" }, { kind: "org", id: "x" }]).ok).toBe(true);
  });
});

describe("planCoHostSync", () => {
  const row = (userId: string, n = 1) => ({ _id: `eventCoHosts:${userId}${n}`, userId });

  it("adds a row for each listed co-host without one", () => {
    expect(planCoHostSync([row("a")], ["a", "b", "c"])).toEqual({ insert: ["b", "c"], remove: [] });
  });
  it("removes rows for anyone no longer listed, and repeats", () => {
    expect(planCoHostSync([row("a"), row("x"), row("a", 2)], ["a"])).toEqual({
      insert: [],
      remove: [row("x"), row("a", 2)],
    });
  });
  it("an empty list removes every row", () => {
    expect(planCoHostSync([row("a"), row("b")], [])).toEqual({ insert: [], remove: [row("a"), row("b")] });
  });
  it("in step is nothing to do; a repeat in the list is one row", () => {
    expect(planCoHostSync([row("a"), row("b")], ["b", "a"])).toEqual({ insert: [], remove: [] });
    expect(planCoHostSync([], ["a", "a"])).toEqual({ insert: ["a"], remove: [] });
  });
});

// ——————————————————————————————————————————————————————————————
// syncCoHosts, every writer, and the backfill, on an in-memory ctx
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** The fields of a real schema index, or a throw (as in shortlist.test.ts). */
function indexFields(table: string, index: string): string[] {
  const tables = schema.tables as unknown as Record<
    string,
    { " indexes"(): { indexDescriptor: string; fields: string[] }[] } | undefined
  >;
  const found = tables[table]?.[" indexes"]().find((i) => i.indexDescriptor === index);
  if (!found) throw new Error(`${table} has no index ${index}`);
  return found.fields;
}

/** Just enough of Convex's ctx for the writers: db get / insert / patch /
 * delete, query(table) with or without withIndex(name, q => q.eq(..)), then
 * collect / first / unique / paginate. withIndex checks the index against
 * the schema. Scheduled functions land in `scheduled`. */
function makeCtx(tables: Record<string, Row[]>, viewerId: string | null = null) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  const find = (id: string) => rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;
  const scheduled: { name: string; args: any }[] = [];
  let counter = 0;

  function query(table: string) {
    let rows = rowsOf(table).slice();
    const api = {
      withIndex(name: string, build: (q: any) => any) {
        const fields = indexFields(table, name);
        const conds: [string, unknown][] = [];
        const q = {
          eq(field: string, value: unknown) {
            conds.push([field, value]);
            return q;
          },
        };
        build(q);
        conds.forEach(([field], i) => {
          if (fields[i] !== field) throw new Error(`${table}.${name}: eq("${field}") isn't field ${i} of the index`);
        });
        rows = rows.filter((r) => conds.every(([f, v]) => r[f] === v));
        return api;
      },
      async collect() {
        return rows.map((r) => ({ ...r }));
      },
      async first() {
        return rows[0] ? { ...rows[0] } : null;
      },
      async unique() {
        if (rows.length > 1) throw new Error("unique() matched more than one row");
        return rows[0] ? { ...rows[0] } : null;
      },
      async paginate(opts: { numItems: number; cursor: string | null }) {
        const start = opts.cursor ? Number(opts.cursor) : 0;
        const page = rows.slice(start, start + opts.numItems).map((r) => ({ ...r }));
        const end = start + page.length;
        return { page, isDone: end >= rows.length, continueCursor: String(end) };
      },
    };
    return api;
  }

  const ctx = {
    db: {
      query,
      async get(id: string) {
        const r = find(id);
        return r ? { ...r } : null;
      },
      async insert(table: string, doc: Record<string, unknown>) {
        const _id = `${table}:new${++counter}`;
        rowsOf(table).push({ _id, ...doc });
        return _id;
      },
      async patch(id: string, fields: Record<string, unknown>) {
        const r = find(id);
        if (!r) throw new Error(`patch: no row ${id}`);
        for (const [k, v] of Object.entries(fields)) {
          if (v === undefined) delete r[k];
          else r[k] = v;
        }
      },
      async delete(id: string) {
        const table = id.split(":")[0];
        store[table] = rowsOf(table).filter((r) => r._id !== id);
      },
    },
    auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
    storage: { delete: async () => {} },
    scheduler: {
      runAfter: async (_ms: number, fn: unknown, args: any) => {
        scheduled.push({ name: getFunctionName(fn as any), args });
      },
    },
    store,
    scheduled,
  };
  return ctx as any;
}

// A Convex-registered function keeps the handler you wrote on `_handler`.
const run = (fn: unknown, ctx: unknown, args: Record<string, unknown> = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

const ORG = "users:org";
const ADMIN = "users:admin";
const ALEX = "users:alex";
const BO = "users:bo";
const CY = "users:cy";

const event = (id: string, coHostIds?: string[]): Row => ({
  _id: `events:${id}`,
  organizerId: ORG,
  ...(coHostIds ? { coHostIds } : {}),
  title: `Event ${id}`,
  description: "",
  datetime: 5000,
  tags: [],
  requiresApproval: false,
  status: "published",
  createdAt: 0,
  updatedAt: 0,
});
const coHostRow = (eventId: string, userId: string): Row => ({
  _id: `eventCoHosts:${eventId}-${userId.split(":")[1]}`,
  eventId: `events:${eventId}`,
  userId,
  createdAt: 0,
});
const world = (events: Row[], eventCoHosts: Row[] = []): Record<string, Row[]> => ({
  users: [ORG, ADMIN, ALEX, BO, CY].map((_id) => ({ _id })),
  profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }],
  events,
  eventCoHosts,
});

/** Each event's co-hosts as eventCoHosts has them, sorted. */
function indexed(ctx: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of ctx.store.eventCoHosts as Row[]) (out[row.eventId] ??= []).push(row.userId);
  for (const ids of Object.values(out)) ids.sort();
  return out;
}

/** What eventCoHosts should hold: each event's coHostIds, sorted. */
function listed(ctx: any): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of ctx.store.events as Row[]) {
    if (e.coHostIds?.length) out[e._id] = [...new Set<string>(e.coHostIds)].sort();
  }
  return out;
}

describe("syncCoHosts", () => {
  it("inserts and deletes to match the list, and only for that event", async () => {
    const ctx = makeCtx(world([event("a", [ALEX, BO]), event("b", [ALEX])], [coHostRow("a", CY), coHostRow("b", ALEX)]));
    expect(await syncCoHosts(ctx, "events:a" as any, [ALEX, BO] as any)).toEqual({ added: 2, removed: 1 });
    expect(indexed(ctx)).toEqual({ "events:a": [ALEX, BO], "events:b": [ALEX] });
    expect(ctx.store.eventCoHosts.find((r: Row) => r.userId === BO)).toMatchObject({ eventId: "events:a" });
  });

  it("is idempotent: a second run writes nothing", async () => {
    const ctx = makeCtx(world([event("a", [ALEX])]));
    await syncCoHosts(ctx, "events:a" as any, [ALEX] as any);
    const after = ctx.store.eventCoHosts.map((r: Row) => ({ ...r }));
    expect(await syncCoHosts(ctx, "events:a" as any, [ALEX] as any)).toEqual({ added: 0, removed: 0 });
    expect(ctx.store.eventCoHosts).toEqual(after);
  });
});

describe("every writer keeps eventCoHosts in step", () => {
  it("events.addCoHost and removeCoHost", async () => {
    const ctx = makeCtx(world([event("a"), event("b", [ALEX])], [coHostRow("b", ALEX)]), ORG);
    await run(addCoHost, ctx, { eventId: "events:a", userId: ALEX });
    await run(addCoHost, ctx, { eventId: "events:a", userId: BO });
    expect(indexed(ctx)).toEqual({ "events:a": [ALEX, BO], "events:b": [ALEX] });

    await run(removeCoHost, ctx, { eventId: "events:a", userId: ALEX });
    expect(ctx.store.events[0].coHostIds).toEqual([BO]);
    expect(indexed(ctx)).toEqual({ "events:a": [BO], "events:b": [ALEX] });
    expect(indexed(ctx)).toEqual(listed(ctx));
  });

  it("a refused add or remove writes nothing", async () => {
    const ctx = makeCtx(world([event("a", [ALEX])], [coHostRow("a", ALEX)]), ORG);
    await expect(run(addCoHost, ctx, { eventId: "events:a", userId: ALEX })).rejects.toThrow(/Already a co-host/);
    await expect(run(removeCoHost, ctx, { eventId: "events:a", userId: BO })).rejects.toThrow(/Not a co-host/);
    // Only the organizer changes the list; a co-host can't.
    const asAlex = { ...ctx, auth: { getUserIdentity: async () => ({ subject: `${ALEX}|session` }) } };
    await expect(run(addCoHost, asAlex, { eventId: "events:a", userId: BO })).rejects.toThrow(/Only the organizer/);
    expect(ctx.store.eventCoHosts).toEqual([coHostRow("a", ALEX)]);
  });

  it("moderation.deleteEvent takes the event's rows and leaves the others", async () => {
    const ctx = makeCtx(
      world([event("a", [ALEX, BO]), event("b", [ALEX])], [coHostRow("a", ALEX), coHostRow("a", BO), coHostRow("b", ALEX)]),
      ADMIN,
    );
    expect(await run(deleteEvent, ctx, { eventId: "events:a" })).toEqual({ ok: true, deleted: true });
    expect(ctx.store.events.map((e: Row) => e._id)).toEqual(["events:b"]);
    expect(indexed(ctx)).toEqual({ "events:b": [ALEX] });
  });

  it("admin mergeUsers moves a co-host's rows to the account they're merged into, once", async () => {
    // Alex merges into Bo. On "a" Bo takes Alex's place; on "both" Bo is
    // already a co-host, so Bo is listed, and indexed, once.
    const ctx = makeCtx(
      world(
        [event("a", [ALEX, CY]), event("both", [ALEX, BO]), event("other", [CY])],
        [coHostRow("a", ALEX), coHostRow("a", CY), coHostRow("both", ALEX), coHostRow("both", BO), coHostRow("other", CY)],
      ),
    );
    const result = await run(mergeUsers, ctx, { targetUserId: BO, sourceUserIds: [ALEX], dryRun: false, moveContent: true });
    expect(result.results[0]).toMatchObject({ merged: true, contentMoved: { moved: { "events.coHostIds": 2 } } });
    expect(ctx.store.events.map((e: Row) => e.coHostIds)).toEqual([[BO, CY], [BO], [CY]]);
    expect(indexed(ctx)).toEqual({ "events:a": [BO, CY], "events:both": [BO], "events:other": [CY] });
    expect(indexed(ctx)).toEqual(listed(ctx));
  });

  // A file that wrote coHostIds without syncCoHosts would leave the Shortlist
  // missing a co-host, or keeping one who left. Every backend file that names
  // coHostIds is listed here by what it does with it, so a new one has to say
  // which it is, and a writer has to sync.
  it("no file writes coHostIds without syncCoHosts", () => {
    const WRITERS = ["admin/mergeUsers.ts", "events.ts"];
    const READERS = ["announcements.ts", "eventHosts.ts", "schema.ts", "shortlist.ts"];
    const source = (file: string) => readFileSync(join(__dirname, file), "utf8");
    const naming = (readdirSync(__dirname, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.startsWith("_generated"))
      .filter((f) => source(f).includes("coHostIds"))
      .sort();
    expect(naming).toEqual([...WRITERS, ...READERS].sort());
    for (const file of WRITERS) expect(source(file)).toContain("syncCoHosts(");
  });
});

describe("backfillCoHosts", () => {
  /** Over two pages of events: every third has co-hosts; e1 has a row for
   * someone it doesn't list, and e3 a repeat. */
  function bigWorld() {
    const events = Array.from({ length: BACKFILL_PAGE_SIZE * 2 + 5 }, (_, i) =>
      event(`e${i}`, i % 3 === 0 ? [ALEX, ...(i % 2 ? [BO] : [])] : undefined),
    );
    return world(events, [coHostRow("e1", CY), coHostRow("e3", ALEX), { ...coHostRow("e3", ALEX), _id: "eventCoHosts:repeat" }]);
  }

  /** Runs it, then whatever it schedules, until it stops scheduling. */
  async function drain(ctx: any) {
    const results = [await run(backfillCoHosts, ctx, {})];
    while (ctx.scheduled.length) {
      const next = ctx.scheduled.shift();
      expect(next.name).toBe("eventHosts:backfillCoHosts");
      results.push(await run(backfillCoHosts, ctx, next.args));
    }
    return results;
  }

  it("does a page per run and schedules the next with its cursor", async () => {
    const ctx = makeCtx(bigWorld());
    expect(await run(backfillCoHosts, ctx, {})).toMatchObject({ scanned: BACKFILL_PAGE_SIZE, isDone: false });
    expect(ctx.scheduled).toEqual([{ name: "eventHosts:backfillCoHosts", args: { cursor: String(BACKFILL_PAGE_SIZE) } }]);
  });

  it("stops once every event is in step, stale rows and repeats gone", async () => {
    const ctx = makeCtx(bigWorld());
    const results = await drain(ctx);
    expect(results.map((r) => [r.scanned, r.isDone])).toEqual([
      [BACKFILL_PAGE_SIZE, false],
      [BACKFILL_PAGE_SIZE, false],
      [5, true],
    ]);
    expect(indexed(ctx)).toEqual(listed(ctx));
    expect(results.reduce((n, r) => n + r.removed, 0)).toBe(2);
  });

  it("is idempotent: a second full run writes nothing", async () => {
    const ctx = makeCtx(bigWorld());
    await drain(ctx);
    const after = ctx.store.eventCoHosts.map((r: Row) => ({ ...r }));
    const again = await drain(ctx);
    expect(again.every((r) => r.added === 0 && r.removed === 0)).toBe(true);
    expect(ctx.store.eventCoHosts).toEqual(after);
  });
});
