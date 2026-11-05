import { describe, expect, it } from "vitest";
import { ownerSections, projectTabs, readProjectTab, sectionsWithContent, withProjectTab } from "./projectTabs";

const ids = (tabs: { id: string }[]) => tabs.map((t) => t.id);
const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label);

const nothing = { team: false, updates: false };
const all = { team: true, updates: true };

describe("projectTabs", () => {
  it("gives a project About, Team and Updates when each has something, and never a Support tab", () => {
    const tabs = projectTabs({ isGig: false, requests: 0, has: all });
    expect(ids(tabs)).toEqual(["about", "team", "updates"]);
    expect(labels(tabs)).toEqual(["About", "Team", "Updates"]);
  });
  it("leaves out every empty section: a bare project is just About", () => {
    expect(ids(projectTabs({ isGig: false, requests: 0, has: nothing }))).toEqual(["about"]);
  });
  it("keeps each section that has something in it", () => {
    expect(ids(projectTabs({ isGig: false, requests: 0, has: { ...nothing, team: true } }))).toEqual([
      "about",
      "team",
    ]);
    expect(ids(projectTabs({ isGig: false, requests: 0, has: { ...nothing, updates: true } }))).toEqual([
      "about",
      "updates",
    ]);
  });
  it("gives a gig Dates in place of Team, always", () => {
    const tabs = projectTabs({ isGig: true, requests: 0, has: nothing });
    expect(ids(tabs)).toEqual(["about", "dates"]);
    expect(labels(projectTabs({ isGig: true, requests: 0, has: all }))).toEqual([
      "About",
      "Dates",
      "Updates",
    ]);
  });
  it("counts the requests waiting on the owner", () => {
    expect(labels(projectTabs({ isGig: false, requests: 1, has: all }))[1]).toBe("Team · 1 request");
    expect(labels(projectTabs({ isGig: false, requests: 2, has: all }))[1]).toBe("Team · 2 requests");
  });
  it("counts updates on their tab for everyone", () => {
    expect(labels(projectTabs({ isGig: false, requests: 0, updates: 4, has: all }))).toEqual(["About", "Team", "Updates · 4"]);
    expect(labels(projectTabs({ isGig: false, requests: 0, updates: 0, has: all }))).toEqual(["About", "Team", "Updates"]);
  });
  it("sends an old ?tab=support link to About, where the supporters are now", () => {
    expect(readProjectTab("support", projectTabs({ isGig: false, requests: 0, has: all }))).toBe("about");
  });
  it("sends ?tab=team back to About when there's no Team tab", () => {
    const tabs = projectTabs({ isGig: false, requests: 0, has: nothing });
    expect(readProjectTab("team", tabs)).toBe("about");
    expect(readProjectTab("updates", tabs)).toBe("about");
    expect(readProjectTab("support", tabs)).toBe("about");
  });
});

describe("sectionsWithContent", () => {
  const leadOnly = { accepted: [], credits: [] };
  const bare = { team: leadOnly, roles: [], updates: [] };

  it("finds nothing in a project with only its lead, no roles and no updates", () => {
    expect(sectionsWithContent(bare)).toEqual(nothing);
  });
  it("finds nothing while the team, roles and updates are still loading", () => {
    expect(sectionsWithContent({ ...bare, team: undefined, roles: undefined, updates: undefined })).toEqual(nothing);
  });
  it("finds a team in a member, a credit, a listed role, or the viewer's own request", () => {
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, accepted: [{}] } }).team).toBe(true);
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, credits: [{}] } }).team).toBe(true);
    expect(sectionsWithContent({ ...bare, roles: [{}] }).team).toBe(true);
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, mine: { status: "invited" } } }).team).toBe(true);
  });
  it("doesn't call a lead alone a team just because the project is open to people", () => {
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, acceptingPeople: true } as never }).team).toBe(false);
  });
  it("finds updates once one is posted", () => {
    expect(sectionsWithContent({ ...bare, updates: [{}] }).updates).toBe(true);
  });
});

describe("ownerSections", () => {
  const none = { requests: 0, opened: new Set<never>() };

  it("always gives the owner Updates, and nothing else on a bare project", () => {
    expect(ownerSections(nothing, none)).toEqual({ team: false, updates: true });
  });
  it("keeps what has content", () => {
    expect(ownerSections(all, none)).toEqual(all);
  });
  it("shows Team while a request waits", () => {
    expect(ownerSections(nothing, { ...none, requests: 1 }).team).toBe(true);
  });
  it("shows a section the owner opened from Next steps", () => {
    expect(ownerSections(nothing, { ...none, opened: new Set(["team" as const]) }).team).toBe(true);
  });
});

describe("readProjectTab", () => {
  const tabs = projectTabs({ isGig: false, requests: 0, has: all });
  it("reads the tab the URL names", () => {
    expect(readProjectTab("updates", tabs)).toBe("updates");
  });
  it("falls back to About for none, an unknown name, or a tab this project doesn't have", () => {
    expect(readProjectTab(null, tabs)).toBe("about");
    expect(readProjectTab("nonsense", tabs)).toBe("about");
    expect(readProjectTab("support", tabs)).toBe("about");
    expect(readProjectTab("dates", tabs)).toBe("about");
  });
});

describe("withProjectTab", () => {
  it("sets ?tab= for any tab but the first, and keeps the other params", () => {
    expect(withProjectTab(new URLSearchParams("backed=1"), "team").toString()).toBe("backed=1&tab=team");
    expect(withProjectTab(new URLSearchParams("tab=team"), "updates").toString()).toBe("tab=updates");
  });
  it("drops the param for the first tab", () => {
    expect(withProjectTab(new URLSearchParams("backed=1&tab=team"), "about").toString()).toBe("backed=1");
    expect(withProjectTab(new URLSearchParams(), "about").toString()).toBe("");
  });
});
