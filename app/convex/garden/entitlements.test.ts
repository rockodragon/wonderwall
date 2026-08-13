// The pure core of server-side enforcement, tested without Convex.
// Complements capabilities.test.ts (the 86-assertion matrix): that suite
// proves can() is right; this one proves the SERVER derives the right
// GardenUser from raw rows and throws the right denial anatomy.

import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { assertCanPure, deriveGardenUser } from "./entitlements";

const base = { userId: "u1", profile: { name: "Test" }, memberships: [], activePassionProjects: 0 };

describe("deriveGardenUser", () => {
  it("no profile → visitor; profile without membership → free", () => {
    expect(deriveGardenUser({ ...base, profile: null }).level).toBe("visitor");
    expect(deriveGardenUser(base).level).toBe("free");
  });

  it("active membership confers its level", () => {
    const u = deriveGardenUser({
      ...base,
      memberships: [{ level: "seat", status: "active" }],
    });
    expect(u.level).toBe("seat");
    expect(u.coveredBy).toBeUndefined();
  });

  it("past_due keeps entitlements (grace — never silently strip a seat)", () => {
    expect(
      deriveGardenUser({ ...base, memberships: [{ level: "seat", status: "past_due" }] }).level,
    ).toBe("seat");
  });

  it("canceled and incomplete confer nothing", () => {
    expect(
      deriveGardenUser({
        ...base,
        memberships: [
          { level: "host", status: "canceled" },
          { level: "seat", status: "incomplete" },
        ],
      }).level,
    ).toBe("free");
  });

  it("highest entitled level wins across multiple memberships", () => {
    const u = deriveGardenUser({
      ...base,
      memberships: [
        { level: "seat", status: "active", coveredByCodeId: "code1" },
        { level: "host", status: "active" },
      ],
    });
    expect(u.level).toBe("host");
    expect(u.coveredBy).toBeUndefined(); // the winning membership is self-paid
  });

  it("covered seat marks coveredBy", () => {
    const u = deriveGardenUser({
      ...base,
      memberships: [{ level: "seat", status: "active", coveredByCodeId: "code1" }],
    });
    expect(u.coveredBy).toBe("covered");
  });

  it("roles come from the profile, independent of membership", () => {
    const u = deriveGardenUser({
      ...base,
      profile: { name: "D", patronRole: true, partnerRole: true },
    });
    expect(u.patronRole).toBe(true);
    expect(u.partnerRole).toBe(true);
  });

  it("passion count passes through (the cap input)", () => {
    expect(
      deriveGardenUser({
        ...base,
        memberships: [{ level: "five", status: "active" }],
        activePassionProjects: 5,
      }).activePassionProjects,
    ).toBe(5);
  });
});

describe("assertCanPure", () => {
  const free = deriveGardenUser(base);
  const seat = deriveGardenUser({ ...base, memberships: [{ level: "seat", status: "active" }] });

  it("allows and returns the CanResult", () => {
    expect(assertCanPure(seat, "project.create.passion").allowed).toBe(true);
  });

  it("throws ConvexError carrying the full denial anatomy", () => {
    try {
      assertCanPure(free, "project.create.passion");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      const data = (e as ConvexError<{ code: string; capability: string; reason?: string; upgradePath?: string }>).data;
      expect(data.code).toBe("entitlement_denied");
      expect(data.capability).toBe("project.create.passion");
      expect(data.reason).toBeTruthy();
      expect(data.upgradePath).toMatch(/seat.*\$10\/mo/i);
    }
  });
});
