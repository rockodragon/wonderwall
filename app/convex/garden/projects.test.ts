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
import { getProject, listProjects, validateBudgetDeclaration } from "./projects";
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

describe("getProject and listProjects on the public project pages", () => {
  const LEAD = "users:lead";
  const ADMIN = "users:admin";
  const MEMBER = "users:member";
  const INSIDER = "users:insider"; // active member of the hidden community
  const HID = "hostOrgs:hid";
  const place = {
    location: "Harbor Studio, Oakland",
    locationType: "venue",
    address: { street: "12 Dock St", city: "Oakland", state: "California", zip: "94607" },
    coordinates: { lat: 37.8, lng: -122.27 },
    placeId: "ChIJ-harbor",
  };
  // A place that IS a street address: its name is the address.
  const streetPlace = {
    location: "12 Dock St, Oakland, CA 94607",
    locationType: "address",
    address: { street: "12 Dock St", city: "Oakland", state: "California", stateCode: "CA", zip: "94607" },
    coordinates: { lat: 37.8, lng: -122.27 },
    placeId: "ChIJ-dock",
  };
  function world(extra: Record<string, unknown> = {}): Record<string, Row[]> {
    return {
      profiles: [
        { _id: "profiles:lead", userId: LEAD, name: "Lena", interests: [] },
        { _id: "profiles:admin", userId: ADMIN, name: "Ada", interests: [], isAdmin: true },
        { _id: "profiles:member", userId: MEMBER, name: "Mo", interests: [] },
        { _id: "profiles:insider", userId: INSIDER, name: "Ines", interests: [] },
      ],
      hostOrgs: [
        { _id: HID, name: "_TeamTest", slug: "teamtest", kind: "community", status: "active", visibility: "public", joinPolicy: "open", ownerUserId: LEAD, createdAt: 1 },
      ],
      communityMembers: [{ _id: "communityMembers:1", hostOrgId: HID, userId: INSIDER, role: "member", status: "active", joinedAt: 0 }],
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
  const args = { projectId: "projects:p1" };

  /** Whether each of the page's other reads had anything for this viewer.
   * The project is also a gig series here, so getSchedule has dates. */
  async function pageReads(extra: Record<string, unknown>, viewer: string | null) {
    const tables = {
      ...world(extra),
      gigSeries: [
        {
          _id: "gigSeries:g1", projectId: "projects:p1", hostUserId: LEAD, status: "open", timeZone: "America/Los_Angeles",
          startTime: "20:00", endTime: "22:00", weekdays: [5], intervalWeeks: 1, startDate: "2026-10-02", endMode: "never",
          createdAt: 1, updatedAt: 1,
        },
      ],
    };
    const ctx = () => makeCtx(tables, viewer);
    return {
      updates: (await run(listProjectUpdates, ctx(), args)).length,
      supporters: (await run(listSupportForProject, ctx(), args)).length,
      tiers: (await run(listTiers, ctx(), args)).length,
      schedule: (await run(getSchedule, ctx(), args)) !== null,
    };
  }
  const NOTHING = { updates: 0, supporters: 0, tiers: 0, schedule: false };
  const EVERYTHING = { updates: 1, supporters: 1, tiers: 1, schedule: true };

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", MEMBER],
  ])("opens for %s, with the place's name and city but not its street, map position or Places id", async (_label, viewer) => {
    const project = await run(getProject, makeCtx(world(), viewer), args);
    expect(project).toMatchObject({ title: "Harbor Mural", location: "Harbor Studio, Oakland" });
    expect(project.address).toEqual({ city: "Oakland", state: "California" });
    expect(project.coordinates).toBeUndefined();
    expect(project.placeId).toBeUndefined();
    expect(JSON.stringify(project)).not.toContain("12 Dock St");
    expect(JSON.stringify(project)).not.toContain("94607");
  });

  it.each([
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("gives %s the exact place, to edit it", async (_label, viewer) => {
    const project = await run(getProject, makeCtx(world(), viewer), args);
    expect(project).toMatchObject({ address: place.address, coordinates: place.coordinates, placeId: place.placeId });
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", MEMBER],
  ])("lists every project to %s with no street, map position or Places id", async (_label, viewer) => {
    const [row] = await run(listProjects, makeCtx(world(), viewer));
    expect(row).toMatchObject({ title: "Harbor Mural", location: "Harbor Studio, Oakland" });
    expect(row.address).toEqual({ city: "Oakland", state: "California" });
    expect(row.coordinates).toBeUndefined();
    expect(row.placeId).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain("12 Dock St");
  });

  it("names a street-address place by its city to a visitor, on the page and in the list", async () => {
    const project = await run(getProject, makeCtx(world(streetPlace), null), args);
    expect(project.location).toBe("Oakland, CA");
    const [row] = await run(listProjects, makeCtx(world(streetPlace), MEMBER));
    expect(row.location).toBe("Oakland, CA");
    expect(JSON.stringify([project, row])).not.toContain("12 Dock St");
  });

  it("gives the lead a street-address place whole, on the page and in the list", async () => {
    const project = await run(getProject, makeCtx(world(streetPlace), LEAD), args);
    expect(project).toMatchObject(streetPlace);
    const [row] = await run(listProjects, makeCtx(world(streetPlace), LEAD));
    expect(row).toMatchObject(streetPlace);
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't its lead", MEMBER],
  ])("is not found to %s when an admin hid it, and nor is anything else the page reads", async (_label, viewer) => {
    expect(await run(getProject, makeCtx(world({ status: "hidden" }), viewer), args)).toBeNull();
    expect(await pageReads({ status: "hidden" }, viewer)).toEqual(NOTHING);
  });

  it.each([
    ["its lead", LEAD],
    ["an admin", ADMIN],
  ])("still shows %s an admin-hidden project and everything the page reads", async (_label, viewer) => {
    expect(await run(getProject, makeCtx(world({ status: "hidden" }), viewer), args)).not.toBeNull();
    expect(await pageReads({ status: "hidden" }, viewer)).toEqual(EVERYTHING);
  });

  it.each([
    ["someone signed out", null],
    ["a member who isn't in the community", MEMBER],
  ])("shows %s nothing of a project in a hidden community", async (_label, viewer) => {
    expect(await run(getProject, makeCtx(world({ hostOrgId: HID }), viewer), args)).toBeNull();
    expect(await pageReads({ hostOrgId: HID }, viewer)).toEqual(NOTHING);
  });

  it.each([
    ["a member of the community", INSIDER],
    ["its lead", LEAD],
  ])("shows %s a hidden community's project and everything the page reads", async (_label, viewer) => {
    expect(await run(getProject, makeCtx(world({ hostOrgId: HID }), viewer), args)).not.toBeNull();
    expect(await pageReads({ hostOrgId: HID }, viewer)).toEqual(EVERYTHING);
  });

  it("lets a visitor read an ordinary project's updates, supporters, tiers and dates", async () => {
    expect(await pageReads({}, null)).toEqual(EVERYTHING);
  });
});
