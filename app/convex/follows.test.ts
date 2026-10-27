// Pure-logic test for follows.ts: the date fragment in the "is hosting"
// fan-out. No Convex, no network — same style as events.test.ts.

import { describe, expect, it } from "vitest";
import { followEachOther, formatFollowedEventDate, inviteFollowPairs } from "./follows";
import { makeCtx } from "../test-support/convexContext";

describe("formatFollowedEventDate", () => {
  // Noon UTC so the calendar day is the same in every zone a dev might run
  // this in (UTC-12 through UTC+11).
  it("renders short month + day, no year", () => {
    expect(formatFollowedEventDate(Date.UTC(2026, 10, 6, 12))).toBe("Nov 6");
    expect(formatFollowedEventDate(Date.UTC(2027, 0, 15, 12))).toBe("Jan 15");
  });
});

describe("inviteFollowPairs", () => {
  it("keeps accepted invites only, one pair each", () => {
    expect(
      inviteFollowPairs([
        { inviterId: "haley", usedBy: "ann" },
        { inviterId: "haley" }, // never used
        { inviterId: "haley", usedBy: "ann" }, // re-clicked link
        { inviterId: "ann", usedBy: "haley" }, // same pair, other direction
        { inviterId: "rick", usedBy: "rick" }, // self
        { inviterId: "ann", usedBy: "bo" },
      ]),
    ).toEqual([
      ["haley", "ann"],
      ["ann", "bo"],
    ]);
  });

  it("returns nothing for no invites", () => {
    expect(inviteFollowPairs([])).toEqual([]);
  });
});

describe("invite follow provenance", () => {
  it("marks new automatic follows as invite-origin and preserves existing deliberate intent", async () => {
    const ctx = makeCtx({
      profiles: [
        { _id: "profiles:a", userId: "users:a", name: "A" },
        { _id: "profiles:b", userId: "users:b", name: "B" },
      ],
      favorites: [{ _id: "favorites:existing", userId: "users:a", targetType: "profile", targetId: "profiles:b", origin: "user", createdAt: 1 }],
    }, null);
    expect(await followEachOther(ctx, "users:a" as never, "users:b" as never)).toBe(1);
    expect(ctx.store.favorites).toMatchObject([
      { userId: "users:a", targetId: "profiles:b", origin: "user" },
      { userId: "users:b", targetId: "profiles:a", origin: "invite" },
    ]);
    expect(ctx.store.productEvents).toMatchObject([{ event: "follow_created", userId: "users:b", properties: { origin: "invite", interaction_source: "invite" } }]);
    expect(await followEachOther(ctx, "users:a" as never, "users:b" as never)).toBe(0);
    expect(ctx.store.productEvents).toHaveLength(1);
  });
});
