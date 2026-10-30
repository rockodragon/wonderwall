import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { makeCtx, run } from "../test-support/convexContext";
import { markConversationRead, sendMessage } from "./messaging";
import { trackEvent } from "./posthog";
import { backfillConversationSummaries, conversationReminderEligibility, ensureConversationSummaries } from "./engagement/conversations";

vi.mock("./posthog", () => ({ trackEvent: vi.fn(async () => {}) }));
const A = "users:a";
const B = "users:b";
const C = "conversations:one";
const message = (id: string, senderId: string, createdAt: number, readAt?: number) => ({
  _id: `messages:${id}`, conversationId: C, senderId, createdAt, content: "private words", ...(readAt === undefined ? {} : { readAt }),
});
function world(messages: ReturnType<typeof message>[] = [], viewer = A) {
  return makeCtx({
    users: [{ _id: A }, { _id: B }],
    profiles: [{ _id: "profiles:a", userId: A, name: "Ana", isAdmin: true }, { _id: "profiles:b", userId: B, name: "Ben", isAdmin: true }],
    conversations: [{ _id: C, participants: [A, B], createdAt: 1, lastMessageAt: Math.max(1, ...messages.map(m => m.createdAt)) }],
    messages,
  }, viewer);
}
beforeEach(() => vi.clearAllMocks());

describe("authoritative conversation measurement", () => {
  it("tracks successful sends and only the first response, with no message text", async () => {
    const ctx = world();
    await run(sendMessage, ctx, { recipientId: B, content: "first private message" });
    ctx.auth.getUserIdentity = async () => ({ subject: `${B}|session` });
    await run(sendMessage, ctx, { recipientId: A, content: "private response" });
    await run(sendMessage, ctx, { recipientId: A, content: "another response" });
    const events = vi.mocked(trackEvent).mock.calls.map(call => call[1]);
    expect(events.filter(name => name === "message_sent")).toHaveLength(3);
    expect(events.filter(name => name === "first_reply")).toHaveLength(1);
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls.map(call => call[3]))).not.toContain("private");
    const recipient = ctx.store.conversationParticipants.find((row: any) => row.userId === A);
    expect(recipient.awaitingReplySince).toBeDefined();
    expect(recipient.firstReplyAt).toBeUndefined();
  });

  it("emails a recipient with an address under the message policy, once per unread burst, and never texts them", async () => {
    const ctx = world();
    ctx.store.users[1] = { _id: B, email: "ben@example.com", phone: "+16195550100", phoneVerificationTime: 1 };
    ctx.store.engagementLoops = [{ _id: "engagementLoops:texts", key: "message_texts", enabled: true, subject: "", body: "", updatedAt: 1 }];
    ctx.store.profiles[0].name = `Ana <b>"&"</b>`;
    ctx.scheduler.runAfter = vi.fn(async () => {});
    await run(sendMessage, ctx, { recipientId: B, content: "first private message" });
    await run(sendMessage, ctx, { recipientId: B, content: "second private message" });
    const [first] = ctx.store.messages;
    expect(ctx.store.emailDeliveries).toEqual([expect.objectContaining({
      recipientUserId: B, policy: "message", sourceType: "message", dedupeKey: `message:${first._id}`,
      conversationId: C, messageId: first._id, blockedUserId: A, status: "queued",
    })]);
    expect(ctx.store.messageTexts ?? []).toEqual([]);
    const emails = vi.mocked(ctx.scheduler.runAfter).mock.calls.filter(([, reference]: any[]) => getFunctionName(reference) === "emails:sendNotificationEmail");
    expect(emails).toHaveLength(1);
    const [, , email] = emails[0] as any[];
    expect(email).toMatchObject({
      contactId: ctx.store.emailDeliveries[0]._id, to: "ben@example.com", category: "activity", recipientUserId: B,
      subject: `Ana <b>"&"</b> sent you a message`, heading: "New message", ctaText: "View Message", ctaUrl: `/messages/${C}`,
    });
    expect(email.body).toBe(`<strong>Ana &lt;b&gt;&quot;&amp;&quot;&lt;/b&gt;</strong> sent you a message: "first private message"`);
  });

  it("marks only observed inbound IDs; replay and old clients create no read evidence", async () => {
    const ctx = world([message("old", B, 10), message("shown", B, 20), message("arrived-later", B, 30)]);
    expect(await run(markConversationRead, ctx, { conversationId: C })).toEqual({ markedCount: 0 });
    expect(await run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: ["messages:shown"] })).toEqual({ markedCount: 1 });
    expect(ctx.store.messages.find((row: any) => row._id === "messages:shown").readAt).toBeDefined();
    expect(ctx.store.messages.find((row: any) => row._id === "messages:old").readAt).toBeUndefined();
    expect(ctx.store.messages.find((row: any) => row._id === "messages:arrived-later").readAt).toBeUndefined();
    expect(await run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: ["messages:shown"] })).toEqual({ markedCount: 0 });
    expect(vi.mocked(trackEvent).mock.calls.filter(call => call[1] === "conversation_read")).toHaveLength(1);
  });

  it("rejects another thread, own messages and unauthorized participants before changing reads", async () => {
    const ctx = world([message("own", A, 10), { ...message("elsewhere", B, 20), conversationId: "conversations:other" }]);
    for (const id of ["messages:own", "messages:elsewhere"])
      await expect(run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: [id] })).rejects.toThrow();
    ctx.auth.getUserIdentity = async () => ({ subject: "users:stranger|session" });
    await expect(run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: ["messages:own"] })).rejects.toThrow();
    expect(ctx.store.messages.every((row: any) => row.readAt === undefined)).toBe(true);
  });

  it("reconstructs legacy replies and chooses the new unanswered burst, not old unread messages", async () => {
    const ctx = world([message("old-inbound", B, 10), message("reply", A, 20), message("new-inbound", B, 30)]);
    expect((await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 100 })).reason).toBe("history_incomplete");
    await ensureConversationSummaries(ctx, ctx.store.conversations[0]);
    const result = await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 100 });
    expect(result).toMatchObject({ eligible: true, messageId: "messages:new-inbound", otherUserId: B });
    expect(result.summary).toMatchObject({ unreadSince: 30, awaitingReplySince: 30, firstReplyAt: 20 });
    await run(markConversationRead, ctx, { conversationId: C, visibleMessageIds: ["messages:new-inbound"] });
    expect((await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 100 })).reason).toBe("read_or_replied");
  });

  it("cancels a queued source after reply, block or source change", async () => {
    const ctx = world([message("inbound", B, 10)]);
    await ensureConversationSummaries(ctx, ctx.store.conversations[0]);
    expect((await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 9 })).reason).toBe("too_recent");
    expect((await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 100, messageId: "messages:wrong" as never })).reason).toBe("source_changed");
    ctx.store.blocks = [{ _id: "blocks:one", blockerId: B, blockedId: A }];
    expect((await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 100 })).reason).toBe("blocked");
    ctx.store.blocks = [];
    ctx.store.messages.push(message("reply", A, 20));
    expect((await conversationReminderEligibility(ctx, { conversationId: C as never, userId: A as never, cutoff: 100 })).reason).toBe("read_or_replied");
  });

  it("backfills bounded conversation pages and is idempotent", async () => {
    const ctx = world();
    ctx.store.conversations = Array.from({ length: 23 }, (_, i) => ({ _id: `conversations:${i.toString().padStart(2, "0")}`, participants: [A, B], createdAt: i, lastMessageAt: i }));
    const first = await run(backfillConversationSummaries, ctx, {});
    expect(first).toMatchObject({ processed: 20, isDone: false });
    const last = await run(backfillConversationSummaries, ctx, { cursor: first.cursor });
    expect(last).toEqual({ processed: 3, isDone: true, cursor: null });
    expect(ctx.store.conversationParticipants).toHaveLength(46);
    await run(backfillConversationSummaries, ctx, {});
    expect(ctx.store.conversationParticipants).toHaveLength(46);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
