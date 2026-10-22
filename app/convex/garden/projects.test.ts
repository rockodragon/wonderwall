// Pure-logic tests for the paid-posting money guardrail. No Convex — plain
// fixtures, same style as projectsPublic.test.ts and stories.test.ts.
//
// The rule these pin down: a paid posting must declare one of four money
// states. That's what replaced the old required-number guardrail — an unpaid
// ask can't masquerade as paid work, and a small or unknown budget no longer
// blocks the post.
//
// At the end, the public project page's reads on the in-memory ctx in
// test-support: what getProject sends whom (no street address to the
// world), and that every other query the page makes agrees with it on a
// project it hides.

import { describe, expect, it } from "vitest";
import { makeCtx, run, type Row } from "../../test-support/convexContext";
import { getProject, validateBudgetDeclaration } from "./projects";
import { getSchedule } from "./gigs";
import { listTiers } from "./patronTiers";
import { listProjectUpdates } from "./stories";
import { listSupportForProject } from "./support";

describe("validateBudgetDeclaration — the four states, declared correctly", () => {
  it("accepts a set amount", () => {
    expect(validateBudgetDeclaration({ budgetType: "amount", budget: 400 })).toBeNull();
  });

  it("accepts a range with a high number above the low one", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 300, budgetMax: 600 }),
    ).toBeNull();
  });

  it("accepts open to proposals with no numbers", () => {
    expect(validateBudgetDeclaration({ budgetType: "proposals" })).toBeNull();
  });

  it("accepts volunteer with no numbers", () => {
    expect(validateBudgetDeclaration({ budgetType: "volunteer" })).toBeNull();
  });
});

describe("validateBudgetDeclaration — an unknown or missing state", () => {
  it("rejects a budgetType that isn't one of the four", () => {
    expect(validateBudgetDeclaration({ budgetType: "negotiable" })).toEqual({
      code: "invalid_budget_type",
      reason:
        "Say how this one pays: a set amount, a range, open to proposals, or volunteer.",
    });
  });

  it("rejects an empty budgetType", () => {
    expect(validateBudgetDeclaration({ budgetType: "" })?.code).toBe("invalid_budget_type");
  });
});

describe("validateBudgetDeclaration — 'amount' needs one real number", () => {
  it("rejects a missing amount", () => {
    expect(validateBudgetDeclaration({ budgetType: "amount" })).toEqual({
      code: "invalid_budget",
      reason: "A set amount needs a real number bigger than zero.",
    });
  });

  it("rejects zero, a negative, and a non-finite amount", () => {
    for (const budget of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateBudgetDeclaration({ budgetType: "amount", budget })?.code).toBe(
        "invalid_budget",
      );
    }
  });

  it("rejects a stray high end rather than silently dropping it", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "amount", budget: 400, budgetMax: 600 }),
    ).toEqual({
      code: "invalid_budget",
      reason: "A set amount is one number. Pick a range if you want a low and a high.",
    });
  });
});

describe("validateBudgetDeclaration — 'range' needs both ends, in order", () => {
  it("rejects a range missing its high end", () => {
    expect(validateBudgetDeclaration({ budgetType: "range", budget: 300 })).toEqual({
      code: "invalid_budget",
      reason: "A range needs both a low and a high number.",
    });
  });

  it("rejects a range missing its low end", () => {
    expect(validateBudgetDeclaration({ budgetType: "range", budgetMax: 600 })?.reason).toBe(
      "A range needs both a low and a high number.",
    );
  });

  it("rejects a range whose ends aren't real positive numbers", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 0, budgetMax: 600 }),
    ).toEqual({
      code: "invalid_budget",
      reason: "A range needs real numbers bigger than zero.",
    });
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 300, budgetMax: Number.NaN })
        ?.reason,
    ).toBe("A range needs real numbers bigger than zero.");
  });

  it("rejects a high end that isn't above the low one", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 600, budgetMax: 300 }),
    ).toEqual({
      code: "invalid_budget",
      reason: "A range needs a high number bigger than the low one.",
    });
  });

  it("rejects a range whose ends are the same number — that's an amount", () => {
    expect(
      validateBudgetDeclaration({ budgetType: "range", budget: 400, budgetMax: 400 })?.reason,
    ).toBe("A range needs a high number bigger than the low one.");
  });
});

describe("validateBudgetDeclaration — the numberless states reject stray numbers", () => {
  it("rejects a number attached to open to proposals", () => {
    expect(validateBudgetDeclaration({ budgetType: "proposals", budget: 400 })).toEqual({
      code: "invalid_budget",
      reason: "Open to proposals means no number attached. Clear it, or post the amount instead.",
    });
  });

  it("rejects a high end attached to open to proposals", () => {
    expect(validateBudgetDeclaration({ budgetType: "proposals", budgetMax: 600 })?.code).toBe(
      "invalid_budget",
    );
  });

  it("rejects a number attached to volunteer — that's the ambiguity the states exist to stop", () => {
    expect(validateBudgetDeclaration({ budgetType: "volunteer", budget: 400 })).toEqual({
      code: "invalid_budget",
      reason: "Volunteer work has no budget attached. Clear the number, or say what it pays.",
    });
  });
});

// ——————————————————————————————————————————————————————————————
// The public project page
// ——————————————————————————————————————————————————————————————

describe("getProject on the public project page", () => {
  const LEAD = "users:lead";
  const ADMIN = "users:admin";
  const MEMBER = "users:member";
  const place = {
    location: "Harbor Studio, Oakland",
    locationType: "venue",
    address: { street: "12 Dock St", city: "Oakland", state: "California", zip: "94607" },
    coordinates: { lat: 37.8, lng: -122.27 },
    placeId: "ChIJ-harbor",
  };
  function world(extra: Record<string, unknown> = {}): Record<string, Row[]> {
    return {
      profiles: [
        { _id: "profiles:lead", userId: LEAD, name: "Lena", interests: [] },
        { _id: "profiles:admin", userId: ADMIN, name: "Ada", interests: [], isAdmin: true },
        { _id: "profiles:member", userId: MEMBER, name: "Mo", interests: [] },
      ],
      projects: [
        {
          _id: "projects:p1", userId: LEAD, kind: "passion", origin: "posted", title: "Harbor Mural",
          status: "active", createdAt: 1, updatedAt: 1, ...place, ...extra,
        },
      ],
      storyUpdates: [{ _id: "storyUpdates:u1", projectId: "projects:p1", authorUserId: LEAD, body: "Day one.", createdAt: 2 }],
      projectSupport: [
        {
          _id: "projectSupport:s1", projectId: "projects:p1", type: "encouragement", status: "confirmed",
          visible: true, supporterName: "Mo", supporterUserId: MEMBER, createdAt: 3,
        },
      ],
      patronTiers: [{ _id: "patronTiers:t1", projectId: "projects:p1", name: "Friend", priceCents: 500, isActive: true, sortOrder: 0 }],
    };
  }

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", MEMBER],
  ])("opens for %s, with the place's name but not its street address, map position or Places id", async (_label, viewer) => {
    const project = await run(getProject, makeCtx(world(), viewer), { projectId: "projects:p1" });
    expect(project).toMatchObject({ title: "Harbor Mural", location: "Harbor Studio, Oakland" });
    expect(project.address).toBeUndefined();
    expect(project.coordinates).toBeUndefined();
    expect(project.placeId).toBeUndefined();
    expect(JSON.stringify(project)).not.toContain("12 Dock St");
  });

  it.each([
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("gives %s the exact place, to edit it", async (_label, viewer) => {
    const project = await run(getProject, makeCtx(world(), viewer), { projectId: "projects:p1" });
    expect(project).toMatchObject({ address: place.address, coordinates: place.coordinates, placeId: place.placeId });
  });

  it("is not found to a visitor when an admin hid it, and nor is anything the page reads about it", async () => {
    for (const viewer of [null, MEMBER]) {
      // A gig's dates too (getSchedule), so this one has a series.
      const tables = {
        ...world({ status: "hidden" }),
        gigSeries: [{ _id: "gigSeries:g1", projectId: "projects:p1", hostUserId: LEAD, status: "open" }],
      };
      const ctx = () => makeCtx(tables, viewer);
      const args = { projectId: "projects:p1" };
      expect(await run(getProject, ctx(), args)).toBeNull();
      expect(await run(listProjectUpdates, ctx(), args)).toEqual([]);
      expect(await run(listSupportForProject, ctx(), args)).toEqual([]);
      expect(await run(listTiers, ctx(), args)).toEqual([]);
      expect(await run(getSchedule, ctx(), args)).toBeNull();
    }
  });

  it("still lets a visitor read an ordinary project's updates, supporters and tiers", async () => {
    const ctx = () => makeCtx(world(), null);
    const args = { projectId: "projects:p1" };
    expect((await run(listProjectUpdates, ctx(), args)).map((u: any) => u.body)).toEqual(["Day one."]);
    expect((await run(listSupportForProject, ctx(), args)).map((s: any) => s.supporterName)).toEqual(["Mo"]);
    expect((await run(listTiers, ctx(), args)).map((t: any) => t.name)).toEqual(["Friend"]);
  });
});
