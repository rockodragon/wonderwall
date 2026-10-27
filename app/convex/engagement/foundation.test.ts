import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../../test-support/convexContext";
import { list, update, getUnreadReminder, setUnreadReminder } from "./attention";
import { backfillConversationSummaries, ensureConversationSummaries } from "./conversations";
import { runUnreadReminder } from "./unreadReminder";
import { claimForDispatch } from "../emailDeliveries";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const ME = "users:admin";
const MEMBER = "users:member";
const OTHER = "users:other";
const C = "conversations:one";
function world(enabled = false) {
  const ctx = makeCtx({
    users: [{ _id: ME }, { _id: MEMBER, email: "private@example.com" }, { _id: OTHER }],
    profiles: [
      { _id: "profiles:admin", userId: ME, name: "Admin", isAdmin: true, createdAt: NOW },
      { _id: "profiles:member", userId: MEMBER, name: "Member", createdAt: NOW - 2 * DAY },
    ],
    conversations: [{ _id: C, participants: [MEMBER, OTHER], createdAt: NOW - 2 * DAY, lastMessageAt: NOW - 2 * DAY }],
    messages: [{ _id: "messages:one", conversationId: C, senderId: OTHER, content: "Secret message body", createdAt: NOW - 2 * DAY }],
    emailPreferences: [{ _id: "emailPreferences:member", userId: MEMBER, activity: true, digest: true, announcements: true, unsubscribeToken: "private-token" }],
    engagementLoops: enabled ? [{ _id: "engagementLoops:unread", key: "unread_message", enabled: true, subject: "Your inbox", body: "An unread message is waiting." }] : [],
  }, ME);
  ctx.scheduler.runAfter = vi.fn();
  return ctx;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("admin attention", () => {
  it("checks admin access for every public read and write", async () => {
    const ctx = world();
    ctx.store.profiles[0].isAdmin = false;
    for (const [fn, args] of [[list, { reason: "unanswered" }], [getUnreadReminder, {}], [setUnreadReminder, { enabled: true }], [update, { candidateKey: "bad", action: "claim" }]] as const)
      await expect(run(fn, ctx, args)).rejects.toThrow();
  });

  it("shows only metadata and persists claim/snooze without sending", async () => {
    const ctx = world();
    await ensureConversationSummaries(ctx, ctx.store.conversations[0]);
    const page = await run(list, ctx, { reason: "unanswered" });
    expect(page.items).toHaveLength(1);
    expect(JSON.stringify(page)).not.toMatch(/Secret message|private@example|private-token/);
    const candidateKey = page.items[0].candidateKey;
    await run(update, ctx, { candidateKey, action: "claim" });
    expect(ctx.store.engagementAttention[0].ownerId).toBe(ME);
    await run(update, ctx, { candidateKey, action: "snooze" });
    expect((await run(list, ctx, { reason: "unanswered" })).items).toHaveLength(0);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("rejects stale actions after a reply and distinguishes unknown legacy activation", async () => {
    const ctx = world();
    await ensureConversationSummaries(ctx, ctx.store.conversations[0]);
    const key = (await run(list, ctx, { reason: "unanswered" })).items[0].candidateKey;
    ctx.store.conversationParticipants.find((row: any) => row.userId === MEMBER).awaitingReplySince = undefined;
    await expect(run(update, ctx, { candidateKey: key, action: "review" })).rejects.toThrow();
    expect((await run(list, ctx, { reason: "newcomer" })).coverage.unknown).toBe(1);
  });

  it("records full migration completion, excludes intentional follows and leaves invite autofollows distinct", async () => {
    const ctx = world();
    await run(backfillConversationSummaries, ctx);
    expect((await run(list, ctx, { reason: "newcomer" })).items).toHaveLength(1);
    ctx.store.favorites = [{ _id: "favorites:one", userId: MEMBER, targetType: "profile", targetId: "profiles:other", origin: "invite" }];
    expect((await run(list, ctx, { reason: "newcomer" })).items).toHaveLength(1);
    ctx.store.favorites[0].origin = "user";
    expect((await run(list, ctx, { reason: "newcomer" })).items).toHaveLength(0);
    ctx.store.favorites[0].origin = undefined;
    const unknown = await run(list, ctx, { reason: "newcomer" });
    expect(unknown.items).toHaveLength(0);
    expect(unknown.coverage.unknown).toBe(1);
  });
});

describe("one careful unread reminder", () => {
  it("defaults off, including before any backfill or settings row", async () => {
    const ctx = world();
    expect(await run(getUnreadReminder, ctx)).toMatchObject({ enabled: false });
    expect(await run(runUnreadReminder, ctx)).toEqual({ scanned: 0, queued: 0, isDone: true });
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("queues once per episode and cancels on a read before dispatch", async () => {
    const ctx = world(true);
    await ensureConversationSummaries(ctx, ctx.store.conversations[0]);
    expect((await run(runUnreadReminder, ctx)).queued).toBe(1);
    expect((await run(runUnreadReminder, ctx)).queued).toBe(0);
    expect(ctx.store.emailDeliveries).toHaveLength(1);
    expect(ctx.store.nudgeLog[0].status).toBe("queued");
    expect(JSON.stringify(ctx.scheduler.runAfter.mock.calls)).not.toMatch(/Secret message body/);
    ctx.store.messages[0].readAt = NOW;
    expect(await run(claimForDispatch, ctx, { contactId: ctx.store.emailDeliveries[0]._id })).toMatchObject({ claimed: false, reason: "read_or_replied" });
    expect(ctx.store.emailDeliveries[0].status).toBe("cancelled");
  });

  it.each(["reply", "preference", "block", "off"])("rechecks %s at dispatch", async change => {
    const ctx = world(true);
    await ensureConversationSummaries(ctx, ctx.store.conversations[0]);
    await run(runUnreadReminder, ctx);
    if (change === "reply") ctx.store.messages.push({ _id: "messages:reply", conversationId: C, senderId: MEMBER, content: "Reply", createdAt: NOW });
    if (change === "preference") ctx.store.emailPreferences[0].activity = false;
    if (change === "block") ctx.store.blocks = [{ _id: "blocks:one", blockerId: MEMBER, blockedId: OTHER }];
    if (change === "off") ctx.store.engagementLoops[0].enabled = false;
    expect((await run(claimForDispatch, ctx, { contactId: ctx.store.emailDeliveries[0]._id })).claimed).toBe(false);
  });

  it("continues beyond a full source page even when every candidate is ineligible", async () => {
    const ctx = world(true);
    ctx.store.conversationParticipants = Array.from({ length: 26 }, (_, i) => ({ _id: `conversationParticipants:${i}`, userId: MEMBER, otherUserId: OTHER,
      conversationId: `conversations:${i}`, unreadSince: NOW - 2 * DAY, awaitingReplySince: NOW - 2 * DAY, historyComplete: false }));
    const result = await run(runUnreadReminder, ctx);
    expect(result).toEqual({ scanned: 25, queued: 0, isDone: false });
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(1000, expect.anything(), expect.objectContaining({ cursor: expect.any(String), cutoff: NOW - DAY }));
  });
});
