// The drift cleanup for the events group (events.ts, garden/memberships.ts,
// communities.ts, tables.ts, eventRsvps.ts, eventWaitlist.ts, tableNotify.ts,
// tablesMigration.ts, announcements.ts, entitlements.ts, activity.ts,
// reports.ts, products.ts, updates.ts): the shared helpers must behave the
// way the copies they replaced did, except where a copy had drifted:
//
//   - signed out on create / cancel / apply is the shared refusal (a
//     ConvexError the page can read), not a plain Error production hides;
//   - a person with two profiles no longer breaks a call that used
//     `.unique()` — they get the first profile (getProfileByUserId);
//   - the co-host and "Hosted by" refusals carry a code and a reason the
//     event page can show (fail), not a plain Error.

import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import {
  addCoHost,
  apply,
  cancel,
  create,
  getMyEvents,
  removeCoHost,
  setDisplayHosts,
} from "./events";
import { applyStripeEvent, getMyMembership, hasBillingCustomer } from "./garden/memberships";
import { getCommunity, listMembers, setMemberRole, transferOwnership } from "./garden/communities";
import { getHostRoster, getTable } from "./garden/tables";
import { accountRsvpIdentity } from "./garden/eventRsvps";
import { admitFromWaitlist, joinWaitlist } from "./garden/eventWaitlist";
import { migrateBatch } from "./garden/tablesMigration";
import { deliverAnnouncementBatch } from "./announcements";
import { getGardenUser } from "./garden/entitlements";
import { getRecentActivity } from "./garden/activity";
import { getPlatformReport } from "./garden/reports";
import { getCommunityEarnings } from "./garden/products";
import { deliverBatch } from "./updates";

const RICK = "users:rick";
const DAVID = "users:david";
const BO = "users:bo";
const SAM = "users:sam";
const ADMIN = "users:admin";

/** A person with two profiles: the shape that made `.unique()` throw. The
 * first row is the one every caller must now get. */
function twoProfiles(userId: string, name: string, extra: Record<string, unknown> = {}): Row[] {
  const key = userId.split(":")[1];
  return [
    { _id: `profiles:${key}1`, userId, name, ...extra },
    { _id: `profiles:${key}2`, userId, name: `${name} (second profile)`, ...extra },
  ];
}

const person = (id: string, name: string): Row => ({
  _id: id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  emailVerificationTime: 1,
});

/** The ctx as the fake offers it, plus the pieces a few handlers use that it
 * doesn't: `.order()` (a no-op here) and `.paginate()` (one page), and a
 * record of what got scheduled (the emails). */
function withExtras(ctx: any) {
  const scheduled: { fn: unknown; args: any }[] = [];
  ctx.scheduler.runAfter = async (_delay: number, fn: unknown, args: any) => {
    scheduled.push({ fn, args });
  };
  const query = ctx.db.query;
  ctx.db.query = (table: string) => {
    const api = query(table);
    api.order = () => api;
    api.paginate = async ({ numItems }: { numItems: number }) => ({
      page: await api.take(numItems),
      continueCursor: "",
      isDone: true,
    });
    return api;
  };
  return { ctx, scheduled };
}

/** What a rejected call carries in `.data`, or fails the test if it didn't
 * reject with a ConvexError. */
async function refusal(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<any>).data;
  }
  throw new Error("expected the call to be refused");
}

// ——————————————————————————————————————————————————————————————
// Events: the world
// ——————————————————————————————————————————————————————————————

const EVENT = "events:show";
const ORG = "hostOrgs:grove";

function eventWorld(event: Record<string, unknown> = {}): Record<string, Row[]> {
  return {
    users: [person(RICK, "Rick"), person(DAVID, "David"), person(BO, "Bo"), person(SAM, "Sam")],
    profiles: [
      { _id: "profiles:rick", userId: RICK, name: "Rick" },
      { _id: "profiles:david", userId: DAVID, name: "David" },
      { _id: "profiles:bo", userId: BO, name: "Bo" },
      { _id: "profiles:sam", userId: SAM, name: "Sam" },
    ],
    hostOrgs: [{ _id: ORG, kind: "community", status: "active", name: "The Grove", slug: "the-grove", agreements: ["Be kind."] }],
    events: [
      {
        _id: EVENT,
        hostOrgId: ORG,
        organizerId: RICK,
        title: "Showcase",
        description: "",
        datetime: Date.now() + 7 * 24 * 3600000,
        status: "published",
        accessType: "public",
        requiresApproval: false,
        tags: [],
        coHostIds: [],
        ...event,
      },
    ],
    eventRsvps: [],
    eventApplications: [],
    eventWaitlist: [],
    ticketPurchases: [],
    communityMembers: [],
    notifications: [],
    memberships: [],
  };
}

// ——————————————————————————————————————————————————————————————
// Signed out: the shared refusal
// ——————————————————————————————————————————————————————————————

describe("signed out on events", () => {
  it.each([
    ["create", create, {}],
    ["cancel", cancel, { eventId: EVENT }],
    ["apply", apply, { eventId: EVENT }],
  ])("%s is refused with the shared, readable refusal", async (_name, fn, args) => {
    await expectSignedOutRefusal(fn, args as Record<string, unknown>, eventWorld());
  });

  it("the reads that show a signed-out visitor nothing still do", async () => {
    expect(await run(getMyEvents, makeCtx(eventWorld(), null))).toEqual([]);
    expect(await run(getMyMembership, makeCtx({ memberships: [], hostOrgs: [] }, null))).toBeNull();
    expect(await run(hasBillingCustomer, makeCtx({ billingCustomers: [] }, null))).toBe(false);
  });
});

// ——————————————————————————————————————————————————————————————
// Events: refusals the page shows (coordinator's addition)
// ——————————————————————————————————————————————————————————————

describe("co-host and Hosted by refusals carry a code and a reason", () => {
  const asRick = (event: Record<string, unknown> = {}) => makeCtx(eventWorld(event), RICK);

  it("addCoHost: the organizer, a repeat and a full list are invalid_input", async () => {
    expect(await refusal(run(addCoHost, asRick(), { eventId: EVENT, userId: RICK }))).toEqual({
      code: "invalid_input",
      reason: "The organizer is already a host",
    });
    expect(await refusal(run(addCoHost, asRick({ coHostIds: [DAVID] }), { eventId: EVENT, userId: DAVID }))).toEqual({
      code: "invalid_input",
      reason: "Already a co-host",
    });
    const ten = Array.from({ length: 10 }, (_, i) => `users:co${i}`);
    expect(await refusal(run(addCoHost, asRick({ coHostIds: ten }), { eventId: EVENT, userId: BO }))).toEqual({
      code: "invalid_input",
      reason: "An event can have at most 10 co-hosts",
    });
  });

  it("addCoHost: someone who isn't there is not_found", async () => {
    expect(await refusal(run(addCoHost, asRick(), { eventId: EVENT, userId: "users:ghost" }))).toEqual({
      code: "not_found",
      reason: "We couldn't find that person.",
    });
  });

  it("removeCoHost: someone who isn't a co-host is not_found", async () => {
    expect(await refusal(run(removeCoHost, asRick(), { eventId: EVENT, userId: BO }))).toEqual({
      code: "not_found",
      reason: "They aren't a co-host.",
    });
  });

  it("setDisplayHosts: more than ten, or a repeat, is invalid_input", async () => {
    const names = Array.from({ length: 11 }, (_, i) => ({ kind: "name", name: `Host ${i}` }));
    expect(await refusal(run(setDisplayHosts, asRick(), { eventId: EVENT, hosts: names }))).toEqual({
      code: "invalid_input",
      reason: "Show at most 10 hosts",
    });
    const twice = [{ kind: "name", name: "Ada" }, { kind: "name", name: "ada" }];
    expect(await refusal(run(setDisplayHosts, asRick(), { eventId: EVENT, hosts: twice }))).toEqual({
      code: "invalid_input",
      reason: "Each host can be listed once",
    });
  });

  it("the other refusals in events.ts are still plain Errors (cancel by a non-organizer)", async () => {
    const ctx = makeCtx(eventWorld({ coHostIds: [DAVID] }), DAVID);
    await expect(run(cancel, ctx, { eventId: EVENT })).rejects.toThrow(/Not authorized/);
  });
});

// ——————————————————————————————————————————————————————————————
// Notifications through insertNotification: same rows, same emails
// ——————————————————————————————————————————————————————————————

describe("notifications written through insertNotification", () => {
  it("making someone a co-host: the note and the email, to them, from the actor", async () => {
    const { ctx, scheduled } = withExtras(makeCtx(eventWorld(), RICK));
    await run(addCoHost, ctx, { eventId: EVENT, userId: BO });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: BO,
        type: "event_cohost_added",
        title: "Rick made you a co-host of Showcase",
        message: "You can edit the event and see the guest list.",
        linkUrl: `/events/${EVENT}`,
        relatedUserId: RICK,
        createdAt: expect.any(Number),
      }),
    ]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].args).toMatchObject({
      to: "bo@example.com",
      subject: "Rick made you a co-host of Showcase",
      category: "activity",
      communityId: ORG,
      recipientUserId: BO,
    });
  });

  it("applying: the organizer is told by note and email, under the applicant's name", async () => {
    const { ctx, scheduled } = withExtras(makeCtx(eventWorld({ requiresApproval: true }), BO));
    await run(apply, ctx, { eventId: EVENT });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: RICK,
        type: "event_application",
        title: "Bo applied to your event",
        message: "Showcase",
        linkUrl: `/events/${EVENT}`,
        relatedUserId: BO,
        createdAt: expect.any(Number),
      }),
    ]);
    expect(scheduled.map((s) => s.args)).toEqual([
      expect.objectContaining({ to: "rick@example.com", subject: 'Bo applied to "Showcase"', recipientUserId: RICK }),
    ]);
  });

  it("a person with no profile is still 'Someone' in the line about them", async () => {
    const data = eventWorld({ requiresApproval: true });
    data.profiles = data.profiles.filter((p) => p.userId !== BO);
    const ctx = makeCtx(data, BO);
    await run(apply, ctx, { eventId: EVENT });
    expect(ctx.store.notifications[0].title).toBe("Someone applied to your event");
  });
});

// ——————————————————————————————————————————————————————————————
// A person with two profiles: `.unique()` used to throw
// ——————————————————————————————————————————————————————————————

describe("two profiles no longer break a call (garden/entitlements.ts, eventRsvps.ts, eventWaitlist.ts)", () => {
  it("getGardenUser reads the first profile", async () => {
    const ctx = makeCtx({ profiles: twoProfiles(SAM, "Sam"), memberships: [], projects: [], hostOrgs: [] }, SAM);
    const user = await getGardenUser(ctx, SAM as any);
    expect(user).toMatchObject({ id: SAM, name: "Sam", level: "free" });
  });

  it("accountRsvpIdentity names the RSVP after the first profile", async () => {
    const ctx = makeCtx({ users: [{ _id: SAM, name: "Sam U", email: "sam@example.com" }], profiles: twoProfiles(SAM, "Sam") }, SAM);
    expect(await accountRsvpIdentity(ctx, SAM as any, undefined)).toEqual({ name: "Sam", email: "sam@example.com" });
  });

  it("joining a full event's waitlist (public) works for someone with two profiles", async () => {
    const data = eventWorld({ capacity: 1 });
    data.eventRsvps.push({ _id: "eventRsvps:bo", eventId: EVENT, userId: BO, name: "Bo", email: "bo@example.com", createdAt: 1 });
    data.profiles.push(...twoProfiles(SAM, "Sam").slice(0, 2));
    data.profiles = data.profiles.filter((p) => p._id !== "profiles:sam");
    const ctx = makeCtx(data, SAM);
    expect(await run(joinWaitlist, ctx, { eventId: EVENT })).toBe("waiting");
    expect(ctx.store.eventWaitlist[0]).toMatchObject({ userId: SAM, name: "Sam" });
  });

  it("letting someone in from the waitlist: one note and one email, to them", async () => {
    const data = eventWorld({ capacity: 1 });
    data.eventWaitlist.push({ _id: "eventWaitlist:sam", eventId: EVENT, userId: SAM, name: "Sam", email: "sam@example.com", createdAt: 1 });
    const { ctx, scheduled } = withExtras(makeCtx(data, RICK));
    await run(admitFromWaitlist, ctx, { entryId: "eventWaitlist:sam" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: SAM,
        type: "event_waitlist_admitted",
        title: "You're in: Showcase",
        relatedUserId: RICK,
        createdAt: expect.any(Number),
      }),
    ]);
    expect(scheduled.map((s) => s.args)).toEqual([
      expect.objectContaining({ to: "sam@example.com", category: "transactional", recipientUserId: SAM }),
    ]);
  });
});

describe("two profiles no longer break a call (garden/communities.ts)", () => {
  const COMMUNITY = "hostOrgs:garden";
  function communityWorld(): Record<string, Row[]> {
    return {
      users: [person(RICK, "Rick"), person(SAM, "Sam")],
      profiles: [...twoProfiles(RICK, "Rick"), ...twoProfiles(SAM, "Sam")],
      hostOrgs: [
        { _id: COMMUNITY, kind: "community", status: "active", name: "The Garden", slug: "garden", ownerUserId: RICK, joinPolicy: "open" },
      ],
      communityMembers: [
        { _id: "communityMembers:rick", hostOrgId: COMMUNITY, userId: RICK, role: "host", status: "active", joinedAt: 1 },
        { _id: "communityMembers:sam", hostOrgId: COMMUNITY, userId: SAM, role: "member", status: "active", joinedAt: 2 },
      ],
    };
  }

  it("getCommunity: the host's name and the viewer's own profile", async () => {
    const page = await run(getCommunity, makeCtx(communityWorld(), SAM), { slug: "garden" });
    expect(page.hosts).toEqual(["Rick"]);
    expect(page.viewer.membership).toMatchObject({ role: "member", status: "active" });
    expect(page.viewer.canManage).toBe(false);
  });

  it("listMembers: the roster names and the viewer's own profile", async () => {
    const rows = await run(listMembers, makeCtx(communityWorld(), RICK), { hostOrgId: COMMUNITY });
    expect(rows.map((r: any) => r.name).sort()).toEqual(["Rick", "Sam"]);
  });

  it("setMemberRole: a host with two profiles can still promote a member", async () => {
    const ctx = makeCtx(communityWorld(), RICK);
    expect(await run(setMemberRole, ctx, { hostOrgId: COMMUNITY, userId: SAM, role: "host" })).toEqual({ ok: true });
    expect(ctx.store.communityMembers.find((m: Row) => m.userId === SAM)).toMatchObject({ role: "host" });
  });

  it("transferOwnership: an owner with two profiles can still hand the community over", async () => {
    const ctx = makeCtx(communityWorld(), RICK);
    expect(await run(transferOwnership, ctx, { hostOrgId: COMMUNITY, userId: SAM })).toEqual({ ok: true });
    expect(ctx.store.hostOrgs[0].ownerUserId).toBe(SAM);
  });
});

describe("two profiles no longer break a call (garden/tables.ts)", () => {
  const TABLE = "gardenTables:table";
  const TABLE_ORG = "hostOrgs:community";
  function tableWorld(): Record<string, Row[]> {
    return {
      users: [person(RICK, "Rick"), person(SAM, "Sam")],
      profiles: [...twoProfiles(RICK, "Rick"), ...twoProfiles(SAM, "Sam")],
      hostOrgs: [{ _id: TABLE_ORG, kind: "community", status: "active", name: "Creative Exchange", slug: "the-garden" }],
      gardenTables: [
        {
          _id: TABLE,
          hostOrgId: TABLE_ORG,
          hostUserId: RICK,
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
      tableMemberships: [
        { _id: "tableMemberships:rick", tableId: TABLE, userId: RICK, role: "host", joinedAt: 0, status: "active" },
        { _id: "tableMemberships:sam", tableId: TABLE, userId: SAM, joinedAt: 0, status: "active" },
      ],
      events: [],
      tableSessions: [],
      communityMembers: [],
      memberships: [],
      projects: [],
    };
  }

  it("getTable: the host's card and the roster use the first profile", async () => {
    const page = await run(getTable, makeCtx(tableWorld(), RICK), { slug: "a-table" });
    expect(page.hostName).toBe("Rick");
    expect([...page.roster].sort()).toEqual(["Rick", "Sam"]);
  });

  it("getHostRoster: names come from the first profile", async () => {
    const rows = await run(getHostRoster, makeCtx(tableWorld(), RICK), { tableId: TABLE });
    expect(rows.map((r: any) => r.name).sort()).toEqual(["Rick", "Sam"]);
  });
});

describe("two profiles no longer break a call (class payments, garden/memberships.ts)", () => {
  it("a paid class: the teacher is told under the first profile's name, and the sign-up carries it", async () => {
    const TEACHER = "users:teacher";
    const { ctx, scheduled } = withExtras(
      makeCtx(
        {
          users: [person(TEACHER, "Teacher"), person(SAM, "Sam")],
          profiles: [{ _id: "profiles:teacher", userId: TEACHER, name: "Teacher" }, ...twoProfiles(SAM, "Sam")],
          offerings: [{ _id: "offerings:draw", userId: TEACHER, title: "Life Drawing", hostOrgId: ORG }],
          classPayments: [],
          offeringSignups: [],
          gardenTables: [],
          notifications: [],
        },
        null,
      ),
    );
    await run(applyStripeEvent, ctx, {
      event: {
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_class",
            mode: "payment",
            payment_status: "paid",
            created: Math.floor(Date.now() / 1000),
            metadata: { kind: "class", offeringId: "offerings:draw", userId: SAM, amountCents: "5000" },
          },
        },
      },
    });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: TEACHER,
        type: "class_purchased",
        title: "Sam signed up for Life Drawing",
        message: "$50.00",
        linkUrl: "/offerings/offerings:draw",
        relatedUserId: SAM,
        createdAt: expect.any(Number),
      }),
    ]);
    expect(scheduled.map((s) => s.args)).toEqual([
      expect.objectContaining({ to: "teacher@example.com", category: "activity", recipientUserId: TEACHER }),
    ]);
    expect(ctx.store.offeringSignups).toEqual([expect.objectContaining({ userId: SAM, name: "Sam", status: "confirmed" })]);
  });
});

describe("two profiles no longer break a call (the operator reads and the migration)", () => {
  function operatorWorld(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
    return {
      users: [person(ADMIN, "Admin"), person(SAM, "Sam")],
      profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Admin", isAdmin: true }, ...twoProfiles(SAM, "Sam")],
      ...extra,
    };
  }

  it("getRecentActivity names the actor from the first profile", async () => {
    const { ctx } = withExtras(
      makeCtx(
        operatorWorld({
          hostOrgs: [{ _id: ORG, kind: "community", status: "active", name: "The Grove", slug: "the-grove" }],
          communityMembers: [{ _id: "communityMembers:sam", hostOrgId: ORG, userId: SAM, role: "member", status: "active", joinedAt: 5 }],
          projects: [],
          offerings: [],
          gardenTables: [],
          events: [],
        }),
        ADMIN,
      ),
    );
    const feed = await run(getRecentActivity, ctx);
    expect(feed).toEqual([expect.objectContaining({ source: "member_joined", actorName: "Sam" })]);
  });

  it("getPlatformReport names a payee from the first profile", async () => {
    const { ctx } = withExtras(
      makeCtx(
        operatorWorld({
          giftPayments: [
            {
              _id: "giftPayments:1",
              payeeUserId: SAM,
              source: "dues",
              grossCents: 500,
              platformCents: 50,
              workCents: 450,
              period: "2026-10",
              createdAt: 1,
              stripeRef: "gift_1",
            },
          ],
        }),
        ADMIN,
      ),
    );
    const report = await run(getPlatformReport, ctx, {});
    expect(report.creativeEarnings).toEqual([expect.objectContaining({ name: "Sam", profileId: "profiles:sam1" })]);
  });

  it("getCommunityEarnings lists buyers by the first profile's name", async () => {
    const ctx = makeCtx(
      {
        users: [person(RICK, "Rick"), person(SAM, "Sam")],
        profiles: [...twoProfiles(RICK, "Rick", { isAdmin: true }), ...twoProfiles(SAM, "Sam")],
        hostOrgs: [{ _id: ORG, kind: "community", status: "active", name: "The Grove", slug: "the-grove" }],
        communityMembers: [],
        communityProducts: [{ _id: "communityProducts:p", hostOrgId: ORG, name: "Zine", status: "active", priceCents: 1000 }],
        hostPayouts: [],
        productPurchases: [
          {
            _id: "productPurchases:1",
            hostOrgId: ORG,
            productId: "communityProducts:p",
            userId: SAM,
            status: "paid",
            grossCents: 1000,
            platformCents: 100,
            hostCents: 900,
            period: "2026-10",
            createdAt: 1,
          },
        ],
      },
      RICK,
    );
    const earnings = await run(getCommunityEarnings, ctx, { hostOrgId: ORG });
    expect(earnings.recent).toEqual([expect.objectContaining({ buyerName: "Sam", productName: "Zine" })]);
  });

  it("the Table migration copies an RSVP under the first profile's name", async () => {
    const { ctx } = withExtras(
      makeCtx(
        operatorWorld({
          sessionRsvps: [{ _id: "sessionRsvps:1", sessionId: "tableSessions:s", userId: SAM, status: "going", createdAt: 5 }],
          events: [{ _id: "events:migrated", sourceSessionId: "tableSessions:s", organizerId: ADMIN, title: "Session", datetime: 1, status: "published" }],
          eventRsvps: [],
        }),
        ADMIN,
      ),
    );
    const result = await run(migrateBatch, ctx, { phase: "rsvps", dryRun: false });
    expect(result.results).toEqual([expect.objectContaining({ action: "created" })]);
    expect(ctx.store.eventRsvps).toEqual([expect.objectContaining({ userId: SAM, name: "Sam" })]);
  });
});

describe("two profiles no longer break a call (announcements.ts, updates.ts)", () => {
  it("an announcement's sender is named from the first profile", async () => {
    const { ctx, scheduled } = withExtras(
      makeCtx(
        {
          users: [person(RICK, "Rick"), person(BO, "Bo")],
          profiles: [...twoProfiles(RICK, "Rick"), { _id: "profiles:bo", userId: BO, name: "Bo" }],
          hostOrgs: [],
          events: [
            { _id: EVENT, organizerId: RICK, title: "Showcase", datetime: Date.now() + 86400000, status: "published", tags: [] },
          ],
          announcements: [
            {
              _id: "announcements:a",
              kind: "broadcast",
              targetType: "event",
              targetId: EVENT,
              senderUserId: RICK,
              body: "See you there",
              recipientCount: 1,
              emailedCount: 0,
              createdAt: 1,
            },
          ],
          announcementRecipients: [
            { _id: "announcementRecipients:bo", announcementId: "announcements:a", userId: BO },
          ],
          notifications: [],
        },
        null,
      ),
    );
    await run(deliverAnnouncementBatch, ctx, { announcementId: "announcements:a" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: BO, type: "announcement", message: "See you there", relatedUserId: RICK, createdAt: expect.any(Number) }),
    ]);
    expect(scheduled[0].args.subject).toBe("Rick — update on Showcase");
  });

  it("an Update reaches a reader by note and email, once", async () => {
    const { ctx, scheduled } = withExtras(
      makeCtx(
        {
          users: [person(BO, "Bo")],
          updates: [
            {
              _id: "updates:u",
              title: "Hello",
              body: "News for everyone",
              audience: "everyone",
              status: "sent",
              sentAt: 1,
              createdAt: 1,
            },
          ],
          notifications: [],
        },
        null,
      ),
    );
    await run(deliverBatch, ctx, { updateId: "updates:u", cursor: null });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: BO, type: "update", title: "Hello", message: "News for everyone", createdAt: expect.any(Number) }),
    ]);
    expect(scheduled.map((s) => s.args)).toEqual([
      expect.objectContaining({ to: "bo@example.com", subject: "Hello", category: "announcements", recipientUserId: BO }),
    ]);
  });
});
