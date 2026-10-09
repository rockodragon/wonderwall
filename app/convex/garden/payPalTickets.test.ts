import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { getGuestList } from "../events";
import { ticketCommunityJoin, startPayPalTicket } from "./eventRsvps";
import { joinCommunity } from "./communities";

// Get tickets on an event sold through the organizer's PayPal link
// (eventRsvps.ts startPayPalTicket): the person goes on the guest list and,
// when they agreed, into the event's community; then the page sends them on.

const HOST = "users:host",
  BUYER = "users:buyer";
const EVENT = "events:workshop",
  ORG = "hostOrgs:grove";
const PAYPAL = "https://www.paypal.com/ncp/payment/BVJYP3SUBYXWS";

function world(extra: { joinPolicy?: string; event?: Record<string, unknown> } = {}): Record<string, Row[]> {
  return {
    users: [
      { _id: HOST, email: "host@example.com", name: "Host" },
      { _id: BUYER, email: "buyer@example.com", name: "Buyer" },
    ],
    profiles: [
      { _id: "profiles:h", userId: HOST, name: "Host" },
      { _id: "profiles:b", userId: BUYER, name: "New User" },
    ],
    hostOrgs: [
      {
        _id: ORG,
        kind: "community",
        status: "active",
        name: "The Grove",
        slug: "the-grove",
        agreements: ["Be kind."],
        ...(extra.joinPolicy ? { joinPolicy: extra.joinPolicy } : {}),
      },
    ],
    events: [
      {
        _id: EVENT,
        hostOrgId: ORG,
        organizerId: HOST,
        title: "The Art of Creating You",
        datetime: Date.now() + 7 * 24 * 3600000,
        status: "published",
        accessType: "public",
        requiresApproval: false,
        externalTicketUrl: PAYPAL,
        externalTicketPriceCents: 3500,
        ...extra.event,
      },
    ],
    eventRsvps: [],
    eventApplications: [],
    ticketPurchases: [],
    communityMembers: [],
    memberships: [],
  };
}

describe("startPayPalTicket", () => {
  it("puts the buyer on the list, joins the community, and hands back the PayPal link", async () => {
    const ctx = makeCtx(world(), BUYER);
    const res = await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana Buyer", agreed: true });

    expect(res).toEqual({ url: PAYPAL, community: "joined" });
    const [rsvp] = ctx.store.eventRsvps;
    expect(rsvp).toMatchObject({ eventId: EVENT, userId: BUYER, name: "Ana Buyer", email: "buyer@example.com" });
    expect(typeof rsvp.paypalOpenedAt).toBe("number");
    expect(rsvp.paidCents).toBeUndefined(); // never "paid": PayPal tells us nothing
    const [member] = ctx.store.communityMembers;
    expect(member).toMatchObject({ hostOrgId: ORG, userId: BUYER, role: "member", status: "active" });
    expect(typeof member.agreedAt).toBe("number");
  });

  it("asks to join a community whose hosts approve people", async () => {
    const ctx = makeCtx(world({ joinPolicy: "apply" }), BUYER);
    const res = await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana", agreed: true });
    expect(res.community).toBe("asked");
    expect(ctx.store.communityMembers[0].status).toBe("pending");
  });

  it("still saves the ticket when the community is invite-only, without joining", async () => {
    const ctx = makeCtx(world({ joinPolicy: "invite" }), BUYER);
    const res = await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana", agreed: true });
    expect(res).toEqual({ url: PAYPAL, community: "none" });
    expect(ctx.store.eventRsvps).toHaveLength(1);
    expect(ctx.store.communityMembers).toHaveLength(0);
  });

  it("doesn't join anyone who didn't agree", async () => {
    const ctx = makeCtx(world(), BUYER);
    const res = await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana" });
    expect(res.community).toBe("none");
    expect(ctx.store.eventRsvps).toHaveLength(1);
    expect(ctx.store.communityMembers).toHaveLength(0);
  });

  it("says so for someone already in the community", async () => {
    const data = world();
    data.communityMembers.push({
      _id: "communityMembers:m",
      hostOrgId: ORG,
      userId: BUYER,
      role: "member",
      status: "active",
      joinedAt: 0,
    });
    const ctx = makeCtx(data, BUYER);
    const res = await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana", agreed: true });
    expect(res.community).toBe("member");
    expect(ctx.store.communityMembers).toHaveLength(1);
  });

  it("pressing again keeps one row", async () => {
    const ctx = makeCtx(world(), BUYER);
    await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana", agreed: true });
    await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana", agreed: true });
    expect(ctx.store.eventRsvps).toHaveLength(1);
    expect(ctx.store.communityMembers).toHaveLength(1);
  });

  it("refuses a signed-out caller, an event that isn't on PayPal, and one that's over", async () => {
    await expect(run(startPayPalTicket, makeCtx(world(), null), { eventId: EVENT, agreed: true })).rejects.toThrow();

    const stripe = makeCtx(world({ event: { externalTicketUrl: "https://buy.stripe.com/test_abc" } }), BUYER);
    await expect(run(startPayPalTicket, stripe, { eventId: EVENT, name: "Ana", agreed: true })).rejects.toThrow();
    expect(stripe.store.eventRsvps).toHaveLength(0);

    const over = makeCtx(world({ event: { datetime: Date.now() - 2 * 24 * 3600000 } }), BUYER);
    await expect(run(startPayPalTicket, over, { eventId: EVENT, name: "Ana", agreed: true })).rejects.toThrow();
    expect(over.store.eventRsvps).toHaveLength(0);

    const cancelled = makeCtx(world({ event: { status: "cancelled" } }), BUYER);
    await expect(run(startPayPalTicket, cancelled, { eventId: EVENT, name: "Ana", agreed: true })).rejects.toThrow();
  });

  it("shows the host who left for PayPal, not as paid", async () => {
    const ctx = makeCtx(world(), BUYER);
    await run(startPayPalTicket, ctx, { eventId: EVENT, name: "Ana", agreed: true });
    const hostView = makeCtx(ctx.store, HOST);
    const [row] = await run(getGuestList, hostView, { eventId: EVENT });
    expect(row).toMatchObject({ name: "Ana", email: "buyer@example.com", sentToPayPal: true, paidCents: null });
  });
});

describe("ticketCommunityJoin", () => {
  it("names the community a ticket joins, and whether it's a request", async () => {
    expect(await run(ticketCommunityJoin, makeCtx(world(), BUYER), { eventId: EVENT })).toEqual({
      name: "The Grove",
      agreements: ["Be kind."],
      join: "join",
    });
    expect((await run(ticketCommunityJoin, makeCtx(world({ joinPolicy: "apply" }), null), { eventId: EVENT })).join).toBe("ask");
  });

  it("is null with nothing to say: invite-only, already in, or no community", async () => {
    expect(await run(ticketCommunityJoin, makeCtx(world({ joinPolicy: "invite" }), BUYER), { eventId: EVENT })).toBeNull();

    const data = world();
    data.communityMembers.push({ _id: "communityMembers:m", hostOrgId: ORG, userId: BUYER, role: "member", status: "active", joinedAt: 0 });
    expect(await run(ticketCommunityJoin, makeCtx(data, BUYER), { eventId: EVENT })).toBeNull();

    expect(await run(ticketCommunityJoin, makeCtx(world({ event: { hostOrgId: undefined } }), BUYER), { eventId: EVENT })).toBeNull();
  });
});

describe("joinCommunity (now a wrapper over joinCommunityAs)", () => {
  it("joins with agreement and refuses without it, as before", async () => {
    const ctx = makeCtx(world(), BUYER);
    await expect(run(joinCommunity, ctx, { hostOrgId: ORG })).rejects.toThrow();
    expect(ctx.store.communityMembers).toHaveLength(0);
    expect(await run(joinCommunity, ctx, { hostOrgId: ORG, agreed: true })).toEqual({ ok: true, status: "active" });
    expect(await run(joinCommunity, ctx, { hostOrgId: ORG, agreed: true })).toMatchObject({ alreadyMember: true });
    await expect(run(joinCommunity, makeCtx(world(), null), { hostOrgId: ORG, agreed: true })).rejects.toThrow();
  });
});
