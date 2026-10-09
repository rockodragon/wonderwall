// Tests for the automatic reminders in announcements.ts (docs/
// announcements-prd.md, "Auto-reminder Cron"): the 24-hour reminder that has
// always existed and the 2-hour "starting soon" reminder next to it.
//
// The real handlers run against the small in-memory ctx in test-support/,
// with the clock pinned, so "first seen an hour out", "the cron ticks again
// 15 minutes later", and "the event moved" are all just a setSystemTime.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run, type Row } from "../test-support/convexContext";
import { deliverAnnouncementBatch, sendDueReminders } from "./announcements";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0); // fixed "now" for every test

const GOING = "users:going";
const OPTED_OUT = "users:optedOut";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const event = (id: string, startsIn: number, over: Record<string, unknown> = {}): Row => ({
  _id: `events:${id}`,
  title: `Event ${id}`,
  organizerId: "users:host",
  datetime: NOW + startsIn,
  status: "published",
  ...over,
});
const rsvp = (eventId: string, userId: string): Row => ({
  _id: `eventRsvps:${eventId}-${userId}`,
  eventId: `events:${eventId}`,
  userId,
  email: `${userId.split(":")[1]}@example.com`,
});
const guestRsvp = (eventId: string, email: string): Row => ({
  _id: `eventRsvps:${eventId}-${email}`,
  eventId: `events:${eventId}`,
  email,
});
const user = (id: string): Row => ({ _id: id, email: `${id.split(":")[1]}@example.com` });

function world(tables: Record<string, Row[]>) {
  const ctx = makeCtx(
    {
      users: [user(GOING), user(OPTED_OUT)],
      ...tables,
    },
    null,
  );
  const scheduled: { fn: unknown; args: any }[] = [];
  ctx.scheduler.runAfter = async (_delay: number, fn: unknown, args: any) => {
    scheduled.push({ fn, args });
  };
  return { ctx, scheduled };
}

const announcements = (ctx: any): Row[] => ctx.store.announcements ?? [];
const keys = (ctx: any) => announcements(ctx).map((a) => a.reminderKey);

describe("24-hour reminder", () => {
  it("is sent once per start time, under the unchanged reminder24h key", async () => {
    const e = event("a", 10 * HOUR);
    const { ctx } = world({ events: [e], eventRsvps: [rsvp("a", GOING)] });

    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([`reminder24h:event:events:a:${e.datetime}`]);
    expect(announcements(ctx)[0]).toMatchObject({
      kind: "reminder",
      body: expect.stringMatching(/^Starts /),
      recipientCount: 1,
    });

    // Next tick, still more than 2 hours out: a no-op, not a second send.
    vi.setSystemTime(NOW + 15 * MIN);
    await run(sendDueReminders, ctx);
    expect(announcements(ctx)).toHaveLength(1);
  });

  it("does not re-send a reminder that was already sent before this change", async () => {
    const e = event("a", 10 * HOUR);
    const { ctx } = world({
      events: [e],
      eventRsvps: [rsvp("a", GOING)],
      // The exact string the old code wrote.
      announcements: [
        { _id: "announcements:old", kind: "reminder", reminderKey: `reminder24h:event:events:a:${e.datetime}` },
      ],
    });

    const result = await run(sendDueReminders, ctx);
    expect(result.remindersSent).toBe(0);
    expect(announcements(ctx)).toHaveLength(1);
  });

  it("is not sent for an event more than 24 hours out or one that already started", async () => {
    const { ctx } = world({
      events: [event("far", 25 * HOUR), event("started", -1 * MIN)],
    });
    await run(sendDueReminders, ctx);
    expect(announcements(ctx)).toHaveLength(0);
  });

  it("skips drafts and cancelled events", async () => {
    const { ctx } = world({
      events: [event("a", 10 * HOUR, { status: "cancelled" }), event("b", 1 * HOUR, { status: "draft" })],
    });
    await run(sendDueReminders, ctx);
    expect(announcements(ctx)).toHaveLength(0);
  });
});

describe("2-hour reminder", () => {
  it("is sent once, under its own reminder2h key, to the same audience", async () => {
    const e = event("a", 90 * MIN);
    const { ctx, scheduled } = world({
      events: [e],
      eventRsvps: [rsvp("a", GOING), guestRsvp("a", "guest@example.com")],
    });

    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([`reminder2h:event:events:a:${e.datetime}`]);
    expect(announcements(ctx)[0]).toMatchObject({
      kind: "reminder",
      body: expect.stringMatching(/^Starts /),
      recipientCount: 2,
    });
    expect(ctx.store.announcementRecipients).toHaveLength(2);
    expect(scheduled).toHaveLength(1); // one delivery batch, not inline sends

    vi.setSystemTime(NOW + 15 * MIN);
    await run(sendDueReminders, ctx);
    vi.setSystemTime(NOW + 30 * MIN);
    await run(sendDueReminders, ctx);
    expect(announcements(ctx)).toHaveLength(1);
  });

  it("fires on the first tick inside the 2-hour mark, not before", async () => {
    const e = event("a", 2 * HOUR + 10 * MIN);
    const { ctx } = world({ events: [e], eventRsvps: [rsvp("a", GOING)] });

    await run(sendDueReminders, ctx); // 2h10m out: the 24h stage
    expect(keys(ctx)).toEqual([`reminder24h:event:events:a:${e.datetime}`]);

    vi.setSystemTime(NOW + 15 * MIN); // 1h55m out: the 2h stage
    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([
      `reminder24h:event:events:a:${e.datetime}`,
      `reminder2h:event:events:a:${e.datetime}`,
    ]);
  });

  it("is not sent once the event has started", async () => {
    const { ctx } = world({ events: [event("a", -1 * MIN)], eventRsvps: [rsvp("a", GOING)] });
    await run(sendDueReminders, ctx);
    expect(announcements(ctx)).toHaveLength(0);
  });

  it("covers offerings as well as events", async () => {
    const startDate = NOW + 100 * MIN;
    const { ctx } = world({
      offerings: [{ _id: "offerings:o1", title: "Pottery", userId: "users:host", status: "active", startDate }],
      offeringSignups: [{ _id: "offeringSignups:s1", offeringId: "offerings:o1", userId: GOING, status: "confirmed" }],
    });
    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([`reminder2h:offering:offerings:o1:${startDate}`]);
    expect(announcements(ctx)[0].recipientCount).toBe(1);
  });

  it("skips a paused offering", async () => {
    const { ctx } = world({
      offerings: [
        { _id: "offerings:o1", title: "Pottery", userId: "users:host", status: "active", startDate: NOW + HOUR, pausedAt: NOW - HOUR },
      ],
    });
    await run(sendDueReminders, ctx);
    expect(announcements(ctx)).toHaveLength(0);
  });

  it("re-arms when the start time moves", async () => {
    const e = event("a", 90 * MIN);
    const { ctx } = world({ events: [e], eventRsvps: [rsvp("a", GOING)] });
    await run(sendDueReminders, ctx);

    const moved = NOW + 110 * MIN;
    await ctx.db.patch(e._id, { datetime: moved });
    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([
      `reminder2h:event:events:a:${e.datetime}`,
      `reminder2h:event:events:a:${moved}`,
    ]);
  });
});

describe("how the two reminders fit together", () => {
  it("an event first seen an hour out gets only the 2-hour reminder", async () => {
    const e = event("a", 1 * HOUR);
    const { ctx } = world({ events: [e], eventRsvps: [rsvp("a", GOING)] });

    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([`reminder2h:event:events:a:${e.datetime}`]);

    // And never a 24h one afterwards, however many ticks follow.
    for (const minutes of [15, 30, 45]) {
      vi.setSystemTime(NOW + minutes * MIN);
      await run(sendDueReminders, ctx);
    }
    expect(keys(ctx)).toEqual([`reminder2h:event:events:a:${e.datetime}`]);
  });

  it("an event seen all the way through gets one of each, in order, once", async () => {
    const e = event("a", 23 * HOUR + 50 * MIN);
    const { ctx } = world({ events: [e], eventRsvps: [rsvp("a", GOING)] });

    // A tick every 15 minutes until the event starts.
    for (let t = 0; t <= 24 * HOUR; t += 15 * MIN) {
      vi.setSystemTime(NOW + t);
      await run(sendDueReminders, ctx);
    }

    expect(keys(ctx)).toEqual([
      `reminder24h:event:events:a:${e.datetime}`,
      `reminder2h:event:events:a:${e.datetime}`,
    ]);
    const [dayBefore, soon] = announcements(ctx);
    expect(dayBefore.createdAt).toBeLessThan(soon.createdAt);
  });

  it("never sends the 24-hour reminder after the 2-hour one for the same start", async () => {
    const e = event("a", 90 * MIN);
    // 2h one already went out; the 24h one never did (e.g. event was created late).
    const { ctx } = world({
      events: [e],
      eventRsvps: [rsvp("a", GOING)],
      announcements: [
        { _id: "announcements:two", kind: "reminder", reminderKey: `reminder2h:event:events:a:${e.datetime}` },
      ],
    });
    await run(sendDueReminders, ctx);
    expect(keys(ctx)).toEqual([`reminder2h:event:events:a:${e.datetime}`]);
  });

  it("2-hour reminders are not starved by a backlog of 24-hour ones", async () => {
    // 25 events in the 24h stage, none reminded yet, plus one starting in an hour.
    const dayBeforeEvents = Array.from({ length: 25 }, (_, i) => event(`d${i}`, 5 * HOUR + i * MIN));
    const soon = event("soon", 1 * HOUR);
    const { ctx } = world({ events: [...dayBeforeEvents, soon] });

    const first = await run(sendDueReminders, ctx);
    expect(first.remindersSent).toBe(20); // the per-run cap
    expect(keys(ctx)).toContain(`reminder2h:event:events:soon:${soon.datetime}`);

    // The remainder goes out on the next tick; nothing is sent twice.
    vi.setSystemTime(NOW + 15 * MIN);
    const second = await run(sendDueReminders, ctx);
    expect(second.remindersSent).toBe(6);
    expect(new Set(keys(ctx)).size).toBe(26);
  });

  it("targets that were already reminded do not use up the per-run cap", async () => {
    const already = Array.from({ length: 20 }, (_, i) => event(`r${i}`, 3 * HOUR + i * MIN));
    const fresh = event("fresh", 20 * HOUR);
    const { ctx } = world({
      events: [...already, fresh],
      announcements: already.map((e, i) => ({
        _id: `announcements:r${i}`,
        kind: "reminder",
        reminderKey: `reminder24h:event:${e._id}:${e.datetime}`,
      })),
    });

    const result = await run(sendDueReminders, ctx);
    expect(result.remindersSent).toBe(1);
    expect(keys(ctx)).toContain(`reminder24h:event:events:fresh:${fresh.datetime}`);
  });
});

describe("delivery copy", () => {
  async function deliver(announcementKeyPrefix: string, prefs: Row[] = []) {
    const startsIn = announcementKeyPrefix === "reminder2h" ? 90 * MIN : 10 * HOUR;
    const e = event("a", startsIn, { title: "Open Mic" });
    const w = world({
      events: [e],
      eventRsvps: [rsvp("a", GOING), rsvp("a", OPTED_OUT)],
      emailPreferences: prefs,
    });
    await run(sendDueReminders, w.ctx);
    const [announcement] = announcements(w.ctx);
    expect(announcement.reminderKey).toMatch(new RegExp(`^${announcementKeyPrefix}:`));
    w.scheduled.length = 0;
    await run(deliverAnnouncementBatch, w.ctx, { announcementId: announcement._id });
    const emails = w.scheduled.map((s) => s.args).filter((a) => a?.to);
    return { ...w, announcement, emails };
  }

  it("2-hour reminder says it is starting soon, with the start time and a link to the event", async () => {
    const { ctx, announcement, emails } = await deliver("reminder2h");

    expect(ctx.store.notifications).toHaveLength(2);
    expect(ctx.store.notifications[0]).toMatchObject({
      type: "reminder",
      title: "Starting soon: Open Mic",
      message: announcement.body,
      linkUrl: "/events/events:a",
    });
    expect(announcement.body).toMatch(/^Starts \w{3}, \w{3} \d+ at \d+:\d{2} (AM|PM) /);

    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({
      subject: "Starting soon: Open Mic",
      heading: "Open Mic",
      ctaText: "View event",
      ctaUrl: "/events/events:a",
      category: "announcements",
    });
    expect(emails[0].body).toContain(announcement.body);
    expect(emails[0].body).toContain("You're getting this because you RSVP'd to Open Mic.");
  });

  it("24-hour reminder copy is unchanged", async () => {
    const { ctx, emails } = await deliver("reminder24h");
    expect(ctx.store.notifications[0].title).toBe("Reminder: Open Mic is tomorrow");
    expect(emails[0].subject).toBe("Reminder: Open Mic is tomorrow");
  });

  it("respects the announcements email preference on the 2-hour reminder", async () => {
    const { ctx, emails } = await deliver("reminder2h", [
      { _id: "emailPreferences:p1", userId: OPTED_OUT, announcements: false, activity: true, digest: true, unsubscribeToken: "t" },
    ]);
    // Opted-out user still gets the in-app notification (same as the 24h one), but no email.
    expect(ctx.store.notifications).toHaveLength(2);
    expect(emails.map((e) => e.to)).toEqual(["going@example.com"]);
  });

  it("stops a pending 2-hour batch when the event is cancelled", async () => {
    const e = event("a", 90 * MIN);
    const { ctx } = world({ events: [e], eventRsvps: [rsvp("a", GOING)] });
    await run(sendDueReminders, ctx);
    await ctx.db.patch(e._id, { status: "cancelled" });
    await run(deliverAnnouncementBatch, ctx, { announcementId: announcements(ctx)[0]._id });
    expect(ctx.store.notifications ?? []).toHaveLength(0);
  });
});
