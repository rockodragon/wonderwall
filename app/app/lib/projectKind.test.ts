import { describe, expect, it } from "vitest";
import { gigPhrase, isJob, isPaidRole, leadRoles, paidRoles, projectKindLabel, rolePay } from "./projectKind";

const drummer = { title: "Drummer", budgetType: "amount", budget: 200 };
const singer = { title: "Singer", budgetType: "range", budget: 300, budgetMax: 600 };
const stagehand = { title: "Stagehand", budgetType: "volunteer" };
const bare = { title: "Writer", budgetType: null };

describe("rolePay", () => {
  it("prints the pay a role declared, in the words the cards use", () => {
    expect(rolePay(drummer)).toBe("$200");
    expect(rolePay(singer)).toBe("$300–600");
    expect(rolePay({ title: "Mixer", budgetType: "proposals" })).toBe("Open to proposals");
    expect(rolePay({ title: "Cellist", budgetType: "confidential" })).toBe("Confidential");
  });
  it("is nothing for a volunteer role, or one that never said", () => {
    expect(rolePay(stagehand)).toBeNull();
    expect(rolePay(bare)).toBeNull();
    expect(rolePay({ title: "Writer" })).toBeNull();
    // A stray amount on a role that declared nothing is not a declaration.
    expect(rolePay({ title: "Writer", budget: 500 })).toBeNull();
  });
});

describe("paidRoles", () => {
  it("keeps the roles that pay, in order", () => {
    expect(paidRoles([stagehand, drummer, bare, singer]).map((r) => r.title)).toEqual(["Drummer", "Singer"]);
    expect(isPaidRole(drummer)).toBe(true);
    expect(isPaidRole(stagehand)).toBe(false);
  });
  it("is empty without roles", () => {
    expect(paidRoles([])).toEqual([]);
    expect(paidRoles(null)).toEqual([]);
    expect(paidRoles(undefined)).toEqual([]);
  });
});

describe("gigPhrase", () => {
  it("says a weekly night as a plural day and a time", () => {
    expect(gigPhrase({ status: "open", cadence: "Every Friday", timeRange: "8–10pm" })).toBe("Fridays 8–10pm");
    expect(gigPhrase({ status: "open", cadence: "Every Sunday", timeRange: "7:30pm–midnight" })).toBe("Sundays 7:30pm–midnight");
  });
  it("leaves other cadences as the server wrote them", () => {
    expect(gigPhrase({ status: "open", cadence: "Fridays and Saturdays", timeRange: "9pm–1am" })).toBe("Fridays and Saturdays 9pm–1am");
    expect(gigPhrase({ status: "open", cadence: "Every other Friday", timeRange: "8–10pm" })).toBe("Every other Friday 8–10pm");
    expect(gigPhrase({ status: "open", cadence: "Every 3 weeks on Monday", timeRange: "6–8pm" })).toBe("Every 3 weeks on Monday 6–8pm");
  });
  it("falls back to the one-line schedule when the pieces are not sent", () => {
    expect(gigPhrase({ status: "open", schedule: "Every Friday · 8–10pm" })).toBe("Fridays 8–10pm");
    expect(gigPhrase({ status: "open", schedule: "Fridays and Saturdays · 9pm–1am" })).toBe("Fridays and Saturdays 9pm–1am");
  });
  it("is nothing when the row carries no schedule", () => {
    expect(gigPhrase({ status: "open" })).toBeNull();
    expect(gigPhrase(null)).toBeNull();
    expect(gigPhrase(undefined)).toBeNull();
  });
});

describe("isJob", () => {
  it("is one-off paid work", () => {
    expect(isJob({ kind: "paid", budgetType: "amount", budget: 400 })).toBe(true);
    expect(isJob({ kind: "paid", budgetType: "proposals" })).toBe(true);
  });
  it("is not a gig, an unpaid posting, or a project", () => {
    expect(isJob({ kind: "paid", budgetType: "amount", budget: 400, gig: { status: "open" } })).toBe(false);
    expect(isJob({ kind: "paid", budgetType: "volunteer" })).toBe(false);
    expect(isJob({ kind: "passion" })).toBe(false);
  });
});

describe("leadRoles", () => {
  const project = { kind: "passion", title: "Harbor Mural", openRoles: [stagehand, drummer, singer] };
  it("is the paid roles of a project on the Jobs and gigs list", () => {
    expect(leadRoles(project, true).map((r) => r.title)).toEqual(["Drummer", "Singer"]);
  });
  it("is nothing anywhere else", () => {
    expect(leadRoles(project, false)).toEqual([]);
    expect(leadRoles({ kind: "paid", budgetType: "amount", budget: 1, openRoles: [drummer] }, true)).toEqual([]);
    expect(leadRoles({ kind: "passion", openRoles: [stagehand] }, true)).toEqual([]);
  });
});

describe("projectKindLabel", () => {
  it("calls one-off paid work a Job", () => {
    expect(projectKindLabel({ kind: "paid", budgetType: "amount", budget: 400 })).toBe("Job");
    expect(projectKindLabel({ kind: "paid", budgetType: "range", budget: 300, budgetMax: 600 })).toBe("Job");
    expect(projectKindLabel({ kind: "paid", budgetType: "proposals" })).toBe("Job");
  });
  it("calls a live-booking series a Recurring gig, with its schedule", () => {
    const gig = { status: "open", cadence: "Every Friday", timeRange: "8–10pm" };
    expect(projectKindLabel({ kind: "paid", budgetType: "amount", budget: 300, gig })).toBe("Recurring gig · Fridays 8–10pm");
    expect(projectKindLabel({ kind: "paid", budgetType: "amount", budget: 300, gig: { status: "open" } })).toBe("Recurring gig");
  });
  it("calls an unpaid posting Volunteer, never a job", () => {
    expect(projectKindLabel({ kind: "paid", budgetType: "volunteer" })).toBe("Volunteer");
    expect(projectKindLabel({ kind: "paid", budgetType: "volunteer", gig: { status: "open" } })).toBe("Volunteer");
  });
  it("leads a project on the Jobs and gigs list with its paid role", () => {
    const project = { kind: "passion", title: "Harbor Mural", openRoles: [drummer] };
    expect(projectKindLabel(project, { onJobsAndGigs: true })).toBe("Role on Harbor Mural · Paid");
    // The same project elsewhere is just a project.
    expect(projectKindLabel(project)).toBe("Project");
    expect(projectKindLabel(project, { raising: true })).toBe("Seeking funding");
  });
  it("does not lead with a role that does not pay", () => {
    expect(projectKindLabel({ kind: "passion", title: "Zine", openRoles: [stagehand] }, { onJobsAndGigs: true })).toBe("Project");
  });
});
