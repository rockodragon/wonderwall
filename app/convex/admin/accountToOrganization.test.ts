// The Abiding Practice fix (Rick, 2026-10-10): a shared login made for an
// organization becomes that organization. Real handler, in-memory ctx.

import { describe, expect, it } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { accountToOrganization } from "./accountToOrganization";

const AP = "users:ap";
const DAVID = "users:david";
const JO = "users:jo";
const ORG = "organizations:ap";

function world(extra: Record<string, any[]> = {}) {
  return makeCtx(
    {
      users: [{ _id: AP, name: "Abiding Practice" }, { _id: DAVID }, { _id: JO }],
      profiles: [
        { _id: "profiles:ap", userId: AP, name: "Abiding Practice" },
        { _id: "profiles:david", userId: DAVID, name: "David Russo" },
        { _id: "profiles:jo", userId: JO, name: "Jo" },
      ],
      organizations: [{ _id: ORG, name: "Abiding Practice", slug: "abiding-practice" }],
      orgPositions: [
        { _id: "orgPositions:ap", organizationId: ORG, userId: AP, profileId: "profiles:ap", isAdmin: false, createdAt: 1 },
        { _id: "orgPositions:d", organizationId: ORG, userId: DAVID, profileId: "profiles:david", isAdmin: false, createdAt: 1 },
      ],
      projects: [{ _id: "projects:bloom", userId: AP, title: "Bloom (short film)", createdAt: 1, updatedAt: 1 }],
      projectMembers: [
        { _id: "projectMembers:d", projectId: "projects:bloom", userId: DAVID, invitedByUserId: AP, status: "accepted" },
        { _id: "projectMembers:j", projectId: "projects:bloom", userId: JO, invitedByUserId: AP, status: "accepted" },
      ],
      invites: [{ _id: "invites:1", inviterId: AP, code: "x" }],
      conversations: [{ _id: "conversations:1", participants: [AP, JO], lastMessageAt: 5, createdAt: 1 }],
      messages: [{ _id: "messages:1", conversationId: "conversations:1", senderId: JO, content: "hi", createdAt: 5 }],
      communityMembers: [{ _id: "communityMembers:ap", userId: AP, hostOrgId: "hostOrgs:garden", status: "active" }],
      authAccounts: [{ _id: "authAccounts:ap", userId: AP, provider: "password" }],
      authSessions: [{ _id: "authSessions:ap", userId: AP }],
      ...extra,
    },
    null,
  );
}
const args = (dryRun: boolean) => ({ userId: AP, organizationId: ORG, runBy: DAVID, dryRun });
// The in-memory ctx creates an empty table the first time one is read.
const rows = (store: Record<string, any[]>) =>
  JSON.stringify(Object.fromEntries(Object.entries(store).filter(([, r]) => r.length > 0)));

describe("accountToOrganization", () => {
  it("a dry run says what it would do and changes nothing", async () => {
    const ctx = world();
    const before = rows(ctx.store);
    expect(await run(accountToOrganization, ctx, args(true))).toEqual({
      dryRun: true,
      account: "Abiding Practice",
      organization: "Abiding Practice",
      runBy: "David Russo",
      projects: ["Bloom (short film)"],
      conversations: 1,
    });
    expect(rows(ctx.store)).toBe(before);
  });

  it("moves the projects to the organization, run by David, and removes the login", async () => {
    const ctx = world();
    await run(accountToOrganization, ctx, args(false));
    const s = ctx.store;
    expect(s.projects[0]).toMatchObject({ userId: DAVID, organizationId: ORG });
    // David leads it now, so his member row goes; Jo stays, invited by David.
    expect(s.projectMembers).toEqual([expect.objectContaining({ userId: JO, invitedByUserId: DAVID })]);
    expect(s.invites[0].inviterId).toBe(DAVID);
    expect(s.conversations[0].participants).toEqual([DAVID, JO]);
    expect(s.messages).toHaveLength(1);
    expect(s.orgPositions.map((p: any) => p.userId)).toEqual([DAVID]);
    expect(s.communityMembers).toEqual([]);
    expect(s.authAccounts).toEqual([]);
    expect(s.authSessions).toEqual([]);
    expect(s.profiles.map((p: any) => p.userId)).toEqual([DAVID, JO]);
    expect(s.users.map((u: any) => u._id)).toEqual([DAVID, JO]);
  });

  it("refuses when something it doesn't handle points at the account", async () => {
    const ctx = world({ eventRsvps: [{ _id: "eventRsvps:1", userId: AP, eventId: "events:1" }] });
    expect(await run(accountToOrganization, ctx, args(false))).toEqual({
      blocked: true,
      blockers: { "eventRsvps.userId": 1 },
    });
    expect(ctx.store.users).toHaveLength(3);
  });

  it("hands the organizations it started and the files it uploaded to David, and clears its other traces", async () => {
    const ctx = world({
      organizations: [{ _id: ORG, name: "Abiding Practice", slug: "abiding-practice", createdByUserId: AP }],
      uploadClaims: [{ _id: "uploadClaims:1", storageId: "_storage:logo", userId: AP, claimedAt: 1 }],
      nudgeLog: [{ _id: "nudgeLog:1", userId: AP, loopKey: "x", status: "sent", at: 1 }],
      handleForwards: [{ _id: "handleForwards:1", handle: "ap-old", profileId: "profiles:ap", expiresAt: 9e15 }],
      favorites: [{ _id: "favorites:1", userId: JO, targetType: "profile", targetId: "profiles:ap" }],
    });
    expect(await run(accountToOrganization, ctx, args(false))).toMatchObject({ done: true });
    const s = ctx.store;
    expect(s.organizations[0].createdByUserId).toBe(DAVID);
    expect(s.uploadClaims[0].userId).toBe(DAVID);
    expect(s.nudgeLog).toEqual([]);
    expect(s.handleForwards).toEqual([]);
    expect(s.favorites).toEqual([]);
  });

  describe("what the nurture work keeps about the account (2026-10-27)", () => {
    const summary = (_id: string, conversationId: string, userId: string, otherUserId: string) => ({
      _id: `conversationParticipants:${_id}`,
      conversationId: `conversations:${conversationId}`,
      userId,
      otherUserId,
      lastMessageAt: 1,
      historyComplete: true,
    });
    const delivery = (_id: string, recipientUserId: string) => ({ _id: `emailDeliveries:${_id}`, recipientUserId, to: "x@example.com", status: "sent" });
    const pairs = (s: any[]) => s.map((r) => [r._id.split(":")[1], r.userId, r.otherUserId, r.historyComplete]);

    it("a conversation's summaries follow it to David, and the emails sent to the login go", async () => {
      const ctx = world({
        conversationParticipants: [summary("ap", "1", AP, JO), summary("jo", "1", JO, AP)],
        emailDeliveries: [delivery("ap", AP), delivery("jo", JO)],
      });
      expect(await run(accountToOrganization, ctx, args(true))).toMatchObject({ dryRun: true });
      expect(ctx.store.conversationParticipants).toHaveLength(2);
      expect(await run(accountToOrganization, ctx, args(false))).toMatchObject({ done: true });
      expect(pairs(ctx.store.conversationParticipants)).toEqual([
        ["ap", DAVID, JO, true],
        ["jo", JO, DAVID, true],
      ]);
      expect(ctx.store.emailDeliveries.map((d: any) => d._id)).toEqual(["emailDeliveries:jo"]);
    });

    it("a talk with David goes with its summaries; one David already has takes its messages and is recomputed", async () => {
      const ctx = world({
        conversations: [
          { _id: "conversations:ap-jo", participants: [AP, JO], lastMessageAt: 5, createdAt: 1 },
          { _id: "conversations:david-jo", participants: [DAVID, JO], lastMessageAt: 4, createdAt: 1 },
          { _id: "conversations:ap-david", participants: [AP, DAVID], lastMessageAt: 3, createdAt: 1 },
        ],
        messages: [],
        conversationParticipants: [
          summary("apjo-ap", "ap-jo", AP, JO),
          summary("apjo-jo", "ap-jo", JO, AP),
          summary("davidjo-david", "david-jo", DAVID, JO),
          summary("davidjo-jo", "david-jo", JO, DAVID),
          summary("apdavid-ap", "ap-david", AP, DAVID),
          summary("apdavid-david", "ap-david", DAVID, AP),
        ],
      });
      await run(accountToOrganization, ctx, args(false));
      expect(ctx.store.conversations.map((c: any) => c._id)).toEqual(["conversations:david-jo"]);
      expect(pairs(ctx.store.conversationParticipants)).toEqual([
        ["davidjo-david", DAVID, JO, false],
        ["davidjo-jo", JO, DAVID, false],
      ]);
    });
  });

  it("refuses when an event shows the account as a host", async () => {
    const ctx = world({ events: [{ _id: "events:1", organizerId: DAVID, displayHosts: [{ kind: "user", userId: AP }] }] });
    expect(await run(accountToOrganization, ctx, args(true))).toEqual({
      blocked: true,
      blockers: { "events.displayHosts": 1 },
    });
  });

  it("refuses a runBy who isn't part of the organization", async () => {
    await expect(
      run(accountToOrganization, world(), { userId: AP, organizationId: ORG, runBy: JO, dryRun: true }),
    ).rejects.toThrow(/isn't part of Abiding Practice/);
  });
});
