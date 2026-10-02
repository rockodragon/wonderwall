import { describe, expect, it } from "vitest";
import { projectTabs, readProjectTab, withProjectTab } from "./projectTabs";

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
