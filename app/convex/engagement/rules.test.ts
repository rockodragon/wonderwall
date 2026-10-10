// Pure-logic tests for the nudge rules (engagement/rules.ts): the
// send-or-skip decision and the admin counts.
// No Convex, no network.

import { describe, expect, it } from "vitest";
import {
  NUDGE_GAP_MS,
  SHARED_WINDOW_MS,
  SKIP_LABELS,
  countLog,
  countShared,
  decideNudge,
  isPostedProject,
  latestOf,
  skipLabel,
  type NudgeFacts,
} from "./rules";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;




function facts(extra: Partial<NudgeFacts> = {}): NudgeFacts {
  return {
    now: NOW,
    loopEnabled: true,
    userExists: true,
    hasEmail: true,
    emailAllowed: true,
    suppressed: false,
    conditionHolds: true,
    condition: "no_project",
    alreadySent: false,
    lastNudgeAt: null,
    lastDigestAt: null,
    ...extra,
  };
}

describe("decideNudge", () => {
  it("sends when every check passes", () => {
    expect(decideNudge(facts())).toEqual({ send: true });
  });

  it("skips when the loop is off", () => {
    expect(decideNudge(facts({ loopEnabled: false }))).toEqual({ send: false, reason: "loop_off" });
  });

  it("skips someone who isn't a member", () => {
    expect(decideNudge(facts({ userExists: false }))).toEqual({ send: false, reason: "unknown_user" });
  });

  it("skips someone with no email", () => {
    expect(decideNudge(facts({ hasEmail: false }))).toEqual({ send: false, reason: "no_email" });
  });

  it("skips someone who turned activity email off", () => {
    expect(decideNudge(facts({ emailAllowed: false }))).toEqual({ send: false, reason: "email_off" });
  });

  it("skips an address that bounced or complained", () => {
    expect(decideNudge(facts({ suppressed: true }))).toEqual({ send: false, reason: "suppressed" });
  });

  it("skips when the loop's condition no longer holds: they have a project", () => {
    expect(decideNudge(facts({ conditionHolds: false }))).toEqual({ send: false, reason: "has_project" });
  });

  it("skips a loop already sent to them, however long ago", () => {
    expect(decideNudge(facts({ alreadySent: true }))).toEqual({ send: false, reason: "already_sent" });
  });

  it("skips when another nudge went in the last 24 hours, and lets it through at 24 hours", () => {
    expect(decideNudge(facts({ lastNudgeAt: NOW - 3600_000 }))).toEqual({ send: false, reason: "sent_recently" });
    expect(decideNudge(facts({ lastNudgeAt: NOW - NUDGE_GAP_MS + 1 }))).toEqual({ send: false, reason: "sent_recently" });
    expect(decideNudge(facts({ lastNudgeAt: NOW - NUDGE_GAP_MS }))).toEqual({ send: true });
    expect(decideNudge(facts({ lastNudgeAt: NOW - 3 * DAY }))).toEqual({ send: true });
  });

  it("skips when the cheers email went in the last 24 hours, and lets it through at 24 hours", () => {
    expect(decideNudge(facts({ lastDigestAt: NOW - 3600_000 }))).toEqual({ send: false, reason: "digest_recent" });
    expect(decideNudge(facts({ lastDigestAt: NOW - NUDGE_GAP_MS }))).toEqual({ send: true });
  });

  it("names the first check that fails, in the spec's order", () => {
    const everythingWrong = facts({
      loopEnabled: false,
      userExists: false,
      hasEmail: false,
      emailAllowed: false,
      suppressed: true,
      conditionHolds: false,
      alreadySent: true,
      lastNudgeAt: NOW - 1,
      lastDigestAt: NOW - 1,
    });
    expect(decideNudge(everythingWrong)).toEqual({ send: false, reason: "loop_off" });
    expect(decideNudge({ ...everythingWrong, loopEnabled: true })).toEqual({ send: false, reason: "unknown_user" });
    expect(decideNudge({ ...everythingWrong, loopEnabled: true, userExists: true })).toEqual({ send: false, reason: "no_email" });
    expect(decideNudge({ ...everythingWrong, loopEnabled: true, userExists: true, hasEmail: true })).toEqual({
      send: false,
      reason: "email_off",
    });
    const reachable = { ...everythingWrong, loopEnabled: true, userExists: true, hasEmail: true, emailAllowed: true };
    expect(decideNudge(reachable)).toEqual({ send: false, reason: "suppressed" });
    expect(decideNudge({ ...reachable, suppressed: false })).toEqual({ send: false, reason: "has_project" });
    expect(decideNudge({ ...reachable, suppressed: false, conditionHolds: true })).toEqual({ send: false, reason: "already_sent" });
    expect(decideNudge({ ...reachable, suppressed: false, conditionHolds: true, alreadySent: false })).toEqual({
      send: false,
      reason: "sent_recently",
    });
    expect(
      decideNudge({ ...reachable, suppressed: false, conditionHolds: true, alreadySent: false, lastNudgeAt: null }),
    ).toEqual({ send: false, reason: "digest_recent" });
  });
});

describe("skipLabel", () => {
  it("has plain words for every reason the app logs, and passes an unknown one through", () => {
    for (const [reason, label] of Object.entries(SKIP_LABELS)) expect(skipLabel(reason)).toBe(label);
    expect(skipLabel("something_new")).toBe("something_new");
  });
});

describe("isPostedProject", () => {
  it("counts a posted project and an old row with no origin, not onboarding's finished piece", () => {
    expect(isPostedProject({ origin: "posted" })).toBe(true);
    expect(isPostedProject({})).toBe(true);
    expect(isPostedProject({ origin: "portfolio" })).toBe(false);
  });
});

describe("latestOf", () => {
  it("is the newest, ignoring the missing, or null when there is none", () => {
    expect(latestOf([3, undefined, 9, 5])).toBe(9);
    expect(latestOf([undefined])).toBeNull();
    expect(latestOf([])).toBeNull();
  });
});

describe("countLog", () => {
  const rows = [
    { status: "sent" as const, at: NOW - 1 * DAY },
    { status: "sent" as const, at: NOW - 6 * DAY },
    { status: "sent" as const, at: NOW - 20 * DAY },
    { status: "skipped" as const, reason: "has_project", at: NOW - 2 * DAY },
    { status: "skipped" as const, reason: "has_project", at: NOW - 3 * DAY },
    { status: "skipped" as const, reason: "no_email", at: NOW - 4 * DAY },
    { status: "skipped" as const, reason: "no_email", at: NOW - 25 * DAY },
    { status: "skipped" as const, reason: "email_off", at: NOW - 25 * DAY },
    { status: "skipped" as const, at: NOW - 1 * DAY },
    { status: "sent" as const, at: NOW - 40 * DAY },
  ];

  it("counts the last 7 days: sent, and skipped by reason, most common first", () => {
    expect(countLog(rows, NOW, 7)).toEqual({
      sent: 2,
      skipped: 4,
      reasons: [
        { reason: "has_project", label: "Already shared a project", count: 2 },
        { reason: "no_email", label: "No email on file", count: 1 },
        { reason: "unknown", label: "unknown", count: 1 },
      ],
    });
  });

  it("counts the last 30 days, and leaves out anything older", () => {
    const counts = countLog(rows, NOW, 30);
    expect(counts.sent).toBe(3);
    expect(counts.skipped).toBe(6);
    expect(counts.reasons.map((r) => [r.reason, r.count])).toEqual([
      ["has_project", 2],
      ["no_email", 2],
      ["email_off", 1],
      ["unknown", 1],
    ]);
  });

  it("is all zeros with nothing logged", () => {
    expect(countLog([], NOW, 7)).toEqual({ sent: 0, skipped: 0, reasons: [] });
  });
});

describe("countShared", () => {
  const times = new Map<string, number[]>([
    ["mara", [NOW - 5 * DAY]], // a project 1 day after the send below
    ["jo", [NOW - 20 * DAY]], // a project well before the send: doesn't count
    ["sam", [NOW - 6 * DAY + SHARED_WINDOW_MS + 1]], // a project just past 7 days after the send
    ["lee", [NOW - 2 * DAY]], // a project just inside 7 days
  ]);

  it("counts a send followed by a project within 7 days, and not one before it or after the window", () => {
    expect(
      countShared(
        [
          { userId: "mara", at: NOW - 6 * DAY },
          { userId: "jo", at: NOW - 6 * DAY },
          { userId: "sam", at: NOW - 6 * DAY },
          { userId: "lee", at: NOW - 6 * DAY },
          { userId: "nobody", at: NOW - 6 * DAY },
        ],
        times,
      ),
    ).toBe(2);
  });

  it("counts the window's edges: the same instant, and exactly 7 days later", () => {
    expect(countShared([{ userId: "a", at: 1000 }], new Map([["a", [1000]]]))).toBe(1);
    expect(countShared([{ userId: "a", at: 1000 }], new Map([["a", [1000 + SHARED_WINDOW_MS]]]))).toBe(1);
    expect(countShared([{ userId: "a", at: 1000 }], new Map([["a", [999]]]))).toBe(0);
  });

  it("is zero with no sends", () => {
    expect(countShared([], times)).toBe(0);
  });
});
