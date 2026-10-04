// Add a date to any Table, the emails that follow Table changes, guest
// contact details and opt-in, and "Run it again". Same harness as
// tablesHandlers.test.ts, with the scheduler recorded so each email the
// handlers queue can be checked.
import { describe, expect, it } from "vitest";
import { getFunctionName } from "convex/server";
import {
  addTableEvent,
  getTable,
  getTableGuests,
  manageEnrollment,
  runTableAgain,
  membershipName,
} from "./tables";
import {
  getEventRsvps,
  getGuestEmailStop,
  rsvpGuestToTableEvent,
} from "./eventRsvps";
import { update as updateEvent, cancel as cancelEvent } from "../events";
import { unsubscribeByToken } from "../emailPreferences";
import { formatTableDate } from "./tableNotify";
import { makeCtx, run, type Row } from "../../test-support/convexContext";

const NOW = Date.now();
const DAY = 86_400_000;
const HOST = "users:host",
  PAT = "users:pat",
  LEE = "users:lee",
  ASKER = "users:asker",
  GONE = "users:gone",
  OUT = "users:out",
  STRANGER = "users:stranger";
const ORG = "hostOrgs:community";
const TABLE = "gardenTables:t",
  E1 = "events:e1";
const SECRET = "https://private.example/secret-room";

function world(): Record<string, Row[]> {
  const user = (id: string, name: string) => ({
    _id: id,
    email: `${name.toLowerCase()}@example.com`,
    name,
  });
  return {
    users: [
      user(HOST, "Host"),
      user(PAT, "Pat"),
      user(LEE, "Lee"),
      user(ASKER, "Asker"),
      user(GONE, "Gone"),
      user(OUT, "Out"),
      user(STRANGER, "Stranger"),
    ],
    profiles: [
      { _id: "profiles:h", userId: HOST, name: "Host" },
      { _id: "profiles:p", userId: PAT, name: "Pat" },
      { _id: "profiles:l", userId: LEE, name: "Lee" },
      { _id: "profiles:a", userId: ASKER, name: "Asker" },
    ],
    hostOrgs: [
      {
        _id: ORG,
        name: "The Garden",
        slug: "the-garden",
        kind: "community",
        status: "active",
      },
    ],
    communityMembers: [
      { _id: "communityMembers:h", userId: HOST, hostOrgId: ORG, status: "active", joinedAt: 0 },
    ],
    memberships: [],
    gardenTables: [
      {
        _id: TABLE,
        name: "Theology of Creativity",
        slug: "theology-of-creativity",
        hostOrgId: ORG,
        hostUserId: HOST,
        mode: "open",
        status: "active",
        createdAt: NOW,
        description: "We read and make things.",
        photoUrl: "https://images.example/table.png",
        pricingType: "free",
        priceCents: 0,
        membershipRequired: false,
        access: "open",
        visibility: "public",
        allowsExternalGuests: true,
        capacity: 20,
        scheduleType: "one_time",
        meetingUrl: SECRET,
      },
    ],
    tableMemberships: [
      { _id: "tableMemberships:h", tableId: TABLE, userId: HOST, joinedAt: 0, status: "active", role: "host", paymentStatus: "not_required" },
      { _id: "tableMemberships:p", tableId: TABLE, userId: PAT, joinedAt: 0, status: "active", role: "participant", paymentStatus: "not_required" },
      { _id: "tableMemberships:l", tableId: TABLE, userId: LEE, joinedAt: 0, status: "active", role: "participant", paymentStatus: "not_required" },
      { _id: "tableMemberships:a", tableId: TABLE, userId: ASKER, joinedAt: 0, status: "pending", role: "participant", paymentStatus: "not_required" },
      { _id: "tableMemberships:g", tableId: TABLE, userId: GONE, joinedAt: 0, status: "removed", role: "participant", paymentStatus: "not_required" },
      { _id: "tableMemberships:o", tableId: TABLE, userId: OUT, joinedAt: 0, status: "left", role: "participant", paymentStatus: "not_required" },
    ],
    tableMembershipHistory: [],
    tableCheckoutHolds: [],
    tableAttendance: [],
    tableSessions: [],
    events: [
      {
        _id: E1,
        tableId: TABLE,
        hostOrgId: ORG,
        organizerId: HOST,
        title: "First gathering",
        description: "We read and make things.",
        datetime: NOW + 2 * DAY,
        endTime: NOW + 2 * DAY + 90 * 60_000,
        location: "Pasadena studio",
        locationType: "venue",
        status: "published",
        tags: [],
        requiresApproval: false,
      },
    ],
    eventCoHosts: [],
    eventApplications: [],
    eventRsvps: [],
    emailPreferences: [],
    projects: [],
  };
}

/** Pays HOST's dues in the Table's community: what a series takes. */
function hostPays(data: Record<string, Row[]>) {
  data.memberships.push({
    _id: "memberships:h",
    userId: HOST,
    communityId: ORG,
    status: "active",
    level: "seat",
  });
}

function guestRow(
  data: Record<string, Row[]>,
  id: string,
  email: string,
  extra: Record<string, unknown> = {},
) {
  data.eventRsvps.push({
    _id: `eventRsvps:${id}`,
    eventId: E1,
    name: id,
    email,
    notifyToken: `table-${id.padEnd(32, "0")}`,
    createdAt: 0,
    ...extra,
  });
}

/** A ctx whose scheduler records what it's asked to run. */
function as(data: Record<string, Row[]>, viewer: string | null) {
  return recording(makeCtx(data, viewer));
}
function recording(ctx: any) {
  ctx.scheduled = [] as { name: string; args: any }[];
  ctx.scheduler = {
    runAfter: async (_ms: number, fn: unknown, args: any) => {
      ctx.scheduled.push({ name: getFunctionName(fn as any), args });
    },
  };
  return ctx;
}
/** The same database (and id counter), seen by someone else, with a fresh
 * record of scheduled work. */
function then(ctx: any, viewer: string | null) {
  return recording({
    ...ctx,
    auth: {
      getUserIdentity: async () =>
        viewer ? { subject: `${viewer}|session` } : null,
    },
  });
}
const emails = (ctx: any) =>
  ctx.scheduled.filter((s: any) => s.name === "emails:sendNotificationEmail");
const to = (ctx: any) => emails(ctx).map((s: any) => s.args.to).sort();

const nextDate = {
  title: "Second gathering",
  datetime: NOW + 9 * DAY,
  endTime: NOW + 9 * DAY + 90 * 60_000,
  location: "Pasadena studio",
  locationType: "venue",
};

async function reason(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (error) {
    return (error as { data?: { reason?: string } }).data?.reason;
  }
  throw new Error("expected a refusal");
}

describe("Add a date to any Table", () => {
  it("a paying host adds a date to a one-time Table: it becomes a series and nobody re-joins", async () => {
    const data = world();
    hostPays(data);
    const ctx = as(data, HOST);
    const before = ctx.store.tableMemberships.map((m: Row) => ({ ...m }));
    const result = await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate });
    expect(result.scheduleType).toBe("series");
    expect(ctx.store.gardenTables[0].scheduleType).toBe("series");
    expect(ctx.store.events.filter((e: Row) => e.tableId === TABLE)).toHaveLength(2);
    expect(ctx.store.tableMemberships).toEqual(before);
    expect(ctx.store.tableMembershipHistory).toEqual([]);
  });

  it("names the membership without a leading 'The'", () => {
    expect(membershipName("The Garden")).toBe("Garden");
    expect(membershipName("the garden")).toBe("garden");
    expect(membershipName("Creative Exchange")).toBe("Creative Exchange");
    expect(membershipName("Theater Club")).toBe("Theater Club");
  });

  it("a host without paid membership is told why in plain words", async () => {
    const ctx = as(world(), HOST);
    expect(
      await reason(run(addTableEvent, ctx, { tableId: TABLE, event: nextDate })),
    ).toBe("Adding more dates takes Garden membership.");
    expect(ctx.store.events).toHaveLength(1);
    expect(ctx.store.gardenTables[0].scheduleType).toBe("one_time");
  });

  it("a Table with no community can't grow, and says so", async () => {
    const data = world();
    hostPays(data);
    data.gardenTables[0].hostOrgId = undefined;
    const ctx = as(data, HOST);
    const error = await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate }).catch(
      (e: { data: unknown }) => e.data,
    );
    expect(error).toMatchObject({ code: "community_required" });
    expect((error as { reason: string }).reason).toMatch(/isn't in a community/);
  });

  it("participants and strangers can't add dates; the 24-date cap holds", async () => {
    const data = world();
    hostPays(data);
    await expect(
      run(addTableEvent, as(data, PAT), { tableId: TABLE, event: nextDate }),
    ).rejects.toThrow();
    for (let i = 0; i < 23; i++)
      data.events.push({ ...data.events[0], _id: `events:x${i}` });
    expect(
      await reason(run(addTableEvent, as(data, HOST), { tableId: TABLE, event: nextDate })),
    ).toBe("A Table can have up to 24 dates.");
  });
});

describe("Emails when a date is added", () => {
  it("goes to the people at the Table, not the host, and to guests who asked", async () => {
    const data = world();
    hostPays(data);
    guestRow(data, "yes", "yes@guest.test", { notifyNewDates: true });
    guestRow(data, "no", "no@guest.test", { notifyNewDates: false });
    guestRow(data, "stopped", "stopped@guest.test", { notifyNewDates: false, notifyStoppedAt: NOW });
    const ctx = as(data, HOST);
    await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate });
    // Pat and Lee are active; Asker is pending, Gone removed, Out left.
    expect(to(ctx)).toEqual(["lee@example.com", "pat@example.com", "yes@guest.test"]);
    const sent = emails(ctx);
    const pat = sent.find((s: any) => s.args.to === "pat@example.com").args;
    expect(pat).toMatchObject({
      subject: "Theology of Creativity has a new date",
      category: "activity",
      communityId: ORG,
      recipientUserId: PAT,
    });
    expect(pat.previewText).toBe(
      `Theology of Creativity has a new date: ${formatTableDate(nextDate.datetime)}.`,
    );
    expect(pat.ctaUrl).toMatch(/^\/events\//);
    expect(pat.unsubscribeToken).toMatch(/^[0-9a-f]{32}$/);
    const guest = sent.find((s: any) => s.args.to === "yes@guest.test").args;
    expect(guest).toMatchObject({
      ctaUrl: "/tables/theology-of-creativity",
      unsubscribeToken: "table-yes".padEnd(38, "0"),
      communityId: ORG,
    });
    expect(guest.recipientUserId).toBeUndefined();
    expect(JSON.stringify(ctx.scheduled)).not.toContain("secret-room");
  });

  it("respects a participant's email preferences", async () => {
    const data = world();
    hostPays(data);
    data.emailPreferences.push({
      _id: "emailPreferences:p",
      userId: PAT,
      activity: false,
      digest: true,
      announcements: true,
      unsubscribeToken: "f".repeat(32),
      updatedAt: 0,
    });
    const ctx = as(data, HOST);
    await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate });
    expect(to(ctx)).toEqual(["lee@example.com"]);
  });

  it("an unpaid chair at a paid Table hears nothing", async () => {
    const data = world();
    hostPays(data);
    Object.assign(data.gardenTables[0], { pricingType: "fixed", priceCents: 2000, allowsExternalGuests: false });
    data.tableMemberships[1].paymentStatus = "confirmed";
    data.tableMemberships[2].paymentStatus = "pending";
    const ctx = as(data, HOST);
    await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate });
    expect(to(ctx)).toEqual(["pat@example.com"]);
  });
});

describe("Emails when a date changes or is canceled", () => {
  const edit = (over: Record<string, unknown> = {}) => ({
    eventId: E1,
    title: "First gathering",
    description: "We read and make things.",
    datetime: NOW + 2 * DAY,
    endTime: NOW + 2 * DAY + 90 * 60_000,
    location: "Pasadena studio",
    locationType: "venue",
    tags: [],
    requiresApproval: false,
    ...over,
  });
  function withRsvps() {
    const data = world();
    // Out left the Table but still has an RSVP on this date.
    data.eventRsvps.push({ _id: "eventRsvps:out", eventId: E1, userId: OUT, name: "Out", email: "out@example.com", createdAt: 0 });
    guestRow(data, "coming", "coming@guest.test", { notifyNewDates: false });
    guestRow(data, "quiet", "quiet@guest.test", { notifyStoppedAt: NOW });
    return data;
  }

  it("a new time tells RSVPs (accounts and guests) and the people at the Table", async () => {
    const ctx = as(withRsvps(), HOST);
    const later = NOW + 3 * DAY;
    await run(updateEvent, ctx, edit({ datetime: later, endTime: later + 3_600_000 }));
    expect(to(ctx)).toEqual([
      "coming@guest.test",
      "lee@example.com",
      "out@example.com",
      "pat@example.com",
    ]);
    const lee = emails(ctx).find((s: any) => s.args.to === "lee@example.com").args;
    expect(lee.subject).toBe("New time for Theology of Creativity");
    expect(lee.previewText).toBe(
      `Theology of Creativity moved from ${formatTableDate(NOW + 2 * DAY)} to ${formatTableDate(later)}.`,
    );
    const guest = emails(ctx).find((s: any) => s.args.to === "coming@guest.test").args;
    expect(guest.ctaUrl).toBe("/tables/theology-of-creativity");
    expect(JSON.stringify(ctx.scheduled)).not.toContain("secret-room");
  });

  it("a new place says so", async () => {
    const ctx = as(withRsvps(), HOST);
    await run(updateEvent, ctx, edit({ location: "Library, room 2" }));
    const pat = emails(ctx).find((s: any) => s.args.to === "pat@example.com").args;
    expect(pat.subject).toBe("New place for Theology of Creativity");
    expect(pat.body).toContain("Library, room 2");
  });

  it("a description or title edit sends nothing", async () => {
    const ctx = as(withRsvps(), HOST);
    await run(updateEvent, ctx, edit({ title: "Renamed", description: "New words." }));
    expect(emails(ctx)).toEqual([]);
  });

  it("canceling a date tells the same people", async () => {
    const ctx = as(withRsvps(), HOST);
    await run(cancelEvent, ctx, { eventId: E1 });
    expect(to(ctx)).toEqual([
      "coming@guest.test",
      "lee@example.com",
      "out@example.com",
      "pat@example.com",
    ]);
    expect(emails(ctx)[0].args.subject).toMatch(/^Canceled: Theology of Creativity, /);
  });

  it("a past date or an ordinary Event sends nothing", async () => {
    const past = withRsvps();
    past.events[0].datetime = NOW - 2 * DAY;
    past.events[0].endTime = NOW - 2 * DAY + 3_600_000;
    const ctx = as(past, HOST);
    await run(cancelEvent, ctx, { eventId: E1 });
    expect(emails(ctx)).toEqual([]);
    const plain = withRsvps();
    plain.events[0].tableId = undefined;
    const ctx2 = as(plain, HOST);
    await run(updateEvent, ctx2, edit({ datetime: NOW + 5 * DAY, endTime: NOW + 5 * DAY + 60_000 }));
    expect(emails(ctx2)).toEqual([]);
  });
});

describe("Email when a request is accepted", () => {
  it("tells the person who asked, once", async () => {
    const data = world();
    data.gardenTables[0].access = "approval";
    const ctx = as(data, HOST);
    await run(manageEnrollment, ctx, { tableId: TABLE, userId: ASKER, decision: "accept" });
    expect(to(ctx)).toEqual(["asker@example.com"]);
    expect(emails(ctx)[0].args).toMatchObject({
      subject: "You're in: Theology of Creativity",
      ctaUrl: "/tables/theology-of-creativity",
      communityId: ORG,
    });
  });

  it("restoring a removed chair sends nothing", async () => {
    const ctx = as(world(), HOST);
    await run(manageEnrollment, ctx, { tableId: TABLE, userId: GONE, decision: "accept" });
    expect(emails(ctx)).toEqual([]);
  });
});

describe("Guest RSVP: phone and new-date opt-in", () => {
  it("stores a normalized phone and the opt-in, and only hosts read them back", async () => {
    const ctx = as(world(), null);
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: E1,
      name: "Guest Person",
      email: "Guest@Example.com",
      phone: "(619) 555-0100",
      notifyNewDates: true,
    });
    const row = ctx.store.eventRsvps[0];
    expect(row).toMatchObject({
      email: "guest@example.com",
      phone: "+16195550100",
      notifyNewDates: true,
    });
    expect(row.notifyToken).toMatch(/^table-[0-9a-f]{32}$/);

    const host = await run(getTableGuests, makeCtx(ctx.store, HOST), { tableId: TABLE });
    expect(host).toEqual([
      expect.objectContaining({
        name: "Guest Person",
        email: "guest@example.com",
        phone: "+16195550100",
        wantsNewDates: true,
      }),
    ]);
    expect(JSON.stringify(host)).not.toContain(row.notifyToken);
    await expect(run(getTableGuests, makeCtx(ctx.store, PAT), { tableId: TABLE })).rejects.toThrow();
    await expect(run(getTableGuests, makeCtx(ctx.store, null), { tableId: TABLE })).rejects.toThrow();
    for (const viewer of [null, PAT, STRANGER]) {
      const view = makeCtx(ctx.store, viewer);
      const projections = JSON.stringify([
        await run(getTable, view, { slug: "theology-of-creativity" }),
        await run(getEventRsvps, view, { eventId: E1 }),
      ]);
      expect(projections).not.toContain("5550100");
      expect(projections).not.toContain("guest@example.com");
    }
  });

  it("refuses a phone number that isn't US or Canadian, and saves nothing", async () => {
    const ctx = as(world(), null);
    expect(
      await reason(
        run(rsvpGuestToTableEvent, ctx, {
          eventId: E1,
          name: "Guest",
          email: "guest@example.com",
          phone: "+44 20 7946 0958",
          notifyNewDates: true,
        }),
      ),
    ).toBe("Enter a US or Canadian phone number, or leave it blank.");
    expect(ctx.store.eventRsvps).toEqual([]);
  });

  it("a guest who didn't opt in hears nothing about a new date", async () => {
    const data = world();
    hostPays(data);
    const guest = as(data, null);
    await run(rsvpGuestToTableEvent, guest, {
      eventId: E1,
      name: "Guest",
      email: "guest@example.com",
      notifyNewDates: false,
    });
    const ctx = then(guest, HOST);
    await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate });
    expect(to(ctx)).not.toContain("guest@example.com");
  });

  it("the stop link stops new-date email for that Table, in one click", async () => {
    const data = world();
    hostPays(data);
    const guest = as(data, null);
    await run(rsvpGuestToTableEvent, guest, {
      eventId: E1,
      name: "Guest",
      email: "guest@example.com",
      notifyNewDates: true,
    });
    const token = guest.store.eventRsvps[0].notifyToken;
    expect(await run(getGuestEmailStop, guest, { token })).toEqual({
      tableName: "Theology of Creativity",
      stopped: false,
    });
    expect(await run(unsubscribeByToken, guest, { token })).toEqual({ ok: true });
    expect(await run(getGuestEmailStop, guest, { token })).toMatchObject({ stopped: true });
    // Nothing else is changed by a guest token: no preferences row appears.
    expect(guest.store.emailPreferences).toEqual([]);
    const ctx = then(guest, HOST);
    await run(addTableEvent, ctx, { tableId: TABLE, event: nextDate });
    expect(to(ctx)).not.toContain("guest@example.com");
    // Saying yes again on a later RSVP turns it back on.
    const again = then(ctx, null);
    const second = ctx.store.events.find((e: Row) => e._id !== E1)._id;
    await run(rsvpGuestToTableEvent, again, {
      eventId: second,
      name: "Guest",
      email: "guest@example.com",
      notifyNewDates: true,
    });
    expect(again.store.eventRsvps.every((r: Row) => !r.notifyStoppedAt && r.notifyNewDates)).toBe(true);
  });

  it("an unknown or account token stops nothing", async () => {
    const ctx = as(world(), null);
    expect(await run(unsubscribeByToken, ctx, { token: "table-" + "0".repeat(32) })).toEqual({ ok: false });
    expect(await run(getGuestEmailStop, ctx, { token: "a".repeat(32) })).toBeNull();
  });
});

describe("Run it again", () => {
  function pastTable() {
    const data = world();
    data.events[0].datetime = NOW - 7 * DAY;
    data.events[0].endTime = NOW - 7 * DAY + 3_600_000;
    return data;
  }
  const first = {
    title: "Theology of Creativity",
    datetime: NOW + 14 * DAY,
    endTime: NOW + 14 * DAY + 90 * 60_000,
    location: "Pasadena studio",
    locationType: "venue",
  };

  it("copies the Table's details into a new Table with the date the host picked", async () => {
    const data = pastTable();
    data.gardenTables[0].access = "open";
    const ctx = as(data, HOST);
    const result = await run(runTableAgain, ctx, { tableId: TABLE, event: first });
    const fresh = ctx.store.gardenTables.find((t: Row) => t._id === result.tableId);
    expect(fresh).toMatchObject({
      name: "Theology of Creativity",
      slug: "theology-of-creativity-2",
      description: "We read and make things.",
      photoUrl: "https://images.example/table.png",
      hostOrgId: ORG,
      hostUserId: HOST,
      access: "open",
      allowsExternalGuests: true,
      capacity: 20,
      pricingType: "free",
      priceCents: 0,
      membershipRequired: false,
      scheduleType: "one_time",
      previousTableId: TABLE,
    });
    expect(fresh.meetingUrl).toBeUndefined();
    const dates = ctx.store.events.filter((e: Row) => e.tableId === result.tableId);
    expect(dates).toHaveLength(1);
    expect(dates[0]).toMatchObject({ datetime: first.datetime, location: "Pasadena studio" });
  });

  it("invites active and former participants, attendees and opted-in guests, once each; never removed people", async () => {
    const data = pastTable();
    // Gone (removed) attended once and also left a guest RSVP: still out.
    data.tableAttendance.push(
      { _id: "tableAttendance:g", tableId: TABLE, eventId: E1, userId: GONE, status: "attended", recordedByUserId: HOST, recordedAt: 0 },
      { _id: "tableAttendance:p", tableId: TABLE, eventId: E1, userId: PAT, status: "attended", recordedByUserId: HOST, recordedAt: 0 },
      // A stranger who came without a chair, recorded by the host.
      { _id: "tableAttendance:s", tableId: TABLE, eventId: E1, userId: STRANGER, status: "attended", recordedByUserId: HOST, recordedAt: 0 },
    );
    guestRow(data, "gone", "gone@example.com", { notifyNewDates: true });
    // Lee also left a guest RSVP under the account's address.
    guestRow(data, "lee", "lee@example.com", { notifyNewDates: true });
    guestRow(data, "yes", "yes@guest.test", { notifyNewDates: true });
    guestRow(data, "no", "no@guest.test", { notifyNewDates: false });
    guestRow(data, "stopped", "stopped@guest.test", { notifyNewDates: true, notifyStoppedAt: NOW });
    const ctx = as(data, HOST);
    const result = await run(runTableAgain, ctx, { tableId: TABLE, event: first });
    expect(to(ctx)).toEqual([
      "lee@example.com",
      "out@example.com",
      "pat@example.com",
      "stranger@example.com",
      "yes@guest.test",
    ]);
    expect(result.invited).toBe(5);
    const invite = emails(ctx).find((s: any) => s.args.to === "out@example.com").args;
    expect(invite).toMatchObject({
      subject: "Theology of Creativity is happening again",
      ctaUrl: `/tables/${result.slug}`,
      communityId: ORG,
    });
    // Invited, not enrolled: only the host holds a chair at the new Table.
    expect(
      ctx.store.tableMemberships
        .filter((m: Row) => m.tableId === result.tableId)
        .map((m: Row) => m.userId),
    ).toEqual([HOST]);
  });

  it("follows createTable's rules: a paid Table still takes membership", async () => {
    const data = pastTable();
    Object.assign(data.gardenTables[0], { pricingType: "fixed", priceCents: 2500, allowsExternalGuests: false });
    const ctx = as(data, HOST);
    await expect(run(runTableAgain, ctx, { tableId: TABLE, event: first })).rejects.toThrow();
    expect(ctx.store.gardenTables).toHaveLength(1);
    expect(emails(ctx)).toEqual([]);
    hostPays(data);
    const paid = as(data, HOST);
    const result = await run(runTableAgain, paid, { tableId: TABLE, event: first });
    expect(paid.store.gardenTables.find((t: Row) => t._id === result.tableId)).toMatchObject({
      pricingType: "fixed",
      priceCents: 2500,
    });
  });

  it("only a host can run it again, and not while the Table is paused", async () => {
    const data = pastTable();
    await expect(run(runTableAgain, as(data, PAT), { tableId: TABLE, event: first })).rejects.toThrow();
    data.gardenTables[0].pausedAt = NOW;
    await expect(run(runTableAgain, as(data, HOST), { tableId: TABLE, event: first })).rejects.toThrow();
  });

  it("an invitation-only Table can't run again: the emailed link would lead nowhere", async () => {
    const data = pastTable();
    Object.assign(data.gardenTables[0], { access: "invite", visibility: "unlisted", allowsExternalGuests: false });
    const ctx = as(data, HOST);
    expect(await reason(run(runTableAgain, ctx, { tableId: TABLE, event: first }))).toBe(
      "Run it again works for open Tables and Tables you approve.",
    );
    expect(emails(ctx)).toEqual([]);
  });

  it("an approval Table runs again as an approval Table: invitees still ask the host", async () => {
    const data = pastTable();
    Object.assign(data.gardenTables[0], { access: "approval", allowsExternalGuests: false });
    const ctx = as(data, HOST);
    const result = await run(runTableAgain, ctx, { tableId: TABLE, event: first });
    expect(ctx.store.gardenTables.find((t: Row) => t._id === result.tableId).access).toBe("approval");
    const pat = then(ctx, PAT);
    expect(await run(getTable, pat, { slug: result.slug })).toMatchObject({
      viewer: { action: "request", isMember: false },
    });
  });
});
