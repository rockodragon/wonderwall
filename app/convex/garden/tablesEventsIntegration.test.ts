import { describe, expect, it } from "vitest";
import { joinTable, getTable } from "./tables";
import { getEventForTicketCheckout, apply, getAttendees } from "../events";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { canSeeEvent, eventVisibilityChecker } from "./eventVisibility";
import {
  rsvpToEvent,
  rsvpGuestToTableEvent,
  getEventRsvps,
} from "./eventRsvps";
import {
  get as getVideo,
  getPublicJoinTarget,
  publicJoinTarget,
} from "../eventVideo";

const HOST = "users:host",
  USER = "users:participant",
  OTHER = "users:other";
const TABLE = "gardenTables:table",
  EVENT = "events:event",
  ORG = "hostOrgs:community";
function world(): Record<string, Row[]> {
  return {
    users: [
      { _id: HOST, email: "host@example.com", name: "Host" },
      { _id: USER, email: "participant@example.com", name: "Participant" },
      { _id: OTHER, email: "other@example.com", name: "Other" },
    ],
    profiles: [
      { _id: "profiles:h", userId: HOST, name: "Host" },
      { _id: "profiles:p", userId: USER, name: "Participant" },
      { _id: "profiles:o", userId: OTHER, name: "Other" },
    ],
    hostOrgs: [
      {
        _id: ORG,
        kind: "community",
        status: "active",
        name: "Creative Exchange",
        slug: "the-garden",
      },
    ],
    gardenTables: [
      {
        _id: TABLE,
        hostOrgId: ORG,
        hostUserId: HOST,
        name: "A Table",
        slug: "a-table",
        mode: "open",
        pricingType: "free",
        membershipRequired: false,
        access: "open",
        visibility: "public",
        allowsExternalGuests: true,
        status: "active",
        createdAt: 0,
      },
    ],
    events: [
      {
        _id: EVENT,
        tableId: TABLE,
        hostOrgId: ORG,
        organizerId: HOST,
        title: "An Event",
        datetime: Date.now() + 3600000,
        status: "published",
        accessType: "public",
        hasVideo: true,
      },
    ],
    eventVideo: [
      {
        _id: "eventVideo:v",
        eventId: EVENT,
        meetingUrl: "https://private.example/room",
        recordingUrl: "https://private.example/recording",
      },
    ],
    tableMemberships: [],
    tableCheckoutHolds: [],
    eventRsvps: [],
    communityMembers: [],
    memberships: [],
    projects: [],
    eventApplications: [],
  };
}
function member(
  data: Record<string, Row[]>,
  extra: Record<string, unknown> = {},
) {
  data.tableMemberships.push({
    _id: "tableMemberships:m",
    tableId: TABLE,
    userId: USER,
    joinedAt: 0,
    status: "active",
    ...extra,
  });
}

describe("Table parent policy applies to existing Event endpoints", () => {
  it.each(["unlisted", "missing", "hidden"])(
    "Event visibility follows %s parent Table",
    async (kind) => {
      const data = world();
      if (kind === "unlisted") data.gardenTables[0].visibility = "unlisted";
      if (kind === "missing") data.gardenTables = [];
      if (kind === "hidden") data.hostOrgs[0].name = "_TeamTest";
      const ctx = makeCtx(data, OTHER);
      expect(await canSeeEvent(ctx, data.events[0] as any, OTHER as any)).toBe(
        false,
      );
      expect(await eventVisibilityChecker(ctx)(data.events[0] as any)).toBe(
        false,
      );
      await expect(run(rsvpToEvent, ctx, { eventId: EVENT })).rejects.toThrow();
    },
  );
  it.each(["unenrolled", "pending_payment", "removed"])(
    "account RSVP rejects %s participant",
    async (kind) => {
      const data = world();
      if (kind === "pending_payment") {
        Object.assign(data.gardenTables[0], {
          pricingType: "fixed",
          priceCents: 2000,
        });
        member(data, { paymentStatus: "pending" });
      }
      if (kind === "removed") member(data, { status: "removed" });
      const ctx = makeCtx(data, USER);
      await expect(run(rsvpToEvent, ctx, { eventId: EVENT })).rejects.toThrow();
      expect(ctx.store.eventRsvps).toHaveLength(0);
    },
  );
  it("active enrollment grants account RSVP without creating attendance", async () => {
    const data = world();
    member(data);
    const ctx = makeCtx(data, USER);
    expect(
      await run(rsvpToEvent, ctx, {
        eventId: EVENT,
        email: "somebodyelse@example.com",
      }),
    ).toMatchObject({ ok: true });
    expect(ctx.store.eventRsvps[0]).toMatchObject({
      userId: USER,
      email: "participant@example.com",
    });
    expect(ctx.store.tableAttendance ?? []).toEqual([]);
  });
  it("RSVP list hides identities and contact details until enrolled; hosts retain management", async () => {
    const data = world();
    data.eventRsvps.push({
      _id: "eventRsvps:r",
      eventId: EVENT,
      userId: USER,
      name: "Participant Person",
      email: "participant@example.com",
      createdAt: 0,
    });
    expect(
      await run(getEventRsvps, makeCtx(data, null), { eventId: EVENT }),
    ).toEqual({ count: 1, names: [] });
    expect(
      await run(getEventRsvps, makeCtx(data, OTHER), { eventId: EVENT }),
    ).toEqual({ count: 1, names: [] });
    member(data);
    expect(
      await run(getEventRsvps, makeCtx(data, USER), { eventId: EVENT }),
    ).toEqual({ count: 1, names: ["Participant"] });
    expect(
      (await run(getEventRsvps, makeCtx(data, HOST), { eventId: EVENT }))
        .rsvps[0].email,
    ).toBe("participant@example.com");
  });
  it("guest RSVPs dedupe email but never grant Table enrollment or identities", async () => {
    const ctx = makeCtx(world(), null);
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: EVENT,
      name: "Guest Person",
      email: " Guest@Example.com ",
    });
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: EVENT,
      name: "Guest Updated",
      email: "guest@example.com",
    });
    expect(ctx.store.eventRsvps).toHaveLength(1);
    expect(ctx.store.eventRsvps[0].userId).toBeUndefined();
    expect(ctx.store.tableMemberships).toHaveLength(0);
    expect(await run(getEventRsvps, ctx, { eventId: EVENT })).toEqual({
      count: 1,
      names: [],
    });
  });
  it.each([
    { allowsExternalGuests: false },
    { membershipRequired: true },
    { access: "approval" },
    { pricingType: "fixed", priceCents: 1000 },
    { enrollmentClosed: true },
    { visibility: "unlisted" },
  ])("guest RSVP enforces configured eligibility %j", async (policy) => {
    const data = world();
    Object.assign(data.gardenTables[0], policy);
    await expect(
      run(rsvpGuestToTableEvent, makeCtx(data, null), {
        eventId: EVENT,
        name: "Guest",
        email: "guest@example.com",
      }),
    ).rejects.toThrow();
  });
  it("guest cannot overwrite account-backed RSVP names or ownership", async () => {
    const data = world();
    data.eventRsvps.push({
      _id: "eventRsvps:r",
      eventId: EVENT,
      userId: USER,
      name: "Real Participant",
      email: "participant@example.com",
      createdAt: 0,
    });
    const ctx = makeCtx(data, null);
    await expect(
      run(rsvpGuestToTableEvent, ctx, {
        eventId: EVENT,
        name: "Spoof",
        email: "PARTICIPANT@EXAMPLE.COM",
      }),
    ).rejects.toThrow();
    expect(ctx.store.eventRsvps[0]).toMatchObject({
      name: "Real Participant",
      userId: USER,
    });
  });
  it("guest RSVP observes capacity without bypassing own repeat update", async () => {
    const data = world();
    data.gardenTables[0].capacity = 1;
    const ctx = makeCtx(data, null);
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: EVENT,
      name: "First",
      email: "first@example.com",
    });
    await expect(
      run(rsvpGuestToTableEvent, ctx, {
        eventId: EVENT,
        name: "Second",
        email: "second@example.com",
      }),
    ).rejects.toThrow();
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: EVENT,
      name: "First Updated",
      email: "first@example.com",
    });
    expect(ctx.store.eventRsvps).toHaveLength(1);
  });
  it("legacy Event ticket checkout refuses parent Table pricing even for enrolled users", async () => {
    const data = world();
    member(data);
    data.events[0].ticketTiers = [{ name: "General", priceCents: 1000 }];
    expect(
      await run(getEventForTicketCheckout, makeCtx(data, USER), {
        eventId: EVENT,
        tierName: "General",
      }),
    ).toBeNull();
  });
  it.each(["unenrolled", "paid_pending", "removed"])(
    "Event application rejects %s",
    async (kind) => {
      const data = world();
      if (kind === "paid_pending") {
        Object.assign(data.gardenTables[0], {
          pricingType: "fixed",
          priceCents: 1000,
        });
        member(data, { paymentStatus: "pending" });
      }
      if (kind === "removed") member(data, { status: "removed" });
      const ctx = makeCtx(data, USER);
      await expect(
        run(apply, ctx, { eventId: EVENT, message: "Let me in" }),
      ).rejects.toThrow();
      expect(ctx.store.eventApplications).toHaveLength(0);
    },
  );
  it("Event attendees hide identities from outsiders and application messages from accepted peers", async () => {
    const data = world();
    data.eventApplications.push({
      _id: "eventApplications:a",
      eventId: EVENT,
      applicantId: USER,
      status: "accepted",
      message: "Private application note",
      createdAt: 0,
    });
    data.eventRsvps.push({
      _id: "eventRsvps:r",
      eventId: EVENT,
      userId: USER,
      name: "Participant",
      email: "participant@example.com",
      createdAt: 0,
    });
    expect(
      await run(getAttendees, makeCtx(data, null), { eventId: EVENT }),
    ).toEqual([]);
    expect(
      await run(getAttendees, makeCtx(data, OTHER), { eventId: EVENT }),
    ).toEqual([]);
    member(data);
    const participant = await run(getAttendees, makeCtx(data, USER), {
      eventId: EVENT,
    });
    expect(participant).toHaveLength(1);
    expect(participant[0].message).toBeNull();
    expect(JSON.stringify(participant)).not.toContain(
      "participant@example.com",
    );
    const host = await run(getAttendees, makeCtx(data, HOST), {
      eventId: EVENT,
    });
    expect(host[0].message).toBe("Private application note");
  });
  it("guests filling every chair block later account enrollment and RSVP", async () => {
    const data = world();
    data.gardenTables[0].capacity = 2;
    const ctx = makeCtx(data, null);
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: EVENT,
      name: "Guest one",
      email: "one@example.com",
    });
    await run(rsvpGuestToTableEvent, ctx, {
      eventId: EVENT,
      name: "Guest two",
      email: "two@example.com",
    });
    const account = {
      ...ctx,
      auth: { getUserIdentity: async () => ({ subject: `${USER}|session` }) },
    };
    await expect(run(joinTable, account, { tableId: TABLE })).rejects.toThrow();
    await expect(
      run(rsvpToEvent, account, { eventId: EVENT }),
    ).rejects.toThrow();
    expect(
      (await run(getTable, account, { slug: "a-table" })).spotsRemaining,
    ).toBe(0);
    expect(ctx.store.tableMemberships).toHaveLength(0);
  });
  it("Table enrollment reserves chairs before RSVP and blocks new guests", async () => {
    const data = world();
    data.gardenTables[0].capacity = 1;
    const ctx = makeCtx(data, USER);
    await run(joinTable, ctx, { tableId: TABLE });
    expect(ctx.store.eventRsvps).toHaveLength(0);
    const guest = { ...ctx, auth: { getUserIdentity: async () => null } };
    await expect(
      run(rsvpGuestToTableEvent, guest, {
        eventId: EVENT,
        name: "Guest",
        email: "guest@example.com",
      }),
    ).rejects.toThrow();
    await run(rsvpToEvent, ctx, { eventId: EVENT });
    expect(ctx.store.eventRsvps).toHaveLength(1);
  });
  it.each(["guest_first", "member_first"])(
    "the last chair cannot oversell for sequential %s",
    async (order) => {
      const data = world();
      data.gardenTables[0].capacity = 1;
      const ctx = makeCtx(data, USER);
      const guest = { ...ctx, auth: { getUserIdentity: async () => null } };
      if (order === "guest_first") {
        await run(rsvpGuestToTableEvent, guest, {
          eventId: EVENT,
          name: "Guest",
          email: "guest@example.com",
        });
        await expect(run(joinTable, ctx, { tableId: TABLE })).rejects.toThrow();
        await run(rsvpGuestToTableEvent, guest, {
          eventId: EVENT,
          name: "Guest updated",
          email: "guest@example.com",
        });
        expect(ctx.store.eventRsvps).toHaveLength(1);
      } else {
        await run(joinTable, ctx, { tableId: TABLE });
        await expect(
          run(rsvpGuestToTableEvent, guest, {
            eventId: EVENT,
            name: "Guest",
            email: "guest@example.com",
          }),
        ).rejects.toThrow();
        expect(ctx.store.tableMemberships).toHaveLength(1);
      }
    },
  );
  it("series capacity takes busiest future guest count rather than summing dates or reserving past guests", async () => {
    const data = world();
    data.gardenTables[0].capacity = 3;
    data.gardenTables[0].scheduleType = "series";
    data.events.push(
      {
        ...data.events[0],
        _id: "events:second",
        datetime: Date.now() + 7200000,
      },
      { ...data.events[0], _id: "events:past", datetime: Date.now() - 7200000 },
      {
        ...data.events[0],
        _id: "events:cancelled",
        status: "cancelled",
        datetime: Date.now() + 7200000,
      },
    );
    data.eventRsvps.push(
      {
        _id: "eventRsvps:a",
        eventId: EVENT,
        email: "one@example.com",
        name: "One",
      },
      {
        _id: "eventRsvps:b",
        eventId: "events:second",
        email: "two@example.com",
        name: "Two",
        ticketCount: 2,
      },
      {
        _id: "eventRsvps:c",
        eventId: "events:past",
        email: "past@example.com",
        name: "Past",
        ticketCount: 10,
      },
      {
        _id: "eventRsvps:d",
        eventId: "events:cancelled",
        email: "cancelled@example.com",
        name: "Cancelled",
        ticketCount: 10,
      },
    );
    const ctx = makeCtx(data, USER);
    expect((await run(getTable, ctx, { slug: "a-table" })).spotsRemaining).toBe(
      1,
    );
    await run(joinTable, ctx, { tableId: TABLE });
    expect((await run(getTable, ctx, { slug: "a-table" })).spotsRemaining).toBe(
      0,
    );
  });
  it.each(["anonymous", "unenrolled", "paid_pending", "removed"])(
    "private video never reveals URLs to %s",
    async (kind) => {
      const data = world();
      if (kind === "paid_pending") {
        Object.assign(data.gardenTables[0], {
          pricingType: "fixed",
          priceCents: 1000,
        });
        member(data, { paymentStatus: "pending" });
      }
      if (kind === "removed") member(data, { status: "removed" });
      const video = await run(
        getVideo,
        makeCtx(data, kind === "anonymous" ? null : USER),
        { eventId: EVENT },
      );
      expect(video).toMatchObject({ role: "none" });
      expect(video.meetingUrl).toBeUndefined();
      expect(video.recordingUrl).toBeUndefined();
    },
  );
  it("accepted free participant can read private room, and /j proxy stays closed", async () => {
    const data = world();
    member(data);
    const ctx = makeCtx(data, USER);
    expect(await run(getVideo, ctx, { eventId: EVENT })).toMatchObject({
      role: "entitled",
      meetingUrl: "https://private.example/room",
    });
    expect(await run(getPublicJoinTarget, ctx, { eventId: EVENT })).toBeNull();
    expect(
      publicJoinTarget(
        { status: "published", accessType: "public", tableId: TABLE },
        { meetingUrl: "https://private.example/room" },
      ),
    ).toBeNull();
  });
});
