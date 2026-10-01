import { describe, expect, it } from "vitest";
import {
  isExpired,
  READ_RETENTION_MS,
  UNREAD_RETENTION_MS,
} from "./notificationRetention";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-22T00:00:00Z");

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
