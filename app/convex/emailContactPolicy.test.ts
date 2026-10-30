import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import {
  claimForDispatch, contactEligibility, finishDispatch, queueEmailContact, recordProviderEvent,
} from "./emailDeliveries";
import { acceptsProviderEvent, CONTACT_GAP_MS, CONTACT_LEASE_MS, contactRetryAt } from "./emailContactPolicy";
import { scheduleNotificationEmail } from "./emailHelpers";
import { trackEvent } from "./posthog";
import { conversationReminderEligibility } from "./engagement/conversations";

vi.mock("./helpers", () => ({ requireAdminCtx: vi.fn(), getProfileByUserId: vi.fn() }));
vi.mock("./posthog", () => ({ trackEvent: vi.fn() }));
vi.mock("./engagement/conversations", () => ({ conversationReminderEligibility: vi.fn() }));

const NOW = 1_800_000_000_000;
const USER = "users:recipient";
const LOG = "nudgeLog:one";

function world(extra: Record<string, any[]> = {}) {
  const ctx = makeCtx({
    users: [{ _id: USER, email: "person@example.com" }],
    emailPreferences: [{ _id: "emailPreferences:one", userId: USER, activity: true, digest: true, announcements: true, unsubscribeToken: "unsubscribe" }],
    nudgeLog: [{ _id: LOG, loopKey: "share_project_day1", userId: USER, status: "queued", at: NOW }],
    ...extra,
  }, USER);
  const query = ctx.db.query;
  ctx.db.query = (table: string) => {
    const underlying = query(table);
    const wrapped: any = new Proxy(underlying, {
      get(target, key) {
        if (key === "order") return () => wrapped;
        if (key === Symbol.asyncIterator) return async function* () { yield* await target.collect(); };
        const value = target[key as keyof typeof target];
        return typeof value !== "function" ? value : (...args: unknown[]) => {
          const result = value.apply(target, args);
          return result === target ? wrapped : result;
        };
      },
    });
    return wrapped;
  };
  ctx.scheduler.runAfter = vi.fn();
  return ctx;
}

async function queue(ctx: ReturnType<typeof world>, key = "one", extra: Record<string, unknown> = {}) {
  return queueEmailContact(ctx, {
    to: "person@example.com", subject: "Come back", category: "activity", recipientUserId: USER as any,
    contact: { dedupeKey: key, journeyKey: "share_project_day1", nudgeLogId: LOG as any, ...extra },
  });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe("correlated email lifecycle", () => {
  it("queues once by stable source and does not report provider acceptance prematurely", async () => {
    const ctx = world();
    const opts = {
      userId: USER as any, subject: "Come back", previewText: "Preview", heading: "Hello", body: "Body", category: "activity" as const,
      contact: { dedupeKey: "source:one", journeyKey: "share_project_day1", nudgeLogId: LOG as any },
    };
    const first = await scheduleNotificationEmail(ctx, opts);
    const second = await scheduleNotificationEmail(ctx, opts);
    expect(first).toEqual(second);
    expect(ctx.store.emailDeliveries).toHaveLength(1);
    expect(ctx.store.emailDeliveries[0].status).toBe("queued");
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("claims atomically, blocks another standard contact, and records sent only on provider acceptance", async () => {
    const ctx = world();
    const first = await queue(ctx);
    const claim = await run(claimForDispatch, ctx, { contactId: first.contactId });
    expect(claim).toMatchObject({ claimed: true, attempts: 1 });
    expect(await run(claimForDispatch, ctx, { contactId: first.contactId })).toEqual({ claimed: false });
    const second = await queue(ctx, "two", { nudgeLogId: undefined });
    expect(await run(claimForDispatch, ctx, { contactId: second.contactId })).toMatchObject({ claimed: false, reason: "contact_cooldown" });
    expect(ctx.store.nudgeLog[0].status).toBe("queued");
    await run(finishDispatch, ctx, { contactId: first.contactId, attempt: 1, provider: "resend", providerId: "provider-one" });
    expect(ctx.store.emailDeliveries[0].status).toBe("accepted");
    expect(ctx.store.nudgeLog[0].status).toBe("sent");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    await run(finishDispatch, ctx, { contactId: first.contactId, attempt: 1, provider: "resend", providerId: "provider-one" });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["preference changed", (ctx: any) => { ctx.store.emailPreferences[0].activity = false; }, "email_off"],
    ["account deleted", (ctx: any) => { ctx.store.users = []; }, "unknown_user"],
    ["complaint arrived", (ctx: any) => { ctx.store.emailSuppressions = [{ _id: "emailSuppressions:one", email: "person@example.com" }]; }, "suppressed"],
    ["loop disabled", (ctx: any) => { ctx.store.engagementLoops = [{ _id: "engagementLoops:one", key: "share_project_day1", enabled: false }]; }, "loop_off"],
  ])("rechecks %s after queueing", async (_name, change, reason) => {
    const ctx = world();
    const queued = await queue(ctx);
    change(ctx);
    expect(await run(claimForDispatch, ctx, { contactId: queued.contactId })).toMatchObject({ claimed: false, reason });
    expect(ctx.store.emailDeliveries[0].attempts).toBe(0);
    expect(ctx.store.nudgeLog[0].status).toBe(reason === "suppressed" ? "suppressed" : "cancelled");
  });

  it("cancels a no-project nudge when its goal completes before dispatch", async () => {
    const ctx = world();
    const queued = await queue(ctx, "project", { goal: "no_project" });
    ctx.store.projects = [{ _id: "projects:new", userId: USER, origin: "posted" }];
    expect(await run(claimForDispatch, ctx, { contactId: queued.contactId })).toMatchObject({ claimed: false, reason: "goal_completed" });
  });

  it("unread reminders are default off and use shared authoritative read/reply checks when enabled", async () => {
    const ctx = world();
    const input = { userId: USER as any, category: "activity", goal: "unread_message" as const, conversationId: "conversations:one" as any };
    expect(await contactEligibility(ctx, input)).toMatchObject({ eligible: false, reason: "loop_off" });
    expect(conversationReminderEligibility).not.toHaveBeenCalled();
    ctx.store.engagementLoops = [{ _id: "engagementLoops:reminder", key: "unread_message", enabled: true }];
    vi.mocked(conversationReminderEligibility).mockResolvedValue({ eligible: false, reason: "read_or_replied" });
    expect(await contactEligibility(ctx, input)).toMatchObject({ eligible: false, reason: "read_or_replied" });
  });

  it("immediate message mail checks current read/reply state without opting into delayed reminders", async () => {
    const ctx = world();
    vi.mocked(conversationReminderEligibility).mockResolvedValue({ eligible: false, reason: "read_or_replied" });
    expect(await contactEligibility(ctx, {
      userId: USER as any, category: "activity", sourceType: "message", conversationId: "conversations:one" as any,
      messageId: "messages:one" as any,
    })).toMatchObject({ eligible: false, reason: "read_or_replied" });
    expect(conversationReminderEligibility).toHaveBeenCalledWith(ctx, expect.objectContaining({ cutoff: NOW, messageId: "messages:one" }));
  });

  it("named first-cheer and transactional exceptions bypass cooldown, but not suppression", async () => {
    const ctx = world({ emailDeliveries: [{ _id: "emailDeliveries:prior", recipientUserId: USER, status: "accepted", cooldownAt: NOW - 100 }] });
    expect(await contactEligibility(ctx, { userId: USER as any, category: "activity" })).toMatchObject({ eligible: false, reason: "contact_cooldown" });
    expect(await contactEligibility(ctx, { userId: USER as any, category: "activity", policy: "first_cheer" })).toMatchObject({ eligible: true });
    ctx.store.emailPreferences[0].activity = false;
    expect(await contactEligibility(ctx, { userId: USER as any, category: "transactional" })).toMatchObject({ eligible: true });
    ctx.store.emailSuppressions = [{ _id: "emailSuppressions:one", email: "person@example.com" }];
    expect(await contactEligibility(ctx, { userId: USER as any, category: "transactional" })).toMatchObject({ eligible: false, reason: "suppressed" });
  });

  const messageContact = (key = "message:messages:one") => ({
    dedupeKey: key, policy: "message" as const, sourceType: "message", sourceId: "messages:one",
    conversationId: "conversations:one" as any, messageId: "messages:one" as any, blockedUserId: "users:sender" as any,
  });

  it("a message email is claimed through another email's cooldown, and reserves none of its own", async () => {
    const ctx = world({ emailDeliveries: [{
      _id: "emailDeliveries:digest", recipientUserId: USER, to: "person@example.com", category: "digest", policy: "standard",
      status: "accepted", cooldownAt: NOW - 2 * 60 * 60 * 1000, createdAt: NOW - 2 * 60 * 60 * 1000,
    }] });
    vi.mocked(conversationReminderEligibility).mockResolvedValue({ eligible: true, reason: "unread_inbound" });
    // A standard email right now would be held back by the digest.
    expect(await contactEligibility(ctx, { userId: USER as any, category: "activity" })).toMatchObject({ eligible: false, reason: "contact_cooldown" });
    const message = await queueEmailContact(ctx, {
      to: "person@example.com", subject: "Ana sent you a message", category: "activity", recipientUserId: USER as any, contact: messageContact(),
    });
    expect(await run(claimForDispatch, ctx, { contactId: message.contactId })).toMatchObject({ claimed: true, attempts: 1 });
    const row = () => ctx.store.emailDeliveries.find((r: any) => r._id === message.contactId);
    expect(row()).toMatchObject({ status: "queued", policy: "message" });
    expect(row().cooldownAt).toBeUndefined();
    await run(finishDispatch, ctx, { contactId: message.contactId, attempt: 1, provider: "resend", providerId: "provider-message" });
    expect(row().status).toBe("accepted");
    expect(row().cooldownAt).toBeUndefined();
  });

  it.each([
    ["a nudge", "activity", { journeyKey: "share_project_day1", nudgeLogId: LOG as any }],
    ["a digest", "digest", {}],
    ["a host announcement", "announcements", {}],
  ])("%s due an hour after a message email is still sent", async (_name, category, extra) => {
    const ctx = world();
    vi.mocked(conversationReminderEligibility).mockResolvedValue({ eligible: true, reason: "unread_inbound" });
    const message = await queueEmailContact(ctx, {
      to: "person@example.com", subject: "Ana sent you a message", category: "activity", recipientUserId: USER as any, contact: messageContact(),
    });
    await run(claimForDispatch, ctx, { contactId: message.contactId });
    await run(finishDispatch, ctx, { contactId: message.contactId, attempt: 1, provider: "resend", providerId: "provider-message" });

    vi.setSystemTime(NOW + 60 * 60 * 1000);
    const later = await queueEmailContact(ctx, {
      to: "person@example.com", subject: "Later", category, recipientUserId: USER as any, contact: { dedupeKey: `later:${category}`, ...extra },
    });
    expect(await run(claimForDispatch, ctx, { contactId: later.contactId })).toMatchObject({ claimed: true });
    expect(ctx.store.emailDeliveries.find((r: any) => r._id === later.contactId)).toMatchObject({ status: "queued", policy: "standard", cooldownAt: NOW + 60 * 60 * 1000 });
  });

  it.each([
    ["Activity switched off", (ctx: any) => { ctx.store.emailPreferences[0].activity = false; }, "email_off", "cancelled"],
    ["address suppressed", (ctx: any) => { ctx.store.emailSuppressions = [{ _id: "emailSuppressions:one", email: "person@example.com" }]; }, "suppressed", "suppressed"],
    ["sender blocked", (ctx: any) => { ctx.store.blocks = [{ _id: "blocks:one", blockerId: USER, blockedId: "users:sender" }]; }, "blocked", "cancelled"],
    ["thread read or answered", () => {
      vi.mocked(conversationReminderEligibility).mockResolvedValue({ eligible: false, reason: "read_or_replied" });
    }, "read_or_replied", "cancelled"],
  ])("a message email still stops when %s", async (_name, change, reason, status) => {
    const ctx = world();
    vi.mocked(conversationReminderEligibility).mockResolvedValue({ eligible: true, reason: "unread_inbound" });
    const message = await queueEmailContact(ctx, {
      to: "person@example.com", subject: "Ana sent you a message", category: "activity", recipientUserId: USER as any, contact: messageContact(),
    });
    change(ctx);
    expect(await run(claimForDispatch, ctx, { contactId: message.contactId })).toMatchObject({ claimed: false, reason });
    expect(ctx.store.emailDeliveries[0]).toMatchObject({ status, detail: reason });
  });

  it("bounds transient retries and stops replay after the provider idempotency window", async () => {
    const ctx = world();
    const queued = await queue(ctx);
    await run(claimForDispatch, ctx, { contactId: queued.contactId });
    const failed = await run(finishDispatch, ctx, { contactId: queued.contactId, attempt: 1, provider: "resend", error: "temporary", retryable: true });
    expect(failed.retryAt).toBe(NOW + 60_000);
    expect(ctx.store.nudgeLog[0].status).toBe("queued");
    expect(await run(claimForDispatch, ctx, { contactId: queued.contactId })).toEqual({ claimed: false });
    vi.setSystemTime(NOW + 60_000);
    expect(await run(claimForDispatch, ctx, { contactId: queued.contactId })).toMatchObject({ claimed: true, attempts: 2 });
    vi.setSystemTime(NOW + CONTACT_GAP_MS);
    expect(await run(claimForDispatch, ctx, { contactId: queued.contactId })).toEqual({ claimed: false });
    expect(ctx.store.emailDeliveries[0]).toMatchObject({ status: "failed", detail: "idempotency_window_expired" });
    expect(contactRetryAt(NOW, 3, true)).toBeNull();
    expect(contactRetryAt(NOW, 1, false)).toBeNull();
  });

  it("a lost worker lease can recover once without accepting overlapping claims", async () => {
    const ctx = world();
    const queued = await queue(ctx);
    await run(claimForDispatch, ctx, { contactId: queued.contactId });
    vi.setSystemTime(NOW + CONTACT_LEASE_MS + 1);
    expect(await run(claimForDispatch, ctx, { contactId: queued.contactId })).toMatchObject({ claimed: true, attempts: 2 });
    await run(finishDispatch, ctx, { contactId: queued.contactId, attempt: 1, provider: "resend", error: "stale result", retryable: false });
    expect(ctx.store.emailDeliveries[0].status).toBe("queued");
  });

  it("retains a webhook that beats provider acceptance and replays it once correlation exists", async () => {
    const ctx = world();
    const queued = await queue(ctx);
    await run(claimForDispatch, ctx, { contactId: queued.contactId });
    const event = { providerId: "provider-race", eventKey: "event:one", status: "delivered", eventAt: NOW + 1, recipients: ["person@example.com"] };
    expect(await run(recordProviderEvent, ctx, event)).toEqual({ unknown: true });
    expect(await run(recordProviderEvent, ctx, event)).toEqual({ duplicate: true });
    await run(finishDispatch, ctx, { contactId: queued.contactId, attempt: 1, provider: "resend", providerId: "provider-race" });
    expect(ctx.store.emailDeliveries[0].status).toBe("delivered");
    expect(ctx.store.emailDeliveryEvents).toHaveLength(1);
    expect(ctx.store.emailDeliveryEvents[0].appliedAt).toBe(NOW);
    await run(recordProviderEvent, ctx, { ...event, eventKey: "event:old", status: "sent", eventAt: NOW - 1 });
    expect(ctx.store.emailDeliveries[0].status).toBe("delivered");
  });
});

describe("provider ordering", () => {
  it("never regresses a complaint or a delivered outcome to delayed/sent", () => {
    expect(acceptsProviderEvent({ status: "complained", lastProviderEventAt: NOW }, { status: "delivered", eventAt: NOW + 1 })).toBe(false);
    expect(acceptsProviderEvent({ status: "delivered", lastProviderEventAt: NOW }, { status: "delayed", eventAt: NOW + 1 })).toBe(false);
    expect(acceptsProviderEvent({ status: "delivered", lastProviderEventAt: NOW }, { status: "bounced", eventAt: NOW - 1 })).toBe(false);
  });
});
