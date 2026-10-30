import { describe, expect, it } from "vitest";
import { ownerSections, projectTabs, readProjectTab, sectionsWithContent, withProjectTab } from "./projectTabs";

const ids = (tabs: { id: string }[]) => tabs.map((t) => t.id);
const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label);

const nothing = { team: false, updates: false, support: false };
const all = { team: true, updates: true, support: true };

describe("projectTabs", () => {
  it("gives a project About, Team, Updates and Support when each has something", () => {
    const tabs = projectTabs({ isGig: false, isPassion: true, requests: 0, has: all });
    expect(ids(tabs)).toEqual(["about", "team", "updates", "support"]);
    expect(labels(tabs)).toEqual(["About", "Team", "Updates", "Support"]);
  });
  it("leaves out every empty section: a bare project is just About", () => {
    expect(ids(projectTabs({ isGig: false, isPassion: true, requests: 0, has: nothing }))).toEqual(["about"]);
  });
  it("keeps each section that has something in it", () => {
    expect(ids(projectTabs({ isGig: false, isPassion: true, requests: 0, has: { ...nothing, team: true } }))).toEqual([
      "about",
      "team",
    ]);
    expect(ids(projectTabs({ isGig: false, isPassion: true, requests: 0, has: { ...nothing, updates: true } }))).toEqual([
      "about",
      "updates",
    ]);
    expect(
      labels(projectTabs({ isGig: false, isPassion: true, requests: 0, supporters: 2, has: { ...nothing, support: true } })),
    ).toEqual(["About", "Support · 2"]);
  });
  it("never gives a job Support, whatever it holds", () => {
    expect(ids(projectTabs({ isGig: false, isPassion: false, requests: 0, has: all }))).toEqual(["about", "team", "updates"]);
  });
  it("gives a gig Dates in place of Team, always, and no Support", () => {
    const tabs = projectTabs({ isGig: true, isPassion: false, requests: 0, has: nothing });
    expect(ids(tabs)).toEqual(["about", "dates"]);
    expect(labels(projectTabs({ isGig: true, isPassion: false, requests: 0, has: all }))).toEqual([
      "About",
      "Dates",
      "Updates",
    ]);
  });
  it("counts the requests waiting on the owner", () => {
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 1, has: all }))[1]).toBe("Team · 1 request");
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 2, has: all }))[1]).toBe("Team · 2 requests");
  });
  it("counts updates and supporters on their tabs for everyone", () => {
    const tabs = projectTabs({ isGig: false, isPassion: true, requests: 0, updates: 4, supporters: 3, has: all });
    expect(labels(tabs)).toEqual(["About", "Team", "Updates · 4", "Support · 3"]);
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 0, updates: 0, supporters: 0, has: all }))).toEqual([
      "About",
      "Team",
      "Updates",
      "Support",
    ]);
  });
  it("sends ?tab=team back to About when there's no Team tab", () => {
    const tabs = projectTabs({ isGig: false, isPassion: true, requests: 0, has: nothing });
    expect(readProjectTab("team", tabs)).toBe("about");
    expect(readProjectTab("updates", tabs)).toBe("about");
    expect(readProjectTab("support", tabs)).toBe("about");
  });
});

describe("sectionsWithContent", () => {
  const leadOnly = { accepted: [], credits: [] };
  const bare = { team: leadOnly, roles: [], updates: [], raising: false };

  it("finds nothing in a project with only its lead, no roles, no updates and no ask for support", () => {
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
  it("finds support only when the owner asked for it", () => {
    expect(sectionsWithContent({ ...bare, raising: true }).support).toBe(true);
    expect(sectionsWithContent(bare).support).toBe(false);
  });
});

describe("ownerSections", () => {
  const none = { requests: 0, supporters: 0, opened: new Set<never>() };

  it("always gives the owner Updates, and nothing else on a bare project", () => {
    expect(ownerSections(nothing, none)).toEqual({ team: false, updates: true, support: false });
  });
  it("keeps what has content", () => {
    expect(ownerSections(all, none)).toEqual(all);
  });
  it("shows Team while a request waits, and Support once anyone gave it", () => {
    expect(ownerSections(nothing, { ...none, requests: 1 }).team).toBe(true);
    expect(ownerSections(nothing, { ...none, supporters: 1 }).support).toBe(true);
  });
  it("shows a section the owner opened from Next steps", () => {
    expect(ownerSections(nothing, { ...none, opened: new Set(["team" as const]) }).team).toBe(true);
    expect(ownerSections(nothing, { ...none, opened: new Set(["support" as const]) }).support).toBe(true);
  });
});

describe("readProjectTab", () => {
  const tabs = projectTabs({ isGig: false, isPassion: false, requests: 0, has: all });
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
    expect(withProjectTab(new URLSearchParams("tab=team"), "support").toString()).toBe("tab=support");
  });
  it("drops the param for the first tab", () => {
    expect(withProjectTab(new URLSearchParams("backed=1&tab=team"), "about").toString()).toBe("backed=1");
    expect(withProjectTab(new URLSearchParams(), "about").toString()).toBe("");
  });
});
