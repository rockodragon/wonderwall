// The admin group of the drift cleanup: invites, waitlist, admin, analytics,
// seed, crawler, jobScraper, showcase. What changed on purpose:
//   - signed out is the shared refusal (requireUserId), not a plain Error
//     that production hides;
//   - the person-triggerable plain Errors in invites.ts and admin.ts are
//     ConvexErrors with a code and a readable reason;
//   - the invite-accepted notification goes through insertNotification, with
//     its email folded in.
// What must not change: signed-out reads still answer null / [] / empty.

import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import { create, redeem, generateInviteSlug, redeemBySlug, getMyInvites, getMyInviteLink, getMyNetwork } from "./invites";
import { manuallyLinkInvite, deleteUser, setAdminStatus } from "./admin";
import { toggleProfileLike, getProfileLikeStatus, getMyProfileAnalytics, recordProfileView } from "./analytics";
import { generateInvites } from "./seed";
import { startQueueProcessor, seedTestUrls } from "./crawler";
import { scrapeJobsForOrganization, scrapeJobsBatch } from "./jobScraper";
import { listForAdmin, approveEntry } from "./waitlist";
import { adminList } from "./showcase";

const ME = "users:me";
const ADMIN = "users:admin";
const OTHER = "users:other";

async function refusal(call: Promise<unknown>): Promise<{ code: string; reason: string }> {
  try {
    await call;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<any>).data;
  }
  throw new Error("expected the call to be refused");
}

describe("signed out is the shared refusal", () => {
  const cases: [string, unknown, Record<string, unknown>][] = [
    ["invites.create", create, {}],
    ["invites.redeem", redeem, { code: "ABCD" }],
    ["invites.generateInviteSlug", generateInviteSlug, {}],
    ["invites.redeemBySlug", redeemBySlug, { slug: "abc" }],
    ["analytics.toggleProfileLike", toggleProfileLike, { profileId: "profiles:1" }],
    ["seed.generateInvites", generateInvites, {}],
    ["crawler.startQueueProcessor", startQueueProcessor, {}],
    ["crawler.seedTestUrls", seedTestUrls, {}],
    ["jobScraper.scrapeJobsForOrganization", scrapeJobsForOrganization, { organizationId: "crawledOrganizations:1" }],
    ["jobScraper.scrapeJobsBatch", scrapeJobsBatch, {}],
  ];
  for (const [name, fn, args] of cases) {
    it(name, async () => {
      await expectSignedOutRefusal(fn, args);
    });
  }
});

describe("signed out still gets the old empty answer", () => {
  const signedOut = () => makeCtx({}, null);

  it("getMyInvites -> []", async () => {
    expect(await run(getMyInvites, signedOut())).toEqual([]);
  });
  it("getMyInviteLink -> null", async () => {
    expect(await run(getMyInviteLink, signedOut())).toBeNull();
  });
  it("getMyNetwork -> null", async () => {
    expect(await run(getMyNetwork, signedOut())).toBeNull();
  });
  it("getMyProfileAnalytics -> null", async () => {
    expect(await run(getMyProfileAnalytics, signedOut())).toBeNull();
  });
  it("getProfileLikeStatus -> not liked", async () => {
    const ctx = makeCtx({ profileLikes: [{ _id: "profileLikes:1", profileId: "profiles:1", userId: OTHER }] }, null);
    expect(await run(getProfileLikeStatus, ctx, { profileId: "profiles:1" })).toEqual({ count: 1, userLiked: false });
  });
  it("recordProfileView still records an anonymous view", async () => {
    const ctx = makeCtx({ profiles: [{ _id: "profiles:1", userId: OTHER }] }, null);
    await run(recordProfileView, ctx, { profileId: "profiles:1" });
    expect(ctx.store.profileViews).toHaveLength(1);
    expect(ctx.store.profileViews[0].viewerId).toBeUndefined();
  });
});

describe("invites: plain Errors a person can trigger are ConvexErrors", () => {
  it("redeem: a code that doesn't exist", async () => {
    const ctx = makeCtx({}, ME);
    expect(await refusal(run(redeem, ctx, { code: "nope" }))).toEqual({
      code: "not_found",
      reason: "Invalid invite code",
    });
  });

  it("redeem: a code already used", async () => {
    const ctx = makeCtx({ invites: [{ _id: "invites:1", code: "USED", inviterId: OTHER, usedBy: OTHER }] }, ME);
    expect(await refusal(run(redeem, ctx, { code: "used" }))).toEqual({
      code: "invalid_input",
      reason: "Invite already used",
    });
  });

  it("generateInviteSlug: signed in with no profile yet", async () => {
    const ctx = makeCtx({}, ME);
    expect(await refusal(run(generateInviteSlug, ctx))).toEqual({
      code: "no_profile",
      reason: "Finish your profile first.",
    });
  });

  it("redeemBySlug: a link nobody owns", async () => {
    const ctx = makeCtx({}, ME);
    expect(await refusal(run(redeemBySlug, ctx, { slug: "ghost" }))).toEqual({
      code: "not_found",
      reason: "Invalid invite link",
    });
  });
});

describe("admin: plain Errors a person can trigger are ConvexErrors", () => {
  const adminWorld = (extra: Record<string, any[]> = {}) =>
    makeCtx(
      {
        users: [{ _id: ADMIN }, { _id: OTHER }],
        profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }],
        ...extra,
      },
      ADMIN,
    );

  it("manuallyLinkInvite: the inviter has no profile", async () => {
    expect(
      await refusal(run(manuallyLinkInvite, adminWorld(), { inviteeUserId: ADMIN, inviterUserId: OTHER })),
    ).toEqual({ code: "not_found", reason: "Inviter profile not found" });
  });

  it("deleteUser: the person has no profile", async () => {
    expect(await refusal(run(deleteUser, adminWorld(), { userId: OTHER }))).toEqual({
      code: "not_found",
      reason: "Profile not found",
    });
  });

  it("setAdminStatus: the person has no profile", async () => {
    expect(await refusal(run(setAdminStatus, adminWorld(), { userId: OTHER, isAdmin: true }))).toEqual({
      code: "not_found",
      reason: "Profile not found",
    });
  });

  it("a non-admin is still refused as forbidden", async () => {
    const ctx = makeCtx({ profiles: [{ _id: "profiles:me", userId: ME, name: "Me" }] }, ME);
    expect((await refusal(run(setAdminStatus, ctx, { userId: OTHER, isAdmin: true }))).code).toBe("forbidden");
  });
});

describe("profile lookups through getProfileByUserId keep their answers", () => {
  it("manuallyLinkInvite links an invitee to an inviter with a profile", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: ADMIN }, { _id: OTHER }],
        profiles: [
          { _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true },
          { _id: "profiles:other", userId: OTHER, name: "Olu", inviteSlug: "OLU123", inviteUsageCount: 2 },
        ],
      },
      ADMIN,
    );
    expect(await run(manuallyLinkInvite, ctx, { inviteeUserId: ADMIN, inviterUserId: OTHER })).toEqual({
      message: "Successfully linked invite",
      existing: false,
    });
    expect(ctx.store.invites[0]).toMatchObject({ inviterId: OTHER, usedBy: ADMIN, code: "OLU123" });
    expect(ctx.store.profiles.find((p: any) => p._id === "profiles:other").inviteUsageCount).toBe(3);
  });

  it("listForAdmin names the admin who approved an entry", async () => {
    const ctx = makeCtx(
      {
        profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }],
        waitlist: [{ _id: "waitlist:1", email: "a@b.co", createdAt: 1, approvedBy: ADMIN, approvedAt: 2 }],
        hostOrgs: [],
      },
      ADMIN,
    );
    const [row] = await run(listForAdmin, ctx);
    expect(row.approvedByName).toBe("Ada");
  });

  it("approveEntry: a missing entry is still the plain Error (waitlist.ts isn't in the error migration)", async () => {
    const ctx = makeCtx(
      { profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }] },
      ADMIN,
    );
    await expect(run(approveEntry, ctx, { waitlistId: "waitlist:gone" })).rejects.toThrow("Waitlist entry not found");
  });

  it("showcase adminList names each voter from their profile", async () => {
    const ctx = makeCtx(
      {
        profiles: [{ _id: "profiles:admin", userId: ADMIN, name: "Ada", isAdmin: true }],
        showcaseApplications: [{ _id: "showcaseApplications:1", email: "x@y.co", createdAt: 1, status: "new" }],
        showcaseVotes: [
          { _id: "showcaseVotes:1", applicationId: "showcaseApplications:1", userId: ADMIN, vote: "yes" },
          { _id: "showcaseVotes:2", applicationId: "showcaseApplications:1", userId: OTHER, vote: "no" },
        ],
      },
      ADMIN,
    );
    const [row] = await run(adminList, ctx);
    expect(row.votes.map((v: any) => v.voter).sort()).toEqual(["Ada", "An admin"]);
    expect(row.myVote).toBe("yes");
  });
});

describe("redeemBySlug: the invite-accepted notification", () => {
  function world() {
    const ctx = makeCtx(
      {
        users: [
          { _id: ME, email: "new@member.co" },
          { _id: OTHER, email: "inviter@member.co" },
        ],
        profiles: [
          { _id: "profiles:me", userId: ME, name: "Newcomer <b>", interests: [], createdAt: 1 },
          { _id: "profiles:other", userId: OTHER, name: "Olu", inviteSlug: "OLU123", inviteUsageCount: 0, interests: [], createdAt: 1 },
        ],
        hostOrgs: [{ _id: "hostOrgs:garden", slug: "the-garden", name: "The Garden", status: "active" }],
      },
      ME,
    );
    ctx.scheduler.runAfter = vi.fn(async () => {});
    return ctx;
  }

  it("writes the same notification and sends the matching email to the inviter", async () => {
    const ctx = world();
    expect(await run(redeemBySlug, ctx, { slug: "OLU123" })).toBe(true);

    expect(ctx.store.notifications).toHaveLength(1);
    const note = ctx.store.notifications[0];
    expect(note).toMatchObject({
      userId: OTHER,
      type: "invite_accepted",
      title: "New member joined!",
      relatedUserId: ME,
      linkUrl: "/profile/profiles:me",
    });
    expect(note.message).toMatch(/^Newcomer <b> joined .+ using your invite link\.$/);
    expect(typeof note.createdAt).toBe("number");

    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
    const [delay, , email] = (ctx.scheduler.runAfter as any).mock.calls[0];
    expect(delay).toBe(0);
    expect(email).toMatchObject({
      to: "inviter@member.co",
      category: "activity",
      recipientUserId: OTHER,
      heading: "Newcomer <b> joined",
      ctaText: "See their profile",
      ctaUrl: "/profile/profiles:me",
    });
    expect(email.body).toContain("<strong>Newcomer &lt;b&gt;</strong> joined");
  });
});
