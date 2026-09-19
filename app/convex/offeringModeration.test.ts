// Tests for pausing and reporting classes (offerings.ts; spec: docs/features/
// class-payments-and-moderation.md, "How a community steps in").
//
// Two layers. First the pure rules — who may pause, who may see a paused
// class, whether a report is allowed, the community lock — no Convex, same
// shape as communities.test.ts. Then the real handlers run against a small
// in-memory ctx, because the rules are only as good as the wiring: a hidden
// class must really be missing from listOfferings/getOffering/getCommunity,
// and an edit must really leave the pause alone.

import { describe, expect, it } from "vitest";
import {
  PAUSE_REASON_MAX,
  REPORT_DETAILS_MAX,
  canModerateOffering,
  canSeeOffering,
  dismissReport,
  getOffering,
  listOfferings,
  listReportsForOffering,
  pauseOffering,
  pauseView,
  reportOffering,
  resolveCommunityChange,
  resolveOfferingReport,
  restoreOffering,
  createOffering,
  signUpForOffering,
  startClassCheckout,
  signupBlock,
  updateOffering,
  updateOfferingStatus,
  validateOfferingReport,
  validatePauseReason,
} from "./offerings";
import type { ModerationActor, ModeratedOffering } from "./offerings";
import { getCommunity } from "./garden/communities";

const TEACHER = "users:teacher";
const STRANGER = "users:stranger";
const HOST = "users:host";
const OTHER_HOST = "users:otherHost";
const ADMIN = "users:admin";
const COMMUNITY = "hostOrgs:garden";
const OTHER_COMMUNITY = "hostOrgs:other";

const actor = (over: Partial<ModerationActor> = {}): ModerationActor => ({
  userId: STRANGER,
  isAdmin: false,
  memberships: [],
  ...over,
});
const member = (hostOrgId: string, role: string, status = "active") => ({ hostOrgId, role, status });
const classIn = (over: Partial<ModeratedOffering> = {}): ModeratedOffering => ({
  userId: TEACHER,
  hostOrgId: COMMUNITY,
  ...over,
});
const paused = (over: Partial<ModeratedOffering> = {}) => classIn({ pausedAt: 1_000, ...over });

// ——————————————————————————————————————————————————————————————
// Pure rules
// ——————————————————————————————————————————————————————————————

describe("canModerateOffering — who may pause, restore, read and dismiss reports", () => {
  it("a platform admin can, whether or not the class has a community", () => {
    const admin = actor({ userId: ADMIN, isAdmin: true });
    expect(canModerateOffering(classIn(), admin)).toBe(true);
    expect(canModerateOffering(classIn({ hostOrgId: undefined }), admin)).toBe(true);
  });

  it("a host of the class's community can", () => {
    expect(canModerateOffering(classIn(), actor({ userId: HOST, memberships: [member(COMMUNITY, "host")] }))).toBe(true);
  });

  it("a legacy moderator of the class's community can", () => {
    expect(canModerateOffering(classIn(), actor({ userId: HOST, memberships: [member(COMMUNITY, "moderator")] }))).toBe(true);
  });

  it("a plain member of the community cannot", () => {
    expect(canModerateOffering(classIn(), actor({ memberships: [member(COMMUNITY, "member")] }))).toBe(false);
  });

  it("someone outside the community, or signed out, cannot", () => {
    expect(canModerateOffering(classIn(), actor())).toBe(false);
    expect(canModerateOffering(classIn(), { isAdmin: false, memberships: [] })).toBe(false);
  });

  it("a host whose membership is pending or removed cannot", () => {
    for (const status of ["pending", "removed"]) {
      expect(canModerateOffering(classIn(), actor({ memberships: [member(COMMUNITY, "host", status)] }))).toBe(false);
    }
  });

  it("a host of a DIFFERENT community cannot", () => {
    expect(
      canModerateOffering(classIn(), actor({ userId: OTHER_HOST, memberships: [member(OTHER_COMMUNITY, "host")] })),
    ).toBe(false);
  });

  it("the teacher cannot — a plain-member teacher can't un-pause their own class", () => {
    const teacher = actor({ userId: TEACHER, memberships: [member(COMMUNITY, "member")] });
    expect(canModerateOffering(paused(), teacher)).toBe(false);
  });

  it("the teacher cannot even when they also host the community (one host can't overrule another)", () => {
    const teacherHost = actor({ userId: TEACHER, memberships: [member(COMMUNITY, "host")] });
    expect(canModerateOffering(paused(), teacherHost)).toBe(false);
  });

  it("a teacher who is a platform admin can (the admin override is not a teacher's)", () => {
    expect(canModerateOffering(paused(), actor({ userId: TEACHER, isAdmin: true }))).toBe(true);
  });

  it("a class with no community answers to platform admins only", () => {
    const noCommunity = classIn({ hostOrgId: undefined });
    expect(canModerateOffering(noCommunity, actor({ isAdmin: true }))).toBe(true);
    // Not a host anywhere, and not a host who happens to be in some community.
    expect(canModerateOffering(noCommunity, actor())).toBe(false);
    expect(
      canModerateOffering(noCommunity, actor({ memberships: [member(COMMUNITY, "host"), member(OTHER_COMMUNITY, "host")] })),
    ).toBe(false);
    expect(canModerateOffering(noCommunity, actor({ userId: TEACHER }))).toBe(false);
  });
});

describe("canSeeOffering — the paused-class visibility rule", () => {
  it("an unpaused class is visible to everyone, signed in or not", () => {
    expect(canSeeOffering(classIn(), actor())).toBe(true);
    expect(canSeeOffering(classIn(), { isAdmin: false, memberships: [] })).toBe(true);
  });

  it("a paused class is hidden from a stranger and from someone signed out", () => {
    expect(canSeeOffering(paused(), actor())).toBe(false);
    expect(canSeeOffering(paused(), { isAdmin: false, memberships: [] })).toBe(false);
  });

  it("a paused class is hidden from a plain member of its community", () => {
    expect(canSeeOffering(paused(), actor({ memberships: [member(COMMUNITY, "member")] }))).toBe(false);
  });

  it("a paused class is visible to its teacher", () => {
    expect(canSeeOffering(paused(), actor({ userId: TEACHER }))).toBe(true);
  });

  it("a paused class is visible to a host or legacy moderator of THAT community", () => {
    expect(canSeeOffering(paused(), actor({ userId: HOST, memberships: [member(COMMUNITY, "host")] }))).toBe(true);
    expect(canSeeOffering(paused(), actor({ userId: HOST, memberships: [member(COMMUNITY, "moderator")] }))).toBe(true);
  });

  it("a paused class is visible to a platform admin", () => {
    expect(canSeeOffering(paused(), actor({ userId: ADMIN, isAdmin: true }))).toBe(true);
  });

  it("a paused class is hidden from a manager of a DIFFERENT community", () => {
    expect(
      canSeeOffering(paused(), actor({ userId: OTHER_HOST, memberships: [member(OTHER_COMMUNITY, "host")] })),
    ).toBe(false);
  });

  it("a host who is pending or removed does not get to see it", () => {
    for (const status of ["pending", "removed"]) {
      expect(canSeeOffering(paused(), actor({ memberships: [member(COMMUNITY, "host", status)] }))).toBe(false);
    }
  });

  it("a paused class with no community is visible to its teacher and admins only", () => {
    const noCommunity = paused({ hostOrgId: undefined });
    expect(canSeeOffering(noCommunity, actor({ userId: TEACHER }))).toBe(true);
    expect(canSeeOffering(noCommunity, actor({ isAdmin: true }))).toBe(true);
    expect(canSeeOffering(noCommunity, actor({ memberships: [member(COMMUNITY, "host")] }))).toBe(false);
  });
});

describe("signupBlock", () => {
  it("lets an unpaused class through", () => {
    expect(signupBlock({})).toBeNull();
  });
  it("refuses a paused class with the agreed code and words", () => {
    expect(signupBlock({ pausedAt: 5 })).toEqual({ code: "paused", reason: "This class is paused right now." });
  });
});

describe("pauseView — what a read shows about a pause", () => {
  it("shows nothing for a class that isn't paused", () => {
    expect(pauseView({}, true)).toEqual({ paused: false, reason: null, at: null, canRestore: false });
    // A stale reason on an unpaused row never leaks.
    expect(pauseView({ pausedReason: "old" }, true).reason).toBeNull();
  });
  it("shows the reason and time for a paused class, and canRestore follows the viewer", () => {
    expect(pauseView({ pausedAt: 9, pausedReason: "Complaints" }, true)).toEqual({
      paused: true,
      reason: "Complaints",
      at: 9,
      canRestore: true,
    });
    expect(pauseView({ pausedAt: 9, pausedReason: "Complaints" }, false).canRestore).toBe(false);
  });
});

describe("validatePauseReason", () => {
  it("requires a reason", () => {
    expect(validatePauseReason("")?.code).toBe("missing_reason");
    expect(validatePauseReason("   \n ")?.code).toBe("missing_reason");
  });
  it("accepts up to 300 characters after trimming, and no more", () => {
    expect(validatePauseReason("x".repeat(PAUSE_REASON_MAX))).toBeNull();
    expect(validatePauseReason(`  ${"x".repeat(PAUSE_REASON_MAX)}  `)).toBeNull();
    expect(validatePauseReason("x".repeat(PAUSE_REASON_MAX + 1))?.code).toBe("reason_too_long");
  });
});

describe("validateOfferingReport", () => {
  it("accepts each reason, with or without details", () => {
    for (const reason of ["harassment", "spam", "unsafe", "misleading", "other"]) {
      expect(validateOfferingReport({ reason })).toBeNull();
      expect(validateOfferingReport({ reason, details: "It happened twice." })).toBeNull();
    }
  });
  it("rejects a reason that isn't on the list", () => {
    expect(validateOfferingReport({ reason: "inappropriate" })?.code).toBe("invalid_reason");
    expect(validateOfferingReport({ reason: "" })?.code).toBe("invalid_reason");
  });
  it("allows details up to 500 characters and no more", () => {
    expect(validateOfferingReport({ reason: "spam", details: "x".repeat(REPORT_DETAILS_MAX) })).toBeNull();
    expect(validateOfferingReport({ reason: "spam", details: "x".repeat(REPORT_DETAILS_MAX + 1) })?.code).toBe(
      "details_too_long",
    );
  });
});

describe("resolveOfferingReport — the gate for reportOffering", () => {
  const reporter = actor({ userId: "users:reporter" });

  it("a signed-in member can report a class", () => {
    expect(resolveOfferingReport({ offering: classIn(), actor: reporter, openReports: [] })).toEqual({
      ok: true,
      action: "create",
    });
  });

  it("signed-out people can't report", () => {
    const d = resolveOfferingReport({ offering: classIn(), actor: { isAdmin: false, memberships: [] }, openReports: [] });
    expect(d).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("you can't report your own class", () => {
    const d = resolveOfferingReport({ offering: classIn(), actor: actor({ userId: TEACHER }), openReports: [] });
    expect(d).toMatchObject({ ok: false, code: "own_offering" });
  });

  it("a host who teaches the class still can't report it", () => {
    const d = resolveOfferingReport({
      offering: classIn(),
      actor: actor({ userId: TEACHER, memberships: [member(COMMUNITY, "host")] }),
      openReports: [],
    });
    expect(d).toMatchObject({ ok: false, code: "own_offering" });
  });

  it("you can't report a class you can't see — it reads as not found", () => {
    const d = resolveOfferingReport({ offering: paused(), actor: reporter, openReports: [] });
    expect(d).toMatchObject({ ok: false, code: "not_found" });
  });

  it("someone who can see a paused class may report it", () => {
    const d = resolveOfferingReport({
      offering: paused(),
      actor: actor({ userId: HOST, memberships: [member(COMMUNITY, "host")] }),
      openReports: [],
    });
    expect(d).toEqual({ ok: true, action: "create" });
  });

  it("a second report from the same person updates the first instead of duplicating", () => {
    const d = resolveOfferingReport({
      offering: classIn(),
      actor: reporter,
      openReports: [{ _id: "offeringReports:1", reporterId: "users:reporter" }],
    });
    expect(d).toEqual({ ok: true, action: "update", reportId: "offeringReports:1" });
  });

  it("someone else's open report doesn't block a new one from you", () => {
    const d = resolveOfferingReport({
      offering: classIn(),
      actor: reporter,
      openReports: [{ _id: "offeringReports:1", reporterId: "users:someoneElse" }],
    });
    expect(d).toEqual({ ok: true, action: "create" });
  });

  it("updates YOUR report even when other people have open ones too", () => {
    const d = resolveOfferingReport({
      offering: classIn(),
      actor: reporter,
      openReports: [
        { _id: "offeringReports:1", reporterId: "users:someoneElse" },
        { _id: "offeringReports:2", reporterId: "users:reporter" },
      ],
    });
    expect(d).toEqual({ ok: true, action: "update", reportId: "offeringReports:2" });
  });
});

describe("resolveCommunityChange — a paused class can't edit its way out", () => {
  const base = { current: COMMUNITY, requested: undefined, clear: undefined, paused: false, actorIsAdmin: false };

  it("unpaused: leave alone, change, clear, and set all behave as they always did", () => {
    expect(resolveCommunityChange(base)).toEqual({ ok: true, hostOrgId: COMMUNITY });
    expect(resolveCommunityChange({ ...base, requested: OTHER_COMMUNITY })).toEqual({ ok: true, hostOrgId: OTHER_COMMUNITY });
    expect(resolveCommunityChange({ ...base, clear: true })).toEqual({ ok: true, hostOrgId: undefined });
    expect(resolveCommunityChange({ ...base, current: undefined, requested: COMMUNITY })).toEqual({
      ok: true,
      hostOrgId: COMMUNITY,
    });
  });

  it("paused: the teacher cannot clear the community", () => {
    expect(resolveCommunityChange({ ...base, paused: true, clear: true })).toMatchObject({ ok: false, code: "paused" });
  });

  it("paused: the teacher cannot change the community", () => {
    expect(resolveCommunityChange({ ...base, paused: true, requested: OTHER_COMMUNITY })).toMatchObject({
      ok: false,
      code: "paused",
    });
  });

  it("paused: clear wins over a requested community, and is still refused", () => {
    expect(resolveCommunityChange({ ...base, paused: true, requested: COMMUNITY, clear: true })).toMatchObject({
      ok: false,
      code: "paused",
    });
  });

  it("paused: the edit form re-sends the same community, and that's fine", () => {
    expect(resolveCommunityChange({ ...base, paused: true, requested: COMMUNITY })).toEqual({ ok: true, hostOrgId: COMMUNITY });
    expect(resolveCommunityChange({ ...base, paused: true })).toEqual({ ok: true, hostOrgId: COMMUNITY });
  });

  it("paused with no community: it can't be dropped into one either", () => {
    expect(resolveCommunityChange({ ...base, current: undefined, paused: true, requested: COMMUNITY })).toMatchObject({
      ok: false,
      code: "paused",
    });
    // Clearing what isn't there changes nothing.
    expect(resolveCommunityChange({ ...base, current: undefined, paused: true, clear: true })).toEqual({
      ok: true,
      hostOrgId: undefined,
    });
  });

  it("a platform admin isn't held to the lock", () => {
    expect(resolveCommunityChange({ ...base, paused: true, actorIsAdmin: true, clear: true })).toEqual({
      ok: true,
      hostOrgId: undefined,
    });
  });
});

// ——————————————————————————————————————————————————————————————
// The real handlers, on an in-memory ctx
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx.db for offerings.ts and communities.ts's
 * getCommunity: get / insert / patch (undefined removes a field) / delete,
 * and query().withIndex(name, q => q.eq(..).eq(..)) or .filter(q => q.eq(
 * q.field(f), v)) followed by unique/first/collect. It doesn't check that an
 * index exists or that fields match its definition — the schema does that in
 * a real deployment; what's under test is which rows the handlers ask for
 * and what they do with them. */
function makeCtx(tables: Record<string, Row[]>, viewerId: string | null) {
  const store: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const rowsOf = (table: string) => (store[table] ??= []);
  let counter = 100;

  const find = (id: string) => {
    const table = id.split(":")[0];
    return rowsOf(table).find((r) => r._id === id) ?? null;
  };

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
          eq: (a: any, b: any) => (r: Row) => (typeof a === "function" ? a(r) : a) === (typeof b === "function" ? b(r) : b),
        };
        const pred = build(q);
        rows = rows.filter((r) => pred(r));
        return api;
      },
      async collect() {
        return rows.map((r) => ({ ...r }));
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
    storage: { getUrl: async () => null, delete: async () => {} },
    store,
  };
  return ctx as any;
}

// A Convex-registered function keeps the handler you wrote on `_handler`.
const run = (fn: unknown, ctx: unknown, args: Record<string, unknown> = {}) =>
  (fn as { _handler: (c: unknown, a: unknown) => Promise<any> })._handler(ctx, args);

/** The error a handler throws, for asserting on its {code, reason} payload. */
async function thrown(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: unknown }).data ?? e;
  }
  throw new Error("expected the handler to throw");
}

const WORLD = (): Record<string, Row[]> => ({
  profiles: [
    { _id: "profiles:teacher", userId: TEACHER, name: "Tess Teacher" },
    { _id: "profiles:stranger", userId: STRANGER, name: "Sam Stranger" },
    { _id: "profiles:host", userId: HOST, name: "Hana Host" },
    { _id: "profiles:otherHost", userId: OTHER_HOST, name: "Omar Other" },
    { _id: "profiles:admin", userId: ADMIN, name: "Ada Admin", isAdmin: true },
  ],
  hostOrgs: [
    { _id: COMMUNITY, kind: "community", name: "The Garden", slug: "garden", status: "active" },
    { _id: OTHER_COMMUNITY, kind: "community", name: "Other Place", slug: "other", status: "active" },
  ],
  communityMembers: [
    { _id: "communityMembers:1", hostOrgId: COMMUNITY, userId: TEACHER, role: "member", status: "active" },
    { _id: "communityMembers:2", hostOrgId: COMMUNITY, userId: HOST, role: "host", status: "active" },
    { _id: "communityMembers:3", hostOrgId: OTHER_COMMUNITY, userId: OTHER_HOST, role: "host", status: "active" },
    { _id: "communityMembers:4", hostOrgId: COMMUNITY, userId: STRANGER, role: "member", status: "active" },
  ],
  offerings: [
    {
      _id: "offerings:tap",
      userId: TEACHER,
      title: "Beginner tap",
      format: "class",
      hostOrgId: COMMUNITY,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      _id: "offerings:solo",
      userId: TEACHER,
      title: "Solo coaching",
      format: "coaching",
      status: "active",
      createdAt: 2,
      updatedAt: 2,
    },
  ],
  offeringSignups: [
    { _id: "offeringSignups:1", offeringId: "offerings:tap", userId: STRANGER, name: "Sam", status: "confirmed", createdAt: 3 },
  ],
  offeringReports: [],
});

const editArgs = (over: Record<string, unknown> = {}) => ({
  offeringId: "offerings:tap",
  title: "Beginner tap (new title)",
  format: "class",
  hostOrgId: COMMUNITY,
  ...over,
});

describe("pauseOffering / restoreOffering", () => {
  it("a community host pauses a class in their community, with a trimmed reason", async () => {
    const ctx = makeCtx(WORLD(), HOST);
    await run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "  Three complaints this week  " });
    const row = ctx.store.offerings.find((o: Row) => o._id === "offerings:tap");
    expect(row.pausedAt).toBeTypeOf("number");
    expect(row.pausedBy).toBe(HOST);
    expect(row.pausedReason).toBe("Three complaints this week");
  });

  it("a platform admin pauses a class that has no community", async () => {
    const ctx = makeCtx(WORLD(), ADMIN);
    await run(pauseOffering, ctx, { offeringId: "offerings:solo", reason: "Scam" });
    expect(ctx.store.offerings.find((o: Row) => o._id === "offerings:solo").pausedAt).toBeTypeOf("number");
  });

  it("a plain member, a stranger, the teacher, and a host of another community are all refused", async () => {
    for (const viewer of [STRANGER, TEACHER, OTHER_HOST]) {
      const ctx = makeCtx(WORLD(), viewer);
      const err = await thrown(run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "nope" }));
      expect(err.code).toBe("forbidden");
      expect(ctx.store.offerings.find((o: Row) => o._id === "offerings:tap").pausedAt).toBeUndefined();
    }
  });

  it("a host cannot pause a class that has no community", async () => {
    const ctx = makeCtx(WORLD(), HOST);
    const err = await thrown(run(pauseOffering, ctx, { offeringId: "offerings:solo", reason: "hm" }));
    expect(err.code).toBe("forbidden");
  });

  it("signed-out callers get unauthenticated", async () => {
    const ctx = makeCtx(WORLD(), null);
    const err = await thrown(run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "x" }));
    expect(err.code).toBe("unauthenticated");
  });

  it("a reason is required and capped", async () => {
    const ctx = makeCtx(WORLD(), HOST);
    expect((await thrown(run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "  " }))).code).toBe("missing_reason");
    expect(
      (await thrown(run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "x".repeat(301) }))).code,
    ).toBe("reason_too_long");
  });

  it("pausing marks that class's open reports resolved, and leaves other classes' reports alone", async () => {
    const world = WORLD();
    world.offeringReports = [
      { _id: "offeringReports:1", offeringId: "offerings:tap", reporterId: STRANGER, reason: "spam", status: "open", createdAt: 1 },
      { _id: "offeringReports:2", offeringId: "offerings:tap", reporterId: OTHER_HOST, reason: "unsafe", status: "dismissed", createdAt: 2 },
      { _id: "offeringReports:3", offeringId: "offerings:solo", reporterId: STRANGER, reason: "spam", status: "open", createdAt: 3 },
    ];
    const ctx = makeCtx(world, HOST);
    await run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "Complaints" });
    const byId = (id: string) => ctx.store.offeringReports.find((r: Row) => r._id === id);
    expect(byId("offeringReports:1")).toMatchObject({ status: "resolved", resolvedBy: HOST });
    expect(byId("offeringReports:1").resolvedAt).toBeTypeOf("number");
    expect(byId("offeringReports:2").status).toBe("dismissed");
    expect(byId("offeringReports:3").status).toBe("open");
  });

  it("pausing twice doesn't overwrite the first host's reason", async () => {
    const world = WORLD();
    const ctx = makeCtx(world, HOST);
    await run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "First reason" });
    const again = await run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "Second reason" });
    expect(again.alreadyPaused).toBe(true);
    expect(ctx.store.offerings.find((o: Row) => o._id === "offerings:tap").pausedReason).toBe("First reason");
  });

  it("a host restores it; the teacher can't restore their own class; sign-ups stay", async () => {
    const world = WORLD();
    const ctx = makeCtx(world, HOST);
    await run(pauseOffering, ctx, { offeringId: "offerings:tap", reason: "Complaints" });

    const teacherCtx = { ...ctx, auth: makeCtx({}, TEACHER).auth };
    expect((await thrown(run(restoreOffering, teacherCtx, { offeringId: "offerings:tap" }))).code).toBe("forbidden");
    expect(ctx.store.offerings.find((o: Row) => o._id === "offerings:tap").pausedAt).toBeTypeOf("number");

    await run(restoreOffering, ctx, { offeringId: "offerings:tap" });
    const row = ctx.store.offerings.find((o: Row) => o._id === "offerings:tap");
    expect(row.pausedAt).toBeUndefined();
    expect(row.pausedBy).toBeUndefined();
    expect(row.pausedReason).toBeUndefined();
    expect(ctx.store.offeringSignups).toHaveLength(1);
  });
});

describe("visibility of a paused class — every read the public can reach", () => {
  const pausedWorld = () => {
    const w = WORLD();
    w.offerings[0] = { ...w.offerings[0], pausedAt: 5, pausedBy: HOST, pausedReason: "Complaints" };
    return w;
  };
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort();

  it("listOfferings hides it from a stranger and from signed-out visitors, and shows the rest", async () => {
    for (const viewer of [STRANGER, null]) {
      const rows = await run(listOfferings, makeCtx(pausedWorld(), viewer));
      expect(titles(rows)).toEqual(["Solo coaching"]);
    }
  });

  it("listOfferings hides it from a host of a different community", async () => {
    expect(titles(await run(listOfferings, makeCtx(pausedWorld(), OTHER_HOST)))).toEqual(["Solo coaching"]);
  });

  it("listOfferings shows it, badged, to the teacher, a host of that community, and an admin", async () => {
    for (const viewer of [TEACHER, HOST, ADMIN]) {
      const rows = await run(listOfferings, makeCtx(pausedWorld(), viewer));
      expect(titles(rows)).toEqual(["Beginner tap", "Solo coaching"]);
      const tap = rows.find((r: any) => r.title === "Beginner tap");
      expect(tap.pause).toMatchObject({ paused: true, reason: "Complaints" });
      // The raw columns never leave the server — pausedBy names a person.
      expect(tap.pausedBy).toBeUndefined();
      expect(tap.pausedAt).toBeUndefined();
      expect(tap.pausedReason).toBeUndefined();
    }
  });

  it("listOfferings still returns everything, unbadged, when nothing is paused", async () => {
    const rows = await run(listOfferings, makeCtx(WORLD(), null));
    expect(titles(rows)).toEqual(["Beginner tap", "Solo coaching"]);
    expect(rows.every((r: any) => r.pause.paused === false)).toBe(true);
  });

  it("getOffering reads as not found to a stranger and to a host elsewhere", async () => {
    for (const viewer of [STRANGER, null, OTHER_HOST]) {
      expect(await run(getOffering, makeCtx(pausedWorld(), viewer), { offeringId: "offerings:tap" })).toBeNull();
    }
  });

  it("getOffering returns it to the teacher (can't moderate), a host (can), and an admin (can)", async () => {
    const as = async (viewer: string) => run(getOffering, makeCtx(pausedWorld(), viewer), { offeringId: "offerings:tap" });
    const teacher = await as(TEACHER);
    expect(teacher.pause).toMatchObject({ paused: true, reason: "Complaints", canRestore: false });
    expect(teacher.canModerate).toBe(false);
    expect(teacher.canReport).toBe(false);
    expect(teacher.community).toMatchObject({ name: "The Garden" });
    expect(teacher.pausedBy).toBeUndefined();

    for (const viewer of [HOST, ADMIN]) {
      const seen = await as(viewer);
      expect(seen.pause).toMatchObject({ paused: true, canRestore: true });
      expect(seen.canModerate).toBe(true);
    }
  });

  it("getOffering on an unpaused class is open to everyone, with no moderation on offer", async () => {
    const seen = await run(getOffering, makeCtx(WORLD(), STRANGER), { offeringId: "offerings:tap" });
    expect(seen.pause).toMatchObject({ paused: false, canRestore: false });
    expect(seen.canModerate).toBe(false);
    expect(seen.canReport).toBe(true);
    expect(seen.viewerHasOpenReport).toBe(false);
  });

  it("getCommunity leaves a paused class out of the community page for a stranger and a host elsewhere", async () => {
    for (const viewer of [STRANGER, null, OTHER_HOST]) {
      const page = await run(getCommunity, makeCtx(pausedWorld(), viewer), { slug: "garden" });
      expect(page.offerings.map((o: any) => o.title)).toEqual([]);
    }
  });

  it("getCommunity shows it, flagged paused, to the teacher, that community's host, and an admin", async () => {
    for (const viewer of [TEACHER, HOST, ADMIN]) {
      const page = await run(getCommunity, makeCtx(pausedWorld(), viewer), { slug: "garden" });
      expect(page.offerings).toMatchObject([{ title: "Beginner tap", paused: true }]);
    }
  });
});

describe("signUpForOffering", () => {
  it("refuses a paused class with the paused code and the agreed words", async () => {
    const w = WORLD();
    w.offerings[0] = { ...w.offerings[0], pausedAt: 5 };
    const ctx = makeCtx(w, STRANGER);
    const err = await thrown(run(signUpForOffering, ctx, { offeringId: "offerings:tap" }));
    expect(err).toEqual({ code: "paused", reason: "This class is paused right now." });
    expect(ctx.store.offeringSignups).toHaveLength(1);
  });

  it("still takes a sign-up for a class that isn't paused", async () => {
    const ctx = makeCtx(WORLD(), HOST);
    const res = await run(signUpForOffering, ctx, { offeringId: "offerings:tap" });
    expect(res.alreadySignedUp).toBe(false);
    expect(ctx.store.offeringSignups).toHaveLength(2);
  });
});

describe("updateOffering on a paused class", () => {
  const pausedWorld = () => {
    const w = WORLD();
    w.offerings[0] = { ...w.offerings[0], pausedAt: 5, pausedBy: HOST, pausedReason: "Complaints" };
    return w;
  };
  const tap = (ctx: any) => ctx.store.offerings.find((o: Row) => o._id === "offerings:tap");

  it("the teacher can still edit the class, and the pause survives the edit", async () => {
    const ctx = makeCtx(pausedWorld(), TEACHER);
    await run(updateOffering, ctx, editArgs());
    expect(tap(ctx).title).toBe("Beginner tap (new title)");
    expect(tap(ctx)).toMatchObject({ pausedAt: 5, pausedBy: HOST, pausedReason: "Complaints", hostOrgId: COMMUNITY });
  });

  it("the teacher cannot clear the community while it's paused", async () => {
    const ctx = makeCtx(pausedWorld(), TEACHER);
    const err = await thrown(run(updateOffering, ctx, editArgs({ hostOrgId: undefined, clearCommunity: true })));
    expect(err.code).toBe("paused");
    expect(tap(ctx).hostOrgId).toBe(COMMUNITY);
    expect(tap(ctx).title).toBe("Beginner tap");
  });

  it("the teacher cannot move it to another community while it's paused", async () => {
    const w = pausedWorld();
    w.communityMembers.push({
      _id: "communityMembers:9",
      hostOrgId: OTHER_COMMUNITY,
      userId: TEACHER,
      role: "member",
      status: "active",
    });
    const ctx = makeCtx(w, TEACHER);
    const err = await thrown(run(updateOffering, ctx, editArgs({ hostOrgId: OTHER_COMMUNITY })));
    expect(err.code).toBe("paused");
    expect(tap(ctx).hostOrgId).toBe(COMMUNITY);
  });

  it("the teacher's own archive and unarchive still work while it's paused", async () => {
    // updateOfferingStatus is the teacher's own switch, not a moderation action.
    const ctx = makeCtx(pausedWorld(), TEACHER);
    await run(updateOfferingStatus, ctx, { offeringId: "offerings:tap", status: "archived" });
    expect(tap(ctx).status).toBe("archived");
    await run(updateOfferingStatus, ctx, { offeringId: "offerings:tap", status: "active" });
    expect(tap(ctx)).toMatchObject({ status: "active", pausedAt: 5 });
  });

  it("an unpaused class can still be moved out of its community (nothing changed for it)", async () => {
    const ctx = makeCtx(WORLD(), TEACHER);
    await run(updateOffering, ctx, editArgs({ hostOrgId: undefined, clearCommunity: true }));
    expect(tap(ctx).hostOrgId).toBeUndefined();
  });
});

describe("reportOffering / listReportsForOffering / dismissReport", () => {
  const reports = (ctx: any) => ctx.store.offeringReports as Row[];

  it("a signed-in member reports a class; the row copies the class's community", async () => {
    const ctx = makeCtx(WORLD(), STRANGER);
    const res = await run(reportOffering, ctx, {
      offeringId: "offerings:tap",
      reason: "misleading",
      details: "  It isn't beginner level.  ",
    });
    expect(res.updated).toBe(false);
    expect(reports(ctx)).toHaveLength(1);
    expect(reports(ctx)[0]).toMatchObject({
      offeringId: "offerings:tap",
      hostOrgId: COMMUNITY,
      reporterId: STRANGER,
      reason: "misleading",
      details: "It isn't beginner level.",
      status: "open",
    });
  });

  it("a report on a class with no community carries no community", async () => {
    const ctx = makeCtx(WORLD(), STRANGER);
    await run(reportOffering, ctx, { offeringId: "offerings:solo", reason: "spam" });
    expect(reports(ctx)[0].hostOrgId).toBeUndefined();
  });

  it("reporting again updates the same report instead of adding another", async () => {
    const ctx = makeCtx(WORLD(), STRANGER);
    await run(reportOffering, ctx, { offeringId: "offerings:tap", reason: "spam", details: "first" });
    const second = await run(reportOffering, ctx, { offeringId: "offerings:tap", reason: "unsafe" });
    expect(second.updated).toBe(true);
    expect(reports(ctx)).toHaveLength(1);
    expect(reports(ctx)[0]).toMatchObject({ reason: "unsafe", status: "open" });
    expect(reports(ctx)[0].details).toBeUndefined();
  });

  it("a different person's report is a separate one", async () => {
    const world = WORLD();
    const first = makeCtx(world, STRANGER);
    await run(reportOffering, first, { offeringId: "offerings:tap", reason: "spam" });
    const second = makeCtx({ ...first.store }, OTHER_HOST);
    await run(reportOffering, second, { offeringId: "offerings:tap", reason: "spam" });
    expect(reports(second)).toHaveLength(2);
  });

  it("the teacher can't report their own class; details over 500 characters are refused", async () => {
    const own = makeCtx(WORLD(), TEACHER);
    expect((await thrown(run(reportOffering, own, { offeringId: "offerings:tap", reason: "spam" }))).code).toBe(
      "own_offering",
    );
    const long = makeCtx(WORLD(), STRANGER);
    const err = await thrown(
      run(reportOffering, long, { offeringId: "offerings:tap", reason: "spam", details: "x".repeat(501) }),
    );
    expect(err.code).toBe("details_too_long");
    expect(reports(long)).toHaveLength(0);
  });

  it("a stranger can't report a paused class they can't see", async () => {
    const w = WORLD();
    w.offerings[0] = { ...w.offerings[0], pausedAt: 5 };
    const ctx = makeCtx(w, STRANGER);
    expect((await thrown(run(reportOffering, ctx, { offeringId: "offerings:tap", reason: "spam" }))).code).toBe("not_found");
  });

  it("signed-out callers can't report", async () => {
    const ctx = makeCtx(WORLD(), null);
    expect((await thrown(run(reportOffering, ctx, { offeringId: "offerings:tap", reason: "spam" }))).code).toBe(
      "unauthenticated",
    );
  });

  it("getOffering tells the reporter they already reported it", async () => {
    const ctx = makeCtx(WORLD(), STRANGER);
    await run(reportOffering, ctx, { offeringId: "offerings:tap", reason: "spam" });
    expect((await run(getOffering, ctx, { offeringId: "offerings:tap" })).viewerHasOpenReport).toBe(true);
  });

  const reportedWorld = () => {
    const w = WORLD();
    w.offeringReports = [
      { _id: "offeringReports:1", offeringId: "offerings:tap", hostOrgId: COMMUNITY, reporterId: STRANGER, reason: "spam", details: "Older", status: "open", createdAt: 10 },
      { _id: "offeringReports:2", offeringId: "offerings:tap", hostOrgId: COMMUNITY, reporterId: OTHER_HOST, reason: "unsafe", status: "open", createdAt: 20 },
      { _id: "offeringReports:3", offeringId: "offerings:tap", hostOrgId: COMMUNITY, reporterId: HOST, reason: "other", status: "dismissed", createdAt: 30 },
    ];
    return w;
  };

  it("a host reads the open reports, newest first, without who reported", async () => {
    const list = await run(listReportsForOffering, makeCtx(reportedWorld(), HOST), { offeringId: "offerings:tap" });
    expect(list.map((r: any) => r._id)).toEqual(["offeringReports:2", "offeringReports:1"]);
    expect(list[1]).toEqual({ _id: "offeringReports:1", reason: "spam", details: "Older", createdAt: 10 });
  });

  it("an admin reads them too, including for a class with no community", async () => {
    const list = await run(listReportsForOffering, makeCtx(reportedWorld(), ADMIN), { offeringId: "offerings:tap" });
    expect(list).toHaveLength(2);
    const w = WORLD();
    w.offeringReports = [
      { _id: "offeringReports:9", offeringId: "offerings:solo", reporterId: STRANGER, reason: "spam", status: "open", createdAt: 1 },
    ];
    const solo = await run(listReportsForOffering, makeCtx(w, ADMIN), { offeringId: "offerings:solo" });
    expect(solo).toHaveLength(1);
  });

  it("the teacher, a stranger, and a host of another community can't read the reports", async () => {
    for (const viewer of [TEACHER, STRANGER, OTHER_HOST]) {
      const err = await thrown(
        run(listReportsForOffering, makeCtx(reportedWorld(), viewer), { offeringId: "offerings:tap" }),
      );
      expect(err.code).toBe("forbidden");
    }
  });

  it("a host of the community that has no reports on a community-less class can't read it either", async () => {
    const err = await thrown(run(listReportsForOffering, makeCtx(WORLD(), HOST), { offeringId: "offerings:solo" }));
    expect(err.code).toBe("forbidden");
  });

  it("a host dismisses a report; it's recorded and drops off the open list", async () => {
    const ctx = makeCtx(reportedWorld(), HOST);
    await run(dismissReport, ctx, { reportId: "offeringReports:1" });
    expect(reports(ctx).find((r) => r._id === "offeringReports:1")).toMatchObject({
      status: "dismissed",
      resolvedBy: HOST,
    });
    const list = await run(listReportsForOffering, ctx, { offeringId: "offerings:tap" });
    expect(list.map((r: any) => r._id)).toEqual(["offeringReports:2"]);
  });

  it("the teacher, a stranger, and a host of another community can't dismiss a report", async () => {
    for (const viewer of [TEACHER, STRANGER, OTHER_HOST]) {
      const ctx = makeCtx(reportedWorld(), viewer);
      const err = await thrown(run(dismissReport, ctx, { reportId: "offeringReports:1" }));
      expect(err.code).toBe("forbidden");
      expect(reports(ctx).find((r) => r._id === "offeringReports:1")?.status).toBe("open");
    }
  });
});

// ——————————————————————————————————————————————————————————————
// Paid classes: the two places the pause and the price rules meet checkout
// ——————————————————————————————————————————————————————————————

/** WORLD with "Beginner tap" turned into a paid class with no outside link. */
const paidWorld = (over: Record<string, unknown> = {}) => {
  const w = WORLD();
  const tap = w.offerings.find((o) => o._id === "offerings:tap")!;
  Object.assign(tap, { priceCents: 2500, ...over });
  return w;
};

describe("startClassCheckout and a paused class", () => {
  it("a paid class that isn't paused lets a student start checkout, with a pledged row to pay against", async () => {
    const ctx = makeCtx(paidWorld(), HOST);
    const out = await run(startClassCheckout, ctx, { offeringId: "offerings:tap", userId: HOST });
    expect(out).toMatchObject({ ok: true, priceCents: 2500 });
    const mine = ctx.store.offeringSignups.filter((r: Row) => r.userId === HOST);
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("pledged");
  });

  it("a paused class takes no payment: the student is refused and no row is written", async () => {
    const ctx = makeCtx(paidWorld({ pausedAt: 5, pausedBy: HOST, pausedReason: "complaints" }), STRANGER);
    const before = ctx.store.offeringSignups.length;
    const out = await run(startClassCheckout, ctx, { offeringId: "offerings:tap", userId: HOST });
    expect(out).toEqual({ ok: false, refusal: { code: "paused", reason: "This class is paused right now." } });
    expect(ctx.store.offeringSignups).toHaveLength(before);
  });
});

describe("the price rule when a class is posted or edited", () => {
  const post = (viewer: string, over: Record<string, unknown>) =>
    run(createOffering, makeCtx(WORLD(), viewer), { title: "Watercolor", format: "class", ...over });

  it("refuses a price the checkout can't take, and posts nothing", async () => {
    const ctx = makeCtx(WORLD(), TEACHER);
    const err = await thrown(run(createOffering, ctx, { title: "Watercolor", format: "class", priceCents: 50 }));
    expect(err.code).toBe("invalid_price");
    expect(err.reason).toContain("$1 to $5,000");
    expect(ctx.store.offerings).toHaveLength(2); // still just the two seeded classes
  });

  it("takes a price inside the range, a free class, and any price when the teacher uses their own link", async () => {
    await expect(post(TEACHER, { priceCents: 2500 })).resolves.toBeTruthy();
    await expect(post(TEACHER, {})).resolves.toBeTruthy();
    await expect(
      post(TEACHER, { priceCents: 50, externalPaymentLinkUrl: "https://example.com/pay" }),
    ).resolves.toBeTruthy();
  });

  it("holds an edit to the same rule", async () => {
    const ctx = makeCtx(WORLD(), TEACHER);
    const err = await thrown(run(updateOffering, ctx, editArgs({ priceCents: 50 })));
    expect(err.code).toBe("invalid_price");
    await expect(run(updateOffering, makeCtx(WORLD(), TEACHER), editArgs({ priceCents: 4000 }))).resolves.toBeTruthy();
  });
});
