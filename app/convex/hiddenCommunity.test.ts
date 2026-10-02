// Hidden (test) communities, end to end on an in-memory ctx: a community
// whose name starts with "_" (hiddenCommunity.ts) must not exist for anyone
// but admins and its active members — not in the directory, not by its
// address, not in any browse list or search, and not by a direct link to
// something posted into it. Same harness shape as moderation.test.ts: the
// real handlers, a tiny fake ctx, so what's under test is which rows each
// handler returns to whom.

import { describe, expect, it } from "vitest";
import {
  applyToHost,
  getCommunity,
  joinCommunity,
  listCommunities,
  updateCommunity,
} from "./garden/communities";
import { getCommunityLanding, getEntryCommunity } from "./garden/communityDomains";
import { communityVisibility, isHiddenCommunityId } from "./garden/communityVisibility";
import { canSeeEvent } from "./garden/eventVisibility";
import { getProject as getProjectDetail, listProjects as listProjectsDetail } from "./garden/projects";
import { getProject as getProjectPublic, listProjects as listProjectsPublic } from "./garden/projectsPublic";
import { getStoryPage, postStoryUpdate } from "./garden/stories";
import { listAffiliations } from "./garden/projectTeam";
import { getTable, listTables } from "./garden/tables";
import { publicCounts } from "./garden/stats";
import { get as getEvent, list as listEvents, listForOrganization, search as searchEvents } from "./events";
import { getOffering, listOfferings } from "./offerings";
import { search as searchProfiles } from "./profiles";

const ADMIN = "users:admin";
const OWNER = "users:owner"; // host of both communities, teacher / lead / organizer of everything
const MEMBER = "users:member"; // active member of the hidden community
const PENDING = "users:pending"; // asked to join the hidden community, not yet in
const STRANGER = "users:stranger";

const PUB = "hostOrgs:pub";
const HID = "hostOrgs:hid";

// ——————————————————————————————————————————————————————————————
// The harness
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx: get / insert / patch / delete, and
 * query().withIndex(name, q => q.eq(..).gte(..)) or .filter(...) followed by
 * collect / first / unique / take. Index names aren't checked — the schema
 * does that for real. */
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
        const conds: ((r: Row) => boolean)[] = [];
        const q: any = {
          eq: (f: string, v: unknown) => (conds.push((r) => r[f] === v), q),
          gt: (f: string, v: any) => (conds.push((r) => r[f] > v), q),
          gte: (f: string, v: any) => (conds.push((r) => r[f] >= v), q),
          lt: (f: string, v: any) => (conds.push((r) => r[f] < v), q),
          lte: (f: string, v: any) => (conds.push((r) => r[f] <= v), q),
        };
        build(q);
        rows = rows.filter((r) => conds.every((c) => c(r)));
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
      async take(n: number) {
        return rows.slice(0, n).map((r) => ({ ...r }));
      },
      async unique() {
        if (rows.length > 1) throw new Error("unique() matched more than one row");
        return rows[0] ? { ...rows[0] } : null;
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
  };

  return {
    db,
    auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
    storage: { getUrl: async () => null, delete: async () => {} },
    scheduler: { runAfter: async () => {} },
    store,
  } as any;
}

const run = (fn: unknown, ctx: unknown, args: Record<string, unknown> = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

async function thrown(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: unknown }).data ?? e;
  }
  throw new Error("expected the handler to throw");
}

// ——————————————————————————————————————————————————————————————
// The world: one ordinary community, one hidden one, and a piece of
// content of each kind in each (plus one in neither).
// ——————————————————————————————————————————————————————————————

const NOW = Date.now();
const DAY = 86_400_000;

function world(): Record<string, Row[]> {
  return {
    profiles: [
      { _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true, interests: [], createdAt: 0, updatedAt: 0 },
      { _id: "profiles:owner", userId: OWNER, name: "Olu", interests: [], createdAt: 0, updatedAt: 0 },
      { _id: "profiles:member", userId: MEMBER, name: "Mia", interests: [], createdAt: 0, updatedAt: 0 },
      { _id: "profiles:pending", userId: PENDING, name: "Pat", interests: [], createdAt: 0, updatedAt: 0 },
      { _id: "profiles:stranger", userId: STRANGER, name: "Sam", interests: [], createdAt: 0, updatedAt: 0 },
    ],
    hostOrgs: [
      {
        _id: PUB, name: "Public Circle", slug: "public-circle", kind: "community",
        status: "active", visibility: "public", joinPolicy: "open", ownerUserId: OWNER, createdAt: 1,
      },
      {
        _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community",
        status: "active", visibility: "public", joinPolicy: "open", ownerUserId: OWNER,
        domains: ["teamtest.test"], createdAt: 2,
      },
    ],
    communityMembers: [
      { _id: "communityMembers:1", hostOrgId: PUB, userId: OWNER, role: "host", status: "active", joinedAt: 0 },
      { _id: "communityMembers:2", hostOrgId: HID, userId: OWNER, role: "host", status: "active", joinedAt: 0 },
      { _id: "communityMembers:3", hostOrgId: HID, userId: MEMBER, role: "member", status: "active", joinedAt: 0 },
      { _id: "communityMembers:4", hostOrgId: HID, userId: PENDING, role: "member", status: "pending", joinedAt: 0 },
    ],
    events: [
      event("events:pub", "Public show", PUB),
      event("events:hid", "Test show", HID),
      event("events:plain", "Plain show", undefined),
    ],
    projects: [
      project("projects:pub", "Public mural", "public-mural", PUB),
      project("projects:hid", "Test mural", "test-mural", HID),
      project("projects:plain", "Plain mural", "plain-mural", undefined),
    ],
    offerings: [
      offering("offerings:pub", "Public class", PUB),
      offering("offerings:hid", "Test class", HID),
      offering("offerings:plain", "Plain class", undefined),
    ],
    gardenTables: [
      table("gardenTables:pub", "Public table", "public-table", PUB),
      table("gardenTables:hid", "Test table", "test-table", HID),
    ],
    organizations: [{ _id: "organizations:o", name: "Olu Co", slug: "olu-co", nameKey: "olu co", createdAt: 0, updatedAt: 0 }],
    orgPositions: [
      {
        _id: "orgPositions:1", organizationId: "organizations:o", userId: OWNER,
        profileId: "profiles:owner", isAdmin: true, order: 0, createdAt: 0,
      },
    ],
    favorites: [
      // Sam follows Olu, so anything Olu posts "publicly" would reach Sam.
      { _id: "favorites:1", userId: STRANGER, targetType: "profile", targetId: "profiles:owner", createdAt: 0 },
    ],
  };
}

function event(_id: string, title: string, hostOrgId: string | undefined): Row {
  return {
    _id, organizerId: OWNER, title, description: "Bring a song", datetime: NOW + DAY, tags: [],
    requiresApproval: false, status: "published", hostOrgId, createdAt: 0, updatedAt: 0,
  };
}

function project(_id: string, title: string, storySlug: string, hostOrgId: string | undefined): Row {
  return {
    _id, userId: OWNER, kind: "passion", origin: "posted", title, status: "active", storySlug,
    hostOrgId, createdAt: _id === "projects:hid" ? 3 : 1, updatedAt: 0,
  };
}

function offering(_id: string, title: string, hostOrgId: string | undefined): Row {
  return { _id, userId: OWNER, title, format: "class", status: "active", hostOrgId, createdAt: 1, updatedAt: 0 };
}

function table(_id: string, name: string, slug: string, hostOrgId: string): Row {
  return { _id, name, slug, mode: "open", format: "online", status: "active", hostOrgId, createdAt: 0 };
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();
const asStranger = () => makeCtx(world(), STRANGER);
const as = (viewer: string | null, tables = world()) => makeCtx(tables, viewer);

// Who sees the hidden community, in the order every test below checks them.
const INSIDERS = [
  ["a member", MEMBER],
  ["an admin", ADMIN],
] as const;
const OUTSIDERS = [
  ["a stranger", STRANGER],
  ["someone signed out", null],
  ["someone whose request to join is still pending", PENDING],
] as const;

// ——————————————————————————————————————————————————————————————
// The community itself
// ——————————————————————————————————————————————————————————————

describe("the community directory", () => {
  it.each(OUTSIDERS)("%s does not see it", async (_label, viewer) => {
    const list = await run(listCommunities, as(viewer));
    expect(list.map((c: any) => c.slug)).toEqual(["public-circle"]);
  });

  it.each(INSIDERS)("%s does", async (_label, viewer) => {
    const list = await run(listCommunities, as(viewer));
    expect(list.map((c: any) => c.slug).sort()).toEqual(["public-circle", "teamtest"]);
    // Counts are the real ones for those allowed to see them.
    expect(list.find((c: any) => c.slug === "teamtest").memberCount).toBe(2);
  });
});

describe("a community's page", () => {
  it.each(OUTSIDERS)("%s gets not-found", async (_label, viewer) => {
    expect(await run(getCommunity, as(viewer), { slug: "teamtest" })).toBeNull();
  });

  it.each(INSIDERS)("%s gets the page, with what's posted into it", async (_label, viewer) => {
    const page = await run(getCommunity, as(viewer), { slug: "teamtest" });
    expect(page).toMatchObject({ name: "_TeamTest", slug: "teamtest" });
    expect(page.events.map((e: any) => e.title)).toEqual(["Test show"]);
    expect(page.projects.map((p: any) => p.title)).toEqual(["Test mural"]);
    expect(page.offerings.map((o: any) => o.title)).toEqual(["Test class"]);
    expect(page.tables.map((t: any) => t.name)).toEqual(["Test table"]);
  });

  it("an ordinary community's page is open to a stranger", async () => {
    expect(await run(getCommunity, asStranger(), { slug: "public-circle" })).toMatchObject({ name: "Public Circle" });
  });

  it("a hidden community's host can open it even while it is pending approval", async () => {
    const w = world();
    w.hostOrgs[1].status = "pending";
    expect(await run(getCommunity, as(OWNER, w), { slug: "teamtest" })).toMatchObject({ name: "_TeamTest" });
    expect(await run(getCommunity, as(STRANGER, w), { slug: "teamtest" })).toBeNull();
  });
});

describe("a community's front door", () => {
  it.each(OUTSIDERS)("/<slug> is not-found for %s", async (_label, viewer) => {
    expect(await run(getCommunityLanding, as(viewer), { slug: "teamtest" })).toBeNull();
  });

  it.each(INSIDERS)("/<slug> opens for %s", async (_label, viewer) => {
    expect(await run(getCommunityLanding, as(viewer), { slug: "teamtest" })).toMatchObject({ name: "_TeamTest" });
  });

  it("never becomes a visitor's entry community, by slug or by domain", async () => {
    expect(await run(getEntryCommunity, as(null), { communitySlug: "teamtest" })).toBeNull();
    expect(await run(getEntryCommunity, as(null), { host: "teamtest.test" })).toBeNull();
    expect(await run(getEntryCommunity, as(null), { communitySlug: "public-circle" })).toMatchObject({ slug: "public-circle" });
  });
});

describe("joining", () => {
  it("a stranger can't join one they can't see, even with its id", async () => {
    const ctx = asStranger();
    const err = await thrown(run(joinCommunity, ctx, { hostOrgId: HID }));
    expect(err).toMatchObject({ code: "not_found" });
    expect(ctx.store.communityMembers.filter((m: Row) => m.userId === STRANGER)).toEqual([]);
  });

  it("an admin can, which is how a team gets in", async () => {
    const ctx = as(ADMIN);
    expect(await run(joinCommunity, ctx, { hostOrgId: HID })).toMatchObject({ ok: true, status: "active" });
  });

  it("an ordinary community is still open to join", async () => {
    expect(await run(joinCommunity, asStranger(), { hostOrgId: PUB })).toMatchObject({ ok: true });
  });
});

describe("making one", () => {
  const adminCtx = () => {
    const w = world();
    return as(ADMIN, w);
  };

  it("an admin names a community with a leading underscore; it lands pending, hidden by name", async () => {
    const ctx = adminCtx();
    const out = await run(applyToHost, ctx, { name: "_TeamTest2" });
    expect(out.slug).toBe("teamtest2");
    const row = ctx.store.hostOrgs.find((o: Row) => o._id === out.hostOrgId);
    expect(row).toMatchObject({ name: "_TeamTest2", status: "pending", kind: "community" });
  });

  it("anyone else is told the name can't start with an underscore", async () => {
    const ctx = asStranger();
    const err = await thrown(run(applyToHost, ctx, { name: "_Secret" }));
    expect(err).toMatchObject({ code: "invalid_name" });
    expect(ctx.store.hostOrgs.filter((o: Row) => o.name === "_Secret")).toEqual([]);
  });

  it("an ordinary name is unaffected", async () => {
    const out = await run(applyToHost, asStranger(), { name: "Table Art Society" });
    expect(out.slug).toBe("table-art-society");
  });

  it("a host can't hide their own community by renaming it, or un-hide a test one", async () => {
    const hide = await thrown(run(updateCommunity, as(OWNER), { hostOrgId: PUB, name: "_Public Circle" }));
    expect(hide).toMatchObject({ code: "invalid_name" });
    const unhide = await thrown(run(updateCommunity, as(OWNER), { hostOrgId: HID, name: "TeamTest" }));
    expect(unhide).toMatchObject({ code: "invalid_name" });
    // A plain rename of an ordinary community still works.
    expect(await run(updateCommunity, as(OWNER), { hostOrgId: PUB, name: "Public Circle SD" })).toEqual({ ok: true });
  });

  it("an admin can rename it either way", async () => {
    const ctx = as(ADMIN);
    expect(await run(updateCommunity, ctx, { hostOrgId: HID, name: "TeamTest" })).toEqual({ ok: true });
    expect(ctx.store.hostOrgs.find((o: Row) => o._id === HID).name).toBe("TeamTest");
  });
});

// ——————————————————————————————————————————————————————————————
// Events
// ——————————————————————————————————————————————————————————————

describe("events", () => {
  it.each(OUTSIDERS)("the list leaves out its event for %s", async (_label, viewer) => {
    expect(titles(await run(listEvents, as(viewer), {}))).toEqual(["Plain show", "Public show"]);
  });

  it.each(INSIDERS)("the list has its event for %s", async (_label, viewer) => {
    expect(titles(await run(listEvents, as(viewer), {}))).toEqual(["Plain show", "Public show", "Test show"]);
  });

  it.each(OUTSIDERS)("search leaves it out for %s, with or without the community", async (_label, viewer) => {
    expect(titles(await run(searchEvents, as(viewer), { query: "show" }))).toEqual(["Plain show", "Public show"]);
    expect(await run(searchEvents, as(viewer), { query: "show", communitySlug: "teamtest" })).toEqual([]);
  });

  it.each(INSIDERS)("search finds it for %s", async (_label, viewer) => {
    expect(titles(await run(searchEvents, as(viewer), { query: "show" }))).toEqual(["Plain show", "Public show", "Test show"]);
    expect(titles(await run(searchEvents, as(viewer), { query: "show", communitySlug: "teamtest" }))).toEqual(["Test show"]);
  });

  it.each(OUTSIDERS)("its page is not-found for %s", async (_label, viewer) => {
    expect(await run(getEvent, as(viewer), { eventId: "events:hid" })).toBeNull();
  });

  it.each(INSIDERS)("its page opens for %s", async (_label, viewer) => {
    expect(await run(getEvent, as(viewer), { eventId: "events:hid" })).toMatchObject({
      title: "Test show",
      community: { name: "_TeamTest", slug: "teamtest" },
    });
  });

  it("its organizer can still open it", async () => {
    expect(await run(getEvent, as(OWNER), { eventId: "events:hid" })).toMatchObject({ title: "Test show" });
  });

  it("an ordinary community's event is open to a stranger", async () => {
    expect(await run(getEvent, asStranger(), { eventId: "events:pub" })).toMatchObject({ title: "Public show" });
  });

  it("an organization's page leaves it out for a stranger and keeps it for a member", async () => {
    const stranger = await run(listForOrganization, asStranger(), { organizationId: "organizations:o" });
    expect(titles(stranger.upcoming)).toEqual(["Plain show", "Public show"]);
    const member = await run(listForOrganization, as(MEMBER), { organizationId: "organizations:o" });
    expect(titles(member.upcoming)).toEqual(["Plain show", "Public show", "Test show"]);
  });

  it("apply / RSVP / attendee reads (canSeeEvent) refuse a stranger who has only the id", async () => {
    const hid = (await as(null).db.get("events:hid"))!;
    const pub = (await as(null).db.get("events:pub"))!;
    expect(await canSeeEvent(asStranger(), hid, STRANGER as any)).toBe(false);
    expect(await canSeeEvent(as(null), hid, null)).toBe(false);
    expect(await canSeeEvent(as(MEMBER), hid, MEMBER as any)).toBe(true);
    expect(await canSeeEvent(as(ADMIN), hid, ADMIN as any)).toBe(true);
    expect(await canSeeEvent(as(OWNER), hid, OWNER as any)).toBe(true);
    expect(await canSeeEvent(asStranger(), pub, STRANGER as any)).toBe(true);
  });
});

// ——————————————————————————————————————————————————————————————
// Projects
// ——————————————————————————————————————————————————————————————

describe("projects", () => {
  const PROJECT_LISTS = [
    ["garden/projects.listProjects", listProjectsDetail],
    ["garden/projectsPublic.listProjects", listProjectsPublic],
  ] as const;

  describe.each(PROJECT_LISTS)("%s", (_name, listFn) => {
    it.each(OUTSIDERS)("leaves it out for %s", async (_label, viewer) => {
      expect(titles(await run(listFn, as(viewer), {}))).toEqual(["Plain mural", "Public mural"]);
    });
    it.each(INSIDERS)("has it for %s", async (_label, viewer) => {
      expect(titles(await run(listFn, as(viewer), {}))).toEqual(["Plain mural", "Public mural", "Test mural"]);
    });
  });

  const PROJECT_PAGES = [
    ["garden/projects.getProject", getProjectDetail],
    ["garden/projectsPublic.getProject", getProjectPublic],
  ] as const;

  describe.each(PROJECT_PAGES)("%s", (_name, getFn) => {
    it.each(OUTSIDERS)("is not-found for %s", async (_label, viewer) => {
      expect(await run(getFn, as(viewer), { projectId: "projects:hid" })).toBeNull();
    });
    it.each(INSIDERS)("opens for %s", async (_label, viewer) => {
      expect(await run(getFn, as(viewer), { projectId: "projects:hid" })).toMatchObject({ title: "Test mural" });
    });
    it("opens for its lead", async () => {
      expect(await run(getFn, as(OWNER), { projectId: "projects:hid" })).toMatchObject({ title: "Test mural" });
    });
    it("an ordinary community's project is open to a stranger", async () => {
      expect(await run(getFn, asStranger(), { projectId: "projects:pub" })).toMatchObject({ title: "Public mural" });
    });
  });

  it.each(OUTSIDERS)("its story page is not-found for %s", async (_label, viewer) => {
    expect(await run(getStoryPage, as(viewer), { storySlug: "test-mural" })).toBeNull();
  });

  it.each(INSIDERS)("its story page opens for %s", async (_label, viewer) => {
    expect(await run(getStoryPage, as(viewer), { storySlug: "test-mural" })).toMatchObject({
      project: { title: "Test mural" },
    });
  });

  it("the lead's profile lists it only to those who can see the community", async () => {
    const args = { profileId: "profiles:owner" };
    const stranger = await run(listAffiliations, asStranger(), args);
    expect(titles(stranger)).toEqual(["Plain mural", "Public mural"]);
    const member = await run(listAffiliations, as(MEMBER), args);
    expect(titles(member)).toEqual(["Plain mural", "Public mural", "Test mural"]);
  });

  it("posting an update on it tells no followers; on an ordinary project it does", async () => {
    const ctx = as(OWNER);
    await run(postStoryUpdate, ctx, { projectId: "projects:hid", body: "Day one" });
    expect(ctx.store.notifications ?? []).toEqual([]);
    await run(postStoryUpdate, ctx, { projectId: "projects:pub", body: "Day one" });
    expect(ctx.store.notifications).toHaveLength(1);
    expect(ctx.store.notifications[0]).toMatchObject({ userId: STRANGER, type: "project_update" });
  });
});

// ——————————————————————————————————————————————————————————————
// Classes and tables
// ——————————————————————————————————————————————————————————————

describe("classes", () => {
  it.each(OUTSIDERS)("the list leaves out its class for %s", async (_label, viewer) => {
    expect(titles(await run(listOfferings, as(viewer)))).toEqual(["Plain class", "Public class"]);
  });
  it.each(INSIDERS)("the list has its class for %s", async (_label, viewer) => {
    expect(titles(await run(listOfferings, as(viewer)))).toEqual(["Plain class", "Public class", "Test class"]);
  });
  it.each(OUTSIDERS)("its page is not-found for %s", async (_label, viewer) => {
    expect(await run(getOffering, as(viewer), { offeringId: "offerings:hid" })).toBeNull();
  });
  it.each(INSIDERS)("its page opens for %s", async (_label, viewer) => {
    expect(await run(getOffering, as(viewer), { offeringId: "offerings:hid" })).toMatchObject({ title: "Test class" });
  });
  it("opens for its teacher", async () => {
    expect(await run(getOffering, as(OWNER), { offeringId: "offerings:hid" })).toMatchObject({ title: "Test class" });
  });
});

describe("tables", () => {
  const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();
  it.each(OUTSIDERS)("the list leaves out its table for %s", async (_label, viewer) => {
    expect(names(await run(listTables, as(viewer)))).toEqual(["Public table"]);
  });
  it.each(INSIDERS)("the list has its table for %s", async (_label, viewer) => {
    expect(names(await run(listTables, as(viewer)))).toEqual(["Public table", "Test table"]);
  });
  it.each(OUTSIDERS)("its page is not-found for %s", async (_label, viewer) => {
    expect(await run(getTable, as(viewer), { slug: "test-table" })).toBeNull();
  });
  it.each(INSIDERS)("its page opens for %s", async (_label, viewer) => {
    expect(await run(getTable, as(viewer), { slug: "test-table" })).toMatchObject({ name: "Test table" });
  });
});

// ——————————————————————————————————————————————————————————————
// People and counts
// ——————————————————————————————————————————————————————————————

describe("finding its people", () => {
  const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

  it.each(OUTSIDERS)("a search scoped to it finds nobody for %s", async (_label, viewer) => {
    expect(await run(searchProfiles, as(viewer), { communitySlug: "teamtest" })).toEqual([]);
  });

  it.each(INSIDERS)("%s finds its active members, not the pending request", async (_label, viewer) => {
    expect(names(await run(searchProfiles, as(viewer), { communitySlug: "teamtest" }))).toEqual(["Mia", "Olu"]);
  });

  it("an ordinary community's people are open to a stranger", async () => {
    expect(names(await run(searchProfiles, asStranger(), { communitySlug: "public-circle" }))).toEqual(["Olu"]);
  });
});

describe("the public counts", () => {
  it("leave the hidden community and what's in it out, for everyone", async () => {
    const stranger = await run(publicCounts, asStranger());
    expect(stranger).toMatchObject({ communities: 1, activeProjects: 2 });
    expect(await run(publicCounts, as(ADMIN))).toMatchObject({ communities: 1, activeProjects: 2 });
    expect(await run(publicCounts, as(MEMBER))).toMatchObject({ communities: 1, activeProjects: 2 });
  });
});

// ——————————————————————————————————————————————————————————————
// The shared helper
// ——————————————————————————————————————————————————————————————

describe("communityVisibility", () => {
  it("filters any rows carrying a hostOrgId and keeps ones with none", async () => {
    const rows = [
      { id: 1, hostOrgId: PUB as any },
      { id: 2, hostOrgId: HID as any },
      { id: 3, hostOrgId: undefined },
    ];
    expect((await communityVisibility(asStranger()).filter(rows)).map((r) => r.id)).toEqual([1, 3]);
    expect((await communityVisibility(as(MEMBER)).filter(rows)).map((r) => r.id)).toEqual([1, 2, 3]);
    expect((await communityVisibility(as(ADMIN)).filter(rows)).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("treats a dangling hostOrgId as nothing to hide", async () => {
    expect(await communityVisibility(asStranger()).idVisible("hostOrgs:gone" as any)).toBe(true);
  });

  it("a removed member is a stranger", async () => {
    const w = world();
    w.communityMembers[2].status = "removed";
    expect(await communityVisibility(as(MEMBER, w)).idVisible(HID as any)).toBe(false);
  });

  it("isHiddenCommunityId ignores who is asking", async () => {
    expect(await isHiddenCommunityId(as(ADMIN), HID as any)).toBe(true);
    expect(await isHiddenCommunityId(as(ADMIN), PUB as any)).toBe(false);
    expect(await isHiddenCommunityId(as(ADMIN), undefined)).toBe(false);
  });
});
