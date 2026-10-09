import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { apply, get as getEvent, list as listEvents } from "./events";
import { eventCapacity, normalizeCapacity, waitlistOn } from "./eventSpots";
import { publicPlace, redactHiddenAddress } from "./eventAddress";
import { cancelMyRsvp, claimTicketBySession, rsvpToEvent, startPayPalTicket } from "./garden/eventRsvps";
import { admitFromWaitlist, getWaitlist, joinWaitlist, removeFromWaitlist } from "./garden/eventWaitlist";
import { applyApStripeEvent } from "./garden/apGifts";

// docs/features/event-capacity-waitlist.md: the limit, the waitlist, the
// hidden address, Can't make it — and ticket buyers joining the community.

const HOST = "users:host",
  ANA = "users:ana",
  BEA = "users:bea",
  CY = "users:cy";
const EVENT = "events:show",
  ORG = "hostOrgs:grove",
  AP = "hostOrgs:ap";
const PAYPAL = "https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS";

function world(event: Record<string, unknown> = {}): Record<string, Row[]> {
  const person = (id: string, name: string) => ({ _id: id, name, email: `${name.toLowerCase()}@example.com`, emailVerificationTime: 1 });
  return {
    users: [person(HOST, "Host"), person(ANA, "Ana"), person(BEA, "Bea"), person(CY, "Cy")],
    profiles: [
      { _id: "profiles:h", userId: HOST, name: "Host" },
      { _id: "profiles:a", userId: ANA, name: "Ana" },
      { _id: "profiles:b", userId: BEA, name: "Bea" },
      { _id: "profiles:c", userId: CY, name: "Cy" },
    ],
    hostOrgs: [
      { _id: ORG, kind: "community", status: "active", name: "The Grove", slug: "the-grove", agreements: ["Be kind."] },
      { _id: AP, kind: "org", status: "active", name: "Abiding Practice", slug: "abiding-practice" },
    ],
    events: [
      {
        _id: EVENT,
        hostOrgId: ORG,
        organizerId: HOST,
        title: "Showcase",
        description: "",
        datetime: Date.now() + 7 * 24 * 3600000,
        status: "published",
        accessType: "public",
        requiresApproval: false,
        tags: [],
        location: "12 Elm St",
        address: { street: "12 Elm St", city: "Encinitas", stateCode: "CA", zip: "92024" },
        coordinates: { lat: 33, lng: -117 },
        placeId: "place-1",
        ...event,
      },
    ],
    eventRsvps: [],
    eventApplications: [],
    eventWaitlist: [],
    ticketPurchases: [],
    communityMembers: [],
    notifications: [],
    grantContributions: [],
    memberships: [],
  };
}

function rsvpRow(userId: string, name: string, extra: Record<string, unknown> = {}): Row {
  return { _id: `eventRsvps:${name}`, eventId: EVENT, userId, name, email: `${name.toLowerCase()}@example.com`, createdAt: 1, ...extra };
}

describe("limit rules", () => {
  it("reads the form's Limit box and ignores it on a Table's event", () => {
    expect(normalizeCapacity(undefined)).toEqual({});
    expect(normalizeCapacity(0)).toEqual({});
    expect(normalizeCapacity(40)).toEqual({ capacity: 40 });
    expect(normalizeCapacity(2.5).error).toBeTruthy();
    expect(normalizeCapacity(-1).error).toBeTruthy();
    expect(eventCapacity({ capacity: 40 })).toBe(40);
    expect(eventCapacity({ capacity: 40, tableId: "gardenTables:t" as never })).toBeNull();
    expect(waitlistOn({ capacity: 40 })).toBe(true);
    expect(waitlistOn({ capacity: 40, waitlist: false })).toBe(false);
    expect(waitlistOn({})).toBe(false);
  });
});

describe("a full event", () => {
  it("refuses a new RSVP, Join and PayPal Get tickets, but not someone already going", async () => {
    const data = world({ capacity: 1, externalTicketUrl: undefined });
    data.eventRsvps.push(rsvpRow(ANA, "Ana"));
    await expect(run(rsvpToEvent, makeCtx(data, BEA), { eventId: EVENT })).rejects.toMatchObject({ data: { code: "event_full" } });
    await expect(run(apply, makeCtx(data, BEA), { eventId: EVENT })).rejects.toMatchObject({ data: { code: "event_full" } });
    // Ana pressing again is fine.
    await expect(run(rsvpToEvent, makeCtx(data, ANA), { eventId: EVENT })).resolves.toMatchObject({ ok: true });

    const paypal = world({ capacity: 1, externalTicketUrl: PAYPAL });
    paypal.eventRsvps.push(rsvpRow(ANA, "Ana"));
    await expect(run(startPayPalTicket, makeCtx(paypal, BEA), { eventId: EVENT, agreed: true })).rejects.toMatchObject({ data: { code: "event_full" } });
  });

  it("takes a waitlist, the host lets someone in, and they hear about it", async () => {
    const data = world({ capacity: 1 });
    data.eventRsvps.push(rsvpRow(ANA, "Ana"));
    const ctx = makeCtx(data, BEA);
    expect(await run(joinWaitlist, ctx, { eventId: EVENT })).toBe("waiting");
    expect(await run(joinWaitlist, ctx, { eventId: EVENT })).toBe("waiting"); // once
    expect(ctx.store.eventWaitlist).toHaveLength(1);

    // Only hosts see it.
    expect(await run(getWaitlist, makeCtx(ctx.store, BEA), { eventId: EVENT })).toEqual([]);
    const hostCtx = makeCtx(ctx.store, HOST);
    const [entry] = await run(getWaitlist, hostCtx, { eventId: EVENT });
    expect(entry).toMatchObject({ name: "Bea", email: "bea@example.com" });

    await expect(run(admitFromWaitlist, makeCtx(ctx.store, BEA), { entryId: entry._id })).rejects.toThrow();
    await run(admitFromWaitlist, hostCtx, { entryId: entry._id });
    expect(hostCtx.store.eventWaitlist).toHaveLength(0);
    expect(hostCtx.store.eventRsvps.map((r: Row) => r.userId)).toEqual([ANA, BEA]); // past the limit: host's call
    expect(hostCtx.store.notifications).toContainEqual(expect.objectContaining({ userId: BEA, type: "event_waitlist_admitted" }));
  });

  it("has no waitlist when the host turned it off, and none before it's full", async () => {
    const off = world({ capacity: 1, waitlist: false });
    off.eventRsvps.push(rsvpRow(ANA, "Ana"));
    await expect(run(joinWaitlist, makeCtx(off, BEA), { eventId: EVENT })).rejects.toMatchObject({ data: { code: "no_waitlist" } });
    await expect(run(joinWaitlist, makeCtx(world({ capacity: 5 }), BEA), { eventId: EVENT })).rejects.toMatchObject({ data: { code: "not_full" } });
  });

  it("lets a host remove someone from the waitlist", async () => {
    const data = world({ capacity: 1 });
    data.eventRsvps.push(rsvpRow(ANA, "Ana"));
    data.eventWaitlist.push({ _id: "eventWaitlist:w", eventId: EVENT, userId: BEA, name: "Bea", email: "bea@example.com", createdAt: 1 });
    const ctx = makeCtx(data, HOST);
    await run(removeFromWaitlist, ctx, { entryId: "eventWaitlist:w" });
    expect(ctx.store.eventWaitlist).toHaveLength(0);
    expect(ctx.store.eventRsvps).toHaveLength(1);
  });

  it("tells the page it's full and where the viewer stands", async () => {
    const data = world({ capacity: 1 });
    data.eventRsvps.push(rsvpRow(ANA, "Ana"));
    data.eventWaitlist.push({ _id: "eventWaitlist:w", eventId: EVENT, userId: BEA, name: "Bea", email: "bea@example.com", createdAt: 1 });
    const bea = await run(getEvent, makeCtx(data, BEA), { eventId: EVENT });
    expect(bea).toMatchObject({ capacity: 1, isFull: true, waitlistOn: true, userWaitlisted: true, userRsvp: null, waitlistCount: null });
    const ana = await run(getEvent, makeCtx(data, ANA), { eventId: EVENT });
    expect(ana.userRsvp).toEqual({ paid: false, sentToPayPal: false });
    const host = await run(getEvent, makeCtx(data, HOST), { eventId: EVENT });
    expect(host.waitlistCount).toBe(1);
  });
});

describe("hidden address", () => {
  it("redacts to the city", () => {
    const e = world({ hideAddress: true }).events[0] as never;
    expect(publicPlace(e)).toBe("Encinitas, CA");
    expect(redactHiddenAddress(e)).toMatchObject({
      location: "Encinitas, CA",
      address: { city: "Encinitas", stateCode: "CA" },
      coordinates: undefined,
      placeId: undefined,
      addressHidden: true,
    });
    expect((redactHiddenAddress(e) as { address: Record<string, unknown> }).address.street).toBeUndefined();
    // Off, or on a Table's event: untouched.
    const plain = world().events[0] as never;
    expect(redactHiddenAddress(plain)).toBe(plain);
  });

  it("shows the address to hosts and people going, the city to everyone else", async () => {
    const data = world({ hideAddress: true });
    data.eventRsvps.push(rsvpRow(ANA, "Ana"));
    const visitor = await run(getEvent, makeCtx(data, null), { eventId: EVENT });
    expect(visitor).toMatchObject({ location: "Encinitas, CA", addressHidden: true, coordinates: undefined });
    const stranger = await run(getEvent, makeCtx(data, BEA), { eventId: EVENT });
    expect(stranger.addressHidden).toBe(true);
    const going = await run(getEvent, makeCtx(data, ANA), { eventId: EVENT });
    expect(going).toMatchObject({ location: "12 Elm St", addressHidden: false });
    const host = await run(getEvent, makeCtx(data, HOST), { eventId: EVENT });
    expect(host.location).toBe("12 Elm St");
    const [card] = await run(listEvents, makeCtx(data, ANA), {});
    expect(card.location).toBe("Encinitas, CA"); // lists never carry it
  });
});

describe("Can't make it", () => {
  it("gives up a free RSVP and tells the host how many are waiting", async () => {
    const data = world({ capacity: 1 });
    data.eventRsvps.push(rsvpRow(ANA, "Ana"));
    data.eventWaitlist.push({ _id: "eventWaitlist:w", eventId: EVENT, userId: BEA, name: "Bea", email: "bea@example.com", createdAt: 1 });
    const ctx = makeCtx(data, ANA);
    expect(await run(cancelMyRsvp, ctx, { eventId: EVENT })).toEqual({ cancelled: true });
    expect(ctx.store.eventRsvps).toHaveLength(0);
    expect(ctx.store.notifications).toContainEqual(
      expect.objectContaining({ userId: HOST, type: "event_cant_make_it", message: "1 on the waitlist." }),
    );
  });

  it("keeps a paid ticket", async () => {
    const data = world();
    data.eventRsvps.push(rsvpRow(ANA, "Ana", { paidCents: 2500 }));
    await expect(run(cancelMyRsvp, makeCtx(data, ANA), { eventId: EVENT })).rejects.toMatchObject({ data: { code: "paid_ticket" } });
  });

  it("withdraws a request and leaves the waitlist quietly", async () => {
    const data = world();
    data.eventApplications.push({ _id: "eventApplications:a", eventId: EVENT, applicantId: ANA, status: "pending", createdAt: 1, updatedAt: 1 });
    data.eventWaitlist.push({ _id: "eventWaitlist:w", eventId: EVENT, userId: BEA, name: "Bea", email: "bea@example.com", createdAt: 1 });
    const a = makeCtx(data, ANA);
    await run(cancelMyRsvp, a, { eventId: EVENT });
    expect(a.store.eventApplications).toHaveLength(0);
    const b = makeCtx(a.store, BEA);
    await run(cancelMyRsvp, b, { eventId: EVENT });
    expect(b.store.eventWaitlist).toHaveLength(0);
    expect(b.store.notifications).toHaveLength(0); // neither was going
  });
});

describe("Stripe ticket buyers join the event's community", () => {
  function webhookCtx(data: Record<string, Row[]>, viewer: string | null = null) {
    const ctx = makeCtx(data, viewer);
    const normalize = ctx.db.normalizeId;
    ctx.db.normalizeId = (table: string, id: string) => normalize(table, `${table}:${id}`);
    const scheduled: unknown[] = [];
    ctx.scheduler.runAfter = async (_ms: number, _fn: unknown, args: unknown) => {
      scheduled.push(args);
    };
    return Object.assign(ctx, { scheduled });
  }
  const paid = (ref: string, email: string, id: string) => ({
    event: {
      id: `evt_${id}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${id}aaaaaaaaaa`,
          payment_status: "paid",
          currency: "usd",
          amount_total: 2500,
          client_reference_id: ref,
          customer_details: { name: "Buyer", email },
          created: 1_800_000_000,
        },
      },
    },
  });

  it("joins a signed-in buyer right away and records the money for the fund", async () => {
    const ctx = webhookCtx(world({ externalTicketUrl: "https://buy.stripe.com/test_x", externalTicketPriceCents: 2500 }));
    await run(applyApStripeEvent, ctx, paid("evt-show-u-ana", "ana@example.com", "one"));
    expect(ctx.store.communityMembers).toContainEqual(expect.objectContaining({ hostOrgId: ORG, userId: ANA, status: "active" }));
    expect(ctx.store.grantContributions).toContainEqual(expect.objectContaining({ type: "ticket_in", grossCents: 2500, userId: ANA }));
    expect(ctx.scheduled).toHaveLength(0);
  });

  it("emails a buyer with no account, and joins them when the ticket moves onto their account", async () => {
    const ctx = webhookCtx(world({ externalTicketUrl: "https://buy.stripe.com/test_x", externalTicketPriceCents: 2500 }));
    await run(applyApStripeEvent, ctx, paid("evt-show", "newperson@example.com", "two"));
    expect(ctx.store.communityMembers).toHaveLength(0);
    expect(ctx.store.eventRsvps).toContainEqual(expect.objectContaining({ email: "newperson@example.com", paidCents: 2500 }));
    expect(ctx.store.grantContributions).toContainEqual(expect.objectContaining({ type: "ticket_in", grossCents: 2500 }));
    expect(ctx.scheduled).toContainEqual(
      expect.objectContaining({ to: "newperson@example.com", ctaUrl: expect.stringContaining("session=cs_test_two") }),
    );

    // They make an account (Cy) and come back with the session.
    const claim = makeCtx(ctx.store, CY);
    expect(await run(claimTicketBySession, claim, { sessionId: "cs_test_twoaaaaaaaaaa" })).toBe("claimed");
    expect(claim.store.communityMembers).toContainEqual(expect.objectContaining({ hostOrgId: ORG, userId: CY }));
  });
});
