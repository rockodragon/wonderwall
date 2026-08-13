// Pure-logic tests for tables.ts: the join-permission decision
// (mode × membership × can()) and the meetingUrl visibility rule. No Convex,
// no network — same shape as entitlements.test.ts / stripeHandlers.test.ts.

import { describe, expect, it } from "vitest";
import { resolveTableJoin, visibleMeetingUrl } from "./tables";
import { deriveGardenUser } from "./entitlements";

const freeUser = deriveGardenUser({
  userId: "u_free",
  profile: { name: "Free Fiona" },
  memberships: [],
  activePassionProjects: 0,
});

const seatUser = deriveGardenUser({
  userId: "u_seat",
  profile: { name: "Seat Sam" },
  memberships: [{ level: "seat", status: "active" }],
  activePassionProjects: 0,
});

describe("resolveTableJoin", () => {
  it("open mode: anyone (even free/visitor level) can join", () => {
    const decision = resolveTableJoin({
      mode: "open",
      alreadyMember: false,
      gardenUser: freeUser,
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("open mode join is idempotent: already a member is a no-op success", () => {
    const decision = resolveTableJoin({
      mode: "open",
      alreadyMember: true,
      gardenUser: freeUser,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.alreadyMember).toBe(true);
  });

  it("member mode: already-a-member short-circuits regardless of level", () => {
    const decision = resolveTableJoin({
      mode: "member",
      alreadyMember: true,
      gardenUser: freeUser,
    });
    expect(decision).toEqual({ allowed: true, alreadyMember: true });
  });

  it("member mode: denied for a free user, with reason and upgradePath surfaced", () => {
    const decision = resolveTableJoin({
      mode: "member",
      alreadyMember: false,
      gardenUser: freeUser,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/members-only/i);
    expect(decision.upgradePath).toMatch(/seat.*\$10\/mo/i);
    expect(decision.alreadyMember).toBeUndefined();
  });

  it("member mode: allowed for a seat-level user, no payment pending", () => {
    const decision = resolveTableJoin({
      mode: "member",
      alreadyMember: false,
      gardenUser: seatUser,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.paymentPending).toBeFalsy();
  });

  it("cohort mode: denied for a free user, same gate as member mode", () => {
    const decision = resolveTableJoin({
      mode: "cohort",
      alreadyMember: false,
      gardenUser: freeUser,
      priceCents: 12000,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.upgradePath).toMatch(/seat.*\$10\/mo/i);
  });

  it("cohort mode with a price: allowed for a seat-level user returns paymentPending", () => {
    const decision = resolveTableJoin({
      mode: "cohort",
      alreadyMember: false,
      gardenUser: seatUser,
      priceCents: 12000,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.paymentPending).toBe(true);
  });

  it("cohort mode with no price set: allowed, no payment pending (free cohort)", () => {
    const decision = resolveTableJoin({
      mode: "cohort",
      alreadyMember: false,
      gardenUser: seatUser,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.paymentPending).toBeFalsy();
  });

  it("unknown mode fails closed with a warm reason rather than guessing", () => {
    const decision = resolveTableJoin({
      mode: "mystery",
      alreadyMember: false,
      gardenUser: seatUser,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBeTruthy();
  });
});

describe("visibleMeetingUrl", () => {
  it("is stripped for a non-member", () => {
    expect(visibleMeetingUrl("https://zoom.us/j/123", false)).toBeUndefined();
  });

  it("is present for a roster member", () => {
    expect(visibleMeetingUrl("https://zoom.us/j/123", true)).toBe("https://zoom.us/j/123");
  });

  it("stays undefined for a member when the table simply has no link set", () => {
    expect(visibleMeetingUrl(undefined, true)).toBeUndefined();
  });
});
