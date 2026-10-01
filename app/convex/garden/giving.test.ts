// Pure-logic tests for member-directed giving (giving.ts). No Convex, no
// network — same style as allocations.test.ts and payouts.test.ts.

import { describe, expect, it } from "vitest";
import {
  GIFT_DEFAULT_AFTER_DAYS,
  GIFT_NOTE_MAX,
  GIVING_SENTENCES,
  MIN_TRANSFER_CENTS,
  allowanceForDuesShare,
  buildAllowanceBackingPayment,
  buildAllowanceGiftPayment,
  buildGiftOpenedEmail,
  buildGiftReceivedEmail,
  buildMemberGiftOutContribution,
  computeGivingReport,
  formatCents,
  giftDecisionProblem,
  giftDefaultDue,
  planTransfers,
  previousPeriod,
  type GiftLike,
  type PlusUpLike,
} from "./giving";

const DAY = 24 * 60 * 60 * 1000;

describe("allowanceForDuesShare", () => {
  it("is the pool share of the invoice — $5 of a $10 Garden membership", () => {
    expect(allowanceForDuesShare(500)).toBe(500);
  });
  it("opens nothing for a community with no pool share", () => {
    expect(allowanceForDuesShare(0)).toBe(0);
    expect(allowanceForDuesShare(-5)).toBe(0);
    expect(allowanceForDuesShare(12.5)).toBe(0);
  });
});

describe("giftDecisionProblem", () => {
  const base = { giftStatus: "open", giverUserId: "u_giver" };

  it("only an open amount can be decided", () => {
    expect(giftDecisionProblem({ ...base, giftStatus: "fund", target: "fund" })).toMatch(/already been decided/);
  });

  it("never to yourself", () => {
    expect(
      giftDecisionProblem({ ...base, target: "creative", recipientUserId: "u_giver", recipientIsMember: true }),
    ).toMatch(/yourself/);
  });

  it("a creative must be an active member of the community", () => {
    expect(
      giftDecisionProblem({ ...base, target: "creative", recipientUserId: "u_other", recipientIsMember: false }),
    ).toMatch(/isn't a member/);
    expect(
      giftDecisionProblem({ ...base, target: "creative", recipientUserId: "u_other", recipientIsMember: true }),
    ).toBeNull();
  });

  it("never to your own project, and only active passion projects", () => {
    expect(
      giftDecisionProblem({ ...base, target: "project", projectOwnerUserId: "u_giver", projectKind: "passion", projectStatus: "active" }),
    ).toMatch(/own project/);
    expect(
      giftDecisionProblem({ ...base, target: "project", projectOwnerUserId: "u_x", projectKind: "paid", projectStatus: "active" }),
    ).toMatch(/passion/);
    expect(
      giftDecisionProblem({ ...base, target: "project", projectOwnerUserId: "u_x", projectKind: "passion", projectStatus: "archived" }),
    ).toMatch(/isn't taking support/);
    expect(
      giftDecisionProblem({ ...base, target: "project", projectOwnerUserId: "u_x", projectKind: "passion", projectStatus: "active" }),
    ).toBeNull();
  });

  it("the fund is always allowed; a note has a ceiling", () => {
    expect(giftDecisionProblem({ ...base, target: "fund" })).toBeNull();
    expect(giftDecisionProblem({ ...base, target: "fund", note: "x".repeat(GIFT_NOTE_MAX + 1) })).toMatch(/under 200/);
  });
});

describe("giftDefaultDue / previousPeriod", () => {
  it("defaults after a week, or as soon as a newer amount opens", () => {
    const openedAt = 1_000_000;
    expect(giftDefaultDue({ openedAt, now: openedAt + (GIFT_DEFAULT_AFTER_DAYS - 1) * DAY, newerGiftExists: false })).toBe(false);
    expect(giftDefaultDue({ openedAt, now: openedAt + GIFT_DEFAULT_AFTER_DAYS * DAY, newerGiftExists: false })).toBe(true);
    expect(giftDefaultDue({ openedAt, now: openedAt + DAY, newerGiftExists: true })).toBe(true);
  });
  it("walks months, including the year boundary", () => {
    expect(previousPeriod("2026-10")).toBe("2026-09");
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });
});

describe("row builders", () => {
  it("a creative-directed amount is owed in full with no platform share", () => {
    const row = buildAllowanceGiftPayment({
      memberGiftId: "gift_1",
      payeeUserId: "u_dana",
      giverUserId: "u_giver",
      giverName: "Sam",
      visible: true,
      amountCents: 500,
      period: "2026-10",
    });
    expect(row).toMatchObject({
      source: "allowance",
      billing: "allowance",
      grossCents: 500,
      platformCents: 0,
      workCents: 500,
      stripeRef: "allowance:gift_1",
      giverName: "Sam",
    });
  });

  it("an anonymous giver's name never reaches the row", () => {
    const row = buildAllowanceGiftPayment({
      memberGiftId: "gift_1",
      payeeUserId: "u_dana",
      giverUserId: "u_giver",
      giverName: "Sam",
      visible: false,
      amountCents: 500,
      period: "2026-10",
    });
    expect(row.giverName).toBeUndefined();
    expect(row.visible).toBe(false);
  });

  it("a project-directed amount is a backing payment with no platform share", () => {
    const row = buildAllowanceBackingPayment({
      memberGiftId: "gift_1",
      projectId: "p_1",
      supportId: "s_1",
      payeeUserId: "u_lead",
      backerUserId: "u_giver",
      amountCents: 500,
      period: "2026-10",
    });
    expect(row).toMatchObject({ billing: "allowance", platformCents: 0, workCents: 500, stripeRef: "allowance:gift_1", memberGiftId: "gift_1" });
  });

  it("the pool loses exactly what was directed away", () => {
    const row = buildMemberGiftOutContribution({
      communityId: "org_garden",
      memberGiftId: "gift_1",
      userId: "u_giver",
      amountCents: 500,
      period: "2026-10",
      target: "creative",
    });
    expect(row).toMatchObject({ type: "member_gift_out", grossCents: 0, platformCents: 0, poolCents: -500 });
  });
});

describe("planTransfers", () => {
  const rows = [
    { table: "giftPayments" as const, rowId: "g1", payeeUserId: "a", workCents: 500 },
    { table: "giftPayments" as const, rowId: "g2", payeeUserId: "a", workCents: 4500 },
    { table: "backingPayments" as const, rowId: "b1", payeeUserId: "b", workCents: 2000 },
    { table: "giftPayments" as const, rowId: "g3", payeeUserId: "c", workCents: 0 },
  ];

  it("groups by payee and keeps only those at the $50 minimum", () => {
    const plans = planTransfers(rows);
    expect(MIN_TRANSFER_CENTS).toBe(5000);
    expect(plans.map((p) => p.payeeUserId)).toEqual(["a"]);
    expect(plans[0].totalCents).toBe(5000);
    expect(plans[0].rows.map((r) => r.rowId)).toEqual(["g1", "g2"]);
  });

  it("waives the minimum on request and drops rows with nothing owed", () => {
    const plans = planTransfers(rows, { ignoreMinimum: true });
    expect(plans.map((p) => p.payeeUserId)).toEqual(["a", "b"]);
  });
});

describe("computeGivingReport", () => {
  const t0 = Date.UTC(2026, 9, 3); // 2026-10-03
  const gifts: GiftLike[] = [
    { id: "g1", userId: "u1", period: "2026-10", status: "creative", decidedBy: "member", openedAt: t0, decidedAt: t0 + DAY, recipientUserId: "r1", amountCents: 500 },
    { id: "g2", userId: "u2", period: "2026-10", status: "project", decidedBy: "member", openedAt: t0, decidedAt: t0 + 10 * DAY, projectId: "p1", amountCents: 500 },
    { id: "g3", userId: "u3", period: "2026-10", status: "fund", decidedBy: "member", openedAt: t0, decidedAt: t0 + DAY, amountCents: 500 },
    { id: "g4", userId: "u4", period: "2026-10", status: "fund", decidedBy: "default", openedAt: t0, decidedAt: t0 + 7 * DAY, amountCents: 500 },
    { id: "g5", userId: "u5", period: "2026-10", status: "open", openedAt: t0, amountCents: 500 },
    // September: u1 and u2 directed; u1 plussed up
    { id: "g6", userId: "u1", period: "2026-09", status: "creative", decidedBy: "member", openedAt: t0 - 30 * DAY, decidedAt: t0 - 29 * DAY, recipientUserId: "r1", amountCents: 500 },
    { id: "g7", userId: "u2", period: "2026-09", status: "creative", decidedBy: "member", openedAt: t0 - 30 * DAY, decidedAt: t0 - 29 * DAY, recipientUserId: "r2", amountCents: 500 },
  ];
  const plusUps: PlusUpLike[] = [
    { memberGiftId: "g1", giverUserId: "u1", grossCents: 2500, billing: "first" },
    { memberGiftId: "g1", giverUserId: "u1", grossCents: 2500, billing: "renewal" },
    { memberGiftId: "g2", giverUserId: "u2", grossCents: 1000, billing: "one_time" },
    { memberGiftId: "g6", giverUserId: "u1", grossCents: 1000, billing: "one_time" },
  ];

  it("counts where each month's amounts went", () => {
    const oct = computeGivingReport(gifts, plusUps).byPeriod[0];
    expect(oct.period).toBe("2026-10");
    expect(oct).toMatchObject({ membersBilled: 5, gaveToCreative: 1, gaveToProject: 1, choseFund: 1, didntPick: 1, notPickedYet: 1, givenCents: 1000 });
    expect(oct.decidedWithin7Days).toBe(2); // g1 and g3; g2 took 10 days, g4 defaulted
    expect(oct.distinctRecipients).toBe(2);
  });

  it("the plus-up is the metric: count, dollars, monthly starts, rate", () => {
    const oct = computeGivingReport(gifts, plusUps).byPeriod[0];
    expect(oct.plussedUpCents).toBe(6000); // renewals included in dollars
    expect(oct.plussedUpMonthly).toBe(1);
    expect(oct.plussedUpMembers).toBe(2);
    expect(oct.plussedUpRate).toBe(1); // 2 of 2 directed
  });

  it("repeat givers and repeat plus-ups look at the month before", () => {
    const oct = computeGivingReport(gifts, plusUps).byPeriod[0];
    expect(oct.gaveAgain).toBe(2); // u1, u2 directed in Sept and Oct
    expect(oct.plussedUpAgain).toBe(1); // only u1 plussed up both months
  });

  it("per member: totals, most plussed-up first, no streaks", () => {
    const { members, totals } = computeGivingReport(gifts, plusUps);
    expect(members[0]).toMatchObject({ userId: "u1", timesPlussedUp: 2, plussedUpCents: 6000, gaveCount: 2 });
    expect(members.find((m) => m.userId === "u3")).toMatchObject({ timesPlussedUp: 0, gaveCount: 0 });
    expect(members[0]).not.toHaveProperty("monthsDirectedInARow");
    expect(totals).toEqual({ membersBilled: 7, gave: 4, givenCents: 2000, plussedUpCents: 7000, plussedUpMembers: 3 });
  });

  it("empty input yields the zeroed shape", () => {
    expect(computeGivingReport([], [])).toEqual({
      byPeriod: [],
      members: [],
      totals: { membersBilled: 0, gave: 0, givenCents: 0, plussedUpCents: 0, plussedUpMembers: 0 },
    });
  });
});

describe("emails", () => {
  it("the opened notice is two sentences: what to do and the default", () => {
    const email = buildGiftOpenedEmail({ amountCents: 471, linkUrl: "/give" });
    expect(email.subject).toBe("You have $4.71 to give");
    expect(email.heading).toBe("You have $4.71 to give.");
    expect(email.body).toBe(`Support a creative, a project, or the grant fund. ${GIVING_SENTENCES.memberDirectedDefault}`);
    expect(email.previewText).toBe(email.body);
    expect(email.ctaText).toBe("Pick");
    expect(email.ctaUrl).toBe("/give");
  });

  it("the received notice names the giver only when visible, and nudges to connect", () => {
    const shown = buildGiftReceivedEmail({ giverName: `Sam <Reed>`, visible: true, amountCents: 471, source: "allowance", recurring: false, connected: false });
    expect(shown.subject).toBe("Sam <Reed> gave you $4.71");
    expect(shown.body).toContain("<strong>Sam &lt;Reed&gt;</strong> gave you $4.71.");
    expect(shown.body).toContain("Connect your bank in Settings to get it.");
    expect(shown.ctaText).toBe("Get paid");
    expect(shown.ctaUrl).toBe("/settings?tab=money");

    const hidden = buildGiftReceivedEmail({ giverName: "Sam", visible: false, amountCents: 471, source: "allowance", recurring: false, connected: true });
    expect(hidden.subject).toBe("Someone gave you $4.71");
    expect(hidden.body).not.toContain("Sam");
    expect(hidden.body).not.toContain("Connect your bank");
    expect(hidden.ctaUrl).toBe("/give");
  });

  it("a plus-up reads as gave you, monthly when recurring, with the note escaped", () => {
    const email = buildGiftReceivedEmail({ giverName: "Sam", visible: true, amountCents: 2500, source: "plus_up", recurring: true, note: `keep <going>`, connected: true });
    expect(email.subject).toBe("Sam gave you $25 a month");
    expect(email.body).toContain("keep &lt;going&gt;");
    const once = buildGiftReceivedEmail({ giverName: "Sam", visible: true, amountCents: 2500, source: "plus_up", recurring: false, connected: true });
    expect(once.heading).toBe("Sam gave you $25");
  });

  it("never says donate or tax-deductible (money-words rule)", () => {
    const texts = [
      buildGiftOpenedEmail({ amountCents: 471, linkUrl: "/give" }),
      buildGiftReceivedEmail({ giverName: "Sam", visible: true, amountCents: 500, source: "allowance", recurring: false, connected: false }),
    ].flatMap((e) => [e.subject, e.previewText, e.heading, e.body, e.ctaText]);
    for (const t of texts) {
      for (const banned of ["donat", "tax-deduct"]) {
        expect(t.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it("formats whole dollars without cents and fractional ones with", () => {
    expect(formatCents(500)).toBe("$5");
    expect(formatCents(1250)).toBe("$12.50");
    expect(formatCents(100000)).toBe("$1,000");
  });
});
