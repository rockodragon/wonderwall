// Pure-logic tests for the AP Fund allocations ledger. No Convex — plain
// fixtures shaped like allocation rows, mirroring stripeHandlers.test.ts's
// style (hand-written rows, no fake Db needed since these functions take
// plain arrays/maps directly).

import { describe, expect, it } from "vitest";
import {
  computeFundTotals,
  computePoolBalance,
  computePoolInflows,
  isValidAmountCents,
  resolveRecipientName,
  shapeCredits,
  shapeLedger,
  type AllocationLike,
  type ContributionLike,
  type CreditRow,
  type LedgerRow,
  type ProjectLookup,
} from "./allocations";

describe("computeFundTotals", () => {
  it("sums all-time and groups by period, newest period first", () => {
    const totals = computeFundTotals([
      { amountCents: 50000, period: "2026-08" },
      { amountCents: 50000, period: "2026-07" },
      { amountCents: 25000, period: "2026-08" },
    ]);
    expect(totals.allTimeCents).toBe(125000);
    expect(totals.byPeriod).toEqual([
      { period: "2026-08", cents: 75000 },
      { period: "2026-07", cents: 50000 },
    ]);
  });

  it("empty fund yields the zeroed shape, not an absent field (founder ask: empty-state care)", () => {
    expect(computeFundTotals([])).toEqual({ allTimeCents: 0, byPeriod: [] });
  });

  it("a single allocation rolls up to a single period bucket", () => {
    const totals = computeFundTotals([{ amountCents: 12300, period: "2026-09" }]);
    expect(totals).toEqual({ allTimeCents: 12300, byPeriod: [{ period: "2026-09", cents: 12300 }] });
  });
});

describe("shapeLedger", () => {
  const projectsById = new Map<string, ProjectLookup>([
    ["proj_psalms", { title: "Psalms for the 2AM", slug: "psalms-for-the-2am" }],
  ]);

  it("newest first, cents converted to display amount, project title/slug attached", () => {
    const rows: LedgerRow[] = [
      {
        recipientName: "Shua",
        amountCents: 50000,
        period: "2026-08 · monthly",
        note: "Fellowship",
        projectId: "proj_psalms",
        createdAt: 100,
      },
      {
        recipientName: "Marcus",
        amountCents: 20000,
        period: "2026-07",
        projectId: undefined,
        createdAt: 200,
      },
    ];
    expect(shapeLedger(rows, projectsById)).toEqual([
      {
        period: "2026-07",
        amount: 200,
        recipientName: "Marcus",
        projectTitle: undefined,
        projectSlug: undefined,
        note: undefined,
      },
      {
        period: "2026-08 · monthly",
        amount: 500,
        recipientName: "Shua",
        projectTitle: "Psalms for the 2AM",
        projectSlug: "psalms-for-the-2am",
        note: "Fellowship",
      },
    ]);
  });

  it("empty ledger is an empty array, not null/undefined", () => {
    expect(shapeLedger([], projectsById)).toEqual([]);
  });

  it("a projectId with no matching lookup entry leaves title/slug undefined (never throws)", () => {
    const rows: LedgerRow[] = [
      { recipientName: "Diane", amountCents: 10000, period: "2026-08", projectId: "proj_ghost", createdAt: 1 },
    ];
    const [entry] = shapeLedger(rows, projectsById);
    expect(entry.projectTitle).toBeUndefined();
    expect(entry.projectSlug).toBeUndefined();
  });
});

describe("shapeCredits", () => {
  const orgNameById = new Map([["org_ap", "Abiding Practice"]]);

  it("attaches org name and converts to display amount, newest first", () => {
    const rows: CreditRow[] = [
      { hostOrgId: "org_ap", period: "2026-07", amountCents: 30000, createdAt: 1 },
      { hostOrgId: "org_ap", period: "2026-08", amountCents: 50000, createdAt: 2 },
    ];
    expect(shapeCredits(rows, orgNameById)).toEqual([
      { orgName: "Abiding Practice", period: "2026-08", amount: 500 },
      { orgName: "Abiding Practice", period: "2026-07", amount: 300 },
    ]);
  });

  it("no allocations → [] (a project with no fund support renders cleanly)", () => {
    expect(shapeCredits([], orgNameById)).toEqual([]);
  });

  it("unresolvable org falls back to a plain 'A sponsor' rather than throwing", () => {
    const rows: CreditRow[] = [{ hostOrgId: "org_unknown", period: "2026-08", amountCents: 10000, createdAt: 1 }];
    expect(shapeCredits(rows, orgNameById)[0].orgName).toBe("A sponsor");
  });
});

describe("isValidAmountCents", () => {
  it("rejects zero, negative, and non-integer amounts", () => {
    expect(isValidAmountCents(0)).toBe(false);
    expect(isValidAmountCents(-500)).toBe(false);
    expect(isValidAmountCents(12.5)).toBe(false);
  });

  it("accepts any positive whole number of cents", () => {
    expect(isValidAmountCents(1)).toBe(true);
    expect(isValidAmountCents(50000)).toBe(true);
  });
});

describe("resolveRecipientName", () => {
  it("prefers the explicit arg over the denormalized owner name", () => {
    expect(
      resolveRecipientName({ recipientNameArg: "Shua Custom", ownerProfileName: "Shua" }),
    ).toBe("Shua Custom");
  });

  it("falls back to the project owner's profile name when the arg is omitted", () => {
    expect(resolveRecipientName({ ownerProfileName: "Shua" })).toBe("Shua");
  });

  it("returns null when neither is resolvable — the mutation's cue to reject", () => {
    expect(resolveRecipientName({})).toBeNull();
    expect(resolveRecipientName({ recipientNameArg: "   " })).toBeNull();
  });
});

describe("computePoolInflows", () => {
  it("sums pool/gross/platform totals and groups by type and by period (newest first)", () => {
    const contributions: ContributionLike[] = [
      { type: "dues_share", grossCents: 1000, platformCents: 500, poolCents: 500, period: "2026-08" },
      { type: "dues_share", grossCents: 1000, platformCents: 500, poolCents: 500, period: "2026-07" },
      { type: "contribution_in", grossCents: 1000, platformCents: 100, poolCents: 900, period: "2026-08" },
    ];
    const inflows = computePoolInflows(contributions);
    expect(inflows.poolCents).toBe(1900);
    expect(inflows.grossCents).toBe(3000);
    expect(inflows.platformCents).toBe(1100);
    expect(inflows.byType).toEqual([
      { type: "dues_share", poolCents: 1000, count: 2 },
      { type: "contribution_in", poolCents: 900, count: 1 },
    ]);
    expect(inflows.byPeriod).toEqual([
      { period: "2026-08", poolCents: 1400 },
      { period: "2026-07", poolCents: 500 },
    ]);
  });

  it("empty input yields the zeroed shape, not an absent field", () => {
    expect(computePoolInflows([])).toEqual({
      poolCents: 0,
      grossCents: 0,
      platformCents: 0,
      byType: [],
      byPeriod: [],
    });
  });

  it("a negative-poolCents adjustment nets out of the type/period totals correctly", () => {
    const contributions: ContributionLike[] = [
      { type: "sponsor_in", grossCents: 10000, platformCents: 1000, poolCents: 9000, period: "2026-08" },
      { type: "adjustment", grossCents: -2000, platformCents: 0, poolCents: -2000, period: "2026-08" },
    ];
    const inflows = computePoolInflows(contributions);
    expect(inflows.poolCents).toBe(7000);
    expect(inflows.byType).toEqual(
      expect.arrayContaining([
        { type: "sponsor_in", poolCents: 9000, count: 1 },
        { type: "adjustment", poolCents: -2000, count: 1 },
      ]),
    );
    expect(inflows.byPeriod).toEqual([{ period: "2026-08", poolCents: 7000 }]);
  });
});

describe("computePoolBalance", () => {
  it("is inflow pool cents minus allocations awarded out", () => {
    const contributions: ContributionLike[] = [
      { type: "dues_share", grossCents: 1000, platformCents: 500, poolCents: 500, period: "2026-08" },
      { type: "contribution_in", grossCents: 1000, platformCents: 100, poolCents: 900, period: "2026-08" },
    ];
    const allocations: AllocationLike[] = [{ amountCents: 700, period: "2026-08" }];
    expect(computePoolBalance(contributions, allocations)).toBe(700); // 1400 in - 700 out
  });

  it("an adjustment row with negative poolCents lowers the balance (a clawback)", () => {
    const contributions: ContributionLike[] = [
      { type: "sponsor_in", grossCents: 10000, platformCents: 1000, poolCents: 9000, period: "2026-08" },
      { type: "adjustment", grossCents: -3000, platformCents: 0, poolCents: -3000, period: "2026-09" },
    ];
    expect(computePoolBalance(contributions, [])).toBe(6000);
  });

  it("no contributions and no allocations yields a zero balance", () => {
    expect(computePoolBalance([], [])).toBe(0);
  });

  it("allocations with no contributions yield a negative balance (spent ahead of the ledger — not clamped)", () => {
    expect(computePoolBalance([], [{ amountCents: 500, period: "2026-08" }])).toBe(-500);
  });
});
