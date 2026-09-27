// Pure-logic test for follows.ts: the date fragment in the "is hosting"
// fan-out. No Convex, no network — same style as events.test.ts.

import { describe, expect, it } from "vitest";
import { formatFollowedEventDate, inviteFollowPairs } from "./follows";

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
