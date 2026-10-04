import { describe, expect, it } from "vitest";
import { joinTable, getTable, manageEnrollment } from "./tables";
import {
  getEventForTicketCheckout,
  apply,
  getAttendees,
  get as getEvent,
  update as updateEvent,
} from "../events";
import { applyApStripeEvent } from "./apGifts";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { canSeeEvent, eventVisibilityChecker } from "./eventVisibility";
import {
  rsvpToEvent,
  rsvpGuestToTableEvent,
  getEventRsvps,
  claimTicketBySession,
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
  it("a guest RSVP is checked against its own Event, not the series' busiest Event", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], { capacity: 3, scheduleType: "series" });
    const SECOND_EVENT = "events:second";
    data.events.push({
      ...data.events[0],
      _id: SECOND_EVENT,
      datetime: Date.now() + 7200000,
    });
    for (const n of [1, 2, 3])
      data.eventRsvps.push({
        _id: `eventRsvps:a${n}`,
        eventId: EVENT,
        email: `a${n}@example.com`,
        name: `Guest ${n}`,
        createdAt: 0,
      });
    const guest = makeCtx(data, null);
    await expect(
      run(rsvpGuestToTableEvent, guest, {
        eventId: EVENT,
        name: "Late",
        email: "late@example.com",
      }),
    ).rejects.toThrow();
    await run(rsvpGuestToTableEvent, guest, {
      eventId: SECOND_EVENT,
      name: "Second-date guest",
      email: "b1@example.com",
    });
    expect(
      guest.store.eventRsvps.filter((r: Row) => r.eventId === SECOND_EVENT),
    ).toHaveLength(1);
    // Persistent enrollment keeps the aggregate rule: the full first Event
    // still leaves no chair for someone joining every date.
    const account = {
      ...guest,
      auth: { getUserIdentity: async () => ({ subject: `${USER}|session` }) },
    };
    await expect(run(joinTable, account, { tableId: TABLE })).rejects.toThrow();
    expect(guest.store.tableMemberships).toHaveLength(0);
  });
  it("enrollments and live holds take a chair on every Event before its guests", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], { capacity: 3, scheduleType: "series" });
    member(data);
    data.tableCheckoutHolds.push({
      _id: "tableCheckoutHolds:h",
      tableId: TABLE,
      userId: OTHER,
      status: "pending",
      expiresAt: Date.now() + 60000,
    });
    const SECOND_EVENT = "events:second";
    data.events.push({
      ...data.events[0],
      _id: SECOND_EVENT,
      datetime: Date.now() + 7200000,
    });
    const guest = makeCtx(data, null);
    await run(rsvpGuestToTableEvent, guest, {
      eventId: SECOND_EVENT,
      name: "One",
      email: "one@example.com",
    });
    await expect(
      run(rsvpGuestToTableEvent, guest, {
        eventId: SECOND_EVENT,
        name: "Two",
        email: "two@example.com",
      }),
    ).rejects.toThrow();
    // The first Event's guests are counted on their own.
    await run(rsvpGuestToTableEvent, guest, {
      eventId: EVENT,
      name: "First-date guest",
      email: "first@example.com",
    });
    expect(guest.store.eventRsvps).toHaveLength(2);
  });
  it("an accepted participant of an approval Table joins its Event without a second approval", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      access: "approval",
      allowsExternalGuests: false,
    });
    // Older Table Events copied the Table's approval onto the Event.
    data.events[0].requiresApproval = true;
    const participant = makeCtx(data, USER);
    await run(joinTable, participant, { tableId: TABLE });
    // A pending request still can't get in through the Event.
    await expect(
      run(apply, participant, { eventId: EVENT, message: "Let me in" }),
    ).rejects.toThrow();
    const host = makeCtx(participant.store, HOST);
    await run(manageEnrollment, host, {
      tableId: TABLE,
      userId: USER,
      decision: "accept",
    });
    const accepted = makeCtx(host.store, USER);
    expect(
      (await run(getEvent, accepted, { eventId: EVENT })).applyNeedsApproval,
    ).toBe(false);
    await run(apply, accepted, { eventId: EVENT });
    expect(accepted.store.eventApplications).toHaveLength(1);
    expect(accepted.store.eventApplications[0]).toMatchObject({
      applicantId: USER,
      status: "accepted",
    });
    // A stranger still sees the Event's flag, and still can't apply.
    const stranger = makeCtx(accepted.store, OTHER);
    expect(
      (await run(getEvent, stranger, { eventId: EVENT })).applyNeedsApproval,
    ).toBe(true);
    await expect(run(apply, stranger, { eventId: EVENT })).rejects.toThrow();
    expect(stranger.store.eventApplications).toHaveLength(1);
  });
  it("a Table's Event can't be given its own ticket link; a link it already had stays as it was", async () => {
    const LINK = "https://buy.stripe.com/test_tablelink";
    const save = (extra: Record<string, unknown> = {}) => ({
      eventId: EVENT,
      title: "An Event",
      description: "",
      datetime: Date.now() + 3600000,
      tags: [],
      requiresApproval: false,
      ...extra,
    });
    const host = makeCtx(world(), HOST);
    const tableEvent = () =>
      host.store.events.find((e: Row) => e._id === EVENT);
    await expect(
      run(updateEvent, host, save({ externalTicketUrl: LINK, externalTicketPriceCents: 2000 })),
    ).rejects.toThrow("A Table's dates don't sell their own tickets");
    expect(tableEvent().externalTicketUrl).toBeUndefined();
    // Other edits still save.
    await run(updateEvent, host, save({ title: "Renamed" }));
    expect(tableEvent().title).toBe("Renamed");
    // A link from before the rule isn't rewritten by an edit, and an older
    // edit form sending it back unchanged still saves...
    Object.assign(tableEvent(), {
      externalTicketUrl: LINK,
      externalTicketPriceCents: 2000,
    });
    await run(updateEvent, host, save());
    await run(
      updateEvent,
      host,
      save({ externalTicketUrl: LINK, externalTicketPriceCents: 2000 }),
    );
    expect(tableEvent()).toMatchObject({
      externalTicketUrl: LINK,
      externalTicketPriceCents: 2000,
    });
    // ...but it can't be swapped for another link.
    await expect(
      run(updateEvent, host, save({ externalTicketUrl: "https://buy.stripe.com/test_another" })),
    ).rejects.toThrow("A Table's dates don't sell their own tickets");
    expect(tableEvent().externalTicketUrl).toBe(LINK);
    // A standalone Event still sells through its link.
    host.store.events.push({
      _id: "events:standalone",
      organizerId: HOST,
      title: "Standalone",
      datetime: Date.now() + 3600000,
      status: "published",
      tags: [],
      requiresApproval: false,
    });
    await run(
      updateEvent,
      host,
      save({ eventId: "events:standalone", externalTicketUrl: LINK, externalTicketPriceCents: 2000 }),
    );
    expect(
      host.store.events.find((e: Row) => e._id === "events:standalone"),
    ).toMatchObject({ externalTicketUrl: LINK, externalTicketPriceCents: 2000 });
  });
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

describe("AP ticket webhook follows Table rules and trusted identity", () => {
  /** Real Convex ids have no ":" and a ticket ref carries them bare; the
   * harness's ids do, so the ref carries the part after it. */
  function webhookCtx(data: Record<string, Row[]>) {
    data.hostOrgs.push({
      _id: "hostOrgs:ap",
      kind: "fund",
      status: "active",
      name: "Abiding Practice",
      slug: "abiding-practice",
    });
    const ctx = makeCtx(data, null);
    const normalize = ctx.db.normalizeId;
    ctx.db.normalizeId = (table: string, id: string) =>
      normalize(table, `${table}:${id}`);
    return ctx;
  }
  let session = 0;
  function paidTicket(ref: string, email: string, amountTotal = 2000) {
    return {
      event: {
        id: `evt_${++session}`,
        type: "checkout.session.completed",
        data: {
          object: {
            // isCheckoutSessionId wants at least 10 characters after cs_test_.
            id: `cs_test_ticketsession${session}`,
            payment_status: "paid",
            currency: "usd",
            amount_total: amountTotal,
            client_reference_id: ref,
            customer_details: { name: "Ticket Buyer", email },
            created: 1_800_000_000,
          },
        },
      },
    };
  }
  const verified = (data: Record<string, Row[]>, id: string) =>
    Object.assign(data.users.find((u) => u._id === id)!, {
      emailVerificationTime: 1,
    });

  it("a closed paid Table without guests gets no RSVP from a forged ref; the payment is flagged for refund", async () => {
    const data = world();
    Object.assign(data.gardenTables[0], {
      pricingType: "fixed",
      priceCents: 2000,
      enrollmentClosed: true,
      allowsExternalGuests: false,
    });
    verified(data, OTHER);
    const ctx = webhookCtx(data);
    const forged = paidTicket("evt-event-u-other", "buyer@example.com");
    await run(applyApStripeEvent, ctx, forged);
    await run(applyApStripeEvent, ctx, forged); // Stripe replay
    expect(ctx.store.eventRsvps).toHaveLength(0);
    expect(ctx.store.grantContributions ?? []).toHaveLength(0);
    expect(ctx.store.tableMemberships).toHaveLength(0);
    expect(ctx.store.externalTicketExceptions).toHaveLength(1);
    expect(ctx.store.externalTicketExceptions[0]).toMatchObject({
      eventId: EVENT,
      tableId: TABLE,
      grossCents: 2000,
      reason: "guests_not_allowed",
      status: "refund_required",
    });
  });

  it("a standalone Event's ticket goes on an account only when Stripe's email is that account's verified email", async () => {
    const data = world();
    data.events.push({
      _id: "events:standalone",
      organizerId: HOST,
      title: "Standalone",
      datetime: Date.now() + 3600000,
      status: "published",
    });
    const ctx = webhookCtx(data);
    // Someone else's id in the ref, paid with another email: an email guest.
    await run(
      applyApStripeEvent,
      ctx,
      paidTicket("evt-standalone-u-other", "buyer@example.com"),
    );
    // The right email, but the account never verified it: still a guest.
    await run(
      applyApStripeEvent,
      ctx,
      paidTicket("evt-standalone-u-other", "other@example.com"),
    );
    expect(ctx.store.eventRsvps.map((r: Row) => [r.email, r.userId])).toEqual([
      ["buyer@example.com", undefined],
      ["other@example.com", undefined],
    ]);
    expect(
      ctx.store.grantContributions.every((c: Row) => c.userId === undefined),
    ).toBe(true);
    // Verified and matching: the purchase is theirs.
    verified(ctx.store, OTHER);
    await run(
      applyApStripeEvent,
      ctx,
      paidTicket("evt-standalone-u-other", "Other@Example.com"),
    );
    expect(ctx.store.eventRsvps).toHaveLength(2);
    expect(ctx.store.eventRsvps[1]).toMatchObject({
      email: "other@example.com",
      userId: OTHER,
    });
    expect(ctx.store.externalTicketExceptions ?? []).toHaveLength(0);
  });

  it("a guest Table's ticket seats a participant on their account and anyone else as a guest, within the Event's chairs", async () => {
    const data = world();
    data.gardenTables[0].capacity = 2;
    member(data);
    verified(data, USER);
    verified(data, OTHER);
    const ctx = webhookCtx(data);
    // A verified account that isn't a participant is a guest, not a member.
    await run(
      applyApStripeEvent,
      ctx,
      paidTicket("evt-event-u-other", "other@example.com"),
    );
    await run(
      applyApStripeEvent,
      ctx,
      paidTicket("evt-event-u-participant", "participant@example.com"),
    );
    expect(ctx.store.eventRsvps.map((r: Row) => [r.email, r.userId])).toEqual([
      ["other@example.com", undefined],
      ["participant@example.com", USER],
    ]);
    // One enrollment plus one guest fill both chairs.
    await run(
      applyApStripeEvent,
      ctx,
      paidTicket("evt-event", "late@example.com"),
    );
    expect(ctx.store.eventRsvps).toHaveLength(2);
    expect(ctx.store.externalTicketExceptions).toHaveLength(1);
    expect(ctx.store.externalTicketExceptions[0].reason).toBe("full");
    expect(ctx.store.grantContributions).toHaveLength(2);
  });

  it("a Table's guest ticket moves to an account by its session id only for a participant who paid with that account's verified email, for one seat", async () => {
    const data = world();
    data.events[0].externalTicketPriceCents = 2000;
    data.events.push({
      _id: "events:standalone",
      organizerId: HOST,
      title: "Standalone",
      datetime: Date.now() + 3600000,
      status: "published",
    });
    member(data);
    for (const id of [HOST, USER, OTHER]) verified(data, id);
    const webhook = webhookCtx(data);
    // All bought signed out, so each lands as a guest ticket.
    const othersTicket = paidTicket("evt-event", "other@example.com");
    const participantsTicket = paidTicket("evt-event", "participant@example.com");
    const hostsPair = paidTicket("evt-event", "host@example.com", 4000);
    const standaloneTicket = paidTicket("evt-standalone", "someone@example.com");
    for (const t of [othersTicket, participantsTicket, hostsPair, standaloneTicket])
      await run(applyApStripeEvent, webhook, t);
    expect(webhook.store.eventRsvps.map((r: Row) => [r.email, r.userId, r.ticketCount])).toEqual([
      ["other@example.com", undefined, 1],
      ["participant@example.com", undefined, 1],
      ["host@example.com", undefined, 2],
      ["someone@example.com", undefined, 1],
    ]);
    const sessionId = (t: ReturnType<typeof paidTicket>) => t.event.data.object.id;
    const claimAs = (store: Record<string, Row[]>, userId: string, t: ReturnType<typeof paidTicket>) => {
      const ctx = makeCtx(store, userId);
      return { ctx, result: run(claimTicketBySession, ctx, { sessionId: sessionId(t) }) };
    };
    const refused = "This ticket stays a guest ticket";

    // A participant holding someone else's session id: not their email.
    let claim = claimAs(webhook.store, USER, othersTicket);
    await expect(claim.result).rejects.toThrow(refused);
    // The buyer's own verified email, but not in the Table: stays a guest.
    claim = claimAs(claim.ctx.store, OTHER, othersTicket);
    await expect(claim.result).rejects.toThrow(refused);
    // The host bought two seats: an account row holds one.
    claim = claimAs(claim.ctx.store, HOST, hostsPair);
    await expect(claim.result).rejects.toThrow(refused);
    expect(claim.ctx.store.eventRsvps.every((r: Row) => r.userId === undefined)).toBe(true);
    expect(claim.ctx.store.grantContributions.every((c: Row) => c.userId === undefined)).toBe(true);

    // The participant who paid with their own verified email, one seat.
    claim = claimAs(claim.ctx.store, USER, participantsTicket);
    expect(await claim.result).toBe("claimed");
    const rsvpRef = `ap:${sessionId(participantsTicket)}`;
    expect(claim.ctx.store.eventRsvps.find((r: Row) => r.stripeRef === rsvpRef).userId).toBe(USER);
    expect(claim.ctx.store.grantContributions.find((c: Row) => c.stripeRef === rsvpRef).userId).toBe(USER);

    // A standalone Event keeps the old rule: whoever holds the session id.
    claim = claimAs(claim.ctx.store, OTHER, standaloneTicket);
    expect(await claim.result).toBe("claimed");
    expect(claim.ctx.store.eventRsvps.find((r: Row) => r.email === "someone@example.com").userId).toBe(OTHER);
  });
});
