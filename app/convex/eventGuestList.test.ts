import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { getGuestList } from "./events";
import { answerTicketRole, getInviteSuggestions, setGuestRole } from "./eventGuestList";

// Who's coming, by role, on the host's Guests tab: a host's pick beats the
// buyer's own answer, which beats their profile; and who in the community
// hasn't got a ticket yet.

const HOST = "users:host",
  PATRON = "users:patron",
  PASTOR = "users:pastor",
  CREATIVE = "users:creative",
  GIVER = "users:giver",
  NONAME = "users:noname",
  STRANGER = "users:stranger";
const EVENT = "events:showcase",
  ORG = "hostOrgs:garden";
const SESSION = "cs_live_b1abcdefghijkl";

function world(): Record<string, Row[]> {
  const profile = (userId: string, name: string, extra: Record<string, unknown> = {}) => ({
    _id: `profiles:${userId.slice(6)}`,
    userId,
    name,
    interests: [],
    ...extra,
  });
  const member = (userId: string) => ({ _id: `communityMembers:${userId.slice(6)}`, hostOrgId: ORG, userId, role: "member", status: "active" });
  return {
    users: [HOST, PATRON, PASTOR, CREATIVE, GIVER, NONAME, STRANGER].map((_id) => ({ _id, email: `${_id.slice(6)}@x.com` })),
    profiles: [
      profile(HOST, "Rick", { primaryRole: "patron" }),
      profile(PATRON, "Pat", { primaryRole: "patron" }),
      profile(PASTOR, "Cody", { primaryRole: "creative" }),
      profile(CREATIVE, "Ana", { primaryRole: "creative" }),
      profile(GIVER, "Martin", { patronRole: true }),
      profile(NONAME, "New User", { primaryRole: "patron" }),
      profile(STRANGER, "Sam", { primaryRole: "patron" }),
    ],
    organizations: [{ _id: "organizations:church", name: "Uncommon Good", category: "Church" }],
    orgPositions: [{ _id: "orgPositions:1", organizationId: "organizations:church", userId: PASTOR, profileId: "profiles:pastor", order: 0 }],
    hostOrgs: [{ _id: ORG, kind: "community", status: "active", name: "The Garden", slug: "the-garden" }],
    communityMembers: [HOST, PATRON, PASTOR, CREATIVE, GIVER, NONAME].map(member),
    events: [
      {
        _id: EVENT,
        hostOrgId: ORG,
        organizerId: HOST,
        title: "Artist Showcase",
        datetime: Date.now() + 3 * 24 * 3600000,
        status: "published",
      },
    ],
    eventRsvps: [
      { _id: "eventRsvps:1", eventId: EVENT, userId: HOST, name: "Rick", email: "host@x.com", paidCents: 1500, ticketCount: 1, createdAt: 1 },
      { _id: "eventRsvps:2", eventId: EVENT, userId: PATRON, name: "Pat", email: "patron@x.com", paidCents: 3000, ticketCount: 2, createdAt: 2 },
      { _id: "eventRsvps:3", eventId: EVENT, userId: PASTOR, name: "Cody", email: "pastor@x.com", paidCents: 1500, ticketCount: 1, createdAt: 3 },
      {
        _id: "eventRsvps:4",
        eventId: EVENT,
        name: "Juan",
        email: "Juan@Firm.com",
        paidCents: 3000,
        ticketCount: 2,
        stripeRef: `ap:${SESSION}`,
        createdAt: 4,
      },
    ],
    eventApplications: [],
    ticketPurchases: [],
    eventGuestRoles: [],
    blocks: [],
  };
}

const roles = (rows: { name: string; role?: string }[]) => Object.fromEntries(rows.map((r) => [r.name, r.role]));

describe("getGuestList roles", () => {
  it("reads hosts, profiles and churches, and leaves a buyer with no account unknown", async () => {
    const rows = await run(getGuestList, makeCtx(world(), HOST), { eventId: EVENT });
    expect(roles(rows)).toEqual({ Rick: "host", Pat: "patron", Cody: "church", Juan: "unknown" });
  });

  it("gives each guest with an account their profile, so the name opens it", async () => {
    const rows = await run(getGuestList, makeCtx(world(), HOST), { eventId: EVENT });
    const profiles = Object.fromEntries(rows.map((r: { name: string; profileId: string | null }) => [r.name, r.profileId]));
    expect(profiles).toEqual({ Rick: "profiles:host", Pat: "profiles:patron", Cody: "profiles:pastor", Juan: null });
  });
});

describe("setGuestRole", () => {
  it("lets a host say who a guest is, and the list shows it", async () => {
    const ctx = makeCtx(world(), HOST);
    await run(setGuestRole, ctx, { eventId: EVENT, guestKey: "e:juan@firm.com", role: "patron" });
    await run(setGuestRole, ctx, { eventId: EVENT, guestKey: "e:juan@firm.com", role: "partner" });
    expect(ctx.store.eventGuestRoles).toHaveLength(1);
    const rows = await run(getGuestList, ctx, { eventId: EVENT });
    expect(roles(rows).Juan).toBe("partner");
  });

  it("refuses anyone but a host, a made-up role and a key it didn't make", async () => {
    const guest = makeCtx(world(), PATRON);
    await expect(
      run(setGuestRole, guest, { eventId: EVENT, guestKey: "e:juan@firm.com", role: "patron" }),
    ).rejects.toBeInstanceOf(ConvexError);
    const host = makeCtx(world(), HOST);
    await expect(run(setGuestRole, host, { eventId: EVENT, guestKey: "e:juan@firm.com", role: "vip" })).rejects.toThrow(
      ConvexError,
    );
    await expect(run(setGuestRole, host, { eventId: EVENT, guestKey: "x:3", role: "patron" })).rejects.toThrow(ConvexError);
    expect(host.store.eventGuestRoles).toHaveLength(0);
  });
});

describe("answerTicketRole", () => {
  it("saves a signed-out buyer's answer on their ticket", async () => {
    const ctx = makeCtx(world(), null);
    expect(await run(answerTicketRole, ctx, { sessionId: SESSION, role: "patron" })).toBe("saved");
    expect(ctx.store.eventGuestRoles[0]).toMatchObject({ guestKey: "e:juan@firm.com", role: "patron", source: "guest" });
    const rows = await run(getGuestList, makeCtx(ctx.store, HOST), { eventId: EVENT });
    expect(roles(rows).Juan).toBe("patron");
  });

  it("waits for the ticket, and never replaces a host's pick", async () => {
    const early = makeCtx(world(), null);
    expect(await run(answerTicketRole, early, { sessionId: "cs_live_notsavedyet00", role: "creative" })).toBe("not_yet");
    expect(early.store.eventGuestRoles).toHaveLength(0);

    // makeCtx copies the tables it's given, so the buyer acts on the host's store.
    const host = makeCtx(world(), HOST);
    await run(setGuestRole, host, { eventId: EVENT, guestKey: "e:juan@firm.com", role: "church" });
    const ctx = makeCtx(host.store, null);
    expect(await run(answerTicketRole, ctx, { sessionId: SESSION, role: "creative" })).toBe("saved");
    expect(ctx.store.eventGuestRoles).toHaveLength(1);
    expect(ctx.store.eventGuestRoles[0]).toMatchObject({ role: "church", source: "host" });
  });

  it("refuses a bad session id and the roles a buyer can't pick", async () => {
    const ctx = makeCtx(world(), null);
    await expect(run(answerTicketRole, ctx, { sessionId: "nope", role: "patron" })).rejects.toThrow(ConvexError);
    await expect(run(answerTicketRole, ctx, { sessionId: SESSION, role: "host" })).rejects.toThrow(ConvexError);
    expect(ctx.store.eventGuestRoles).toHaveLength(0);
  });
});

describe("getInviteSuggestions", () => {
  it("lists community members not coming yet, churches first, for hosts only", async () => {
    const list = await run(getInviteSuggestions, makeCtx(world(), HOST), { eventId: EVENT });
    // Pat and Cody have tickets, Rick hosts, "New User" has no name yet,
    // Sam isn't in the community.
    expect(list.map((p: { name: string; role: string }) => [p.name, p.role])).toEqual([
      ["Martin", "patron"],
      ["Ana", "creative"],
    ]);
    expect(await run(getInviteSuggestions, makeCtx(world(), PATRON), { eventId: EVENT })).toEqual([]);
  });

  it("shows nothing to a co-host from outside the community", async () => {
    const w = world();
    (w.events[0] as Record<string, unknown>).coHostIds = [STRANGER];
    expect(await run(getInviteSuggestions, makeCtx(w, STRANGER), { eventId: EVENT })).toEqual([]);
  });

  it("leaves out a member who bought signed out, and one the host declined", async () => {
    const w = world();
    w.eventRsvps.push({ _id: "eventRsvps:5", eventId: EVENT, name: "Ana", email: "CREATIVE@x.com", paidCents: 1500, createdAt: 5 });
    w.eventApplications.push({ _id: "eventApplications:1", eventId: EVENT, applicantId: GIVER, status: "declined", createdAt: 6 });
    expect(await run(getInviteSuggestions, makeCtx(w, HOST), { eventId: EVENT })).toEqual([]);
  });

  it("leaves out someone the host blocked", async () => {
    const w = world();
    w.blocks = [{ _id: "blocks:1", blockerId: HOST, blockedId: GIVER }];
    const list = await run(getInviteSuggestions, makeCtx(w, HOST), { eventId: EVENT });
    expect(list.map((p: { name: string }) => p.name)).toEqual(["Ana"]);
  });
});
