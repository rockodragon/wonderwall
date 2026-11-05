import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { listPastForProfile } from "./events";
import { setHidePastEvents } from "./profiles";

// "Past events" on a profile (Rick, 2026-11-04): what a person went to, as
// the Guests tab counts going, newest first. Signed-in members only, never
// what the viewer couldn't open, and gone when the person hides it.

const ANA = "users:ana", // whose profile it is
  BEN = "users:ben", // a signed-in member looking at it
  HOST = "users:host";
const PROFILE = "profiles:ana";
const GARDEN = "hostOrgs:garden",
  TEST = "hostOrgs:test";
const DAY = 24 * 3600000;

function world(): Record<string, Row[]> {
  const now = Date.now();
  const event = (id: string, title: string, daysAgo: number, extra: Record<string, unknown> = {}) => ({
    _id: `events:${id}`,
    hostOrgId: GARDEN,
    organizerId: HOST,
    title,
    description: "",
    tags: [],
    requiresApproval: false,
    datetime: now - daysAgo * DAY,
    status: "published",
    ...extra,
  });
  const rsvp = (eventId: string, userId = ANA) => ({
    _id: `eventRsvps:${eventId}`,
    eventId: `events:${eventId}`,
    userId,
    name: "Ana",
    email: "ana@x.com",
    createdAt: 1,
  });
  return {
    users: [ANA, BEN, HOST].map((_id) => ({ _id, email: `${_id.slice(6)}@x.com` })),
    profiles: [
      { _id: PROFILE, userId: ANA, name: "Ana Reyes", interests: [] },
      { _id: "profiles:ben", userId: BEN, name: "Ben Ortiz", interests: [] },
      { _id: "profiles:host", userId: HOST, name: "Rick", interests: [] },
    ],
    hostOrgs: [
      { _id: GARDEN, kind: "community", status: "active", name: "The Garden", slug: "the-garden" },
      // A hidden (test) community: its name starts with "_".
      { _id: TEST, kind: "community", status: "active", name: "_Test", slug: "_test" },
    ],
    communityMembers: [{ _id: "communityMembers:ana", hostOrgId: TEST, userId: ANA, role: "member", status: "active" }],
    events: [
      event("rsvp", "Spring Showcase", 10),
      event("accepted", "Summer Jam", 5),
      event("ticket", "Fall Gala", 20),
      event("upcoming", "Next Week", -7),
      event("today", "Earlier Today", 0.1),
      event("cancelled", "Called Off", 7, { status: "cancelled" }),
      event("test", "Test Night", 8, { hostOrgId: TEST }),
      event("pending", "Asked, Not In", 9),
      event("declined", "Turned Away", 12),
      event("refunded", "Refunded", 11),
      event("emailOnly", "Bought Signed Out", 3),
    ],
    eventRsvps: [
      rsvp("rsvp"),
      rsvp("upcoming"),
      rsvp("today"),
      rsvp("cancelled"),
      rsvp("test"),
      // Someone else's RSVP never counts as Ana's.
      rsvp("pending", BEN),
      // An RSVP with her email but no account isn't linked to her.
      { _id: "eventRsvps:emailOnly", eventId: "events:emailOnly", name: "Ana", email: "ana@x.com", createdAt: 1 },
    ],
    eventApplications: [
      { _id: "eventApplications:1", eventId: "events:accepted", applicantId: ANA, status: "accepted", createdAt: 1, updatedAt: 1 },
      { _id: "eventApplications:2", eventId: "events:pending", applicantId: ANA, status: "pending", createdAt: 1, updatedAt: 1 },
      { _id: "eventApplications:3", eventId: "events:declined", applicantId: ANA, status: "declined", createdAt: 1, updatedAt: 1 },
    ],
    ticketPurchases: [
      { _id: "ticketPurchases:1", eventId: "events:ticket", userId: ANA, tierName: "General", amountCents: 2500, stripeSessionId: "cs_1", status: "paid", createdAt: 1 },
      { _id: "ticketPurchases:2", eventId: "events:refunded", userId: ANA, tierName: "General", amountCents: 2500, stripeSessionId: "cs_2", status: "refunded", createdAt: 1 },
    ],
    blocks: [],
  };
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe("listPastForProfile", () => {
  it("lists what she went to, newest first: an RSVP, an accepted request, a paid ticket", async () => {
    const rows = await run(listPastForProfile, makeCtx(world(), BEN), { profileId: PROFILE });
    expect(titles(rows)).toEqual(["Summer Jam", "Spring Showcase", "Fall Gala"]);
  });

  it("shows a visitor nothing", async () => {
    expect(await run(listPastForProfile, makeCtx(world(), null), { profileId: PROFILE })).toEqual([]);
  });

  it("shows a test community's event only to someone who can see that community", async () => {
    const mine = await run(listPastForProfile, makeCtx(world(), ANA), { profileId: PROFILE });
    expect(titles(mine)).toEqual(["Summer Jam", "Test Night", "Spring Showcase", "Fall Gala"]);
    const bens = await run(listPastForProfile, makeCtx(world(), BEN), { profileId: PROFILE });
    expect(titles(bens)).not.toContain("Test Night");
  });

  it("is gone for everyone once she hides it, and back when she shows it", async () => {
    const ana = makeCtx(world(), ANA);
    await run(setHidePastEvents, ana, { hide: true });
    expect(ana.store.profiles.find((p: Row) => p._id === PROFILE)?.hidePastEvents).toBe(true);
    expect(await run(listPastForProfile, makeCtx(ana.store, BEN), { profileId: PROFILE })).toEqual([]);
    expect(await run(listPastForProfile, makeCtx(ana.store, ANA), { profileId: PROFILE })).toEqual([]);

    await run(setHidePastEvents, ana, { hide: false });
    expect(await run(listPastForProfile, makeCtx(ana.store, BEN), { profileId: PROFILE })).toHaveLength(3);
  });

  it("shows nothing across a block, either way", async () => {
    for (const block of [
      { blockerId: ANA, blockedId: BEN },
      { blockerId: BEN, blockedId: ANA },
    ]) {
      const tables = { ...world(), blocks: [{ _id: "blocks:1", ...block, createdAt: 1 }] };
      expect(await run(listPastForProfile, makeCtx(tables, BEN), { profileId: PROFILE })).toEqual([]);
    }
  });
});

describe("setHidePastEvents", () => {
  it("needs someone signed in", async () => {
    await expect(run(setHidePastEvents, makeCtx(world(), null), { hide: true })).rejects.toBeInstanceOf(ConvexError);
  });
});
