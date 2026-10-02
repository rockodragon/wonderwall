import { describe, expect, it } from "vitest";
import {
  PROJECT_VIEWS,
  SHOW_FILTERS,
  filterProjects,
  inView,
  isMatch,
  isRaising,
  matchesProjectQuery,
  matchesShow,
  projectTopics,
  readProjectsView,
} from "./projectsFilter";

const passion = (over: Record<string, unknown> = {}) => ({ _id: "p", kind: "passion", status: "active", title: "Mural", ...over });
const paid = (over: Record<string, unknown> = {}) => ({ _id: "j", kind: "paid", status: "active", title: "Cover band", ...over });

describe("inView", () => {
  it("puts passion projects in Projects and paid postings in Work", () => {
    expect(inView(passion(), "projects")).toBe(true);
    expect(inView(passion(), "work")).toBe(false);
    expect(inView(paid(), "work")).toBe(true);
    expect(inView(paid(), "projects")).toBe(false);
  });

  it("puts a passion project with open roles in both", () => {
    const p = passion({ openRoles: [{ title: "Drummer" }] });
    expect(inView(p, "projects")).toBe(true);
    expect(inView(p, "work")).toBe(true);
  });
});

describe("isRaising", () => {
  it("is false for a gig, whatever its goal", () => {
    expect(isRaising(passion({ gig: { status: "open" }, goal: 500 }))).toBe(false);
  });
  it("trusts the server's flag when it sends one", () => {
    expect(isRaising(passion({ raising: false, goal: 500 }))).toBe(false);
    expect(isRaising(passion({ raising: true }))).toBe(true);
  });
  it("reads a goal or the raising stage on an older backend", () => {
    expect(isRaising(passion({ goal: 500 }))).toBe(true);
    expect(isRaising(passion({ stage: "raising" }))).toBe(true);
    expect(isRaising(passion())).toBe(false);
  });
});

describe("matchesShow", () => {
  it("matches a stage pill to the stage the card shows", () => {
    expect(matchesShow(passion({ stage: "working" }), "working")).toBe(true);
    expect(matchesShow(passion({ stage: "working" }), "planning")).toBe(false);
    // No stage set: a passion project derives to planning, a paid one to forming.
    expect(matchesShow(passion(), "planning")).toBe(true);
    expect(matchesShow(paid(), "forming")).toBe(true);
  });
  it("matches Raising by the raising rule, not the stage", () => {
    expect(matchesShow(passion({ goal: 500, stage: "planning" }), "raising")).toBe(true);
  });
  it("splits Work into jobs, shows and roles", () => {
    expect(matchesShow(paid(), "jobs")).toBe(true);
    expect(matchesShow(paid({ gig: { status: "open" } }), "jobs")).toBe(false);
    expect(matchesShow(paid({ gig: { status: "open" } }), "gigs")).toBe(true);
    expect(matchesShow(passion({ openRoles: [{}] }), "roles")).toBe(true);
    expect(matchesShow(passion(), "roles")).toBe(false);
  });
  it("lets everything through for All", () => {
    expect(matchesShow(passion(), "")).toBe(true);
  });
});

describe("PROJECT_VIEWS", () => {
  it("names the two views Passion and Paid, the Shortlist's words", () => {
    expect(PROJECT_VIEWS.map((v) => v.label)).toEqual(["Passion", "Paid"]);
  });
  it("keeps the old values, so ?view=work links still land", () => {
    expect(PROJECT_VIEWS.map((v) => v.value)).toEqual(["projects", "work"]);
    expect(readProjectsView({ view: PROJECT_VIEWS[1].value }).view).toBe("work");
  });
});

describe("readProjectsView", () => {
  it("defaults to Projects with no pill", () => {
    expect(readProjectsView({})).toEqual({ view: "projects", show: "" });
  });
  it("reads ?view=work and a pill that belongs to it", () => {
    expect(readProjectsView({ view: "work", show: "gigs" })).toEqual({ view: "work", show: "gigs" });
  });
  it("reads an unknown pill, or one from the other view, as All", () => {
    expect(readProjectsView({ show: "nonsense" }).show).toBe("");
    expect(readProjectsView({ view: "work", show: "raising" }).show).toBe("");
    expect(readProjectsView({ show: "jobs" }).show).toBe("");
  });
  it("lands the old ?kind= and ?show=people links where they used to", () => {
    expect(readProjectsView({ kind: "paid" })).toEqual({ view: "work", show: "" });
    expect(readProjectsView({ kind: "gigs" })).toEqual({ view: "work", show: "gigs" });
    expect(readProjectsView({ show: "people" })).toEqual({ view: "projects", show: "forming" });
  });
  it("takes the desk's own Work switch", () => {
    expect(readProjectsView({ work: true, show: "roles" })).toEqual({ view: "work", show: "roles" });
  });
  it("offers the stage pills the page always has", () => {
    expect(SHOW_FILTERS.projects.map((f) => f.label)).toEqual(["All", "Planning", "Raising", "Forming team", "Working", "Released"]);
    expect(SHOW_FILTERS.work.map((f) => f.label)).toEqual(["All", "Jobs", "Shows", "Roles on projects"]);
  });
});

describe("projectTopics and isMatch", () => {
  it("prefers the project's own interests, then its creator's", () => {
    expect(projectTopics({ interests: ["Music"], creator: { interests: ["Film"] } })).toEqual(["Music"]);
    expect(projectTopics({ interests: [], creator: { interests: ["Film"] } })).toEqual(["Film"]);
    expect(projectTopics({})).toEqual([]);
  });
  it("matches an interest", () => {
    expect(isMatch({ interests: ["Music"] }, { interests: ["Music"], location: "" })).toBe(true);
    expect(isMatch({ interests: ["Film"] }, { interests: ["Music"], location: "" })).toBe(false);
  });
  it("matches a remote-friendly project to any location, and an in-person one either way round", () => {
    const soft = { interests: [], location: "Nashville" };
    expect(isMatch({ remote: true }, soft)).toBe(true);
    expect(isMatch({}, soft)).toBe(true);
    expect(isMatch({ remote: false, location: "Nashville, TN" }, soft)).toBe(true);
    expect(isMatch({ remote: false, location: "Nash" }, soft)).toBe(true);
    expect(isMatch({ remote: false, location: "Austin" }, soft)).toBe(false);
    expect(isMatch({ remote: false, creator: { location: "Nashville" } }, soft)).toBe(true);
  });
});

describe("matchesProjectQuery", () => {
  it("looks in the title, the summary and the page text", () => {
    const p = passion({
      title: "Harbor Mural",
      blurb: "Painting the seawall",
      body: [{ type: "text", text: "We need volunteers on Saturdays" }],
    });
    expect(matchesProjectQuery(p, "harbor")).toBe(true);
    expect(matchesProjectQuery(p, "seawall")).toBe(true);
    expect(matchesProjectQuery(p, "saturdays")).toBe(true);
    expect(matchesProjectQuery(p, "orchestra")).toBe(false);
  });
});

describe("filterProjects", () => {
  const list = [
    passion({ _id: "a", title: "Mural", stage: "working", interests: ["Visual Art"], community: { slug: "the-garden" } }),
    passion({ _id: "b", title: "Album", stage: "planning", interests: ["Music"], community: { slug: "sd" } }),
    paid({ _id: "c", title: "Cover band" }),
    passion({ _id: "d", title: "Zine", stage: "working", interests: ["Music"] }),
  ];
  const ids = (xs: { _id: string }[]) => xs.map((x) => x._id);

  it("keeps the view and the pill", () => {
    expect(ids(filterProjects(list as any, { view: "projects", show: "" }) as any)).toEqual(["a", "b", "d"]);
    expect(ids(filterProjects(list as any, { view: "projects", show: "working" }) as any)).toEqual(["a", "d"]);
    expect(ids(filterProjects(list as any, { view: "work", show: "" }) as any)).toEqual(["c"]);
  });
  it("applies a community, a search and tags", () => {
    expect(ids(filterProjects(list as any, { view: "projects", show: "", inCommunity: (p: any) => p.community?.slug === "sd" }) as any)).toEqual(["b"]);
    expect(ids(filterProjects(list as any, { view: "projects", show: "", query: "  ZINE " }) as any)).toEqual(["d"]);
    expect(ids(filterProjects(list as any, { view: "projects", show: "", tags: ["Music"] }) as any)).toEqual(["b", "d"]);
  });
  it("floats soft matches to the top without dropping anything", () => {
    const out = filterProjects(list as any, { view: "projects", show: "", soft: { interests: ["Music"], location: "" } });
    expect(ids(out as any)).toEqual(["b", "d", "a"]);
  });
  it("does not reorder for an empty soft signal", () => {
    const out = filterProjects(list as any, { view: "projects", show: "", soft: { interests: [], location: "" } });
    expect(ids(out as any)).toEqual(["a", "b", "d"]);
  });
});
