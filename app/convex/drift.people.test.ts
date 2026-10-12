// The people group of the drift cleanup (messaging, notifications, profiles,
// follows, favorites, likesDigest, moderation, shortlist, phoneLink,
// emailHelpers, auth): every place a signed-out refusal, an error a person
// reads, or a notification write moved onto its shared helper
// (requireUserId, fail, insertNotification — helpers.ts, errors.ts, notify.ts).

import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { expectSignedOutRefusal } from "../test-support/signedOut";
import { errorMessage, isNotSignedIn } from "../app/lib/convexError";
import { getUserEmail } from "./emailHelpers";
import * as favorites from "./favorites";
import * as follows from "./follows";
import { sendLikesDigest } from "./likesDigest";
import * as messaging from "./messaging";
import * as notifications from "./notifications";
import * as phoneLink from "./phoneLink";
import * as profiles from "./profiles";

/** The error a call rejects with. */
async function caught(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected the call to be refused");
}

// ——— a) Signed out is refused with the shared ConvexError ———

// Each of these threw a plain Error("Not authenticated") (production hides
// its message from the page), a ConvexError with a bare code or a bare
// string, or another code. All now go through requireUserId.
const REFUSED_WHEN_SIGNED_OUT: Array<[string, unknown, Record<string, unknown>]> = [
  ["favorites.toggle", favorites.toggle, { targetType: "profile", targetId: "profiles:x" }],
  ["favorites.remove", favorites.remove, { targetType: "profile", targetId: "profiles:x" }],
  ["favorites.removeMany", favorites.removeMany, { targets: [] }],
  ["messaging.getOrCreateConversation", messaging.getOrCreateConversation, { otherUserId: "users:b" }],
  ["messaging.sendMessage", messaging.sendMessage, { recipientId: "users:b", content: "hi" }],
  ["messaging.markConversationRead", messaging.markConversationRead, { conversationId: "conversations:c" }],
  ["messaging.blockUser", messaging.blockUser, { userId: "users:b" }],
  ["messaging.unblockUser", messaging.unblockUser, { userId: "users:b" }],
  ["notifications.finishCelebration", notifications.finishCelebration, { notificationId: "notifications:n" }],
  ["notifications.markAsRead", notifications.markAsRead, { notificationId: "notifications:n" }],
  ["notifications.markAllAsRead", notifications.markAllAsRead, {}],
  ["notifications.markReadByLinkUrl", notifications.markReadByLinkUrl, { linkUrl: "/x" }],
  ["profiles.fillMissingBasics", profiles.fillMissingBasics, { name: "Ada" }],
  ["profiles.upsertProfile", profiles.upsertProfile, { name: "Ada" }],
  ["profiles.updateAttribute", profiles.updateAttribute, { key: "k", value: "v" }],
  ["profiles.setOrgName", profiles.setOrgName, { orgName: "Acme" }],
  ["profiles.setPayoutHandles", profiles.setPayoutHandles, {}],
  ["phoneLink.startAddPhone", phoneLink.startAddPhone, { phone: "+16195550100" }],
  ["phoneLink.confirmAddPhone", phoneLink.confirmAddPhone, { code: "123456" }],
  ["phoneLink.removePhone", phoneLink.removePhone, {}],
];

describe("signed out is refused with the shared ConvexError", () => {
  it.each(REFUSED_WHEN_SIGNED_OUT)("%s", async (_name, fn, args) => {
    await expectSignedOutRefusal(fn, args);
  });

  it("fillMissingBasics: the pages that retry while a new sign-in settles still read it as not signed in", async () => {
    const err = await caught(run(profiles.fillMissingBasics, makeCtx({}, null), { name: "Ada" }));
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data.code).toBe("unauthenticated"); // was "not_signed_in", with no reason
    expect(isNotSignedIn(err)).toBe(true); // event.tsx retries on this
  });

  it("blockUser and unblockUser: the refusal now carries the reason too", async () => {
    for (const fn of [messaging.blockUser, messaging.unblockUser]) {
      const err = await caught(run(fn, makeCtx({}, null), { userId: "users:b" }));
      expect(err.data).toEqual({ code: "unauthenticated", reason: "Sign in first." }); // was { code } only
    }
  });

  it("phoneLink: Settings shows the same line from the object as it did from the string", async () => {
    // Was `new ConvexError("Sign in first.")`, a bare string payload.
    for (const [fn, args] of [
      [phoneLink.startAddPhone, { phone: "+16195550100" }],
      [phoneLink.confirmAddPhone, { code: "123456" }],
      [phoneLink.removePhone, {}],
    ] as const) {
      const err = await caught(run(fn, makeCtx({}, null), args));
      expect(errorMessage(err)).toBe("Sign in first.");
    }
  });
});

// Signed out sees nothing, as before: these stayed on currentUserId.
describe("signed out still sees nothing where it did before", () => {
  const nothing = (fn: unknown, args: Record<string, unknown> = {}) => run(fn, makeCtx({}, null), args);

  it("answers each read with its empty shape", async () => {
    expect(await nothing(favorites.isFavorited, { targetType: "profile", targetId: "profiles:x" })).toBe(false);
    expect(await nothing(favorites.getMyFavorites)).toEqual({ profiles: [], events: [] });
    expect(await nothing(follows.followsMe, { profileId: "profiles:x" })).toBe(false);
    expect(await nothing(messaging.getConversations)).toEqual([]);
    expect(await nothing(messaging.getMessages, { conversationId: "conversations:c" })).toEqual({
      messages: [],
      nextCursor: null,
    });
    expect(await nothing(messaging.getConversation, { conversationId: "conversations:c" })).toBeNull();
    expect(await nothing(messaging.getUnreadCount)).toBe(0);
    expect(await nothing(messaging.isBlocked, { userId: "users:b" })).toEqual({ blockedByMe: false });
    expect(await nothing(messaging.listBlocked)).toEqual([]);
    expect(await nothing(messaging.searchPeopleToMessage, { query: "ad" })).toEqual([]);
    expect(await nothing(notifications.getNotifications)).toEqual([]);
    expect(await nothing(notifications.getUnreadCount)).toBe(0);
    expect(await nothing(notifications.listCelebrations)).toEqual([]);
    expect(await nothing(profiles.getMyProfile)).toBeNull();
    expect(await nothing(phoneLink.getMyPhone)).toBeNull();
  });
});

// ——— c) Errors a person reads are ConvexErrors with a code ———

describe("notifications: errors a person can trigger", () => {
  const mine: Row = {
    _id: "notifications:mine",
    userId: "users:ada",
    type: "cheer",
    title: "Max cheered you on",
    message: "",
    createdAt: 1,
  };
  const world = () => ({ notifications: [mine] });

  it("markAsRead: a notification that isn't there is not_found", async () => {
    const err = await caught(
      run(notifications.markAsRead, makeCtx(world(), "users:ada"), { notificationId: "notifications:gone" }),
    );
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data).toEqual({ code: "not_found", reason: "That notification isn't here anymore." });
  });

  it("markAsRead: someone else's notification is forbidden", async () => {
    const ctx = makeCtx(world(), "users:bob");
    const err = await caught(run(notifications.markAsRead, ctx, { notificationId: mine._id }));
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data).toEqual({ code: "forbidden", reason: "That notification isn't yours." });
    expect(ctx.store.notifications[0].readAt).toBeUndefined();
  });

  it("finishCelebration: someone else's notification is forbidden", async () => {
    const ctx = makeCtx(world(), "users:bob");
    const err = await caught(run(notifications.finishCelebration, ctx, { notificationId: mine._id }));
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.data).toEqual({ code: "forbidden", reason: "That notification isn't yours." });
    expect(ctx.store.notifications[0].celebratedAt).toBeUndefined();
  });

  it("the owner still reads and finishes their own", async () => {
    const ctx = makeCtx(world(), "users:ada");
    expect(await run(notifications.markAsRead, ctx, { notificationId: mine._id })).toBe(true);
    expect(ctx.store.notifications[0].readAt).toEqual(expect.any(Number));
    expect(await run(notifications.finishCelebration, ctx, { notificationId: mine._id })).toBe(true);
    expect(ctx.store.notifications[0].celebratedAt).toEqual(expect.any(Number));
    // finishCelebration on a notification that's gone is still a quiet false.
    expect(await run(notifications.finishCelebration, ctx, { notificationId: "notifications:gone" })).toBe(false);
  });
});

// ——— Notifications written through insertNotification: same rows as before ———

describe("notification writes keep their rows", () => {
  it("createNotification (internal) writes the row and returns its id", async () => {
    const ctx = makeCtx({}, null);
    const id = await run(notifications.createNotification, ctx, {
      userId: "users:ada",
      type: "update",
      title: "Hi",
      message: "Body",
      linkUrl: "/x",
    });
    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        _id: id,
        userId: "users:ada",
        type: "update",
        title: "Hi",
        message: "Body",
        linkUrl: "/x",
        createdAt: expect.any(Number),
      }),
    ]);
  });

  it("sendLikesDigest: one in-app row and the digest email to the same person", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: "users:ada", email: "ada@example.com" }],
        profiles: [{ _id: "profiles:ada", userId: "users:ada", name: "Ada" }],
        profileLikes: [{ _id: "profileLikes:1", profileId: "profiles:ada", createdAt: 5_000 }],
      },
      null,
    );
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      await run(sendLikesDigest, ctx);
    } finally {
      vi.restoreAllMocks();
    }

    expect(ctx.store.notifications).toEqual([
      expect.objectContaining({
        userId: "users:ada",
        type: "likes_digest",
        title: "1 new like on your profile",
        message: "1 profile like",
        linkUrl: "/profile/profiles:ada",
        createdAt: 10_000,
      }),
    ]);
    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter.mock.calls[0][2]).toMatchObject({
      to: "ada@example.com",
      subject: "1 new like on your profile",
      previewText: "1 profile like",
      heading: "People are noticing your work",
      ctaUrl: "/profile/profiles:ada",
      category: "digest",
      recipientUserId: "users:ada",
    });
    expect(ctx.store.profiles[0].lastLikeNotifiedAt).toBe(10_000);
  });

  it("sendLikesDigest: nothing new, nothing written or sent", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: "users:ada", email: "ada@example.com" }],
        profiles: [{ _id: "profiles:ada", userId: "users:ada", name: "Ada", lastLikeNotifiedAt: 9_000 }],
        profileLikes: [{ _id: "profileLikes:1", profileId: "profiles:ada", createdAt: 5_000 }],
      },
      null,
    );
    const runAfter = vi.spyOn(ctx.scheduler, "runAfter");
    await run(sendLikesDigest, ctx);
    expect(ctx.store.notifications ?? []).toEqual([]);
    expect(runAfter).not.toHaveBeenCalled();
  });
});

// ——— The profile fallback in getUserEmail still works through the shared lookup ———

describe("getUserEmail", () => {
  it("falls back to the profile's email attribute, even for a person with two profiles", async () => {
    const ctx = makeCtx(
      {
        users: [{ _id: "users:p" }],
        profiles: [
          { _id: "profiles:p1", userId: "users:p", name: "P" },
          { _id: "profiles:p2", userId: "users:p", name: "P again" },
        ],
        attributes: [{ _id: "attributes:1", profileId: "profiles:p1", key: "email", value: "p@example.com" }],
      },
      null,
    );
    expect(await getUserEmail(ctx, "users:p" as any)).toBe("p@example.com");
  });

  it("prefers the email on the user, and is null with neither", async () => {
    const ctx = makeCtx({ users: [{ _id: "users:a", email: "a@example.com" }, { _id: "users:b" }] }, null);
    expect(await getUserEmail(ctx, "users:a" as any)).toBe("a@example.com");
    expect(await getUserEmail(ctx, "users:b" as any)).toBeNull();
  });
});
