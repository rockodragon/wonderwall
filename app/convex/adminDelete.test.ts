import { describe, expect, it } from "vitest";
import { deleteUser, summarizeDeletion } from "./admin";

describe("summarizeDeletion", () => {
  it("names the things people recognize and lumps the rest", () => {
    expect(
      summarizeDeletion({ events: 1, projects: 6, offerings: 1, artifacts: 4, notifications: 9, authAccounts: 1 }),
    ).toBe("1 event, 6 projects, 1 class, 4 portfolio pieces, 10 other records");
  });

  it("handles an account with nothing attached", () => {
    expect(summarizeDeletion({})).toBe("nothing besides the account");
    expect(summarizeDeletion({ authAccounts: 1 })).toBe("1 other record");
  });
});

// ——— deleteUser against an in-memory db (same fake as offeringModeration.test.ts) ———

type Row = Record<string, any> & { _id: string };

function makeCtx(tables: Record<string, Row[]>, viewerId: string | null) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
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
    store,
  };
  return ctx as any;
}

const run = (ctx: unknown, args: Record<string, unknown>) =>
  (deleteUser as unknown as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

async function thrown(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: unknown }).data ?? (e as Error).message;
  }
  throw new Error("expected a throw");
}

// Shaped like the production "Test Account": an event with a guest RSVP, a
// project someone else offered a resource to, a class someone signed up
// for, portfolio pieces, a cheer on someone else's project, a conversation.
function world() {
  return {
    users: [{ _id: "users:1" }, { _id: "users:2" }, { _id: "users:3" }],
    profiles: [
      { _id: "profiles:1", userId: "users:1", name: "Admin", isAdmin: true },
      { _id: "profiles:2", userId: "users:2", name: "Test Account" },
      { _id: "profiles:3", userId: "users:3", name: "Rick" },
    ],
    events: [{ _id: "events:1", organizerId: "users:2", title: "Bug2 Rehydration Test Event" }],
    eventRsvps: [
      { _id: "eventRsvps:1", eventId: "events:1" },
      { _id: "eventRsvps:2", eventId: "events:1", userId: "users:3" },
    ],
    projects: [
      { _id: "projects:1", userId: "users:2", title: "Wedding video edit" },
      { _id: "projects:2", userId: "users:3", title: "Sample image" },
    ],
    projectSupport: [
      { _id: "projectSupport:1", projectId: "projects:1", supporterUserId: "users:3", type: "resource" },
      { _id: "projectSupport:2", projectId: "projects:2", supporterUserId: "users:2", type: "encouragement" },
      { _id: "projectSupport:3", projectId: "projects:2", supporterUserId: "users:3", type: "encouragement" },
    ],
    offerings: [{ _id: "offerings:1", userId: "users:2", title: "Sign-up Test" }],
    offeringSignups: [{ _id: "offeringSignups:1", offeringId: "offerings:1", userId: "users:3" }],
    artifacts: [
      { _id: "artifacts:1", profileId: "profiles:2", title: "Regression Test Reel" },
      { _id: "artifacts:2", profileId: "profiles:3", projectId: "projects:1", title: "Rick's clip" },
    ],
    conversations: [{ _id: "conversations:1", participants: ["users:2", "users:3"] }],
    messages: [
      { _id: "messages:1", conversationId: "conversations:1", senderId: "users:3" },
      { _id: "messages:2", conversationId: "conversations:1", senderId: "users:2" },
    ],
    notifications: [
      { _id: "notifications:1", userId: "users:3", relatedUserId: "users:2" },
      { _id: "notifications:2", userId: "users:3", relatedUserId: "users:1" },
    ],
    authAccounts: [{ _id: "authAccounts:1", userId: "users:2", provider: "password" }],
    authSessions: [],
    authRefreshTokens: [],
  };
}

const ids = (ctx: any, table: string) => (ctx.store[table] ?? []).map((r: Row) => r._id);

describe("deleteUser", () => {
  it("previews without touching anything", async () => {
    const ctx = makeCtx(world(), "users:1");
    const preview = await run(ctx, { userId: "users:2", dryRun: true });
    expect(preview.deleted).toBe(false);
    expect(preview.blocked).toEqual([]);
    expect(preview.summary).toContain("1 event");
    expect(preview.summary).toContain("1 project");
    expect(preview.summary).toContain("1 class");
    expect(ids(ctx, "users")).toContain("users:2");
    expect(ids(ctx, "events")).toEqual(["events:1"]);
  });

  it("removes the account and everything it owns, and nothing of anyone else's", async () => {
    const ctx = makeCtx(world(), "users:1");
    const done = await run(ctx, { userId: "users:2" });
    expect(done.deleted).toBe(true);

    expect(ids(ctx, "users")).toEqual(["users:1", "users:3"]);
    expect(ids(ctx, "profiles")).toEqual(["profiles:1", "profiles:3"]);
    expect(ids(ctx, "events")).toEqual([]);
    expect(ids(ctx, "eventRsvps")).toEqual([]);
    expect(ids(ctx, "projects")).toEqual(["projects:2"]);
    // Their cheer on Rick's project goes; Rick's own cheer there stays.
    expect(ids(ctx, "projectSupport")).toEqual(["projectSupport:3"]);
    expect(ids(ctx, "offerings")).toEqual([]);
    expect(ids(ctx, "offeringSignups")).toEqual([]);
    expect(ids(ctx, "conversations")).toEqual([]);
    expect(ids(ctx, "messages")).toEqual([]);
    expect(ids(ctx, "notifications")).toEqual(["notifications:2"]);
    expect(ids(ctx, "authAccounts")).toEqual([]);
    // Rick's clip stays, just no longer attached to the deleted project.
    expect(ids(ctx, "artifacts")).toEqual(["artifacts:2"]);
    expect(ctx.store.artifacts[0].projectId).toBeUndefined();
  });

  it("refuses when money is involved, and deletes nothing", async () => {
    const w = world();
    const ctx = makeCtx(
      { ...w, memberships: [{ _id: "memberships:1", userId: "users:2", status: "active" }] },
      "users:1",
    );
    const preview = await run(ctx, { userId: "users:2", dryRun: true });
    expect(preview.blocked).toEqual(["1 membership"]);
    expect(await thrown(run(ctx, { userId: "users:2" }))).toContain("Not deleted");
    expect(ids(ctx, "users")).toContain("users:2");
    expect(ids(ctx, "events")).toEqual(["events:1"]);
  });

  it("refuses a backing payment on their projects", async () => {
    const ctx = makeCtx(
      { ...world(), backingPayments: [{ _id: "backingPayments:1", projectId: "projects:1" }] },
      "users:1",
    );
    const preview = await run(ctx, { userId: "users:2", dryRun: true });
    expect(preview.blocked).toEqual(["1 backing payment on their projects"]);
  });

  it("won't delete the admin's own account, and only admins can delete", async () => {
    expect(await thrown(run(makeCtx(world(), "users:1"), { userId: "users:1" }))).toContain("own account");
    expect(await thrown(run(makeCtx(world(), "users:3"), { userId: "users:2" }))).toContain("Unauthorized");
  });
});
