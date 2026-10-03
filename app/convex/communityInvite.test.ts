// Invite-only communities, end to end on an in-memory ctx: joinCommunity's
// code check (inviteAdmits), getCommunity's viewer fields, and the
// signup-side pieces in garden/defaultCommunity.ts that change when The
// Garden is invite-only. Same harness shape as hiddenCommunity.test.ts (the
// real handlers on a tiny fake ctx) — the repo copies it per file rather
// than sharing it.

import { describe, expect, it } from "vitest";
import { getCommunity, joinCommunity, updateCommunity } from "./garden/communities";
import {
  backfillDefaultCommunity,
  getSignupCommunity,
  joinDefaultCommunity,
} from "./garden/defaultCommunity";

const ADMIN = "users:admin"; // platform admin, host of the Garden
const MEMBER = "users:member"; // active member, has an invite code
const LAPSED = "users:lapsed"; // had a code; a host removed them
const WAITING = "users:waiting"; // had a code; request still pending
const ELSEWHERE = "users:elsewhere"; // has a code, member of Open Circle only
const NEWBIE = "users:newbie"; // the person joining
const OTHER = "users:other"; // someone else who bought a ticket

const GARDEN = "hostOrgs:garden";
const OPEN = "hostOrgs:open";

const TICKET = "cs_test_AAAAAAAAAAAA"; // paid, nobody's account yet
const TICKET_MINE = "cs_test_BBBBBBBBBBBB"; // paid, already claimed by NEWBIE
const TICKET_OTHERS = "cs_test_CCCCCCCCCCCC"; // paid, claimed by OTHER
const TICKET_UNPAID = "cs_test_DDDDDDDDDDDD"; // a free RSVP, no payment

// ——————————————————————————————————————————————————————————————
// The harness
// ——————————————————————————————————————————————————————————————

type Row = Record<string, any> & { _id: string };

/** Just enough of Convex's ctx: get / insert / patch / delete, and
 * query().withIndex(name, q => q.eq(..)) followed by collect / first /
 * unique / take. Index names aren't checked — the schema does that. */
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
// The world: The Garden (invite-only unless a test says otherwise), an open
// community, and the people and tickets that can or can't get into it.
// ——————————————————————————————————————————————————————————————

function profile(userId: string, name: string, extra: Record<string, unknown> = {}): Row {
  return {
    _id: `profiles:${userId.split(":")[1]}`, userId, name, interests: [], createdAt: 0, updatedAt: 0, ...extra,
  };
}

function member(hostOrgId: string, userId: string, status: string, role = "member"): Row {
  return {
    _id: `communityMembers:${hostOrgId.split(":")[1]}-${userId.split(":")[1]}`,
    hostOrgId, userId, role, status, joinedAt: 0,
  };
}

function rsvp(id: string, sessionId: string, extra: Record<string, unknown>): Row {
  return {
    _id: `eventRsvps:${id}`, eventId: "events:1", name: "Guest", email: `${id}@example.test`,
    stripeRef: `ap:${sessionId}`, createdAt: 0, ...extra,
  };
}

function world(gardenPolicy: string = "invite"): Record<string, Row[]> {
  return {
    profiles: [
      // The admin's own code is also their adminCode (what waitlist approval emails).
      profile(ADMIN, "Ada", { isAdmin: true, inviteSlug: "ADAINV", adminCode: "ADMIN-APPROVE", inviteUsageCount: 40 }),
      profile(MEMBER, "Mia", { inviteSlug: "MEMBR2", inviteUsageCount: 1 }),
      profile(LAPSED, "Lee", { inviteSlug: "LAPSED" }),
      profile(WAITING, "Wes", { inviteSlug: "WAITIN" }),
      profile(ELSEWHERE, "Eli", { inviteSlug: "ELSEWH" }),
      profile(NEWBIE, "Nia"),
      profile(OTHER, "Oz"),
    ],
    hostOrgs: [
      {
        _id: GARDEN, name: "The Garden", slug: "the-garden", kind: "community", status: "active",
        visibility: "public", joinPolicy: gardenPolicy, agreements: ["Be kind."], createdAt: 1,
      },
      {
        _id: OPEN, name: "Open Circle", slug: "open-circle", kind: "community", status: "active",
        visibility: "public", joinPolicy: "open", createdAt: 2,
      },
    ],
    communityMembers: [
      member(GARDEN, ADMIN, "active", "host"),
      member(GARDEN, MEMBER, "active"),
      member(GARDEN, LAPSED, "removed"),
      member(GARDEN, WAITING, "pending"),
      member(OPEN, ELSEWHERE, "active"),
    ],
    eventRsvps: [
      rsvp("paid", TICKET, { paidCents: 2500 }),
      rsvp("mine", TICKET_MINE, { paidCents: 2500, userId: NEWBIE }),
      rsvp("others", TICKET_OTHERS, { paidCents: 2500, userId: OTHER }),
      rsvp("free", TICKET_UNPAID, {}),
    ],
  };
}

const as = (viewer: string | null, tables = world()) => makeCtx(tables, viewer);
const rowsFor = (ctx: any, userId: string, hostOrgId = GARDEN) =>
  ctx.store.communityMembers.filter((m: Row) => m.userId === userId && m.hostOrgId === hostOrgId);
const join = (ctx: any, args: Record<string, unknown>) => run(joinCommunity, ctx, { hostOrgId: GARDEN, ...args });

// ——————————————————————————————————————————————————————————————
// joinCommunity on an invite-only community
// ——————————————————————————————————————————————————————————————

describe("joining an invite-only community", () => {
  it("refuses without a code, and adds no one", async () => {
    const ctx = as(NEWBIE);
    expect(await thrown(join(ctx, { agreed: true }))).toEqual({
      code: "invite_required",
      reason: "Joining takes an invite code from a member.",
    });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("treats a blank code as no code", async () => {
    const ctx = as(NEWBIE);
    expect(await thrown(join(ctx, { agreed: true, inviteCode: "   " }))).toMatchObject({ code: "invite_required" });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("refuses a code nobody has", async () => {
    const ctx = as(NEWBIE);
    expect(await thrown(join(ctx, { agreed: true, inviteCode: "NOSUCH" }))).toEqual({
      code: "invite_invalid",
      reason: "We don't recognise that code.",
    });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("refuses a code from someone who isn't a member here, even if they're in another community", async () => {
    const ctx = as(NEWBIE);
    expect(await thrown(join(ctx, { agreed: true, inviteCode: "ELSEWH" }))).toEqual({
      code: "invite_invalid",
      reason: "That code isn't from a member of The Garden.",
    });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("refuses a code from a removed member or one still waiting to be let in", async () => {
    for (const inviteCode of ["LAPSED", "WAITIN"]) {
      const ctx = as(NEWBIE);
      expect(await thrown(join(ctx, { agreed: true, inviteCode }))).toMatchObject({ code: "invite_invalid" });
      expect(rowsFor(ctx, NEWBIE)).toEqual([]);
    }
  });

  it("has no limit: a code used many times still lets the next person in", async () => {
    const w = world();
    w.profiles.find((p) => p.userId === MEMBER)!.inviteUsageCount = 500;
    const ctx = as(NEWBIE, w);
    expect(await join(ctx, { agreed: true, inviteCode: "MEMBR2" })).toMatchObject({ ok: true, status: "active" });
  });

  it("admits an active member's code: active, with when they agreed", async () => {
    const ctx = as(NEWBIE);
    expect(await join(ctx, { agreed: true, inviteCode: "MEMBR2" })).toEqual({ ok: true, status: "active" });
    const [row] = rowsFor(ctx, NEWBIE);
    expect(row).toMatchObject({ role: "member", status: "active" });
    expect(typeof row.agreedAt).toBe("number");
  });

  it("takes the code in whatever case it was typed, with spaces around it", async () => {
    const ctx = as(NEWBIE);
    expect(await join(ctx, { agreed: true, inviteCode: "  membr2 " })).toMatchObject({ ok: true });
  });

  it("still needs the agreements, after the code checks out", async () => {
    const ctx = as(NEWBIE);
    expect(await thrown(join(ctx, { inviteCode: "MEMBR2" }))).toMatchObject({ code: "agreements_required" });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("leaves crediting the inviter to redeemBySlug", async () => {
    const ctx = as(NEWBIE);
    await join(ctx, { agreed: true, inviteCode: "MEMBR2" });
    expect(ctx.store.profiles.find((p: Row) => p.userId === MEMBER).inviteUsageCount).toBe(1);
    expect(ctx.store.invites ?? []).toEqual([]);
  });

  it("brings a removed member back on a good code, reusing their row", async () => {
    const ctx = as(LAPSED);
    expect(await thrown(join(ctx, { agreed: true }))).toMatchObject({ code: "invite_required" });
    expect(await join(ctx, { agreed: true, inviteCode: "MEMBR2" })).toMatchObject({ ok: true, status: "active" });
    const rows = rowsFor(ctx, LAPSED);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "active", role: "member" });
  });

  it("an existing member needs no code, and can still record agreeing", async () => {
    const ctx = as(MEMBER);
    expect(await join(ctx, { agreed: true })).toMatchObject({ alreadyMember: true, status: "active" });
    expect(typeof rowsFor(ctx, MEMBER)[0].agreedAt).toBe("number");
  });

  it("a bad code doesn't matter to an existing member", async () => {
    const ctx = as(MEMBER);
    expect(await join(ctx, { agreed: true, inviteCode: "NOSUCH" })).toMatchObject({ alreadyMember: true });
  });

  it("an invite doesn't open a community that isn't approved yet", async () => {
    const w = world();
    w.hostOrgs.find((o) => o._id === GARDEN)!.status = "pending";
    const ctx = as(NEWBIE, w);
    expect(await thrown(join(ctx, { agreed: true, inviteCode: "MEMBR2" }))).toMatchObject({ code: "cannot_join" });
  });

  it("an open community ignores the code entirely", async () => {
    const ctx = as(NEWBIE);
    expect(await run(joinCommunity, ctx, { hostOrgId: OPEN, agreed: true, inviteCode: "NOSUCH" })).toMatchObject({
      ok: true,
      status: "active",
    });
  });
});

describe("an admin's waitlist code", () => {
  it("admits the approved person", async () => {
    const ctx = as(NEWBIE);
    expect(await join(ctx, { agreed: true, inviteCode: "ADMIN-APPROVE" })).toMatchObject({
      ok: true,
      status: "active",
    });
    expect(rowsFor(ctx, NEWBIE)[0]).toMatchObject({ status: "active" });
  });

  it("works through the admin's invite link code too", async () => {
    expect(await join(as(NEWBIE), { agreed: true, inviteCode: "ADAINV" })).toMatchObject({ ok: true });
  });

  it("still has to be a member here", async () => {
    const w = world();
    w.communityMembers = w.communityMembers.filter((m) => m.userId !== ADMIN);
    const ctx = as(NEWBIE, w);
    expect(await thrown(join(ctx, { agreed: true, inviteCode: "ADMIN-APPROVE" }))).toMatchObject({
      code: "invite_invalid",
    });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });
});

describe("a ticket as an invite", () => {
  it("admits a paid ticket nobody has claimed yet", async () => {
    const ctx = as(NEWBIE);
    expect(await join(ctx, { agreed: true, inviteCode: TICKET })).toMatchObject({ ok: true, status: "active" });
    expect(rowsFor(ctx, NEWBIE)[0]).toMatchObject({ status: "active", role: "member" });
  });

  it("admits a ticket the signup already claimed for this person", async () => {
    expect(await join(as(NEWBIE), { agreed: true, inviteCode: TICKET_MINE })).toMatchObject({ ok: true });
  });

  it("refuses a ticket that's on someone else's account", async () => {
    const ctx = as(NEWBIE);
    expect(await thrown(join(ctx, { agreed: true, inviteCode: TICKET_OTHERS }))).toEqual({
      code: "invite_invalid",
      reason: "That ticket link isn't valid for joining.",
    });
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("refuses an RSVP that wasn't paid for, and a session with no RSVP", async () => {
    for (const inviteCode of [TICKET_UNPAID, "cs_test_ZZZZZZZZZZZZ"]) {
      const ctx = as(NEWBIE);
      expect(await thrown(join(ctx, { agreed: true, inviteCode }))).toMatchObject({ code: "invite_invalid" });
      expect(rowsFor(ctx, NEWBIE)).toEqual([]);
    }
  });
});

// ——————————————————————————————————————————————————————————————
// What the community page is told
// ——————————————————————————————————————————————————————————————

describe("getCommunity's viewer on an invite-only community", () => {
  const viewerOf = async (viewer: string | null, slug = "the-garden", tables = world()) =>
    (await run(getCommunity, as(viewer, tables), { slug })).viewer;

  it("a non-member is told to bring a code, not offered a button", async () => {
    for (const viewer of [NEWBIE, LAPSED, null]) {
      expect(await viewerOf(viewer)).toMatchObject({
        joinNeedsInvite: true,
        canJoin: { allowed: false, reason: "Joining takes an invite code from a member." },
        joinWouldBePending: false,
      });
    }
  });

  it("a member is not asked for a code", async () => {
    const viewer = await viewerOf(MEMBER);
    expect(viewer.joinNeedsInvite).toBe(false);
    expect(viewer.membership).toMatchObject({ status: "active" });
    expect(viewer.canJoin).toEqual({ allowed: false, reason: undefined });
  });

  it("someone whose request is pending isn't asked either", async () => {
    expect((await viewerOf(WAITING)).joinNeedsInvite).toBe(false);
  });

  it("an open community never asks", async () => {
    const viewer = await viewerOf(NEWBIE, "open-circle");
    expect(viewer.joinNeedsInvite).toBe(false);
    expect(viewer.canJoin).toEqual({ allowed: true, reason: undefined });
  });

  it("an apply community never asks", async () => {
    const w = world("apply");
    const viewer = await viewerOf(NEWBIE, "the-garden", w);
    expect(viewer.joinNeedsInvite).toBe(false);
    expect(viewer.joinWouldBePending).toBe(true);
  });

  it("carries the policy itself", async () => {
    expect((await run(getCommunity, as(NEWBIE), { slug: "the-garden" })).joinPolicy).toBe("invite");
  });
});

describe("a host switching a community to invite-only", () => {
  it("is accepted", async () => {
    const ctx = as(ADMIN);
    expect(await run(updateCommunity, ctx, { hostOrgId: OPEN, joinPolicy: "invite" })).toEqual({ ok: true });
    expect(ctx.store.hostOrgs.find((o: Row) => o._id === OPEN).joinPolicy).toBe("invite");
  });

  it("still rejects a policy it doesn't know", async () => {
    expect(await thrown(run(updateCommunity, as(ADMIN), { hostOrgId: OPEN, joinPolicy: "closed" }))).toMatchObject({
      code: "invalid_join_policy",
    });
  });
});

// ——————————————————————————————————————————————————————————————
// The default community at signup
// ——————————————————————————————————————————————————————————————

describe("joinDefaultCommunity", () => {
  it("adds a new account to an open Garden, as it always did", async () => {
    const ctx = as(null, world("open"));
    expect(await joinDefaultCommunity(ctx, NEWBIE as any, { agreedAt: 5 })).toBe(true);
    expect(rowsFor(ctx, NEWBIE)[0]).toMatchObject({ status: "active", role: "member", agreedAt: 5 });
  });

  it("skips an invite-only Garden — the code check in joinCommunity is the way in", async () => {
    const ctx = as(null);
    expect(await joinDefaultCommunity(ctx, NEWBIE as any, { agreedAt: 5 })).toBe(false);
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("skips it when handed the invite-only community's id too", async () => {
    const ctx = as(null);
    expect(await joinDefaultCommunity(ctx, NEWBIE as any, { hostOrgId: GARDEN as any })).toBe(false);
    expect(rowsFor(ctx, NEWBIE)).toEqual([]);
  });

  it("still does nothing when The Garden isn't seeded", async () => {
    const w = world();
    w.hostOrgs = w.hostOrgs.filter((o) => o._id !== GARDEN);
    expect(await joinDefaultCommunity(as(null, w), NEWBIE as any)).toBe(false);
  });
});

describe("backfillDefaultCommunity", () => {
  it("refuses to run against an invite-only Garden rather than report people added", async () => {
    const err = await run(backfillDefaultCommunity, as(null), { dryRun: false }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/invite-only/);
  });
});

describe("getSignupCommunity", () => {
  it("tells a signed-out visitor the Garden is invite-only", async () => {
    expect(await run(getSignupCommunity, as(null), {})).toEqual({
      id: GARDEN,
      slug: "the-garden",
      name: "The Garden",
      agreements: ["Be kind."],
      inviteOnly: true,
      viewer: { signedIn: false, isMember: false },
    });
  });

  it("says inviteOnly is false for an open Garden", async () => {
    expect((await run(getSignupCommunity, as(null, world("open")), {})).inviteOnly).toBe(false);
  });

  it("knows a signed-in non-member isn't in yet", async () => {
    expect((await run(getSignupCommunity, as(NEWBIE), {})).viewer).toEqual({ signedIn: true, isMember: false });
  });

  it("knows an active member is", async () => {
    expect((await run(getSignupCommunity, as(MEMBER), {})).viewer).toEqual({ signedIn: true, isMember: true });
  });

  it("doesn't count a pending or removed row as in", async () => {
    for (const viewer of [WAITING, LAPSED]) {
      expect((await run(getSignupCommunity, as(viewer), {})).viewer).toEqual({ signedIn: true, isMember: false });
    }
  });

  it("is null when the default community isn't seeded", async () => {
    const w = world();
    w.hostOrgs = w.hostOrgs.filter((o) => o._id !== GARDEN);
    expect(await run(getSignupCommunity, as(null, w), {})).toBeNull();
  });
});
