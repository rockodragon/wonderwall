// The executable form of the-garden-product-plan.md §2.3.
// Phase 1B's backend implementation must pass this exact table —
// that is the "UI callers don't change" guarantee.

import { describe, expect, it } from "vitest";
import { can } from "./capabilities";
import type { Capability, GardenUser } from "./capabilities";

const user = (over: Partial<GardenUser>): GardenUser => ({
  id: "t",
  name: "Test",
  level: "free",
  patronRole: false,
  partnerRole: false,
  activePassionProjects: 0,
  ...over,
});

const visitor = user({ level: "visitor" });
const free = user({});
const seat = user({ level: "seat" });
const seatAtCap = user({ level: "seat", activePassionProjects: 1 });
const five = user({ level: "five", activePassionProjects: 3 });
const fiveAtCap = user({ level: "five", activePassionProjects: 5 });
const host = user({ level: "host", activePassionProjects: 2 });
const hostAtCap = user({ level: "host", activePassionProjects: 10 });
const covered = user({ level: "seat", coveredBy: "Grace Fellowship" });
const patron = user({ patronRole: true });
const partner = user({ partnerRole: true });

// The §2.3 matrix, row for row. true = allowed, false = denied.
const MATRIX: [Capability, [boolean, boolean, boolean, boolean, boolean, boolean, boolean]][] = [
  //                        visitor free   seat   five   host   patron partner
  ["project.create.passion", [false, false, true,  true,  true,  false, false]],
  ["project.create.paid",    [false, false, true,  true,  true,  true,  true]],
  ["project.applyPaid",      [false, false, true,  true,  true,  false, false]],
  ["pool.propose",           [false, false, true,  true,  true,  false, false]],
  ["event.create",           [false, false, true,  true,  true,  false, true]],
  ["table.join.open",        [true,  true,  true,  true,  true,  true,  true]],
  ["table.join.member",      [false, false, true,  true,  true,  false, false]],
  ["table.create",           [false, false, false, false, true,  false, false]],
  ["seat.cover",             [false, false, false, false, false, true,  true]],
  ["fellowship.fund",        [false, false, false, false, false, true,  true]],
  ["project.pledge",         [false, false, false, false, false, true,  true]],
];

const COLUMNS: [string, GardenUser][] = [
  ["visitor", visitor],
  ["free", free],
  ["seat", seat],
  ["five", five],
  ["host", host],
  ["patron role", patron],
  ["partner role", partner],
];

describe("the §2.3 entitlement matrix", () => {
  for (const [capability, row] of MATRIX) {
    for (let i = 0; i < COLUMNS.length; i++) {
      const [name, u] = COLUMNS[i];
      it(`${capability} — ${name} → ${row[i] ? "allowed" : "denied"}`, () => {
        expect(can(u, capability).allowed).toBe(row[i]);
      });
    }
  }
});

describe("passion-project caps (1 / 5 / 10)", () => {
  it("seat: 1 active allowed, cap enforced", () => {
    expect(can(seat, "project.create.passion")).toMatchObject({ allowed: true, limit: 1, used: 0 });
    expect(can(seatAtCap, "project.create.passion")).toMatchObject({ allowed: false, limit: 1, used: 1 });
  });
  it("five: cap 5; at-cap denial upgrades toward host", () => {
    expect(can(five, "project.create.passion")).toMatchObject({ allowed: true, limit: 5, used: 3 });
    const denied = can(fiveAtCap, "project.create.passion");
    expect(denied.allowed).toBe(false);
    expect(denied.upgradePath).toMatch(/Lead/);
  });
  it("host: cap 10; at-cap denial has no upgrade path — the ladder ends", () => {
    expect(can(host, "project.create.passion")).toMatchObject({ allowed: true, limit: 10 });
    const denied = can(hostAtCap, "project.create.passion");
    expect(denied.allowed).toBe(false);
    expect(denied.upgradePath).toBeUndefined();
  });
  it("seat→five cap denial upgrades toward five seats", () => {
    expect(can(seatAtCap, "project.create.passion").upgradePath).toMatch(/Five seats/);
  });
});

describe("denial anatomy — every denial explains itself", () => {
  it("every denied cell carries a reason", () => {
    for (const [capability, row] of MATRIX) {
      for (let i = 0; i < COLUMNS.length; i++) {
        if (row[i]) continue;
        const result = can(COLUMNS[i][1], capability);
        expect(result.reason, `${capability} for ${COLUMNS[i][0]}`).toBeTruthy();
      }
    }
  });
  it("free-tier denials on the seat ladder point at the seat", () => {
    for (const cap of [
      "project.create.passion",
      "project.applyPaid",
      "pool.propose",
      "event.create",
      "table.join.member",
    ] as Capability[]) {
      expect(can(free, cap).upgradePath).toMatch(/seat.*\$10\/mo/i);
    }
  });
  it("table.create denial points at the Leader tier", () => {
    expect(can(free, "table.create").upgradePath).toMatch(/Lead.*\$50\/mo/);
  });
  it("patron-act denials point at the free patron role, not a paid tier", () => {
    expect(can(free, "seat.cover").upgradePath).toMatch(/patron.*free/i);
  });
});

describe("a covered seat is a full seat (plan §2.1 hard rule)", () => {
  it("covered and self-paid seats answer identically on every capability", () => {
    for (const [capability] of MATRIX) {
      expect(can(covered, capability)).toEqual(can(seat, capability));
    }
  });
});
