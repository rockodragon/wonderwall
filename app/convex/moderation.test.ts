// Tests for admin hide / unhide / delete of projects and events
// (moderation.ts, moderationRules.ts).
//
// Two layers, same shape as offeringModeration.test.ts. First the pure
// rules. Then the real handlers on a small in-memory ctx, because a hide is
// only as good as the wiring: a hidden row must really be missing from the
// browse lists and the direct-link reads, still open for its owner and
// admins, and out of the owner's reach to undo.

import { describe, expect, it } from "vitest";
import {
  deleteBlocker,
  isHidden,
  isPostedProject,
  restoredStatus,
  VISIBLE_PROJECT_STATUSES,
} from "./moderationRules";
import { deleteEvent, deleteProject, listHidden, setEventHidden, setProjectHidden } from "./moderation";
import { cancel as cancelEvent, get as getEvent, list as listEvents } from "./events";
import { getProject, listProjects, updateProjectStatus } from "./garden/projects";
import { getStoryPage } from "./garden/stories";
import { isAcceptingPeople, listAffiliations } from "./garden/projectTeam";

const ADMIN = "users:admin";
const OWNER = "users:owner";
const STRANGER = "users:stranger";

// ——————————————————————————————————————————————————————————————
// Pure rules
// ——————————————————————————————————————————————————————————————

describe("moderationRules", () => {
  it("isHidden reads only the hidden status", () => {
    expect(isHidden({ status: "hidden" })).toBe(true);
    expect(isHidden({ status: "archived" })).toBe(false);
    expect(isHidden({ status: "cancelled" })).toBe(false);
    expect(isHidden(null)).toBe(false);
  });

  it("restoredStatus puts back what was there, else the fallback", () => {
    expect(restoredStatus({ statusBeforeHidden: "completed" }, "active")).toBe("completed");
    expect(restoredStatus({ statusBeforeHidden: "cancelled" }, "published")).toBe("cancelled");
    expect(restoredStatus({}, "published")).toBe("published");
    // Never restores to hidden itself.
    expect(restoredStatus({ statusBeforeHidden: "hidden" }, "active")).toBe("active");
  });

  it("deleteBlocker is null with no money on record", () => {
    expect(deleteBlocker("event", { "ticket sale": 0, "paid ticket": 0 })).toBeNull();
  });

  it("deleteBlocker names what's on record and says to hide instead", () => {
    expect(deleteBlocker("event", { "ticket sale": 1, "paid ticket": 0 })).toBe(
      "This event has 1 ticket sale on record, which the ledger keeps. Hide it instead.",
    );
    expect(
      deleteBlocker("project", { "backing payment": 2, "fund allocation": 1, "grant proposal": 3 }),
    ).toBe(
      "This project has 2 backing payments, 1 fund allocation and 3 grant proposals on record, which the ledger keeps. Hide it instead.",
    );
  });

  it("VISIBLE_PROJECT_STATUSES: live and completed work shows; pending, archived and hidden don't", () => {
    for (const status of ["active", "in_progress", "completed"]) expect(VISIBLE_PROJECT_STATUSES.has(status)).toBe(true);
    for (const status of ["pending", "archived", "hidden"]) expect(VISIBLE_PROJECT_STATUSES.has(status)).toBe(false);
  });

  it("isPostedProject: only an explicit portfolio origin is a share, not a post", () => {
    expect(isPostedProject({ origin: "portfolio" })).toBe(false);
    expect(isPostedProject({ origin: "posted" })).toBe(true);
    // Predates the field: still a real project.
    expect(isPostedProject({})).toBe(true);
  });

  it("a hidden project isn't taking people", () => {
    expect(isAcceptingPeople({ kind: "passion", status: "active" })).toBe(true);
    expect(isAcceptingPeople({ kind: "passion", status: "hidden" })).toBe(false);
  });
});

// ——————————————————————————————————————————————————————————————
// The real handlers, on an in-memory ctx
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx for the handlers under test: db get /
 * insert / patch (undefined removes a field) / delete, and query()
 * .withIndex(name, q => q.eq(..)) or .filter(q => q.eq(q.field(f), v))
 * followed by collect / first / unique / take. Index names aren't checked —
 * the schema does that for real; what's under test is which rows the
 * handlers ask for and what they do with them. `deletedFiles` records
 * storage deletes. */
function makeCtx(tables: Record<string, Row[]>, viewerId: string | null) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  const deletedFiles: string[] = [];
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

  const ctx = {
    db,
    auth: { getUserIdentity: async () => (viewerId ? { subject: `${viewerId}|session` } : null) },
    storage: {
      getUrl: async () => null,
      delete: async (id: string) => {
        deletedFiles.push(id);
      },
    },
    store,
    deletedFiles,
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
const profiles = (): Row[] => [
  { _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true, createdAt: 0 },
  { _id: "profiles:owner", userId: OWNER, name: "Olu", createdAt: 0 },
  { _id: "profiles:stranger", userId: STRANGER, name: "Sam", createdAt: 0 },
];

const EVENT = "events:show";
const eventWorld = (overrides: Partial<Row> = {}): Record<string, Row[]> => ({
  profiles: profiles(),
  events: [
    {
      _id: EVENT,
      organizerId: OWNER,
      title: "Open mic",
      description: "Bring a song",
      datetime: NOW + 86_400_000,
      tags: [],
      requiresApproval: false,
      status: "published",
      coverImageStorageId: "_storage:cover",
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    },
  ],
});

const PROJECT = "projects:mural";
const projectWorld = (overrides: Partial<Row> = {}): Record<string, Row[]> => ({
  profiles: profiles(),
  projects: [
    {
      _id: PROJECT,
      userId: OWNER,
      kind: "passion",
      origin: "posted",
      title: "Mural",
      status: "active",
      storySlug: "mural",
      photoStorageId: "_storage:photo",
      createdAt: 0,
      updatedAt: 0,
      ...overrides,
    },
  ],
});

describe("hiding an event", () => {
  it("is admin-only", async () => {
    const ctx = makeCtx(eventWorld(), OWNER);
    await expect(run(setEventHidden, ctx, { eventId: EVENT, hidden: true })).rejects.toThrow();
    expect(ctx.store.events[0].status).toBe("published");
  });

  it("takes it off the list and the page, except for its host and admins", async () => {
    const ctx = makeCtx(eventWorld(), ADMIN);
    await run(setEventHidden, ctx, { eventId: EVENT, hidden: true });
    expect(ctx.store.events[0]).toMatchObject({ status: "hidden", statusBeforeHidden: "published" });

    const stranger = makeCtx(ctx.store, STRANGER);
    expect(await run(listEvents, stranger, {})).toEqual([]);
    // Asking for the status by name doesn't get it back either.
    expect(await run(listEvents, stranger, { status: "hidden" })).toEqual([]);
    expect(await run(getEvent, stranger, { eventId: EVENT })).toBeNull();
    expect(await run(getEvent, makeCtx(ctx.store, null), { eventId: EVENT })).toBeNull();

    const host = await run(getEvent, makeCtx(ctx.store, OWNER), { eventId: EVENT });
    expect(host).toMatchObject({ hiddenByAdmin: true, hiddenUntilMembership: false });
    const admin = await run(getEvent, makeCtx(ctx.store, ADMIN), { eventId: EVENT });
    expect(admin).toMatchObject({ hiddenByAdmin: true });
  });

  it("can't be undone by its organizer cancelling it", async () => {
    const ctx = makeCtx(eventWorld({ status: "hidden", statusBeforeHidden: "published" }), OWNER);
    await expect(run(cancelEvent, ctx, { eventId: EVENT })).rejects.toThrow(/admin has hidden/);
    expect(ctx.store.events[0].status).toBe("hidden");
  });

  it("unhide puts back the status it had", async () => {
    const ctx = makeCtx(eventWorld({ status: "cancelled" }), ADMIN);
    await run(setEventHidden, ctx, { eventId: EVENT, hidden: true });
    await run(setEventHidden, ctx, { eventId: EVENT, hidden: false });
    expect(ctx.store.events[0].status).toBe("cancelled");
    expect(ctx.store.events[0]).not.toHaveProperty("statusBeforeHidden");
    expect(ctx.store.events[0]).not.toHaveProperty("hiddenAt");
  });

  it("a visible event is unchanged for everyone", async () => {
    const ctx = makeCtx(eventWorld(), STRANGER);
    expect(await run(listEvents, ctx, {})).toHaveLength(1);
    expect(await run(getEvent, ctx, { eventId: EVENT })).toMatchObject({ hiddenByAdmin: false });
  });
});

describe("deleting an event", () => {
  it("refuses when tickets were sold", async () => {
    const world = eventWorld();
    world.ticketPurchases = [
      { _id: "ticketPurchases:1", eventId: EVENT, tierName: "GA", amountCents: 2500, stripeSessionId: "cs_1", status: "paid", createdAt: 0 },
    ];
    const ctx = makeCtx(world, ADMIN);
    const err = await thrown(run(deleteEvent, ctx, { eventId: EVENT }));
    expect(err).toMatchObject({ code: "has_money" });
    expect(err.reason).toContain("1 ticket sale");
    expect(ctx.store.events).toHaveLength(1);
  });

  it("refuses when a paid external ticket landed as an RSVP", async () => {
    const world = eventWorld();
    world.eventRsvps = [
      { _id: "eventRsvps:paid", eventId: EVENT, name: "B", email: "b@x.co", paidCents: 2000, stripeRef: "ap:cs_9", createdAt: 0 },
    ];
    const err = await thrown(run(deleteEvent, makeCtx(world, ADMIN), { eventId: EVENT }));
    expect(err.reason).toContain("1 paid ticket");
  });

  it("removes the event, what hangs off it, and its files", async () => {
    const world = eventWorld({ imageStorageIds: ["_storage:g1"] });
    world.eventRsvps = [{ _id: "eventRsvps:1", eventId: EVENT, name: "A", email: "a@x.co", createdAt: 0 }];
    world.eventApplications = [{ _id: "eventApplications:1", eventId: EVENT, applicantId: STRANGER, status: "accepted", createdAt: 0, updatedAt: 0 }];
    world.favorites = [
      { _id: "favorites:1", userId: STRANGER, targetType: "event", targetId: EVENT, createdAt: 0 },
      { _id: "favorites:2", userId: STRANGER, targetType: "profile", targetId: "profiles:owner", createdAt: 0 },
    ];
    world.announcements = [{ _id: "announcements:1", targetType: "event", targetId: EVENT, kind: "broadcast", body: "hi", createdAt: 0 }];
    world.announcementRecipients = [{ _id: "announcementRecipients:1", announcementId: "announcements:1", email: "a@x.co" }];
    world.eventVideo = [{ _id: "eventVideo:1", eventId: EVENT, updatedAt: 0 }];
    const ctx = makeCtx(world, ADMIN);

    expect(await run(deleteEvent, ctx, { eventId: EVENT })).toEqual({ ok: true, deleted: true });
    expect(ctx.store.events).toEqual([]);
    expect(ctx.store.eventRsvps).toEqual([]);
    expect(ctx.store.eventApplications).toEqual([]);
    expect(ctx.store.eventVideo).toEqual([]);
    expect(ctx.store.announcements).toEqual([]);
    expect(ctx.store.announcementRecipients).toEqual([]);
    expect(ctx.store.favorites.map((f: Row) => f._id)).toEqual(["favorites:2"]);
    expect(ctx.deletedFiles.sort()).toEqual(["_storage:cover", "_storage:g1"]);
  });

  it("is admin-only", async () => {
    const ctx = makeCtx(eventWorld(), OWNER);
    await expect(run(deleteEvent, ctx, { eventId: EVENT })).rejects.toThrow();
    expect(ctx.store.events).toHaveLength(1);
  });
});

describe("hiding a project", () => {
  it("takes it off the list, the page, the story page and the profile", async () => {
    const ctx = makeCtx(projectWorld({ status: "completed" }), ADMIN);
    await run(setProjectHidden, ctx, { projectId: PROJECT, hidden: true });
    expect(ctx.store.projects[0]).toMatchObject({ status: "hidden", statusBeforeHidden: "completed" });

    const stranger = makeCtx(ctx.store, STRANGER);
    expect(await run(listProjects, stranger, {})).toEqual([]);
    expect(await run(getProject, stranger, { projectId: PROJECT })).toBeNull();
    expect(await run(getProject, makeCtx(ctx.store, null), { projectId: PROJECT })).toBeNull();
    expect(await run(getStoryPage, stranger, { storySlug: "mural" })).toBeNull();
    expect(await run(listAffiliations, stranger, { profileId: "profiles:owner" })).toEqual([]);

    expect(await run(getProject, makeCtx(ctx.store, OWNER), { projectId: PROJECT })).toMatchObject({ status: "hidden" });
    expect(await run(getProject, makeCtx(ctx.store, ADMIN), { projectId: PROJECT })).toMatchObject({ status: "hidden" });
  });

  it("can't be undone by its owner changing the status", async () => {
    const ctx = makeCtx(projectWorld({ status: "hidden", statusBeforeHidden: "active" }), OWNER);
    const err = await thrown(run(updateProjectStatus, ctx, { projectId: PROJECT, status: "active" }));
    expect(err).toMatchObject({ code: "hidden" });
    expect(ctx.store.projects[0].status).toBe("hidden");
  });

  it("unhide puts back the status it had", async () => {
    const ctx = makeCtx(projectWorld({ status: "completed" }), ADMIN);
    await run(setProjectHidden, ctx, { projectId: PROJECT, hidden: true });
    await run(setProjectHidden, ctx, { projectId: PROJECT, hidden: false });
    expect(ctx.store.projects[0].status).toBe("completed");
  });

  it("is admin-only", async () => {
    const ctx = makeCtx(projectWorld(), OWNER);
    await expect(run(setProjectHidden, ctx, { projectId: PROJECT, hidden: true })).rejects.toThrow();
  });
});

describe("deleting a project", () => {
  it("refuses when backing is confirmed", async () => {
    const world = projectWorld();
    world.projectSupport = [
      { _id: "projectSupport:1", projectId: PROJECT, supporterName: "B", type: "financial_one_time", amountCents: 500, visible: true, status: "confirmed", createdAt: 0 },
    ];
    const err = await thrown(run(deleteProject, makeCtx(world, ADMIN), { projectId: PROJECT }));
    expect(err).toMatchObject({ code: "has_money" });
    expect(err.reason).toContain("1 confirmed backing");
  });

  it("refuses when a member gift went to it", async () => {
    const world = projectWorld();
    world.memberGifts = [
      { _id: "memberGifts:1", userId: STRANGER, communityId: "hostOrgs:g", sourceStripeRef: "in_1", period: "2026-09", amountCents: 500, status: "project", projectId: PROJECT, openedAt: 0 },
      { _id: "memberGifts:2", userId: STRANGER, communityId: "hostOrgs:g", sourceStripeRef: "in_2", period: "2026-09", amountCents: 500, status: "project", projectId: "projects:other", openedAt: 0 },
    ];
    const err = await thrown(run(deleteProject, makeCtx(world, ADMIN), { projectId: PROJECT }));
    expect(err.reason).toContain("1 member gift");
  });

  it("removes the project, what hangs off it, and its files", async () => {
    const world = projectWorld();
    world.projectSupport = [
      // An abandoned checkout is counted nowhere, so it doesn't block.
      { _id: "projectSupport:pending", projectId: PROJECT, supporterName: "B", type: "financial_one_time", amountCents: 500, visible: true, status: "pending", createdAt: 0 },
      { _id: "projectSupport:cheer", projectId: PROJECT, supporterName: "C", type: "encouragement", visible: true, status: "confirmed", createdAt: 0 },
    ];
    world.projectMembers = [{ _id: "projectMembers:1", projectId: PROJECT, userId: STRANGER, status: "accepted", role: "Painter" }];
    world.projectRoles = [{ _id: "projectRoles:1", projectId: PROJECT, title: "Painter", status: "open" }];
    world.artifacts = [
      { _id: "artifacts:1", projectId: PROJECT, profileId: "profiles:owner", mediaStorageId: "_storage:piece" },
      { _id: "artifacts:other", projectId: "projects:other", profileId: "profiles:owner" },
    ];
    world.embeddings = [{ _id: "embeddings:1", entityType: "artifact", entityId: "artifacts:1" }];
    world.storyUpdates = [{ _id: "storyUpdates:1", projectId: PROJECT, authorUserId: OWNER, body: "Day one", createdAt: 0 }];
    const ctx = makeCtx(world, ADMIN);

    expect(await run(deleteProject, ctx, { projectId: PROJECT })).toEqual({ ok: true, deleted: true });
    expect(ctx.store.projects).toEqual([]);
    expect(ctx.store.projectSupport).toEqual([]);
    expect(ctx.store.projectMembers).toEqual([]);
    expect(ctx.store.projectRoles).toEqual([]);
    expect(ctx.store.storyUpdates).toEqual([]);
    expect(ctx.store.embeddings).toEqual([]);
    expect(ctx.store.artifacts.map((a: Row) => a._id)).toEqual(["artifacts:other"]);
    expect(ctx.deletedFiles.sort()).toEqual(["_storage:photo", "_storage:piece"]);
  });
});

describe("listHidden", () => {
  it("lists what's hidden, newest first, for admins only", async () => {
    const world = { ...projectWorld({ status: "hidden", hiddenAt: 1 }), events: eventWorld({ status: "hidden", hiddenAt: 2 }).events };
    const out = await run(listHidden, makeCtx(world, ADMIN));
    expect(out.projects).toEqual([{ _id: PROJECT, title: "Mural", ownerName: "Olu", hiddenAt: 1 }]);
    expect(out.events).toMatchObject([{ _id: EVENT, title: "Open mic", ownerName: "Olu", hiddenAt: 2 }]);
    await expect(run(listHidden, makeCtx(world, STRANGER))).rejects.toThrow();
  });
});
