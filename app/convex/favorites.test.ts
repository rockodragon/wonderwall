// Tests for favorites.ts: follows, event hearts, and the Shortlist's saves of
// projects and roles (docs/handoff/favorites-redesign/README.md).
//
// The real handlers on a small in-memory ctx, same harness as
// moderation.test.ts. A save only counts if the wiring holds: a member can't
// save what they can't see, a closed role can be unsaved but not saved, a
// save tells nobody, remove only ever removes, and the five pages that read
// getMyFavorites' { profiles, events } never see a project or role row.

import { describe, expect, it } from "vitest";
import {
  favoriteTargetTypeValidator,
  getFavoriteCount,
  getMyFavorites,
  isFavorited,
  remove,
  toggle,
} from "./favorites";

const OWNER = "users:owner";
const MEMBER = "users:member";

type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx for favorites.ts: db get / normalizeId /
 * insert / delete, and query().withIndex(name, q => q.eq(..)) or
 * .filter(q => q.eq(q.field(f), v)) followed by collect / first. Index names
 * aren't checked — the schema does that for real; what's under test is which
 * rows the handlers ask for and what they do with them. */
function makeCtx(tables: Record<string, Row[]>, viewerId: string | null) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  let counter = 100;

  const find = (id: string) => rowsOf(id.split(":")[0]).find((r) => r._id === id) ?? null;

  function query(table: string) {
    let rows = rowsOf(table).slice();
    const api = {
      withIndex(_name: string, build: (q: any) => any) {
        const conds: [string, unknown][] = [];
        const q = {
          eq(field: string, value: unknown) {
            conds.push([field, value]);
            return q;
          },
        };
        build(q);
        rows = rows.filter((r) => conds.every(([f, v]) => r[f] === v));
        return api;
      },
      filter(build: (q: any) => any) {
        const q = {
          field: (name: string) => (r: Row) => r[name],
          eq: (a: any, b: any) => (r: Row) =>
            (typeof a === "function" ? a(r) : a) === (typeof b === "function" ? b(r) : b),
        };
        const pred = build(q);
        rows = rows.filter((r) => pred(r));
        return api;
      },
      async collect() {
        return rows.map((r) => ({ ...r }));
      },
      async first() {
        return rows[0] ? { ...rows[0] } : null;
      },
    };
    return api;
  }

  const db = {
    query,
    async get(id: string) {
      const r = find(id);
      return r ? { ...r } : null;
    },
    normalizeId(table: string, id: string) {
      return id.startsWith(`${table}:`) && find(id) ? id : null;
    },
    async insert(table: string, doc: Record<string, unknown>) {
      const _id = `${table}:${++counter}`;
      rowsOf(table).push({ _id, _creationTime: Date.now(), ...doc });
      return _id;
    },
    async delete(id: string) {
      const table = id.split(":")[0];
      store[table] = rowsOf(table).filter((r) => r._id !== id);
    },
  };

  const ctx = {
    db,
    auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
    storage: { getUrl: async () => null },
    store,
  };
  return ctx as any;
}

// A Convex-registered function keeps the handler you wrote on `_handler`.
const run = (fn: unknown, ctx: unknown, args: Record<string, unknown> = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

/** The error a handler throws: its {code, reason} payload, or the Error. */
async function thrown(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: unknown }).data ?? e;
  }
  throw new Error("expected the handler to throw");
}

const NOW = Date.now();
const PROJECT = "projects:mural";
const ROLE = "projectRoles:painter";
const EVENT = "events:show";

const world = (
  over: { project?: Partial<Row>; role?: Partial<Row>; favorites?: Row[] } = {},
): Record<string, Row[]> => ({
  profiles: [
    { _id: "profiles:owner", userId: OWNER, name: "Olu", interests: [], createdAt: 0 },
    { _id: "profiles:member", userId: MEMBER, name: "Mia", interests: [], createdAt: 0 },
  ],
  projects: [
    {
      _id: PROJECT,
      userId: OWNER,
      kind: "paid",
      origin: "posted",
      title: "Mural",
      status: "active",
      createdAt: 0,
      updatedAt: 0,
      ...over.project,
    },
  ],
  projectRoles: [
    { _id: ROLE, projectId: PROJECT, title: "Painter", status: "open", createdAt: 0, ...over.role },
  ],
  events: [
    {
      _id: EVENT,
      organizerId: OWNER,
      title: "Open mic",
      datetime: NOW + 86_400_000,
      tags: [],
      requiresApproval: false,
      status: "published",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  favorites: over.favorites ?? [],
  notifications: [],
});

const fav = (targetType: string, targetId: string, userId = MEMBER): Row => ({
  _id: `favorites:${targetType}`,
  userId,
  targetType,
  targetId,
  createdAt: NOW,
});

describe("favoriteTargetTypeValidator", () => {
  it("covers follows, hearts and both kinds of save", () => {
    expect(favoriteTargetTypeValidator.members.map((m) => m.value)).toEqual([
      "profile",
      "event",
      "project",
      "role",
    ]);
  });
});

describe("saving a project or a role", () => {
  it.each([
    ["project", PROJECT],
    ["role", ROLE],
  ])("a %s saves, reads as saved, then unsaves", async (targetType, targetId) => {
    const ctx = makeCtx(world(), MEMBER);
    expect(await run(toggle, ctx, { targetType, targetId })).toEqual({ favorited: true });
    expect(ctx.store.favorites).toMatchObject([{ userId: MEMBER, targetType, targetId }]);
    expect(await run(isFavorited, ctx, { targetType, targetId })).toBe(true);

    expect(await run(toggle, ctx, { targetType, targetId })).toEqual({ favorited: false });
    expect(ctx.store.favorites).toEqual([]);
    expect(await run(isFavorited, ctx, { targetType, targetId })).toBe(false);
  });

  it.each([
    ["project", PROJECT],
    ["role", ROLE],
  ])("a %s save tells nobody, not even the lead", async (targetType, targetId) => {
    const ctx = makeCtx(world(), MEMBER);
    await run(toggle, ctx, { targetType, targetId });
    expect(ctx.store.notifications).toEqual([]);
  });

  it("a saved project and a saved role on it are two rows, unsaved one at a time", async () => {
    const ctx = makeCtx(world(), MEMBER);
    await run(toggle, ctx, { targetType: "project", targetId: PROJECT });
    await run(toggle, ctx, { targetType: "role", targetId: ROLE });
    expect(ctx.store.favorites.map((f: Row) => f.targetType)).toEqual(["project", "role"]);
    await run(toggle, ctx, { targetType: "project", targetId: PROJECT });
    expect(ctx.store.favorites.map((f: Row) => f.targetType)).toEqual(["role"]);
  });

  it("is for signed-in members only", async () => {
    const ctx = makeCtx(world(), null);
    await expect(run(toggle, ctx, { targetType: "project", targetId: PROJECT })).rejects.toThrow(
      "Not authenticated",
    );
    expect(await run(isFavorited, ctx, { targetType: "project", targetId: PROJECT })).toBe(false);
  });
});

describe("refusing a save", () => {
  it.each([
    ["project", "projects:gone"],
    ["project", "not an id"],
    ["project", ROLE], // a role's id passed as a project
    ["role", "projectRoles:gone"],
    ["role", PROJECT], // a project's id passed as a role
  ])("a missing %s (%s) reads as not found", async (targetType, targetId) => {
    const ctx = makeCtx(world(), MEMBER);
    expect(await thrown(run(toggle, ctx, { targetType, targetId }))).toMatchObject({ code: "not_found" });
    expect(ctx.store.favorites).toEqual([]);
  });

  it.each(["hidden", "pending", "archived"])(
    "a project that is %s, and any role on it, reads as not found",
    async (status) => {
      const ctx = makeCtx(world({ project: { status } }), MEMBER);
      expect(await thrown(run(toggle, ctx, { targetType: "project", targetId: PROJECT }))).toMatchObject({
        code: "not_found",
      });
      expect(await thrown(run(toggle, ctx, { targetType: "role", targetId: ROLE }))).toMatchObject({
        code: "not_found",
      });
      expect(ctx.store.favorites).toEqual([]);
    },
  );

  it.each(["in_progress", "completed"])("a %s project can still be saved", async (status) => {
    const ctx = makeCtx(world({ project: { status } }), MEMBER);
    expect(await run(toggle, ctx, { targetType: "project", targetId: PROJECT })).toEqual({ favorited: true });
  });

  it.each(["closed", "filled"])("a %s role can't be newly saved", async (status) => {
    const ctx = makeCtx(world({ role: { status } }), MEMBER);
    expect(await thrown(run(toggle, ctx, { targetType: "role", targetId: ROLE }))).toMatchObject({
      code: "role_closed",
    });
    expect(ctx.store.favorites).toEqual([]);
  });

  it.each([
    ["a completed project", { status: "completed" }],
    ["a cancelled project", { stage: "cancelled" }],
  ])("an open role on %s isn't an opening, so it can't be saved", async (_label, project) => {
    const ctx = makeCtx(world({ project }), MEMBER);
    expect(await thrown(run(toggle, ctx, { targetType: "role", targetId: ROLE }))).toMatchObject({
      code: "role_closed",
    });
  });

  it.each([
    ["a closed role", "role", ROLE, { role: { status: "closed" } }],
    ["a filled role", "role", ROLE, { role: { status: "filled" } }],
    ["a role on a hidden project", "role", ROLE, { project: { status: "hidden" } }],
    ["an archived project", "project", PROJECT, { project: { status: "archived" } }],
    ["a deleted project", "project", "projects:gone", {}],
  ] as const)("an existing save of %s can still be removed", async (_label, targetType, targetId, over) => {
    const ctx = makeCtx(world({ ...over, favorites: [fav(targetType, targetId)] }), MEMBER);
    expect(await run(toggle, ctx, { targetType, targetId })).toEqual({ favorited: false });
    expect(ctx.store.favorites).toEqual([]);
  });
});

describe("a hidden (test) community", () => {
  // "_TeamTest" is hidden (garden/hiddenCommunity.ts): only admins and its
  // active members see what's posted into it.
  const TEST = "hostOrgs:test";
  const inTest = (over: { membership?: string; admin?: boolean; favorites?: Row[] } = {}) => {
    const w = world({ project: { hostOrgId: TEST }, favorites: over.favorites });
    w.events[0].hostOrgId = TEST;
    w.hostOrgs = [{ _id: TEST, name: "_TeamTest", slug: "teamtest" }];
    w.communityMembers = over.membership
      ? [{ _id: "communityMembers:mia", hostOrgId: TEST, userId: MEMBER, role: "member", status: over.membership, joinedAt: 1 }]
      : [];
    if (over.admin) w.profiles[1].isAdmin = true;
    return w;
  };

  it.each([
    ["project", PROJECT],
    ["role", ROLE],
  ])("a %s posted there reads as not found to someone outside it", async (targetType, targetId) => {
    for (const membership of [undefined, "pending", "removed"]) {
      const ctx = makeCtx(inTest({ membership }), MEMBER);
      expect(await thrown(run(toggle, ctx, { targetType, targetId }))).toMatchObject({ code: "not_found" });
      expect(ctx.store.favorites).toEqual([]);
    }
  });

  it.each([
    ["project", PROJECT],
    ["role", ROLE],
  ])("a %s posted there saves for its active members, admins and its lead", async (targetType, targetId) => {
    const viewers = [
      [MEMBER, inTest({ membership: "active" })],
      [MEMBER, inTest({ admin: true })],
      [OWNER, inTest()],
    ] as const;
    for (const [viewer, tables] of viewers) {
      const ctx = makeCtx(tables, viewer);
      expect(await run(toggle, ctx, { targetType, targetId })).toEqual({ favorited: true });
    }
  });

  it("an event posted there drops out of getMyFavorites for someone outside it", async () => {
    const hearted = { favorites: [fav("event", EVENT)] };
    expect((await run(getMyFavorites, makeCtx(inTest(hearted), MEMBER), {})).events).toEqual([]);
    const member = await run(getMyFavorites, makeCtx(inTest({ ...hearted, membership: "active" }), MEMBER), {});
    expect(member.events.map((e: any) => e.event._id)).toEqual([EVENT]);
  });

  it("the event's organizer keeps their own heart on it", async () => {
    const tables = inTest({ favorites: [fav("event", EVENT, OWNER)] });
    const result = await run(getMyFavorites, makeCtx(tables, OWNER), {});
    expect(result.events.map((e: any) => e.event._id)).toEqual([EVENT]);
  });
});

describe("remove — unsave, and only that", () => {
  it.each([
    ["profile", "profiles:owner"],
    ["event", EVENT],
    ["project", PROJECT],
    ["role", ROLE],
  ] as const)("removes a %s save, silently", async (targetType, targetId) => {
    const ctx = makeCtx(world({ favorites: [fav(targetType, targetId)] }), MEMBER);
    expect(await run(remove, ctx, { targetType, targetId })).toEqual({ favorited: false });
    expect(ctx.store.favorites).toEqual([]);
    expect(ctx.store.notifications).toEqual([]);
  });

  it("does nothing when there's no save: pressed twice, it never saves", async () => {
    const ctx = makeCtx(world({ favorites: [fav("project", PROJECT)] }), MEMBER);
    await run(remove, ctx, { targetType: "project", targetId: PROJECT });
    expect(await run(remove, ctx, { targetType: "project", targetId: PROJECT })).toEqual({ favorited: false });
    expect(ctx.store.favorites).toEqual([]);
  });

  it("removes only the member's own save of that target", async () => {
    const theirs = { ...fav("project", PROJECT, OWNER), _id: "favorites:theirs" };
    const ctx = makeCtx(world({ favorites: [theirs, fav("role", ROLE)] }), MEMBER);
    await run(remove, ctx, { targetType: "project", targetId: PROJECT });
    expect(ctx.store.favorites.map((f: Row) => f._id)).toEqual(["favorites:theirs", "favorites:role"]);
  });

  it.each([
    ["a closed role", "role", ROLE, { role: { status: "closed" } }],
    ["a role on a hidden project", "role", ROLE, { project: { status: "hidden" } }],
    ["a deleted project", "project", "projects:gone", {}],
    ["something that was never an id", "project", "not an id", {}],
  ] as const)("never checks the target: a save of %s goes", async (_label, targetType, targetId, over) => {
    const ctx = makeCtx(world({ ...over, favorites: [fav(targetType, targetId)] }), MEMBER);
    await run(remove, ctx, { targetType, targetId });
    expect(ctx.store.favorites).toEqual([]);
  });

  it("is for signed-in members only", async () => {
    await expect(run(remove, makeCtx(world(), null), { targetType: "project", targetId: PROJECT })).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("getFavoriteCount", () => {
  it("counts follows and hearts", async () => {
    const ctx = makeCtx(world({ favorites: [fav("profile", "profiles:owner"), fav("event", EVENT)] }), null);
    expect(await run(getFavoriteCount, ctx, { targetType: "profile", targetId: "profiles:owner" })).toBe(1);
    expect(await run(getFavoriteCount, ctx, { targetType: "event", targetId: EVENT })).toBe(1);
  });

  it("takes profiles and events only, so a project's or role's save count isn't public", () => {
    const args = JSON.parse((getFavoriteCount as unknown as { exportArgs(): string }).exportArgs());
    const targetType = args.value.targetType.fieldType;
    expect(targetType.type).toBe("union");
    expect(targetType.value.map((m: { value: string }) => m.value)).toEqual(["profile", "event"]);
  });
});

describe("following a profile", () => {
  it("still tells the followed person, once, on follow", async () => {
    const ctx = makeCtx(world(), MEMBER);
    await run(toggle, ctx, { targetType: "profile", targetId: "profiles:owner" });
    expect(ctx.store.notifications).toMatchObject([
      {
        userId: OWNER,
        type: "new_follower",
        title: "Mia is following your work",
        linkUrl: "/profile/profiles:member",
        relatedUserId: MEMBER,
      },
    ]);

    await run(toggle, ctx, { targetType: "profile", targetId: "profiles:owner" });
    expect(ctx.store.favorites).toEqual([]);
    expect(ctx.store.notifications).toHaveLength(1);
  });

  it("an event heart tells nobody", async () => {
    const ctx = makeCtx(world(), MEMBER);
    expect(await run(toggle, ctx, { targetType: "event", targetId: EVENT })).toEqual({ favorited: true });
    expect(ctx.store.notifications).toEqual([]);
  });
});

describe("getMyFavorites", () => {
  const saved = () =>
    world({
      favorites: [
        fav("profile", "profiles:owner"),
        fav("event", EVENT),
        fav("project", PROJECT),
        fav("role", ROLE),
      ],
    });

  it("keeps its { profiles, events } shape and ignores project and role saves", async () => {
    const result = await run(getMyFavorites, makeCtx(saved(), MEMBER), {});
    expect(Object.keys(result).sort()).toEqual(["events", "profiles"]);
    expect(result.profiles.map((p: any) => p.profile._id)).toEqual(["profiles:owner"]);
    expect(result.events.map((e: any) => e.event._id)).toEqual([EVENT]);
  });

  it.each(["project", "role"])("asked for %s saves, returns the empty shape", async (targetType) => {
    expect(await run(getMyFavorites, makeCtx(saved(), MEMBER), { targetType })).toEqual({
      profiles: [],
      events: [],
    });
  });

  it("is empty when signed out", async () => {
    expect(await run(getMyFavorites, makeCtx(saved(), null), {})).toEqual({ profiles: [], events: [] });
  });
});
