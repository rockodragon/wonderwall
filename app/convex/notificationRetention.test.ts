import { afterEach, describe, expect, it, vi } from "vitest";
import { makeCtx, run } from "../test-support/convexContext";
import {
  isExpired,
  READ_RETENTION_MS,
  UNREAD_RETENTION_MS,
  sweepExpiredNotifications,
} from "./notificationRetention";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-22T00:00:00Z");

afterEach(() => vi.restoreAllMocks());

describe("notification retention sweep", () => {
  function world(rows: Array<{ _id: string; readAt?: number; createdAt: number }>) {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const ctx = makeCtx({ notifications: rows }, null);
    const schedule = vi.spyOn(ctx.scheduler, "runAfter");
    return { ctx, schedule };
  }

  it("does not reschedule a full table of surviving notifications", async () => {
    const { ctx, schedule } = world(Array.from({ length: 600 }, (_, i) => ({
      _id: `notifications:recent${i}`, createdAt: now - DAY_MS,
    })));
    expect(await run(sweepExpiredNotifications, ctx)).toEqual({ deletedCount: 0, hitBatchLimit: false });
    expect(schedule).not.toHaveBeenCalled();
    expect(ctx.store.notifications).toHaveLength(600);
  });

  it("finds old unread rows behind 500 recently-read survivors without deleting the survivors", async () => {
    const survivors = Array.from({ length: 500 }, (_, i) => ({
      _id: `notifications:read${i}`, createdAt: now - 200 * DAY_MS, readAt: now - DAY_MS,
    }));
    const { ctx, schedule } = world([...survivors, { _id: "notifications:expired", createdAt: now - 91 * DAY_MS }]);
    expect(await run(sweepExpiredNotifications, ctx)).toEqual({ deletedCount: 1, hitBatchLimit: false });
    expect(ctx.store.notifications).toEqual(survivors);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("continues full expired batches and stops once the backlog is gone", async () => {
    const { ctx, schedule } = world(Array.from({ length: 501 }, (_, i) => ({
      _id: `notifications:old${i}`, createdAt: now - 100 * DAY_MS,
    })));
    expect(await run(sweepExpiredNotifications, ctx)).toEqual({ deletedCount: 500, hitBatchLimit: true });
    expect(ctx.store.notifications).toHaveLength(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(await run(sweepExpiredNotifications, ctx)).toEqual({ deletedCount: 1, hitBatchLimit: false });
    expect(ctx.store.notifications).toHaveLength(0);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it("uses independent read and unread clocks and keeps exact boundaries", async () => {
    const kept = [
      { _id: "notifications:readBoundary", createdAt: now - 200 * DAY_MS, readAt: now - READ_RETENTION_MS },
      { _id: "notifications:unreadBoundary", createdAt: now - UNREAD_RETENTION_MS },
    ];
    const { ctx } = world([
      ...kept,
      { _id: "notifications:expiredRead", createdAt: now - DAY_MS, readAt: now - READ_RETENTION_MS - 1 },
      { _id: "notifications:expiredUnread", createdAt: now - UNREAD_RETENTION_MS - 1 },
      { _id: "notifications:epochRead", createdAt: 0, readAt: 0 },
    ]);
    expect(await run(sweepExpiredNotifications, ctx)).toEqual({ deletedCount: 3, hitBatchLimit: false });
    expect(ctx.store.notifications).toEqual(kept);
  });
});

describe("isExpired — read notifications (30 day retention)", () => {
  it("keeps a read notification at 29 days", () => {
    expect(
      isExpired({ readAt: now - 29 * DAY_MS, createdAt: now - 40 * DAY_MS }, now),
    ).toBe(false);
  });

  it("keeps a read notification exactly at the 30 day boundary", () => {
    expect(
      isExpired({ readAt: now - READ_RETENTION_MS, createdAt: now - 40 * DAY_MS }, now),
    ).toBe(false);
  });

  it("expires a read notification at 31 days", () => {
    expect(
      isExpired({ readAt: now - 31 * DAY_MS, createdAt: now - 40 * DAY_MS }, now),
    ).toBe(true);
  });
});

describe("isExpired — unread notifications (90 day retention)", () => {
  it("keeps an unread notification at 89 days", () => {
    expect(isExpired({ createdAt: now - 89 * DAY_MS }, now)).toBe(false);
  });

  it("keeps an unread notification exactly at the 90 day boundary", () => {
    expect(isExpired({ createdAt: now - UNREAD_RETENTION_MS }, now)).toBe(false);
  });

  it("expires an unread notification at 91 days", () => {
    expect(isExpired({ createdAt: now - 91 * DAY_MS }, now)).toBe(true);
  });

  it("keeps a recent unread notification", () => {
    expect(isExpired({ createdAt: now - DAY_MS }, now)).toBe(false);
  });
});

describe("isExpired — read status changes which clock applies", () => {
  it("keeps a notification read yesterday even if created 200 days ago", () => {
    expect(
      isExpired({ readAt: now - DAY_MS, createdAt: now - 200 * DAY_MS }, now),
    ).toBe(false);
  });

  it("expires an old read notification even though it's within the unread window", () => {
    expect(
      isExpired({ readAt: now - 31 * DAY_MS, createdAt: now - 5 * DAY_MS }, now),
    ).toBe(true);
  });
});
