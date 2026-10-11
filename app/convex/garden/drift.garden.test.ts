// The drift cleanup for the garden group (garden/stripe, projects,
// projectsPublic, projectTeam, gigs, grantProposals, giving, connectState,
// connect, stories, support, allocations, seedPaidPostings, and
// organizations): what each shared helper now does for these files.
//
//  a) signed out is the shared refusal (requireUserId);
//  b) a person with two profiles no longer breaks a call that used
//     `.unique()` — they get the first one, like everywhere else;
//  c) the stripe actions that keep their own "Sign in to ..." line still say
//     it, now through currentUserId;
//  d) the notifications and names that moved onto insertNotification /
//     displayNameOf still read the same.

import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { expectSignedOutRefusal } from "../../test-support/signedOut";
import { makeCtx, run } from "../../test-support/convexContext";
import {
  createConnectDashboardLink,
  createConnectOnboardingLink,
  refreshConnectStatus,
} from "./connect";
import {
  getConnectAccountForUser,
  listTransferable,
  saveConnectAccount,
} from "./connectState";
import {
  createBackingCheckout,
  createBillingPortalSession,
  createClassCheckout,
  createCoverageCheckout,
  createGiftCheckout,
  createMembershipCheckout,
  createTableCheckout,
  getCoverageBySession,
  refundTablePayment,
} from "./stripe";
import {
  createPassionProject,
  getProject as getProjectInApp,
  listProjects as listProjectsInApp,
  setStage,
} from "./projects";
import { getProject as getPublicProject, listProjects as listPublicProjects } from "./projectsPublic";
import {
  claimInvite,
  inviteMember,
  leaveProject,
  removeMember,
  decideRequest,
  requestToJoin,
  respondToInvite,
} from "./projectTeam";
import {
  bookSlot,
  cancelSlot,
  confirmSlotPaid,
  createGigSeries,
  markSlotPaid,
  respondAvailable,
  unbookSlot,
  updateGigSeries,
  withdrawResponse,
} from "./gigs";
import { decideProposal, listProposalsForReview } from "./grantProposals";
import {
  decideGift,
  getGivingReport,
  getMyGiving,
  getRecipientForCheckout,
  listProjectsForGift,
  notifyGiftReceived,
  openMemberGift,
  scheduleTransferFor,
  searchRecipients,
} from "./giving";
import { getStoryPage, listProjectUpdates, postStoryUpdate } from "./stories";
import { startBacking, supportProject } from "./support";
import { recordAllocation } from "./allocations";
import { remove as removeSeedPostings } from "./seedPaidPostings";
import {
  addByName,
  addPerson,
  createForHosting,
  join,
  leave,
  mine,
  reorderMine,
  updateMyPosition,
} from "../organizations";

const ADA = "users:ada";
const BO = "users:bo";
const ADMIN = "users:admin";

/** Two profile rows for one person: the second is what `.unique()` choked on. */
function twoProfiles(userId: string, name: string, extra: Record<string, unknown> = {}) {
  const tag = userId.split(":")[1];
  return [
    { _id: `profiles:${tag}1`, userId, name, interests: [], ...extra },
    { _id: `profiles:${tag}2`, userId, name: `${name} (again)`, interests: [], ...extra },
  ];
}

const operator = { _id: "profiles:admin", userId: ADMIN, name: "Admin", interests: [], isAdmin: true };

const project = (extra: Record<string, unknown> = {}) => ({
  _id: "projects:p1",
  userId: BO,
  kind: "passion",
  title: "A film",
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

// ——— a) signed out is refused with the shared line ———

describe("signed out: the shared refusal", () => {
  const cases: [string, unknown][] = [
    ["connect.createConnectOnboardingLink", createConnectOnboardingLink],
    ["connect.refreshConnectStatus", refreshConnectStatus],
    ["connect.createConnectDashboardLink", createConnectDashboardLink],
    ["organizations.addByName", addByName],
    ["organizations.createForHosting", createForHosting],
    ["organizations.join", join],
    ["organizations.updateMyPosition", updateMyPosition],
    ["organizations.leave", leave],
    ["organizations.reorderMine", reorderMine],
  ];
  it.each(cases)("%s", async (_name, fn) => {
    await expectSignedOutRefusal(fn);
  });
});

// ——— c) the stripe actions keep their own lines ———

describe("stripe actions: signed out still says why", () => {
  const cases: [string, unknown, unknown][] = [
    ["createMembershipCheckout", createMembershipCheckout, "Sign in to become a member."],
    ["createCoverageCheckout", createCoverageCheckout, { reason: "Sign in to cover seats." }],
    ["getCoverageBySession", getCoverageBySession, "Sign in to see your code."],
    [
      "createClassCheckout",
      createClassCheckout,
      { code: "unauthenticated", reason: "Sign in to sign up for a class." },
    ],
    ["createTableCheckout", createTableCheckout, "Sign in to join this Table."],
    ["refundTablePayment", refundTablePayment, "Sign in as an operator to refund a payment."],
    ["createBillingPortalSession", createBillingPortalSession, "Sign in to manage billing."],
    ["createGiftCheckout", createGiftCheckout, { reason: "Sign in to back someone." }],
  ];
  it.each(cases)("%s", async (_name, fn, data) => {
    let thrown: unknown;
    try {
      await run(fn, makeCtx({}, null), {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ConvexError);
    expect((thrown as ConvexError<any>).data).toEqual(data);
  });

  it("a signed-out backer still gets the guest checkout rules", async () => {
    // createBackingCheckout lets guests in: a recurring guest backing is refused.
    await expect(
      run(createBackingCheckout, makeCtx({}, null), {
        projectId: "projects:p1",
        amountCents: 2000,
        recurring: true,
        visible: true,
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});

// ——— b) two profiles: no throw, the first one wins ———

describe("a person with two profiles (connectState)", () => {
  it("getConnectAccountForUser answers with the first profile", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: ADA, email: "ada@example.com" }],
        profiles: twoProfiles(ADA, "Ada", { stripeConnectAccountId: "acct_1", stripeConnectPayoutsEnabled: true }),
      },
      null,
    );
    const me = await run(getConnectAccountForUser, ctx, { userId: ADA });
    expect(me).toMatchObject({ profileId: "profiles:ada1", name: "Ada", accountId: "acct_1", payoutsEnabled: true });
  });

  it("saveConnectAccount saves the account on the first profile", async () => {
    const ctx = makeCtx({ profiles: twoProfiles(ADA, "Ada") }, null);
    await run(saveConnectAccount, ctx, { userId: ADA, accountId: "acct_9" });
    expect(ctx.store.profiles[0].stripeConnectAccountId).toBe("acct_9");
    expect(ctx.store.profiles[1].stripeConnectAccountId).toBeUndefined();
  });

  it("listTransferable finds the payee's account", async () => {
    const ctx = makeCtx(
      {
        profiles: twoProfiles(ADA, "Ada", { stripeConnectAccountId: "acct_1", stripeConnectPayoutsEnabled: true }),
        giftPayments: [{ _id: "giftPayments:g1", payeeUserId: ADA, workCents: 6000 }],
        backingPayments: [],
      },
      null,
    );
    const out = await run(listTransferable, ctx, {});
    expect(out.accounts).toEqual([{ payeeUserId: ADA, accountId: "acct_1" }]);
    expect(out.rows).toHaveLength(1);
  });
});

describe("a person with two profiles (browse and story pages)", () => {
  const world = () => ({
    users: [{ _id: BO }],
    profiles: twoProfiles(BO, "Bo"),
    projects: [project({ storySlug: "a-film" })],
  });

  it("garden/projects listProjects shows the creator", async () => {
    const rows = await run(listProjectsInApp, makeCtx(world(), null), {});
    expect(rows).toHaveLength(1);
    expect(rows[0].creator).toMatchObject({ _id: "profiles:bo1", name: "Bo" });
  });

  it("garden/projects getProject shows the creator", async () => {
    const out = await run(getProjectInApp, makeCtx(world(), null), { projectId: "projects:p1" });
    expect(out.creator).toMatchObject({ _id: "profiles:bo1", name: "Bo" });
  });

  it("garden/projectsPublic listProjects names the owner", async () => {
    const rows = await run(listPublicProjects, makeCtx(world(), null), {});
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).toContain("Bo");
  });

  it("garden/projectsPublic getProject names the owner", async () => {
    const out = await run(getPublicProject, makeCtx(world(), null), { projectId: "projects:p1" });
    expect(JSON.stringify(out)).toContain("Bo");
  });

  it("stories listProjectUpdates names the author", async () => {
    const ctx = makeCtx(
      {
        ...world(),
        storyUpdates: [
          { _id: "storyUpdates:u1", projectId: "projects:p1", authorUserId: BO, body: "Shot day one.", createdAt: 5 },
        ],
      },
      null,
    );
    const out = await run(listProjectUpdates, ctx, { projectId: "projects:p1" });
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out[0])).toContain("Bo");
  });

  it("stories getStoryPage shows the owner", async () => {
    const out = await run(getStoryPage, makeCtx(world(), null), { storySlug: "a-film" });
    expect(out).not.toBeNull();
    expect(JSON.stringify(out)).toContain("Bo");
  });
});

describe("a person with two profiles (support)", () => {
  it("supportProject posts the offer under the first profile's name", async () => {
    const ctx = makeCtx(
      { users: [{ _id: ADA }, { _id: BO }], profiles: twoProfiles(ADA, "Ada"), projects: [project()] },
      ADA,
    );
    const out = await run(supportProject, ctx, {
      projectId: "projects:p1",
      type: "resource",
      resourceDescription: "A free weekend in the studio.",
      visible: true,
    });
    expect(out.supportId).toBeTruthy();
    expect(ctx.store.projectSupport[0].supporterName).toBe("Ada");
    expect(ctx.store.notifications[0]).toMatchObject({
      userId: BO,
      type: "help_offered",
      title: "Ada offered help on A film",
    });
  });

  it("startBacking names the backer from the first profile", async () => {
    const ctx = makeCtx({ profiles: twoProfiles(ADA, "Ada"), projects: [project()] }, null);
    const out = await run(startBacking, ctx, {
      projectId: "projects:p1",
      userId: ADA,
      amountCents: 2000,
      recurring: false,
      visible: true,
    });
    expect(out).not.toBeNull();
    expect(ctx.store.projectSupport[0].supporterName).toBe("Ada");
  });
});

describe("a person with two profiles (funds)", () => {
  it("recordAllocation takes the recipient name from the project owner's first profile", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: ADMIN }, { _id: BO, email: "bo@example.com" }],
        profiles: [operator, ...twoProfiles(BO, "Bo")],
        hostOrgs: [{ _id: "hostOrgs:fund", name: "Grant Fund", slug: "grant-fund", kind: "platform" }],
        projects: [project()],
      },
      ADMIN,
    );
    await run(recordAllocation, ctx, {
      hostOrgSlug: "grant-fund",
      projectId: "projects:p1",
      amountCents: 50_000,
      period: "2026-10",
    });
    expect(ctx.store.allocations[0].recipientName).toBe("Bo");
  });

  it("listProposalsForReview names the proposer", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: ADMIN }, { _id: BO }],
        profiles: [operator, ...twoProfiles(BO, "Bo")],
        grantProposals: [
          {
            _id: "grantProposals:g1",
            userId: BO,
            hostOrgId: "hostOrgs:fund",
            title: "A film",
            summary: "About a film.",
            amountCents: 100_000,
            status: "submitted",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      ADMIN,
    );
    const out = await run(listProposalsForReview, ctx, { hostOrgId: "hostOrgs:fund" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ proposerName: "Bo", proposerProfileId: "profiles:bo1" });
  });

  it("seedPaidPostings remove clears a seed poster who has two profiles", async () => {
    const seed = "users:seed";
    const ctx = makeCtx(
      {
        users: [{ _id: seed, email: "x@seed.creatives.exchange" }],
        profiles: twoProfiles(seed, "Seed Poster"),
        projects: [project({ userId: seed })],
      },
      null,
    );
    const out = await run(removeSeedPostings, ctx, {});
    expect(out).toEqual({ ok: true, projects: 1, people: 1 });
    expect(ctx.store.users).toHaveLength(0);
  });
});

describe("a person with two profiles (member-directed giving)", () => {
  const GIFT = "memberGifts:m1";
  const COMMUNITY = "hostOrgs:garden";
  const world = () => ({
    users: [{ _id: ADA, email: "ada@example.com" }, { _id: BO, email: "bo@example.com" }],
    profiles: [
      ...twoProfiles(ADA, "Ada"),
      ...twoProfiles(BO, "Bo", { stripeConnectAccountId: "acct_1", stripeConnectPayoutsEnabled: true }),
    ],
    hostOrgs: [{ _id: COMMUNITY, name: "The Garden", slug: "garden", kind: "community" }],
    communityMembers: [{ _id: "communityMembers:bo", hostOrgId: COMMUNITY, userId: BO, status: "active" }],
    memberGifts: [
      {
        _id: GIFT,
        userId: ADA,
        communityId: COMMUNITY,
        sourceStripeRef: "in_1",
        period: "2026-10",
        amountCents: 500,
        status: "open",
        openedAt: 1,
      },
    ],
    projects: [project({ _id: "projects:bos", userId: BO })],
  });

  it("getMyGiving reads the viewer's Connect state and a recipient's name", async () => {
    const data = world();
    data.memberGifts = [
      { ...data.memberGifts[0], status: "creative", recipientUserId: BO, decidedBy: "member", decidedAt: 2 } as any,
    ];
    const out = await run(getMyGiving, makeCtx(data, ADA), {});
    expect(out.history[0].recipient).toEqual({ name: "Bo", profileId: "profiles:bo1" });
    expect(out.connect.started).toBe(false);
  });

  it("searchRecipients lists a member who has two profiles", async () => {
    const out = await run(searchRecipients, makeCtx(world(), ADA), { giftId: GIFT });
    expect(out.map((p: any) => p.name)).toEqual(["Bo"]);
  });

  it("listProjectsForGift names the project's owner", async () => {
    const out = await run(listProjectsForGift, makeCtx(world(), ADA), { giftId: GIFT });
    expect(out.map((p: any) => p.ownerName)).toEqual(["Bo"]);
  });

  it("decideGift gives to a creative who has two profiles", async () => {
    const ctx = makeCtx(world(), ADA);
    const out = await run(decideGift, ctx, { giftId: GIFT, target: "creative", recipientUserId: BO });
    expect(out).toMatchObject({ ok: true, target: "creative", recipientName: "Bo" });
    expect(ctx.store.giftPayments[0].giverName).toBe("Ada");
    expect(ctx.store.notifications.map((n: any) => n.type)).toEqual(["gift_received"]);
  });

  it("getGivingReport names a member who has two profiles", async () => {
    const data = world();
    const ctx = makeCtx(
      {
        ...data,
        profiles: [operator, ...data.profiles],
        users: [...data.users, { _id: ADMIN }],
        giftPayments: [
          {
            _id: "giftPayments:pu",
            memberGiftId: GIFT,
            giverUserId: ADA,
            payeeUserId: BO,
            source: "plus_up",
            billing: "one_time",
            grossCents: 1000,
            workCents: 900,
            createdAt: 3,
          },
        ],
      },
      ADMIN,
    );
    const out = await run(getGivingReport, ctx, {});
    expect(out.members.map((m: any) => m.name)).toEqual(["Ada"]);
  });

  it("getRecipientForCheckout names both people", async () => {
    const out = await run(getRecipientForCheckout, makeCtx(world(), null), {
      recipientUserId: BO,
      giverUserId: ADA,
    });
    expect(out).toEqual({ ok: true, recipientName: "Bo", giverName: "Ada" });
  });

  it("notifyGiftReceived reads a payee who has two profiles", async () => {
    const ctx = makeCtx(world(), null);
    await notifyGiftReceived(ctx, {
      payeeUserId: BO as any,
      giverUserId: ADA as any,
      giverName: "Ada",
      visible: true,
      amountCents: 500,
      source: "allowance",
      recurring: false,
    });
    expect(ctx.store.notifications).toHaveLength(1);
    // Connected, so no "Connect your bank" nudge.
    expect(ctx.store.notifications[0].message).not.toContain("Connect your bank");
  });

  it("scheduleTransferFor queues the sweep for a connected payee who has two profiles", async () => {
    const ctx = makeCtx(world(), null);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await scheduleTransferFor(ctx, BO as any);
    expect(runAfter).toHaveBeenCalledTimes(1);
  });
});

// ——— the organization "mine" list: signed out still sees nothing ———

describe("organizations: signed out still sees nothing", () => {
  it("mine is empty", async () => {
    expect(await run(mine, makeCtx({}, null), {})).toEqual([]);
  });
});

// ——— d) notifications and names that moved onto the shared helpers ———

const DAY = 24 * 60 * 60 * 1000;

/** The emails a call scheduled, by recipient. */
function emailsTo(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map((c: any[]) => c[2]).map((a: any) => ({ to: a.to, recipientUserId: a.recipientUserId, subject: a.subject }));
}

describe("project teams: who is told, and under what name", () => {
  const lead = { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] };
  const ada = { _id: "profiles:ada", userId: ADA, name: "Ada", interests: [] };
  const world = (extra: Record<string, unknown> = {}) => ({
    users: [
      { _id: ADA, email: "ada@example.com" },
      { _id: BO, email: "bo@example.com" },
    ],
    profiles: [lead, ada],
    projects: [project()],
    ...extra,
  });
  const member = (extra: Record<string, unknown> = {}) => ({
    _id: "projectMembers:m1",
    projectId: "projects:p1",
    userId: ADA,
    name: "Ada Invitee",
    role: "Singer",
    status: "invited",
    createdAt: 1,
    ...extra,
  });

  it("requestToJoin tells the lead, by notice and by email", async () => {
    const ctx = makeCtx(world(), ADA);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(requestToJoin, ctx, { projectId: "projects:p1", role: "Singer" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: BO,
        type: "project_join_request",
        title: "Ada wants to join A film",
        message: "as Singer",
        linkUrl: "/projects/projects:p1",
        relatedUserId: ADA,
      }),
    ]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "bo@example.com", recipientUserId: BO })]);
  });

  it("requestToJoin says Someone for a person with no profile", async () => {
    const ctx = makeCtx(world({ profiles: [lead] }), ADA);
    await run(requestToJoin, ctx, { projectId: "projects:p1", role: "Singer" });
    expect(ctx.store.notifications[0].title).toBe("Someone wants to join A film");
    expect(ctx.store.projectMembers[0].name).toBe("Someone");
  });

  it("inviteMember names the lead, or says The project lead", async () => {
    const named = makeCtx(world(), BO);
    const runAfter = vi.spyOn(named.scheduler, "runAfter");
    await run(inviteMember, named, { projectId: "projects:p1", userId: ADA, role: "Singer" });
    expect(named.store.notifications).toEqual([
      expect.objectContaining({ userId: ADA, type: "project_invite", title: "Bo invited you to A film", relatedUserId: BO }),
    ]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "ada@example.com", recipientUserId: ADA })]);

    const unnamed = makeCtx(world({ profiles: [ada] }), BO);
    await run(inviteMember, unnamed, { projectId: "projects:p1", userId: ADA, role: "Singer" });
    expect(unnamed.store.notifications[0].title).toBe("The project lead invited you to A film");
  });

  it("decideRequest tells the person, by notice and by email", async () => {
    const ctx = makeCtx(world({ projectMembers: [member({ status: "pending" })] }), BO);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(decideRequest, ctx, { memberId: "projectMembers:m1", accept: true });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: ADA, type: "project_request_decided", title: "You're on A film", relatedUserId: BO }),
    ]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "ada@example.com", recipientUserId: ADA })]);
  });

  it("removeMember tells the person with a notice and no email", async () => {
    const ctx = makeCtx(world({ projectMembers: [member({ status: "accepted" })] }), BO);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(removeMember, ctx, { memberId: "projectMembers:m1" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: ADA, type: "project_member_removed", title: "You were removed from A film" }),
    ]);
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("respondToInvite tells the lead, under the profile name or the name on the row", async () => {
    const named = makeCtx(world({ projectMembers: [member()] }), ADA);
    await run(respondToInvite, named, { projectId: "projects:p1", accept: true });
    expect(named.store.notifications[0]).toMatchObject({ userId: BO, type: "project_member_joined", title: "Ada joined A film" });

    const unnamed = makeCtx(world({ profiles: [lead], projectMembers: [member()] }), ADA);
    await run(respondToInvite, unnamed, { projectId: "projects:p1", accept: false });
    expect(unnamed.store.notifications[0]).toMatchObject({ type: "project_member_declined", title: "Ada Invitee declined A film" });
  });

  it("leaveProject tells the lead, under the profile name or the name on the row", async () => {
    const named = makeCtx(world({ projectMembers: [member({ status: "accepted" })] }), ADA);
    await run(leaveProject, named, { projectId: "projects:p1" });
    expect(named.store.notifications[0]).toMatchObject({ userId: BO, type: "project_member_left", title: "Ada left A film" });

    const unnamed = makeCtx(world({ profiles: [lead], projectMembers: [member({ status: "accepted" })] }), ADA);
    await run(leaveProject, unnamed, { projectId: "projects:p1" });
    expect(unnamed.store.notifications[0].title).toBe("Ada Invitee left A film");
  });

  it("claimInvite tells the lead, under the profile name or the credited name", async () => {
    const credit = member({ userId: undefined, name: "Credited Name", claimToken: "tok", claimExpiresAt: Date.now() + DAY });
    const named = makeCtx(world({ projectMembers: [credit] }), ADA);
    await run(claimInvite, named, { token: "tok" });
    expect(named.store.notifications[0]).toMatchObject({ userId: BO, type: "project_member_joined", title: "Ada joined A film" });

    const unnamed = makeCtx(world({ profiles: [lead], projectMembers: [credit] }), ADA);
    await run(claimInvite, unnamed, { token: "tok" });
    expect(unnamed.store.notifications[0].title).toBe("Credited Name joined A film");
  });

  it("setStage tells the team, stamped with the time of the change", async () => {
    const ctx = makeCtx(
      world({
        projects: [project({ stage: "planning", userId: BO })],
        projectMembers: [member({ status: "accepted" })],
      }),
      BO,
    );
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      await run(setStage, ctx, { projectId: "projects:p1", stage: "forming" });
    } finally {
      vi.restoreAllMocks();
    }
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: ADA,
        type: "project_stage_changed",
        relatedUserId: BO,
        createdAt: 1_800_000_000_000,
      }),
    ]);
  });
});

describe("projects: followers hear who posted", () => {
  const world = (name: string) => ({
    users: [{ _id: ADA }, { _id: BO }],
    profiles: [
      { _id: "profiles:ada", userId: ADA, name, interests: [] },
      { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] },
    ],
    favorites: [{ _id: "favorites:f1", userId: BO, targetType: "profile", targetId: "profiles:ada" }],
  });

  it("createPassionProject names the poster in the follower's notice", async () => {
    const ctx = makeCtx(world("Ada"), ADA);
    await run(createPassionProject, ctx, { title: "A film" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: BO, type: "followed_posted_project", title: "Ada posted A film" }),
    ]);
  });

  it("createPassionProject says Someone for a poster with a blank name", async () => {
    const ctx = makeCtx(world(""), ADA);
    await run(createPassionProject, ctx, { title: "A film" });
    expect(ctx.store.notifications[0].title).toBe("Someone posted A film");
  });
});

describe("gigs: who is told, and under what name", () => {
  const host = { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] };
  const artist = { _id: "profiles:ada", userId: ADA, name: "Ada", interests: [], payoutHandles: { venmo: "@ada" } };
  const soon = Date.now() + 10 * DAY;
  const world = (extra: Record<string, unknown> = {}) => ({
    users: [
      { _id: ADA, email: "ada@example.com" },
      { _id: BO, email: "bo@example.com" },
    ],
    profiles: [host, artist],
    projects: [project({ kind: "paid", title: "Friday nights" })],
    gigSeries: [
      {
        _id: "gigSeries:s1",
        projectId: "projects:p1",
        hostUserId: BO,
        venueName: "The Barn",
        weekdays: [5],
        intervalWeeks: 1,
        startDate: "2026-01-02",
        endMode: "never",
        startTime: "20:00",
        endTime: "22:00",
        timeZone: "America/Los_Angeles",
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    gigSlots: [
      {
        _id: "gigSlots:d1",
        seriesId: "gigSeries:s1",
        projectId: "projects:p1",
        date: "2026-11-06",
        startsAt: soon,
        endsAt: soon + 2 * 60 * 60 * 1000,
        status: "booked",
        bookedUserId: ADA,
        bookedResponseId: "gigResponses:r1",
        createdAt: 1,
      },
    ],
    gigResponses: [
      {
        _id: "gigResponses:r1",
        seriesId: "gigSeries:s1",
        slotId: "gigSlots:d1",
        projectId: "projects:p1",
        userId: ADA,
        status: "booked",
        clipIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    ...extra,
  });
  const only = (ctx: any) => ctx.store.notifications.map((n: any) => ({ userId: n.userId, type: n.type, relatedUserId: n.relatedUserId }));

  it("cancelSlot tells the booked artist, by notice and by email", async () => {
    const ctx = makeCtx(world(), BO);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(cancelSlot, ctx, { slotId: "gigSlots:d1" });
    expect(only(ctx)).toEqual([{ userId: ADA, type: "gig_cancelled", relatedUserId: BO }]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "ada@example.com", recipientUserId: ADA })]);
  });

  it("unbookSlot tells the artist, by notice and by email", async () => {
    const ctx = makeCtx(world(), BO);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(unbookSlot, ctx, { slotId: "gigSlots:d1" });
    expect(only(ctx)).toEqual([{ userId: ADA, type: "gig_unbooked", relatedUserId: BO }]);
    expect(emailsTo(runAfter)).toHaveLength(1);
  });

  it("markSlotPaid tells the artist, by notice and by email", async () => {
    const ctx = makeCtx(world(), BO);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(markSlotPaid, ctx, { slotId: "gigSlots:d1", amountCents: 8000, method: "venmo" });
    expect(only(ctx)).toEqual([{ userId: ADA, type: "gig_paid", relatedUserId: BO }]);
    expect(ctx.store.notifications[0].message).toBe("$80 via venmo. Confirm it once it lands.");
    expect(emailsTo(runAfter)).toHaveLength(1);
  });

  it("confirmSlotPaid tells the venue, by the artist's name", async () => {
    const ctx = makeCtx(
      world({ gigSlots: [{ ...world().gigSlots[0], paidAt: 5, paidAmountCents: 8000, paidMethod: "venmo" }] }),
      ADA,
    );
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(confirmSlotPaid, ctx, { slotId: "gigSlots:d1" });
    expect(only(ctx)).toEqual([{ userId: BO, type: "gig_paid_confirmed", relatedUserId: ADA }]);
    expect(ctx.store.notifications[0].title).toContain("Ada confirmed payment");
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "bo@example.com", recipientUserId: BO })]);
  });

  it("withdrawResponse tells the venue when a booked artist pulls out", async () => {
    const ctx = makeCtx(world(), ADA);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(withdrawResponse, ctx, { slotId: "gigSlots:d1" });
    expect(only(ctx)).toEqual([{ userId: BO, type: "gig_artist_withdrew", relatedUserId: ADA }]);
    expect(ctx.store.notifications[0].title).toContain("Ada can't make");
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "bo@example.com" })]);
  });

  it("updateGigSeries tells a booked artist the time changed, by notice and by email", async () => {
    const ctx = makeCtx(world(), BO);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(updateGigSeries, ctx, { seriesId: "gigSeries:s1", startTime: "19:00" });
    expect(only(ctx)).toEqual([{ userId: ADA, type: "gig_time_changed", relatedUserId: BO }]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "ada@example.com", recipientUserId: ADA })]);
  });

  it("respondAvailable tells the venue which dates an artist can play, by notice and by email", async () => {
    const open = { ...world().gigSlots[0], status: "open", bookedUserId: undefined, bookedResponseId: undefined };
    const ctx = makeCtx(
      world({
        gigSlots: [open],
        gigResponses: [],
        memberships: [{ _id: "memberships:m1", userId: ADA, status: "active", level: "seat" }],
      }),
      ADA,
    );
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(respondAvailable, ctx, { seriesId: "gigSeries:s1", slotIds: ["gigSlots:d1"], clipIds: [] });
    expect(only(ctx)).toEqual([{ userId: BO, type: "gig_response", relatedUserId: ADA }]);
    expect(ctx.store.notifications[0].title).toContain("Ada can play");
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "bo@example.com", recipientUserId: BO })]);
  });

  it("createGigSeries tells the poster's followers who posted, or Someone", async () => {
    const args = {
      title: "Friday nights",
      venueName: "The Barn",
      budgetType: "amount",
      budget: 80,
      location: "San Diego, CA",
      weekdays: [5],
      intervalWeeks: 1,
      startDate: "2027-01-01",
      endMode: "never",
      startTime: "20:00",
      endTime: "22:00",
      timeZone: "America/Los_Angeles",
    };
    const followers = { favorites: [{ _id: "favorites:f1", userId: ADA, targetType: "profile", targetId: "profiles:bo" }], projects: [] };
    const named = makeCtx(world({ ...followers, gigSeries: [], gigSlots: [], gigResponses: [] }), BO);
    await run(createGigSeries, named, args);
    expect(named.store.notifications.map((n: any) => ({ userId: n.userId, title: n.title }))).toEqual([
      { userId: ADA, title: "Bo posted Friday nights" },
    ]);

    const blankName = makeCtx(
      world({ ...followers, profiles: [{ ...host, name: "" }, artist], gigSeries: [], gigSlots: [], gigResponses: [] }),
      BO,
    );
    await run(createGigSeries, blankName, args);
    expect(blankName.store.notifications[0].title).toBe("Someone posted Friday nights");
  });

  it("bookSlot tells the artist they're booked, with the payout nudge only when they have none", async () => {
    const open = {
      ...world().gigSlots[0],
      status: "open",
      bookedUserId: undefined,
      bookedResponseId: undefined,
    };
    const availableResponse = { ...world().gigResponses[0], status: "available" };

    const withPayout = makeCtx(world({ gigSlots: [open], gigResponses: [availableResponse] }), BO);
    const runAfter = vi.spyOn(withPayout.scheduler, "runAfter");
    await run(bookSlot, withPayout, { slotId: "gigSlots:d1", responseId: "gigResponses:r1" });
    expect(only(withPayout)).toEqual([{ userId: ADA, type: "gig_booked", relatedUserId: BO }]);
    expect(withPayout.store.notifications[0].message).not.toContain("Add how you get paid");
    expect(emailsTo(runAfter)).toHaveLength(1);

    const noPayout = makeCtx(
      world({ profiles: [host, { ...artist, payoutHandles: undefined }], gigSlots: [open], gigResponses: [availableResponse] }),
      BO,
    );
    await run(bookSlot, noPayout, { slotId: "gigSlots:d1", responseId: "gigResponses:r1" });
    expect(noPayout.store.notifications[0].message).toContain("Add how you get paid");
  });
});

describe("funds and giving: who is told", () => {
  it("decideProposal tells the proposer, by notice and by email", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: ADMIN }, { _id: BO, email: "bo@example.com" }],
        profiles: [operator, { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] }],
        hostOrgs: [{ _id: "hostOrgs:fund", name: "Grant Fund", slug: "grant-fund", kind: "platform" }],
        grantProposals: [
          {
            _id: "grantProposals:g1",
            userId: BO,
            hostOrgId: "hostOrgs:fund",
            projectId: "projects:p1",
            title: "A film",
            summary: "About a film.",
            amountCents: 100_000,
            status: "submitted",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      ADMIN,
    );
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    try {
      await run(decideProposal, ctx, { proposalId: "grantProposals:g1", approve: true });
    } finally {
      vi.restoreAllMocks();
    }
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: BO,
        type: "grant_proposal_approved",
        title: "Your grant proposal was approved",
        message: "A film",
        linkUrl: "/fund/grant-fund",
        relatedUserId: ADMIN,
        projectId: "projects:p1",
        createdAt: 1_800_000_000_000,
      }),
    ]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "bo@example.com", recipientUserId: BO })]);
  });

  it("recordAllocation tells the project's owner, by notice and by email", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: ADMIN }, { _id: BO, email: "bo@example.com" }],
        profiles: [operator, { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] }],
        hostOrgs: [{ _id: "hostOrgs:fund", name: "Grant Fund", slug: "grant-fund", kind: "platform" }],
        projects: [project()],
      },
      ADMIN,
    );
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(recordAllocation, ctx, {
      hostOrgSlug: "grant-fund",
      projectId: "projects:p1",
      amountCents: 50_000,
      period: "2026-10",
    });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: BO,
        type: "fund_award",
        linkUrl: "/fund/grant-fund",
        projectId: "projects:p1",
        amountCents: 50_000,
      }),
    ]);
    expect(ctx.store.notifications[0].createdAt).toEqual(expect.any(Number));
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "bo@example.com", recipientUserId: BO })]);
  });

  it("openMemberGift tells the member they have an amount to give, by notice and by email", async () => {
    const ctx = makeCtx({ users: [{ _id: ADA, email: "ada@example.com" }], profiles: twoProfiles(ADA, "Ada") }, null);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    const giftId = await openMemberGift(ctx, {
      userId: ADA as any,
      communityId: "hostOrgs:garden" as any,
      sourceStripeRef: "in_1",
      period: "2026-10",
      amountCents: 1000,
    });
    expect(giftId).toBeTruthy();
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: ADA, type: "gift_opened", linkUrl: "/give" }),
    ]);
    expect(emailsTo(runAfter)).toEqual([expect.objectContaining({ to: "ada@example.com", recipientUserId: ADA })]);
  });

  it("a gift to someone who hasn't connected tells them to, in the notice and not by email", async () => {
    const ctx = makeCtx({ users: [{ _id: BO, email: "bo@example.com" }], profiles: twoProfiles(BO, "Bo") }, null);
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await notifyGiftReceived(ctx, {
      payeeUserId: BO as any,
      giverUserId: ADA as any,
      giverName: "Ada",
      visible: true,
      amountCents: 500,
      source: "plus_up",
      recurring: false,
      projectId: "projects:p1" as any,
    });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: BO,
        type: "backing_received",
        message: "Connect your bank in Settings to get it.",
        relatedUserId: ADA,
        projectId: "projects:p1",
        amountCents: 500,
      }),
    ]);
    expect(runAfter).not.toHaveBeenCalled();
  });
});

describe("organizations: who is told", () => {
  const world = () => ({
    users: [{ _id: ADMIN }, { _id: ADA }],
    profiles: [
      { _id: "profiles:admin", userId: ADMIN, name: "Admin", interests: [] },
      { _id: "profiles:ada", userId: ADA, name: "Ada", interests: [] },
    ],
    organizations: [{ _id: "organizations:ap", name: "Abiding Practice", nameKey: "abiding practice", slug: "abiding-practice" }],
    orgPositions: [
      { _id: "orgPositions:a", organizationId: "organizations:ap", userId: ADMIN, profileId: "profiles:admin", isAdmin: true, order: 0, createdAt: 1 },
    ],
  });

  it("addPerson tells the person who added them, by name", async () => {
    const ctx = makeCtx(world(), ADMIN);
    await run(addPerson, ctx, { organizationId: "organizations:ap", profileId: "profiles:ada" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: ADA,
        type: "org_added",
        title: "Admin added you to Abiding Practice",
        linkUrl: "/settings#organizations",
        relatedUserId: ADMIN,
      }),
    ]);
  });

  it("join tells the organization's admins", async () => {
    const ctx = makeCtx(world(), ADA);
    await run(join, ctx, { organizationId: "organizations:ap" });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: ADMIN,
        type: "org_joined",
        title: "Ada joined Abiding Practice",
        linkUrl: "/orgs/abiding-practice/edit",
        relatedUserId: ADA,
      }),
    ]);
  });
});

describe("stories: followers hear who posted", () => {
  const world = () => ({
    users: [{ _id: ADA }, { _id: BO }],
    profiles: [
      { _id: "profiles:ada", userId: ADA, name: "Ada", interests: [] },
      { _id: "profiles:bo", userId: BO, name: "Bo", interests: [] },
    ],
    favorites: [{ _id: "favorites:f1", userId: BO, targetType: "profile", targetId: "profiles:ada" }],
    projects: [project({ userId: ADA })],
  });

  it("postStoryUpdate names the poster in the follower's notice", async () => {
    const ctx = makeCtx(world(), ADA);
    await run(postStoryUpdate, ctx, { projectId: "projects:p1", body: "Shot day one." });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({ userId: BO, type: "project_update", title: "Ada posted an update on A film" }),
    ]);
  });

  it("postStoryUpdate says Someone for a poster with no profile name", async () => {
    const data = world();
    data.profiles[0].name = "";
    const ctx = makeCtx(data, ADA);
    await run(postStoryUpdate, ctx, { projectId: "projects:p1", body: "Shot day one." });
    // notifyFollowers needs the profile row to find followers; the name falls back.
    expect(ctx.store.notifications[0].title).toBe("Someone posted an update on A film");
  });
});
