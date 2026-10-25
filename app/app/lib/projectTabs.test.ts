import { describe, expect, it } from "vitest";
import { projectTabs, readProjectTab, sectionsWithContent, withProjectTab } from "./projectTabs";

const ids = (tabs: { id: string }[]) => tabs.map((t) => t.id);
const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label);

describe("projectTabs", () => {
  it("gives a project About, Team, Updates and Support", () => {
    const tabs = projectTabs({ isGig: false, isPassion: true, requests: 0 });
    expect(ids(tabs)).toEqual(["about", "team", "updates", "support"]);
    expect(labels(tabs)).toEqual(["About", "Team", "Updates", "Support"]);
  });
  it("gives a job three tabs, with no Support", () => {
    expect(ids(projectTabs({ isGig: false, isPassion: false, requests: 0 }))).toEqual(["about", "team", "updates"]);
  });
  it("gives a gig Dates in place of Team, and no Support", () => {
    const tabs = projectTabs({ isGig: true, isPassion: false, requests: 0 });
    expect(ids(tabs)).toEqual(["about", "dates", "updates"]);
    expect(labels(tabs)).toEqual(["About", "Dates", "Updates"]);
  });
  it("counts the requests waiting on the owner", () => {
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 1 }))[1]).toBe("Team · 1 request");
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 2 }))[1]).toBe("Team · 2 requests");
  });

  it("counts supporters on the Support tab for everyone", () => {
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 0, supporters: 3 }))[3]).toBe("Support · 3");
    expect(labels(projectTabs({ isGig: false, isPassion: true, requests: 0, supporters: 0 }))[3]).toBe("Support");
  });
});

describe("projectTabs, for someone who can't edit the project", () => {
  const nothing = { team: false, updates: false, support: false };

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
    const all = { team: true, updates: true, support: true };
    expect(ids(projectTabs({ isGig: false, isPassion: false, requests: 0, has: all }))).toEqual(["about", "team", "updates"]);
  });
  it("keeps a gig's Dates", () => {
    expect(ids(projectTabs({ isGig: true, isPassion: false, requests: 0, has: nothing }))).toEqual(["about", "dates"]);
  });
  it("sends ?tab=team back to About when there's no Team tab", () => {
    const tabs = projectTabs({ isGig: false, isPassion: true, requests: 0, has: nothing });
    expect(readProjectTab("team", tabs)).toBe("about");
    expect(readProjectTab("updates", tabs)).toBe("about");
    expect(readProjectTab("support", tabs)).toBe("about");
  });
});

describe("sectionsWithContent", () => {
  // A finished project: no longer taking people.
  const leadOnly = { accepted: [], credits: [], acceptingPeople: false };
  const bare = { team: leadOnly, roles: [], updates: [], raising: false, supporters: 0 };

  it("finds nothing in a finished project with only its lead, no roles, no updates and no support", () => {
    expect(sectionsWithContent(bare)).toEqual({ team: false, updates: false, support: false });
  });
  it("finds nothing while the team, roles and updates are still loading", () => {
    expect(sectionsWithContent({ ...bare, team: undefined, roles: undefined, updates: undefined })).toEqual({
      team: false,
      updates: false,
      support: false,
    });
  });
  it("finds a team in a member, a credit, a listed role, or the viewer's own request", () => {
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, accepted: [{}] } }).team).toBe(true);
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, credits: [{}] } }).team).toBe(true);
    expect(sectionsWithContent({ ...bare, roles: [{}] }).team).toBe(true);
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, mine: { status: "invited" } } }).team).toBe(true);
  });
  it("keeps Team while the project takes people, lead alone or not: Ask to join and Apply are there", () => {
    expect(sectionsWithContent({ ...bare, team: { ...leadOnly, acceptingPeople: true } }).team).toBe(true);
  });
  it("finds updates once one is posted", () => {
    expect(sectionsWithContent({ ...bare, updates: [{}] }).updates).toBe(true);
  });
  it("finds support when the owner asked for it, or someone already gave it", () => {
    expect(sectionsWithContent({ ...bare, raising: true }).support).toBe(true);
    expect(sectionsWithContent({ ...bare, supporters: 1 }).support).toBe(true);
  });
});

describe("readProjectTab", () => {
  const tabs = projectTabs({ isGig: false, isPassion: false, requests: 0 });
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
