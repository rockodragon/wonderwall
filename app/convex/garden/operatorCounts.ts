// Operator counters — the "At a glance" panel on /admin (components/admin/
// CountsPanel.tsx): how many people, projects and events there are, and how
// many are new in the last 7 days. Operator-only, unlike stats.ts's
// publicCounts; and unlike that strip this is a census, not a headline —
// hidden, archived, draft and cancelled rows each get a row of their own
// instead of vanishing. Seeded sample postings (seedPaidPostings.ts) are
// still left out, by the same rule publicCounts uses: they're invented.
//
// "Last 7 days" means NEW in that row this week: a profile created this
// week, a project or event created this week, a person whose FIRST
// community join, paid seat or project landed this week. Never "touched
// this week".
//
// House style (activity.ts, reports.ts): pure core at the top, unit-tested
// without Convex in operatorCounts.test.ts; a thin ctx.db wrapper below.

import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveStage, type Stage } from "../stages";
import { eventHasEnded } from "../eventWindow";
import { requireOperator } from "../helpers";
import { HIDDEN_STATUS, isPortfolioShare, isPostedProject, VISIBLE_PROJECT_STATUSES } from "../moderationRules";
import { DAY_MS } from "./projectTeam";
import { isCreativeProfile, SeedCheck } from "./stats";

// ——————————————————————————————————————————————————————————————
// Pure core — no ctx. Unit-tested in operatorCounts.test.ts.
// ——————————————————————————————————————————————————————————————

export const RECENT_DAYS = 7;

export interface CountRow {
  label: string;
  all: number;
  /** New in this row during the window (see the header). */
  recent: number;
  /** A breakdown of the row above it, drawn indented. */
  sub?: boolean;
}

export interface CountGroup {
  title: "People" | "Projects" | "Events";
  rows: CountRow[];
}

/** The slices of each table the tally reads. The wrapper has already
 * dropped seeded users' rows from every user-keyed list. */
export interface CountInputs {
  profiles: { userId: string; createdAt: number; primaryRole?: string; isAdmin?: boolean }[];
  communityMembers: { userId: string; status: string; joinedAt: number }[];
  memberships: { userId: string; status: string; createdAt: number }[];
  waitlist: { createdAt: number; approvedAt?: number }[];
  projects: {
    userId: string;
    kind: string;
    status: string;
    stage?: string;
    origin?: string;
    createdAt: number;
  }[];
  events: { status: string; datetime: number; endTime?: number; createdAt: number }[];
}

function row<T>(
  label: string,
  rows: readonly T[],
  at: (r: T) => number,
  since: number,
  sub = false,
): CountRow {
  let recent = 0;
  for (const r of rows) if (at(r) >= since) recent++;
  return sub ? { label, all: rows.length, recent, sub } : { label, all: rows.length, recent };
}

/** Per person, when they first did the thing: the earliest `at` among their
 * rows. Counting these (rather than the rows) is what makes "In a community"
 * a count of people, and its 7-day column the people who joined their first
 * community this week — not a second community, and not a re-join. */
function firstTimes<T>(
  rows: readonly T[],
  userOf: (r: T) => string,
  at: (r: T) => number,
): number[] {
  const first = new Map<string, number>();
  for (const r of rows) {
    const key = userOf(r);
    const t = at(r);
    const prior = first.get(key);
    if (prior === undefined || t < prior) first.set(key, t);
  }
  return [...first.values()];
}

const self = (t: number) => t;

/** Stages that mean the work is done (stages.ts). Completed is the one: a
 * project stored as "releasing" resolves to it, so it is counted here too. */
const FINISHED_STAGES: ReadonlySet<Stage> = new Set<Stage>(["completed"]);
/** Stages that mean the work stopped short. */
const STOPPED_STAGES: ReadonlySet<Stage> = new Set<Stage>(["paused", "cancelled"]);

export function tallyCounts(
  input: CountInputs,
  now: number,
): { now: number; since: number; groups: CountGroup[] } {
  const since = now - RECENT_DAYS * DAY_MS;

  // — people —
  const { profiles } = input;
  const createdAt = (r: { createdAt: number }) => r.createdAt;
  const activeJoins = input.communityMembers.filter((m) => m.status === "active");
  const paidSeats = input.memberships.filter((m) => m.status === "active");
  // Projects someone posted, as opposed to a work shared from the portfolio
  // (moderationRules.ts isPostedProject) — those are "works", not projects —
  // and to a draft, which isn't posted yet.
  const posted = input.projects.filter(isPostedProject);
  const people: CountRow[] = [
    row("Signed up", profiles, createdAt, since),
    row("Creatives", profiles.filter(isCreativeProfile), createdAt, since, true),
    row("Patrons", profiles.filter((p) => p.primaryRole === "patron"), createdAt, since, true),
    row("Partners", profiles.filter((p) => p.primaryRole === "partner"), createdAt, since, true),
    row("In a community", firstTimes(activeJoins, (m) => m.userId, (m) => m.joinedAt), self, since),
    row("Paid seat", firstTimes(paidSeats, (m) => m.userId, createdAt), self, since),
    row("Made a project", firstTimes(posted, (p) => p.userId, createdAt), self, since),
    row("Admins", profiles.filter((p) => p.isAdmin === true), createdAt, since),
    row("On the waitlist", input.waitlist.filter((w) => w.approvedAt === undefined), createdAt, since),
  ];

  // — projects —
  const live = posted.filter((p) => VISIBLE_PROJECT_STATUSES.has(p.status));
  const stageOf = (p: CountInputs["projects"][number]) => resolveStage(p);
  const projects: CountRow[] = [
    row("All projects", posted, createdAt, since),
    row("Passion", posted.filter((p) => p.kind === "passion"), createdAt, since, true),
    row("Paid", posted.filter((p) => p.kind === "paid"), createdAt, since, true),
    row("Live on Projects", live, createdAt, since),
    row(
      "In progress",
      live.filter((p) => !FINISHED_STAGES.has(stageOf(p)) && !STOPPED_STAGES.has(stageOf(p))),
      createdAt,
      since,
      true,
    ),
    row("Finished", live.filter((p) => FINISHED_STAGES.has(stageOf(p))), createdAt, since, true),
    row("Paused or cancelled", live.filter((p) => STOPPED_STAGES.has(stageOf(p))), createdAt, since, true),
    row("Archived", posted.filter((p) => p.status === "archived"), createdAt, since),
    row("Hidden by an admin", posted.filter((p) => p.status === HIDDEN_STATUS), createdAt, since),
    row("Works shared from a portfolio", input.projects.filter(isPortfolioShare), createdAt, since),
  ];

  // — events —
  const { events } = input;
  const published = events.filter((e) => e.status === "published");
  const eventRows: CountRow[] = [
    row("All events", events, createdAt, since),
    row("Upcoming", published.filter((e) => !eventHasEnded(e, now)), createdAt, since),
    row(
      "Past",
      events.filter((e) => e.status === "completed" || (e.status === "published" && eventHasEnded(e, now))),
      createdAt,
      since,
    ),
    row("Drafts", events.filter((e) => e.status === "draft"), createdAt, since),
    row("Cancelled", events.filter((e) => e.status === "cancelled"), createdAt, since),
    row("Hidden by an admin", events.filter((e) => e.status === HIDDEN_STATUS), createdAt, since),
  ];

  return {
    now,
    since,
    groups: [
      { title: "People", rows: people },
      { title: "Projects", rows: projects },
      { title: "Events", rows: eventRows },
    ],
  };
}

// ——————————————————————————————————————————————————————————————
// Convex wrapper
// ——————————————————————————————————————————————————————————————

export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);

    const [profiles, communityMembers, memberships, waitlist, projects, events] = await Promise.all([
      ctx.db.query("profiles").collect(),
      ctx.db.query("communityMembers").collect(),
      ctx.db.query("memberships").collect(),
      ctx.db.query("waitlist").collect(),
      ctx.db.query("projects").collect(),
      ctx.db.query("events").collect(),
    ]);

    // One users read per distinct person, memoized across all four lists.
    const seedCheck = new SeedCheck(ctx);
    async function real<T extends { userId: Id<"users"> }>(rows: T[]): Promise<T[]> {
      const kept: T[] = [];
      for (const r of rows) if (!(await seedCheck.isSeed(r.userId))) kept.push(r);
      return kept;
    }

    return tallyCounts(
      {
        profiles: await real(profiles),
        communityMembers: await real(communityMembers),
        memberships: await real(memberships),
        waitlist,
        projects: await real(projects),
        events,
      },
      Date.now(),
    );
  },
});
