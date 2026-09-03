// Pure-logic tests for the operator ledger report. No Convex — plain
// fixtures shaped like the rows each pure function takes, mirroring
// allocations.test.ts's style.

import { describe, expect, it } from "vitest";
import {
  allocationDescription,
  buildHostEarningsRow,
  buildPoolRow,
  buildRecent,
  computeFeeSummary,
  computePeriods,
  contributionDescription,
  duesDescription,
  eventTicketDescription,
  hostSaleDescription,
  payoutDescription,
  periodOf,
  sortPools,
  summarizeCommunityMembers,
  summarizePlatformMemberships,
  winningMembership,
  type CommunityMemberForSummary,
  type FeeEvent,
  type MembershipLevelRow,
  type PlatformMembershipRow,
  type RecentItem,
} from "./reports";

describe("periodOf", () => {
  it("formats epoch ms as YYYY-MM in UTC", () => {
    expect(periodOf(Date.UTC(2026, 7, 15, 3, 0, 0))).toBe("2026-08");
  });

  it("pads single-digit months", () => {
    expect(periodOf(Date.UTC(2026, 0, 1))).toBe("2026-01");
  });

  it("reads the UTC month even when the local wall-clock would round to the next day", () => {
    // 2026-08-31T23:30:00Z — a naive local-time formatter in a UTC-negative
    // zone would still say August; the risk this test guards is a
    // getMonth()/getDate() (local) vs getUTCMonth()/getUTCDate() bug.
    expect(periodOf(Date.UTC(2026, 7, 31, 23, 30, 0))).toBe("2026-08");
  });
});

describe("computePeriods", () => {
  it("dedupes and sorts newest first", () => {
    expect(computePeriods(["2026-06", "2026-08", "2026-06", "2026-07"])).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
  });

  it("caps at 12 newest months", () => {
    const months = Array.from({ length: 20 }, (_, i) => {
      const m = String((i % 12) + 1).padStart(2, "0");
      const y = 2024 + Math.floor(i / 12);
      return `${y}-${m}`;
    });
    const out = computePeriods(months);
    expect(out).toHaveLength(12);
    // newest first
    expect(out[0] >= out[out.length - 1]).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i - 1] >= out[i]).toBe(true);
  });

  it("empty input yields an empty list", () => {
    expect(computePeriods([])).toEqual([]);
  });
});

describe("computeFeeSummary", () => {
  it("totals platformCents across every source, including pool_other rows with no bySource entry", () => {
    const events: FeeEvent[] = [
      { source: "dues", period: "2026-08", grossCents: 10000, platformCents: 5000 },
      { source: "pool_contributions", period: "2026-08", grossCents: 2000, platformCents: 200 },
      { source: "host_sales", period: "2026-08", grossCents: 5000, platformCents: 500 },
      { source: "event_tickets", period: "2026-08", grossCents: 2500, platformCents: 0 },
      { source: "pool_other", period: "2026-08", grossCents: 1000, platformCents: 100 },
    ];
    const fees = computeFeeSummary(events);
    // 5000 + 200 + 500 + 0 + 100
    expect(fees.totalPlatformCents).toBe(5800);
  });

  it("returns bySource in the fixed contract order regardless of input order, dues/pool_contributions/host_sales/event_tickets", () => {
    const events: FeeEvent[] = [
      { source: "event_tickets", period: "2026-08", grossCents: 100, platformCents: 0 },
      { source: "host_sales", period: "2026-08", grossCents: 100, platformCents: 10 },
      { source: "dues", period: "2026-08", grossCents: 100, platformCents: 50 },
      { source: "pool_contributions", period: "2026-08", grossCents: 100, platformCents: 10 },
    ];
    const fees = computeFeeSummary(events);
    expect(fees.bySource.map((s) => s.source)).toEqual([
      "dues",
      "pool_contributions",
      "host_sales",
      "event_tickets",
    ]);
  });

  it("excludes pool_other from bySource entirely — no fifth row leaks in", () => {
    const fees = computeFeeSummary([{ source: "pool_other", period: "2026-08", grossCents: 500, platformCents: 50 }]);
    expect(fees.bySource).toHaveLength(4);
    expect(fees.bySource.every((s) => s.count === 0)).toBe(true);
    // but the platform cut still counts toward the total
    expect(fees.totalPlatformCents).toBe(50);
  });

  it("flags event_tickets as split-not-recorded while the other three are recorded", () => {
    const fees = computeFeeSummary([]);
    const bySource = Object.fromEntries(fees.bySource.map((s) => [s.source, s.splitRecorded]));
    expect(bySource).toEqual({
      dues: true,
      pool_contributions: true,
      host_sales: true,
      event_tickets: false,
    });
  });

  it("sums grossCents/platformCents/count per source and labels every source", () => {
    const fees = computeFeeSummary([
      { source: "dues", period: "2026-08", grossCents: 10000, platformCents: 5000 },
      { source: "dues", period: "2026-07", grossCents: 4000, platformCents: 2000 },
    ]);
    const dues = fees.bySource.find((s) => s.source === "dues")!;
    expect(dues).toMatchObject({
      label: "Member dues",
      grossCents: 14000,
      platformCents: 7000,
      count: 2,
      splitRecorded: true,
    });
  });

  it("groups byPeriod across ALL sources including pool_other, newest period first", () => {
    const fees = computeFeeSummary([
      { source: "dues", period: "2026-07", grossCents: 1000, platformCents: 500 },
      { source: "pool_other", period: "2026-08", grossCents: 300, platformCents: 30 },
      { source: "host_sales", period: "2026-08", grossCents: 700, platformCents: 70 },
    ]);
    expect(fees.byPeriod).toEqual([
      { period: "2026-08", grossCents: 1000, platformCents: 100 },
      { period: "2026-07", grossCents: 1000, platformCents: 500 },
    ]);
  });

  it("empty input yields the zeroed fixed-order shape", () => {
    const fees = computeFeeSummary([]);
    expect(fees.totalPlatformCents).toBe(0);
    expect(fees.byPeriod).toEqual([]);
    expect(fees.bySource).toHaveLength(4);
    for (const s of fees.bySource) {
      expect(s.grossCents).toBe(0);
      expect(s.platformCents).toBe(0);
      expect(s.count).toBe(0);
    }
  });
});

describe("winningMembership", () => {
  it("a covered seat plus a paid five: five wins (outranks seat) and is NOT covered", () => {
    const rows: MembershipLevelRow[] = [
      { level: "seat", status: "active", coveredByCodeId: "code_1" },
      { level: "five", status: "active" }, // no coveredByCodeId — self-paid
    ];
    const w = winningMembership(rows);
    expect(w.level).toBe("five");
    expect(w.coveredByCodeId).toBeUndefined();
  });

  it("a covered seat alone reads as covered", () => {
    const w = winningMembership([{ level: "seat", status: "active", coveredByCodeId: "code_1" }]);
    expect(w).toEqual({ level: "seat", coveredByCodeId: "code_1" });
  });

  it("host outranks five outranks seat", () => {
    expect(
      winningMembership([
        { level: "seat", status: "active" },
        { level: "host", status: "active" },
        { level: "five", status: "active" },
      ]).level,
    ).toBe("host");
  });

  it("past_due still counts (grace), canceled/incomplete do not", () => {
    expect(winningMembership([{ level: "five", status: "past_due" }]).level).toBe("five");
    expect(winningMembership([{ level: "five", status: "canceled" }]).level).toBe("free");
    expect(winningMembership([{ level: "five", status: "incomplete" }]).level).toBe("free");
  });

  it("no rows at all reads as free", () => {
    expect(winningMembership([]).level).toBe("free");
  });
});

describe("summarizeCommunityMembers", () => {
  it("buckets active members by winning level, free for no entitled row", () => {
    const members: CommunityMemberForSummary[] = [
      { role: "member", status: "active", memberships: [] }, // free
      { role: "member", status: "active", memberships: [{ level: "seat", status: "active" }] },
      {
        role: "member",
        status: "active",
        memberships: [
          { level: "seat", status: "active", coveredByCodeId: "code_1" },
          { level: "five", status: "active" },
        ],
      }, // covered seat + paid five -> five, uncovered
      { role: "host", status: "active", memberships: [{ level: "host", status: "active" }] },
    ];
    const summary = summarizeCommunityMembers(members);
    expect(summary.total).toBe(4);
    expect(summary.hosts).toBe(1);
    expect(summary.byLevel).toEqual({ free: 1, seat: 1, five: 1, host: 1 });
    expect(summary.covered).toBe(0); // the covered-seat-but-really-five member isn't covered
  });

  it("counts pending members separately, and doesn't fold them into byLevel/total", () => {
    const members: CommunityMemberForSummary[] = [
      { role: "member", status: "active", memberships: [] },
      { role: "member", status: "pending", memberships: [{ level: "seat", status: "active" }] },
    ];
    const summary = summarizeCommunityMembers(members);
    expect(summary.total).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.byLevel.seat).toBe(0);
  });

  it("counts home members among active only", () => {
    const members: CommunityMemberForSummary[] = [
      { role: "member", status: "active", isHome: true, memberships: [] },
      { role: "member", status: "active", isHome: false, memberships: [] },
      { role: "member", status: "pending", isHome: true, memberships: [] },
    ];
    expect(summarizeCommunityMembers(members).home).toBe(1);
  });

  it("a covered seat with nothing else outranking it counts toward covered", () => {
    const members: CommunityMemberForSummary[] = [
      { role: "member", status: "active", memberships: [{ level: "seat", status: "active", coveredByCodeId: "c1" }] },
    ];
    const summary = summarizeCommunityMembers(members);
    expect(summary.byLevel.seat).toBe(1);
    expect(summary.covered).toBe(1);
  });

  it("empty community yields the zeroed shape", () => {
    expect(summarizeCommunityMembers([])).toEqual({
      total: 0,
      pending: 0,
      hosts: 0,
      byLevel: { free: 0, seat: 0, five: 0, host: 0 },
      covered: 0,
      home: 0,
    });
  });
});

describe("summarizePlatformMemberships", () => {
  it("active/pastDue/canceled are raw row counts, not deduped by user", () => {
    const rows: PlatformMembershipRow[] = [
      { userId: "u1", level: "seat", status: "active" },
      { userId: "u1", level: "five", status: "active" }, // same user, two rows
      { userId: "u2", level: "seat", status: "past_due" },
      { userId: "u3", level: "seat", status: "canceled" },
    ];
    const s = summarizePlatformMemberships(rows);
    expect(s.active).toBe(2);
    expect(s.pastDue).toBe(1);
    expect(s.canceled).toBe(1);
  });

  it("byLevel/covered dedupe to one winning row per user among active+past_due", () => {
    const rows: PlatformMembershipRow[] = [
      { userId: "u1", level: "seat", status: "active", coveredByCodeId: "c1" },
      { userId: "u1", level: "five", status: "active" }, // outranks the covered seat
      { userId: "u2", level: "host", status: "past_due" },
      { userId: "u3", level: "seat", status: "canceled" }, // excluded entirely
    ];
    const s = summarizePlatformMemberships(rows);
    expect(s.byLevel).toEqual({ seat: 0, five: 1, host: 1 });
    expect(s.covered).toBe(0); // u1's winning row (five) isn't covered
  });

  it("empty input yields the zeroed shape", () => {
    expect(summarizePlatformMemberships([])).toEqual({
      active: 0,
      pastDue: 0,
      canceled: 0,
      byLevel: { seat: 0, five: 0, host: 0 },
      covered: 0,
    });
  });
});

describe("buildPoolRow / sortPools", () => {
  it("reshapes pool inflows/outflows for one org", () => {
    const row = buildPoolRow(
      { hostOrgId: "org_1", name: "The Garden", slug: "the-garden", kind: "community" },
      [
        { type: "contribution_in", grossCents: 1000, platformCents: 100, poolCents: 900, period: "2026-08" },
      ],
      [{ amountCents: 300, period: "2026-08" }],
    );
    expect(row.inflowPoolCents).toBe(900);
    expect(row.inflowGrossCents).toBe(1000);
    expect(row.inflowPlatformCents).toBe(100);
    expect(row.outflowCents).toBe(300);
    expect(row.balanceCents).toBe(600);
  });

  it("sorts the platform-kind pool first, then the rest alphabetically", () => {
    const pools = sortPools([
      { kind: "community", name: "Zebra Circle" },
      { kind: "platform", name: "creatives.exchange" },
      { kind: "community", name: "Abiding Practice" },
    ]);
    expect(pools.map((p) => p.name)).toEqual(["creatives.exchange", "Abiding Practice", "Zebra Circle"]);
  });
});

describe("buildHostEarningsRow", () => {
  it("reuses computeHostEarnings and adds activeProducts", () => {
    const row = buildHostEarningsRow(
      { hostOrgId: "org_1", name: "The Garden", slug: "the-garden" },
      [{ grossCents: 1000, platformCents: 100, hostCents: 900, status: "paid" }],
      [{ amountCents: 400 }],
      3,
    );
    expect(row).toMatchObject({
      hostOrgId: "org_1",
      name: "The Garden",
      slug: "the-garden",
      salesCount: 1,
      grossCents: 1000,
      platformCents: 100,
      hostCents: 900,
      paidOutCents: 400,
      owedCents: 500,
      activeProducts: 3,
    });
  });
});

describe("description helpers", () => {
  it("dues carries the level when known", () => {
    expect(duesDescription("seat")).toBe("Dues share · seat");
    expect(duesDescription(undefined)).toBe("Dues share");
  });

  it("contribution types map to warm labels, unknown types fall back", () => {
    expect(contributionDescription("contribution_in")).toBe("Pool contribution");
    expect(contributionDescription("topup_in")).toBe("Top-up");
    expect(contributionDescription("sponsor_in")).toBe("Sponsor contribution");
    expect(contributionDescription("entry_fee_in")).toBe("Entry fee");
    expect(contributionDescription("adjustment")).toBe("Adjustment");
    expect(contributionDescription("something_new")).toBe("Contribution");
  });

  it("allocation/host sale/event ticket/payout descriptions", () => {
    expect(allocationDescription("Shua")).toBe("Allocation — Shua");
    expect(hostSaleDescription("Premium circle", "The Garden")).toBe("Premium circle — The Garden");
    expect(eventTicketDescription("General")).toBe("Event ticket · General");
    expect(payoutDescription("The Garden")).toBe("Payout to The Garden");
  });
});

describe("buildRecent", () => {
  it("orders newest first", () => {
    const items: RecentItem[] = [
      { at: 100, source: "dues", description: "a", grossCents: 100, platformCents: 10 },
      { at: 300, source: "dues", description: "b", grossCents: 100, platformCents: 10 },
      { at: 200, source: "dues", description: "c", grossCents: 100, platformCents: 10 },
    ];
    expect(buildRecent(items).map((i) => i.at)).toEqual([300, 200, 100]);
  });

  it("caps at 60 by default", () => {
    const items: RecentItem[] = Array.from({ length: 90 }, (_, i) => ({
      at: i,
      source: "dues" as const,
      description: "x",
      grossCents: 1,
      platformCents: 0,
    }));
    expect(buildRecent(items)).toHaveLength(60);
    // keeps the 60 newest (at = 89 down to 30)
    expect(buildRecent(items)[0].at).toBe(89);
    expect(buildRecent(items)[59].at).toBe(30);
  });

  it("allocations and payouts carry negative grossCents (money out); inflows stay positive", () => {
    const items: RecentItem[] = [
      { at: 1, source: "allocation", description: "Allocation — Shua", grossCents: -5000, platformCents: 0 },
      { at: 2, source: "host_payout", description: "Payout to The Garden", grossCents: -9000, platformCents: 0 },
      { at: 3, source: "host_sale", description: "Premium — The Garden", grossCents: 2000, platformCents: 200 },
    ];
    const out = buildRecent(items);
    expect(out.find((i) => i.source === "allocation")!.grossCents).toBeLessThan(0);
    expect(out.find((i) => i.source === "host_payout")!.grossCents).toBeLessThan(0);
    expect(out.find((i) => i.source === "host_sale")!.grossCents).toBeGreaterThan(0);
  });
});
