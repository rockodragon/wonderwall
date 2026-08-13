// Redemption rules, pure. The seat-count boundary and every rejection path —
// each rejection's copy is warm and names the way forward (voice rule).

import { describe, expect, it } from "vitest";
import { checkRedemption } from "./coverage";
import type { CodeRow } from "./coverage";

const code = (over: Partial<CodeRow> = {}): CodeRow => ({
  _id: "c1",
  code: "GRACE-FALL",
  seats: 10,
  status: "active",
  stripeSubscriptionId: "sub_1",
  hostOrgId: "org1",
  ...over,
});

const base = {
  code: code(),
  redemptionCount: 0,
  alreadyRedeemedByUser: false,
  userHasEntitledMembership: false,
};

describe("checkRedemption", () => {
  it("happy path reports seats left", () => {
    expect(checkRedemption({ ...base, redemptionCount: 6 })).toEqual({ ok: true, seatsLeft: 4 });
  });

  it("unknown code", () => {
    expect(checkRedemption({ ...base, code: null }).ok).toBe(false);
  });

  it("the last seat redeems; one past the last does not", () => {
    expect(checkRedemption({ ...base, redemptionCount: 9 }).ok).toBe(true);
    const over = checkRedemption({ ...base, redemptionCount: 10 });
    expect(over.ok).toBe(false);
    expect(over.reason).toMatch(/sponsor/i);
  });

  it("suspended (sponsor billing hiccup) blocks NEW redemptions with grace copy", () => {
    const r = checkRedemption({ ...base, code: code({ status: "suspended" }) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/paused|billing/i);
  });

  it("canceled sponsorship blocks with a path forward", () => {
    const r = checkRedemption({ ...base, code: code({ status: "canceled" }) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ended/i);
  });

  it("double redemption by the same user is blocked, not double-seated", () => {
    expect(checkRedemption({ ...base, alreadyRedeemedByUser: true }).ok).toBe(false);
  });

  it("someone who already holds a seat leaves coverage for those who don't", () => {
    const r = checkRedemption({ ...base, userHasEntitledMembership: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already have a seat/i);
  });
});
