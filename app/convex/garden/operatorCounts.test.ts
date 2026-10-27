// Pure-logic tests for the operator counters. No Convex — plain fixtures,
// mirroring activity.test.ts.

import { describe, expect, it } from "vitest";
import { DAY_MS } from "./projectTeam";
import { tallyCounts, type CountInputs, type CountRow } from "./operatorCounts";

const NOW = 1_800_000_000_000;
const THIS_WEEK = NOW - 2 * DAY_MS;
const LAST_MONTH = NOW - 30 * DAY_MS;

function empty(): CountInputs {
  return { profiles: [], communityMembers: [], memberships: [], waitlist: [], projects: [], events: [] };
}

function profile(userId: string, createdAt: number, extra: Partial<CountInputs["profiles"][number]> = {}) {
  return { userId, createdAt, ...extra };
}

function project(
  userId: string,
  createdAt: number,
  extra: Partial<CountInputs["projects"][number]> = {},
): CountInputs["projects"][number] {
  return { userId, kind: "passion", status: "active", createdAt, ...extra };
}

function event(
  createdAt: number,
  datetime: number,
  extra: Partial<CountInputs["events"][number]> = {},
): CountInputs["events"][number] {
  return { status: "published", datetime, createdAt, ...extra };
}

function rows(input: CountInputs, title: "People" | "Projects" | "Events"): Record<string, CountRow> {
  const group = tallyCounts(input, NOW).groups.find((g) => g.title === title)!;
  return Object.fromEntries(group.rows.map((r) => [r.label, r]));
}

describe("tallyCounts", () => {
  it("renders zeros, not a throw — the panel must work on an empty deployment", () => {
    const result = tallyCounts(empty(), NOW);
    expect(result.since).toBe(NOW - 7 * DAY_MS);
    for (const g of result.groups) for (const r of g.rows) expect([r.all, r.recent]).toEqual([0, 0]);
  });

  describe("people", () => {
    it("counts sign-ups, and which were this week, by role", () => {
      const people = rows(
        {
          ...empty(),
          profiles: [
            profile("a", LAST_MONTH),
            profile("b", THIS_WEEK, { primaryRole: "creative" }),
            profile("c", THIS_WEEK, { primaryRole: "patron" }),
            profile("d", LAST_MONTH, { primaryRole: "partner", isAdmin: true }),
          ],
        },
        "People",
      );
      expect(people["Signed up"]).toMatchObject({ all: 4, recent: 2 });
      // No primaryRole = an original Garden creative (stats.ts isCreativeProfile).
      expect(people["Creatives"]).toMatchObject({ all: 2, recent: 1, sub: true });
      expect(people["Patrons"]).toMatchObject({ all: 1, recent: 1 });
      expect(people["Partners"]).toMatchObject({ all: 1, recent: 0 });
      expect(people["Admins"]).toMatchObject({ all: 1, recent: 0 });
    });

    it("counts people in a community once, by their first active join", () => {
      const people = rows(
        {
          ...empty(),
          communityMembers: [
            { userId: "a", status: "active", joinedAt: LAST_MONTH },
            { userId: "a", status: "active", joinedAt: THIS_WEEK }, // second community: not new
            { userId: "b", status: "active", joinedAt: THIS_WEEK },
            { userId: "c", status: "pending", joinedAt: THIS_WEEK }, // asked, not in
            { userId: "d", status: "removed", joinedAt: LAST_MONTH },
          ],
        },
        "People",
      );
      expect(people["In a community"]).toMatchObject({ all: 2, recent: 1 });
    });

    it("counts paid seats and first projects per person, only while active / posted", () => {
      const people = rows(
        {
          ...empty(),
          memberships: [
            { userId: "a", status: "active", createdAt: THIS_WEEK },
            { userId: "b", status: "canceled", createdAt: THIS_WEEK },
          ],
          projects: [
            project("a", LAST_MONTH),
            project("a", THIS_WEEK),
            project("b", THIS_WEEK, { origin: "portfolio" }), // a shared work, not a project
          ],
        },
        "People",
      );
      expect(people["Paid seat"]).toMatchObject({ all: 1, recent: 1 });
      expect(people["Made a project"]).toMatchObject({ all: 1, recent: 0 });
    });

    it("counts the waitlist that is still waiting", () => {
      const people = rows(
        {
          ...empty(),
          waitlist: [
            { createdAt: THIS_WEEK },
            { createdAt: LAST_MONTH },
            { createdAt: THIS_WEEK, approvedAt: NOW - DAY_MS },
          ],
        },
        "People",
      );
      expect(people["On the waitlist"]).toMatchObject({ all: 2, recent: 1 });
    });
  });

  describe("projects", () => {
    it("separates posted projects from shared works, and splits by kind", () => {
      const projects = rows(
        {
          ...empty(),
          projects: [
            project("a", THIS_WEEK),
            project("a", LAST_MONTH, { kind: "paid" }),
            project("b", THIS_WEEK, { origin: "portfolio" }),
          ],
        },
        "Projects",
      );
      expect(projects["All projects"]).toMatchObject({ all: 2, recent: 1 });
      expect(projects["Passion"]).toMatchObject({ all: 1, recent: 1, sub: true });
      expect(projects["Paid"]).toMatchObject({ all: 1, recent: 0, sub: true });
      expect(projects["Works shared from a portfolio"]).toMatchObject({ all: 1, recent: 1 });
    });

    it("splits live projects by stage, and keeps archived and hidden apart", () => {
      const projects = rows(
        {
          ...empty(),
          projects: [
            project("a", LAST_MONTH), // active, no stage → planning
            project("a", THIS_WEEK, { status: "in_progress" }), // legacy → working
            project("a", THIS_WEEK, { stage: "completed" }),
            project("a", LAST_MONTH, { status: "completed" }), // legacy → completed
            project("b", THIS_WEEK, { stage: "paused" }),
            project("b", THIS_WEEK, { status: "archived", stage: "working" }),
            project("b", LAST_MONTH, { status: "hidden" }),
          ],
        },
        "Projects",
      );
      expect(projects["All projects"]).toMatchObject({ all: 7, recent: 4 });
      expect(projects["Live on Projects"]).toMatchObject({ all: 5, recent: 3 });
      expect(projects["In progress"]).toMatchObject({ all: 2, recent: 1, sub: true });
      expect(projects["Finished"]).toMatchObject({ all: 2, recent: 1, sub: true });
      expect(projects["Paused or cancelled"]).toMatchObject({ all: 1, recent: 1, sub: true });
      expect(projects["Archived"]).toMatchObject({ all: 1, recent: 1 });
      expect(projects["Hidden by an admin"]).toMatchObject({ all: 1, recent: 0 });
    });

    it("counts a project stored as releasing as Finished, the way it reads: Completed", () => {
      const projects = rows(
        {
          ...empty(),
          projects: [
            project("a", THIS_WEEK, { stage: "releasing" }),
            project("a", LAST_MONTH, { stage: "completed" }),
            project("a", THIS_WEEK, { stage: "working" }),
          ],
        },
        "Projects",
      );
      expect(projects["Finished"]).toMatchObject({ all: 2, recent: 1, sub: true });
      expect(projects["In progress"]).toMatchObject({ all: 1, recent: 1, sub: true });
    });
  });

  describe("events", () => {
    it("tells upcoming from past by the event's end, and lists the other statuses", () => {
      const events = rows(
        {
          ...empty(),
          events: [
            event(THIS_WEEK, NOW + DAY_MS), // upcoming, created this week
            event(LAST_MONTH, NOW - 60 * 60 * 1000), // started an hour ago, no end: still on
            event(LAST_MONTH, NOW - DAY_MS), // over
            event(THIS_WEEK, NOW - 10 * DAY_MS, { status: "completed" }),
            event(THIS_WEEK, NOW + DAY_MS, { status: "draft" }),
            event(LAST_MONTH, NOW + DAY_MS, { status: "cancelled" }),
            event(THIS_WEEK, NOW + DAY_MS, { status: "hidden" }),
          ],
        },
        "Events",
      );
      expect(events["All events"]).toMatchObject({ all: 7, recent: 4 });
      expect(events["Upcoming"]).toMatchObject({ all: 2, recent: 1 });
      expect(events["Past"]).toMatchObject({ all: 2, recent: 1 });
      expect(events["Drafts"]).toMatchObject({ all: 1, recent: 1 });
      expect(events["Cancelled"]).toMatchObject({ all: 1, recent: 0 });
      expect(events["Hidden by an admin"]).toMatchObject({ all: 1, recent: 1 });
    });
  });
});
