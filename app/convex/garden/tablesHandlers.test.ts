import { describe, expect, it } from "vitest";
import {
  createTable,
  getTable,
  joinTable,
  leaveTable,
  listTablesForUser,
  manageEnrollment,
  recordAttendance,
  rsvpSession,
  getHostRoster,
  addTableEvent,
} from "./tables";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
const NOW = Date.now();
const HOST = "users:host",
  USER = "users:participant",
  OTHER = "users:other";
const COMMUNITY = "hostOrgs:community",
  SECOND = "hostOrgs:second";
export function world() {
  return {
    profiles: [
      { _id: "profiles:h", userId: HOST, name: "Host" },
      {
        _id: "profiles:p",
        userId: USER,
        name: "Participant",
        inviteSlug: "person",
      },
      { _id: "profiles:o", userId: OTHER, name: "Other" },
    ],
    hostOrgs: [
      {
        _id: COMMUNITY,
        name: "Creative Exchange",
        slug: "the-garden",
        kind: "community",
        status: "active",
      },
      {
        _id: SECOND,
        name: "Elsewhere",
        slug: "elsewhere",
        kind: "community",
        status: "active",
      },
    ],
    communityMembers: [
      {
        _id: "communityMembers:h",
        userId: HOST,
        hostOrgId: COMMUNITY,
        status: "active",
      },
      {
        _id: "communityMembers:p",
        userId: USER,
        hostOrgId: COMMUNITY,
        status: "active",
      },
    ],
    memberships: [],
    gardenTables: [
      {
        _id: "gardenTables:t",
        name: "Table",
        slug: "table",
        hostOrgId: COMMUNITY,
        hostUserId: HOST,
        mode: "open",
        status: "active",
        createdAt: NOW,
        pricingType: "free",
        membershipRequired: false,
        access: "open",
        scheduleType: "one_time",
      },
    ],
    tableMemberships: [],
    tableSessions: [
      {
        _id: "tableSessions:s",
        tableId: "gardenTables:t",
        startsAt: NOW + 100000,
        meetingUrl: "https://private.example/secret",
      },
    ],
    events: [
      {
        _id: "events:e",
        tableId: "gardenTables:t",
        organizerId: HOST,
        title: "First Event",
        datetime: NOW + 100000,
        status: "published",
      },
    ],
    tableCheckoutHolds: [],
    tableMembershipHistory: [],
    tableAttendance: [],
    sessionRsvps: [],
    projects: [],
  } as Record<string, Row[]>;
}
const freeCreate = {
  name: "A new Table",
  description: "Make something together",
  scheduleType: "one_time",
  membershipRequired: false,
  access: "open",
  allowsExternalGuests: false,
  pricingType: "free",
  events: [{ title: "First gathering", datetime: NOW + 1000000 }],
};

describe("Tables canonical handler policies", () => {
  it("projects a host as a linked person with avatar and primary organization", async () => {
    const data = world();
    data.profiles[0].imageUrl = "https://images.example/host.png";
    data.organizations = [
      { _id: "organizations:studio", name: "Studio", slug: "studio", createdByUserId: HOST, createdAt: NOW, updatedAt: NOW },
    ];
    data.orgPositions = [
      { _id: "orgPositions:host", organizationId: "organizations:studio", userId: HOST, profileId: "profiles:h", isAdmin: false, order: 0, createdAt: NOW },
    ];
    const summary = await run(getTable, makeCtx(data, null), { slug: "table" });
    expect(summary.host).toMatchObject({
      name: "Host",
      userId: HOST,
      profileId: "profiles:h",
      imageUrl: "https://images.example/host.png",
      href: "/profile/profiles:h",
      orgName: "Studio",
      orgSlug: "studio",
      orgHref: "/orgs/studio",
    });
  });

  it("links community host fallback when the host has no profile", async () => {
    const data = world();
    data.gardenTables[0].hostUserId = undefined;
    data.profiles = data.profiles.filter((p) => p.userId !== HOST);
    const summary = await run(getTable, makeCtx(data, null), { slug: "table" });
    expect(summary.host).toMatchObject({
      name: "Creative Exchange",
      imageUrl: null,
      href: "/communities/the-garden",
    });
    expect(summary.host.profileId).toBeUndefined();
  });

  it("free accounts create one free occurrence, parent Event and persistent host role", async () => {
    const ctx = makeCtx(world(), USER);
    const result = await run(createTable, ctx, freeCreate);
    expect(result.slug).toBe("a-new-table");
    expect(
      ctx.store.events.find((e: Row) => e.tableId === result.tableId)
        ?.organizerId,
    ).toBe(USER);
    expect(ctx.store.tableSessions).toHaveLength(1);
    expect(ctx.store.tableMemberships[0]).toMatchObject({
      role: "host",
      status: "active",
    });
  });
  it("free accounts cannot charge or create ongoing series", async () => {
    const ctx = makeCtx(world(), USER);
    await expect(
      run(createTable, ctx, {
        ...freeCreate,
        hostOrgId: COMMUNITY,
        pricingType: "fixed",
        priceCents: 1000,
      }),
    ).rejects.toThrow();
    await expect(
      run(createTable, ctx, {
        ...freeCreate,
        hostOrgId: COMMUNITY,
        scheduleType: "series",
      }),
    ).rejects.toThrow();
    expect(ctx.store.gardenTables).toHaveLength(1);
  });
  it("membership in another community cannot unlock hosting", async () => {
    const data = world();
    data.memberships.push({
      _id: "memberships:x",
      userId: USER,
      communityId: SECOND,
      status: "active",
      level: "seat",
    });
    const ctx = makeCtx(data, USER);
    await expect(
      run(createTable, ctx, {
        ...freeCreate,
        hostOrgId: COMMUNITY,
        pricingType: "fixed",
        priceCents: 1000,
      }),
    ).rejects.toThrow();
  });
  it("same-community member can host paid series without approved-host role", async () => {
    const data = world();
    data.memberships.push({
      _id: "memberships:x",
      userId: USER,
      communityId: COMMUNITY,
      status: "active",
      level: "seat",
    });
    const ctx = makeCtx(data, USER);
    const result = await run(createTable, ctx, {
      ...freeCreate,
      hostOrgId: COMMUNITY,
      scheduleType: "series",
      pricingType: "fixed",
      priceCents: 1000,
      events: [
        ...freeCreate.events,
        { title: "Second", datetime: NOW + 2000000 },
      ],
    });
    expect(result.eventIds).toHaveLength(2);
  });
  it("roster and secret URLs stay private until accepted free join", async () => {
    const ctx = makeCtx(world(), USER);
    let table = await run(getTable, ctx, { slug: "table" });
    expect(table.roster).toEqual([]);
    expect(table.sessions[0].meetingUrl).toBeUndefined();
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    table = await run(getTable, ctx, { slug: "table" });
    expect(table.roster).toEqual(["Participant"]);
    expect(table.sessions[0].meetingUrl).toContain("secret");
    expect(JSON.stringify(table)).not.toContain("email");
  });
  it("join is idempotent and leave/rejoin retains record and transition history", async () => {
    const ctx = makeCtx(world(), USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    expect(ctx.store.tableMemberships).toHaveLength(1);
    await run(leaveTable, ctx, { tableId: "gardenTables:t" });
    expect(ctx.store.tableMemberships[0].status).toBe("left");
    expect((await run(getTable, ctx, { slug: "table" })).roster).toEqual([]);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    expect(ctx.store.tableMemberships).toHaveLength(1);
    expect(ctx.store.tableMembershipHistory.map((m: Row) => m.status)).toEqual([
      "active",
      "left",
      "active",
    ]);
  });
  it("leaving cannot undo a host removal; only the host restores the chair", async () => {
    const ctx = makeCtx(world(), USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    const host = makeCtx(ctx.store, HOST);
    await run(manageEnrollment, host, {
      tableId: "gardenTables:t",
      userId: USER,
      decision: "remove",
    });
    const removed = makeCtx(host.store, USER);
    await run(leaveTable, removed, { tableId: "gardenTables:t" });
    expect(removed.store.tableMemberships[0].status).toBe("removed");
    await expect(
      run(joinTable, removed, { tableId: "gardenTables:t" }),
    ).rejects.toThrow();
    expect(removed.store.tableMemberships[0].status).toBe("removed");
    expect(
      (await run(getTable, removed, { slug: "table" })).viewer.action,
    ).toBe("closed");
    const restore = makeCtx(removed.store, HOST);
    await run(manageEnrollment, restore, {
      tableId: "gardenTables:t",
      userId: USER,
      decision: "accept",
    });
    expect(restore.store.tableMemberships[0].status).toBe("active");
    expect(
      restore.store.tableMembershipHistory.map((m: Row) => m.status),
    ).toEqual(["active", "removed", "active"]);
  });
  it("Events of an approval Table don't carry a second, per-Event approval", async () => {
    const ctx = makeCtx(world(), USER);
    const result = await run(createTable, ctx, {
      ...freeCreate,
      access: "approval",
    });
    const event = ctx.store.events.find((e: Row) => e.tableId === result.tableId);
    expect(event?.requiresApproval).toBe(false);
  });
  it("open paid enrollment asks for checkout and never grants roster early", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      pricingType: "fixed",
      priceCents: 2500,
    });
    const ctx = makeCtx(data, USER);
    expect(
      await run(joinTable, ctx, { tableId: "gardenTables:t" }),
    ).toMatchObject({ action: "checkout", paymentPending: true });
    expect(ctx.store.tableMemberships).toHaveLength(0);
    expect((await run(getTable, ctx, { slug: "table" })).roster).toEqual([]);
  });
  it.each([false, true])(
    "membership and fixed fee independent (paid=%s)",
    async (paid) => {
      const data = world();
      Object.assign(data.gardenTables[0], {
        membershipRequired: true,
        pricingType: paid ? "fixed" : "free",
        priceCents: paid ? 1000 : 0,
      });
      data.memberships.push({
        _id: "memberships:x",
        userId: USER,
        communityId: SECOND,
        status: "active",
        level: "seat",
      });
      const ctx = makeCtx(data, USER);
      await expect(
        run(joinTable, ctx, { tableId: "gardenTables:t" }),
      ).rejects.toThrow();
      data.memberships[0].communityId = COMMUNITY;
      const ctx2 = makeCtx(data, USER);
      expect(
        await run(joinTable, ctx2, { tableId: "gardenTables:t" }),
      ).toMatchObject({ action: paid ? "checkout" : "joined" });
    },
  );
  it("unconfirmed migrated paid enrollment never unlocks roster or session RSVP", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      pricingType: "fixed",
      priceCents: 1000,
    });
    data.tableMemberships.push({
      _id: "tableMemberships:x",
      tableId: "gardenTables:t",
      userId: USER,
      status: "active",
      paymentStatus: "external_unverified",
      joinedAt: NOW,
    });
    const ctx = makeCtx(data, USER);
    expect((await run(getTable, ctx, { slug: "table" })).viewer.isMember).toBe(
      false,
    );
    await expect(
      run(rsvpSession, ctx, { sessionId: "tableSessions:s", status: "going" }),
    ).rejects.toThrow();
  });
  it("last chair rejects later joins and live holds reserve capacity", async () => {
    const data = world();
    data.gardenTables[0].capacity = 1;
    data.tableCheckoutHolds.push({
      _id: "tableCheckoutHolds:x",
      tableId: "gardenTables:t",
      userId: OTHER,
      status: "pending",
      expiresAt: NOW + 100000,
    });
    const ctx = makeCtx(data, USER);
    await expect(
      run(joinTable, ctx, { tableId: "gardenTables:t" }),
    ).rejects.toThrow();
    expect((await run(getTable, ctx, { slug: "table" })).viewer.action).toBe(
      "full",
    );
  });
  it("approval request private until host accepts, strangers cannot manage", async () => {
    const data = world();
    data.gardenTables[0].access = "approval";
    const ctx = makeCtx(data, USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    expect((await run(getTable, ctx, { slug: "table" })).roster).toEqual([]);
    await expect(
      run(manageEnrollment, ctx, {
        tableId: "gardenTables:t",
        userId: USER,
        decision: "accept",
      }),
    ).rejects.toThrow();
    await run(manageEnrollment, makeCtx(ctx.store, HOST), {
      tableId: "gardenTables:t",
      userId: USER,
      decision: "accept",
    });
  });
  it("paid approval stays unpaid after host accepts and checkout becomes available", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      access: "approval",
      pricingType: "fixed",
      priceCents: 1000,
    });
    const ctx = makeCtx(data, USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    const host = makeCtx(ctx.store, HOST);
    await run(manageEnrollment, host, {
      tableId: "gardenTables:t",
      userId: USER,
      decision: "accept",
    });
    const participant = makeCtx(host.store, USER);
    const detail = await run(getTable, participant, { slug: "table" });
    expect(detail.viewer.action).toBe("checkout");
    expect(detail.roster).toEqual([]);
  });
  it("public profiles never expose private membership relationships", async () => {
    const data = world();
    data.tableMemberships.push({
      _id: "tableMemberships:x",
      tableId: "gardenTables:t",
      userId: USER,
      joinedAt: NOW,
    });
    expect(
      await run(listTablesForUser, makeCtx(data, null), { userId: USER }),
    ).toEqual([]);
    expect(
      await run(listTablesForUser, makeCtx(data, OTHER), { userId: USER }),
    ).toEqual([]);
    expect(
      await run(listTablesForUser, makeCtx(data, USER), { userId: USER }),
    ).toHaveLength(1);
  });
  it("host roster restricted and attendance explicitly recorded, never inferred", async () => {
    const data = world();
    data.tableMemberships.push({
      _id: "tableMemberships:x",
      tableId: "gardenTables:t",
      userId: USER,
      joinedAt: NOW,
    });
    await expect(
      run(getHostRoster, makeCtx(data, OTHER), { tableId: "gardenTables:t" }),
    ).rejects.toThrow();
    const ctx = makeCtx(data, HOST);
    expect(ctx.store.tableAttendance).toEqual([]);
    // Not before the date starts.
    await expect(
      run(recordAttendance, ctx, {
        eventId: "events:e",
        userId: USER,
        status: "attended",
      }),
    ).rejects.toThrow(/once the date starts/);
    ctx.store.events.find((e: { _id: string }) => e._id === "events:e").datetime = NOW - 1000;
    await run(recordAttendance, ctx, {
      eventId: "events:e",
      userId: USER,
      status: "attended",
    });
    await run(recordAttendance, ctx, {
      eventId: "events:e",
      userId: USER,
      status: "absent",
    });
    expect(ctx.store.tableAttendance).toHaveLength(1);
    expect(ctx.store.tableAttendance[0]).toMatchObject({
      status: "absent",
      recordedByUserId: HOST,
    });
  });
  it("another active participant cannot see an unpaid or community-ineligible target's Table relationship", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      pricingType: "fixed",
      priceCents: 1000,
    });
    data.tableMemberships.push(
      {
        _id: "tableMemberships:p",
        tableId: "gardenTables:t",
        userId: USER,
        joinedAt: NOW,
        status: "active",
        paymentStatus: "pending",
      },
      {
        _id: "tableMemberships:o",
        tableId: "gardenTables:t",
        userId: OTHER,
        joinedAt: NOW,
        status: "active",
        paymentStatus: "confirmed",
      },
    );
    expect(
      await run(listTablesForUser, makeCtx(data, OTHER), { userId: USER }),
    ).toEqual([]);
    expect(
      await run(listTablesForUser, makeCtx(data, USER), { userId: USER }),
    ).toHaveLength(1);
    data.tableMemberships[0].paymentStatus = "confirmed";
    expect(
      await run(listTablesForUser, makeCtx(data, OTHER), { userId: USER }),
    ).toHaveLength(1);
    data.gardenTables[0].membershipRequired = true;
    data.communityMembers.push({
      _id: "communityMembers:o",
      userId: OTHER,
      hostOrgId: COMMUNITY,
      status: "active",
    });
    data.memberships.push({
      _id: "memberships:o",
      userId: OTHER,
      communityId: COMMUNITY,
      status: "active",
      level: "seat",
    });
    expect(
      await run(listTablesForUser, makeCtx(data, OTHER), { userId: USER }),
    ).toEqual([]);
  });
  it("added dates require host role and ongoing membership, for one-time and series Tables alike", async () => {
    const data = world();
    const ctx = makeCtx(data, HOST);
    const event = { title: "Next", datetime: NOW + 3000000 };
    await expect(
      run(addTableEvent, ctx, { tableId: "gardenTables:t", event }),
    ).rejects.toThrow();
    data.gardenTables[0].scheduleType = "series";
    data.gardenTables[0].coHostIds = [USER];
    await expect(
      run(addTableEvent, makeCtx(data, HOST), {
        tableId: "gardenTables:t",
        event,
      }),
    ).rejects.toThrow();
    data.communityMembers.push({
      _id: "communityMembers:h2",
      userId: HOST,
      hostOrgId: SECOND,
      status: "active",
    });
    data.memberships.push({
      _id: "memberships:h",
      userId: HOST,
      communityId: COMMUNITY,
      status: "active",
      level: "seat",
    });
    await expect(
      run(addTableEvent, makeCtx(data, OTHER), {
        tableId: "gardenTables:t",
        event,
      }),
    ).rejects.toThrow();
    const host = makeCtx(data, HOST);
    const result = await run(addTableEvent, host, {
      tableId: "gardenTables:t",
      event,
    });
    expect(
      host.store.events.find((e: Row) => e._id === result.eventId),
    ).toMatchObject({
      tableId: "gardenTables:t",
      organizerId: HOST,
      title: "Next",
    });
    expect(host.store.eventCoHosts[0]).toMatchObject({
      eventId: result.eventId,
      userId: USER,
    });
  });
  it("an open payment pledge requests checkout, not unnecessary host approval", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      pricingType: "fixed",
      priceCents: 1000,
    });
    data.tableMemberships.push({
      _id: "tableMemberships:x",
      tableId: "gardenTables:t",
      userId: USER,
      status: "pending",
      paymentStatus: "pending",
      joinedAt: NOW,
    });
    expect(
      (await run(getTable, makeCtx(data, USER), { slug: "table" })).viewer
        .action,
    ).toBe("checkout");
  });
  it("member-only guest policy rejected at creation", async () => {
    await expect(
      run(createTable, makeCtx(world(), USER), {
        ...freeCreate,
        hostOrgId: COMMUNITY,
        membershipRequired: true,
        allowsExternalGuests: true,
      }),
    ).rejects.toThrow();
  });
});

describe("Tables tell people", () => {
  const notes = (store: Record<string, Row[]>, userId: string) =>
    (store.notifications ?? []).filter((n) => n.userId === userId);

  it("tells the host when someone joins, never the person who joined", async () => {
    const ctx = makeCtx(world(), USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    expect(notes(ctx.store, HOST)).toEqual([
      expect.objectContaining({
        type: "table_joined",
        title: "Participant joined Table",
        linkUrl: "/tables/table",
        relatedUserId: USER,
      }),
    ]);
    expect(notes(ctx.store, USER)).toEqual([]);
  });

  it("tells the host once when someone asks, and the person when the host says yes", async () => {
    const data = world();
    data.gardenTables[0].access = "approval";
    const ctx = makeCtx(data, USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    expect(notes(ctx.store, HOST).map((n) => n.type)).toEqual(["table_join_request"]);
    expect(notes(ctx.store, HOST)[0].title).toBe("Participant asked to join Table");
    const host = makeCtx(ctx.store, HOST);
    await run(manageEnrollment, host, {
      tableId: "gardenTables:t",
      userId: USER,
      decision: "accept",
    });
    expect(notes(host.store, USER)).toEqual([
      expect.objectContaining({ type: "table_request_accepted", title: "You're in: Table" }),
    ]);
  });

  it("tells a person the host said no, or removed them", async () => {
    const data = world();
    data.gardenTables[0].access = "approval";
    const asker = makeCtx(data, USER);
    await run(joinTable, asker, { tableId: "gardenTables:t" });
    const decider = makeCtx(asker.store, HOST);
    await run(manageEnrollment, decider, {
      tableId: "gardenTables:t",
      userId: USER,
      decision: "remove",
    });
    expect(notes(decider.store, USER).map((n) => n.type)).toEqual(["table_request_declined"]);

    const open = makeCtx(world(), USER);
    await run(joinTable, open, { tableId: "gardenTables:t" });
    const host = makeCtx(open.store, HOST);
    await run(manageEnrollment, host, { tableId: "gardenTables:t", userId: USER, decision: "remove" });
    expect(notes(host.store, USER)).toEqual([
      expect.objectContaining({ type: "table_removed", title: "You're no longer at Table" }),
    ]);
    // Removing them again tells them nothing new.
    await run(manageEnrollment, host, { tableId: "gardenTables:t", userId: USER, decision: "remove" });
    expect(notes(host.store, USER)).toHaveLength(1);
  });

  it("tells nobody when a person leaves on their own", async () => {
    const ctx = makeCtx(world(), USER);
    await run(joinTable, ctx, { tableId: "gardenTables:t" });
    await run(leaveTable, ctx, { tableId: "gardenTables:t" });
    expect(notes(ctx.store, USER)).toEqual([]);
    expect(notes(ctx.store, HOST)).toHaveLength(1);
  });

  it("tells a host who can't add dates why, and nobody else", async () => {
    const data = world();
    const forHost = await run(getTable, makeCtx(data, HOST), { slug: "table" });
    expect(forHost.addDatesBlocked).toBe("Adding more dates takes Creative Exchange membership.");
    const forMember = await run(getTable, makeCtx(data, USER), { slug: "table" });
    expect(forMember.addDatesBlocked).toBeNull();
    data.memberships.push({
      _id: "memberships:h",
      userId: HOST,
      communityId: COMMUNITY,
      status: "active",
      level: "seat",
    });
    const paidHost = await run(getTable, makeCtx(data, HOST), { slug: "table" });
    expect(paidHost.addDatesBlocked).toBeNull();
  });
});
