// Pure-logic tests for eventRsvps.ts: the dedupe/normalize logic
// (planRsvp) and the organizer-vs-public visibility rule
// (buildRsvpVisibility). No Convex, no network.

import { describe, expect, it } from "vitest";
import {
  buildRsvpVisibility,
  isValidEmail,
  normalizeEmail,
  planRsvp,
  type ExistingRsvp,
} from "./eventRsvps";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Diane@Example.COM ")).toBe("diane@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a normal-looking address", () => {
    expect(isValidEmail("diane@example.com")).toBe(true);
  });

  it.each(["not-an-email", "missing@domain", "@nolocal.com", "", "  "])(
    "rejects %j",
    (bad) => {
      expect(isValidEmail(bad)).toBe(false);
    },
  );
});

describe("planRsvp", () => {
  it("first RSVP: no existing row, alreadyRsvpd is false", () => {
    const plan = planRsvp({ name: "Diane", email: "diane@example.com" }, null);
    expect(plan.alreadyRsvpd).toBe(false);
    expect(plan.normalizedEmail).toBe("diane@example.com");
    expect(plan.patch).toEqual({ name: "Diane", invitedBy: undefined, userId: undefined });
  });

  it("dedupes by email regardless of case/whitespace", () => {
    const existing: ExistingRsvp = { name: "Diane", email: "diane@example.com" };
    const plan = planRsvp({ name: "Diane R.", email: "  DIANE@Example.com  " }, existing);
    expect(plan.alreadyRsvpd).toBe(true);
    expect(plan.normalizedEmail).toBe("diane@example.com");
  });

  it("repeat RSVP updates name rather than duplicating", () => {
    const existing: ExistingRsvp = { name: "Diane", email: "diane@example.com" };
    const plan = planRsvp({ name: "Diane Ross", email: "diane@example.com" }, existing);
    expect(plan.patch.name).toBe("Diane Ross");
  });

  it("repeat RSVP updates invitedBy when a new one is supplied", () => {
    const existing: ExistingRsvp = {
      name: "Diane",
      email: "diane@example.com",
      invitedBy: "shua-invite-1",
    };
    const plan = planRsvp(
      { name: "Diane", email: "diane@example.com", invitedBy: "new-invite-2" },
      existing,
    );
    expect(plan.patch.invitedBy).toBe("new-invite-2");
  });

  it("repeat RSVP keeps existing invitedBy when the repeat omits it", () => {
    const existing: ExistingRsvp = {
      name: "Diane",
      email: "diane@example.com",
      invitedBy: "shua-invite-1",
    };
    const plan = planRsvp({ name: "Diane", email: "diane@example.com" }, existing);
    expect(plan.patch.invitedBy).toBe("shua-invite-1");
  });

  it("a guest who signs in on a repeat visit gets userId attached", () => {
    const existing: ExistingRsvp = { name: "Diane", email: "diane@example.com" };
    const plan = planRsvp(
      { name: "Diane", email: "diane@example.com", userId: "user_diane" },
      existing,
    );
    expect(plan.patch.userId).toBe("user_diane");
  });

  it("keeps prior userId when a repeat RSVP is guest-only again", () => {
    const existing: ExistingRsvp = {
      name: "Diane",
      email: "diane@example.com",
      userId: "user_diane",
    };
    const plan = planRsvp({ name: "Diane", email: "diane@example.com" }, existing);
    expect(plan.patch.userId).toBe("user_diane");
  });
});

describe("buildRsvpVisibility", () => {
  const rows = [
    { name: "Diane Ross", email: "diane@example.com", invitedBy: "shua" },
    { name: "Shua", email: "shua@example.com" },
    { name: "  ", email: "blank@example.com" }, // defensive: blank name
  ];

  it("organizer/admin get the full list, including emails", () => {
    const result = buildRsvpVisibility({ rows, canViewFull: true });
    expect(result).toEqual({ count: 3, rsvps: rows });
  });

  it("everyone else gets a count and first names only, no emails", () => {
    const result = buildRsvpVisibility({ rows, canViewFull: false });
    expect(result).toEqual({ count: 3, names: ["Diane", "Shua", "A guest"] });
    expect(JSON.stringify(result)).not.toMatch(/@example\.com/);
  });

  it("empty state: count 0, names []", () => {
    const result = buildRsvpVisibility({ rows: [], canViewFull: false });
    expect(result).toEqual({ count: 0, names: [] });
  });

  it("empty state for organizer view mirrors the same shape with rsvps []", () => {
    const result = buildRsvpVisibility({ rows: [], canViewFull: true });
    expect(result).toEqual({ count: 0, rsvps: [] });
  });
});
