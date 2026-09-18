import { describe, expect, it } from "vitest";
import { buildCreativeEarningsRows, computeCreativeEarnings, UNASSIGNED } from "./payouts";

describe("computeCreativeEarnings", () => {
  it("totals the split and subtracts what's been paid out", () => {
    expect(
      computeCreativeEarnings(
        [
          { grossCents: 2500, platformCents: 250, workCents: 2250 },
          { grossCents: 1000, platformCents: 100, workCents: 900 },
        ],
        [{ amountCents: 2000 }],
      ),
    ).toEqual({
      paymentsCount: 2,
      grossCents: 3500,
      platformCents: 350,
      workCents: 3150,
      paidOutCents: 2000,
      owedCents: 1150,
    });
  });

  it("owes nothing with nothing in", () => {
    expect(computeCreativeEarnings([], [])).toMatchObject({ owedCents: 0, paymentsCount: 0 });
  });

  it("goes negative when more was paid out than earned — an operator needs to see that", () => {
    expect(
      computeCreativeEarnings([{ grossCents: 1000, platformCents: 100, workCents: 900 }], [{ amountCents: 1000 }])
        .owedCents,
    ).toBe(-100);
  });
});

describe("buildCreativeEarningsRows", () => {
  const lookup = {
    name: (id: string) => ({ u_ada: "Ada", u_bo: "Bo" })[id],
    profileId: (id: string) => ({ u_ada: "p_ada", u_bo: "p_bo" })[id],
    projectTitle: (id: string) => ({ proj_1: "Psalms for the 2AM", proj_2: "Mural" })[id],
  };

  it("groups by payee, names the projects, and puts the largest balance first", () => {
    const rows = buildCreativeEarningsRows(
      [
        { payeeUserId: "u_bo", projectId: "proj_2", grossCents: 1000, platformCents: 100, workCents: 900 },
        { payeeUserId: "u_ada", projectId: "proj_1", grossCents: 2500, platformCents: 250, workCents: 2250 },
        { payeeUserId: "u_ada", projectId: "proj_1", grossCents: 1000, platformCents: 100, workCents: 900 },
      ],
      [{ payeeUserId: "u_ada", amountCents: 500 }],
      lookup,
    );
    expect(rows.map((r) => [r.name, r.owedCents])).toEqual([
      ["Ada", 2650],
      ["Bo", 900],
    ]);
    expect(rows[0]).toMatchObject({ profileId: "p_ada", projects: ["Psalms for the 2AM"], paymentsCount: 2 });
  });

  it("keeps money with no payee on its own row rather than dropping it", () => {
    const rows = buildCreativeEarningsRows(
      [{ projectId: "proj_gone", grossCents: 1000, platformCents: 100, workCents: 900 }],
      [],
      lookup,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        payeeUserId: UNASSIGNED,
        name: "No payee — project deleted",
        profileId: null,
        projects: ["A deleted project"],
        owedCents: 900,
      }),
    ]);
  });

  it("shows a payee who was paid but has no payments yet", () => {
    const rows = buildCreativeEarningsRows([], [{ payeeUserId: "u_bo", amountCents: 300 }], lookup);
    expect(rows).toEqual([expect.objectContaining({ name: "Bo", owedCents: -300, paymentsCount: 0 })]);
  });
});
