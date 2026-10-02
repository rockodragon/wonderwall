import { describe, expect, it } from "vitest";
import {
  BROWSE_STAGES,
  PROJECT_LENSES,
  STAGE_OPTIONS,
  filterProjects,
  isJobOrGig,
  isMatch,
  isRaising,
  lensCreate,
  matchesLens,
  matchesProjectQuery,
  matchesStage,
  projectTopics,
  readProjectsView,
  seeksPeople,
  selectLens,
  stageCaption,
  writeProjectsView,
  type ProjectsLens,
} from "./projectsFilter";

const passion = (over: Record<string, unknown> = {}) => ({ _id: "p", kind: "passion", status: "active", title: "Mural", ...over });
const paid = (over: Record<string, unknown> = {}) => ({ _id: "j", kind: "paid", status: "active", title: "Cover band", budgetType: "amount", budget: 300, ...over });
const gig = (over: Record<string, unknown> = {}) => paid({ gig: { status: "open", cadence: "Every Friday", timeRange: "8–10pm" }, ...over });
const paidRole = { roleId: "r1", title: "Drummer", budgetType: "amount", budget: 200 };
const volunteerRole = { roleId: "r2", title: "Stagehand", budgetType: "volunteer" };
const unpricedRole = { roleId: "r3", title: "Writer", budgetType: null };

/** Which chips a row answers to. */
const chipsOf = (p: unknown) => PROJECT_LENSES.map((l) => l.value).filter((l) => matchesLens(p, l));

describe("the chips", () => {
  it("are Projects, Seeking funding, Seeking people, Jobs and gigs, in that order", () => {
    expect(PROJECT_LENSES.map((l) => l.label)).toEqual(["Projects", "Seeking funding", "Seeking people", "Jobs and gigs"]);
    expect(PROJECT_LENSES.map((l) => l.value)).toEqual(["projects", "funding", "people", "work"]);
  });
  it("have no All chip", () => {
    expect(PROJECT_LENSES.some((l) => /^all$/i.test(l.label))).toBe(false);
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

describe("seeksPeople", () => {
  it("is a project with an open role, paid or volunteer", () => {
    expect(seeksPeople(passion({ openRoles: [paidRole] }))).toBe(true);
    expect(seeksPeople(passion({ openRoles: [volunteerRole] }))).toBe(true);
    expect(seeksPeople(passion({ openRoles: [unpricedRole] }))).toBe(true);
    expect(seeksPeople(passion({ openRoles: [] }))).toBe(false);
    expect(seeksPeople(passion())).toBe(false);
  });
  it("is a posting that says it is unpaid, and no paid one", () => {
    expect(seeksPeople(paid({ budgetType: "volunteer" }))).toBe(true);
    expect(seeksPeople(paid({ budgetType: "proposals" }))).toBe(false);
    expect(seeksPeople(paid())).toBe(false);
    expect(seeksPeople(gig())).toBe(false);
  });
});

describe("isJobOrGig", () => {
  it("is a paid posting: a one-off job or a recurring gig", () => {
    expect(isJobOrGig(paid())).toBe(true);
    expect(isJobOrGig(paid({ budgetType: "range", budget: 300, budgetMax: 600 }))).toBe(true);
    expect(isJobOrGig(paid({ budgetType: "proposals" }))).toBe(true);
    expect(isJobOrGig(gig())).toBe(true);
  });
  it("is not an unpaid posting", () => {
    expect(isJobOrGig(paid({ budgetType: "volunteer" }))).toBe(false);
    expect(isJobOrGig(gig({ budgetType: "volunteer" }))).toBe(false);
  });
  it("is a project with an open role that pays", () => {
    expect(isJobOrGig(passion({ openRoles: [paidRole] }))).toBe(true);
    expect(isJobOrGig(passion({ openRoles: [volunteerRole, paidRole] }))).toBe(true);
    expect(isJobOrGig(passion({ openRoles: [{ ...paidRole, budgetType: "proposals", budget: null }] }))).toBe(true);
  });
  it("is not a project whose roles are all unpaid, or never said what they pay", () => {
    expect(isJobOrGig(passion({ openRoles: [volunteerRole] }))).toBe(false);
    expect(isJobOrGig(passion({ openRoles: [unpricedRole] }))).toBe(false);
    expect(isJobOrGig(passion({ openRoles: [{ title: "Writer" }] }))).toBe(false);
    expect(isJobOrGig(passion())).toBe(false);
  });
});

describe("matchesLens: which chips a project answers to", () => {
  it("a plain project: Projects only", () => {
    expect(chipsOf(passion())).toEqual(["projects"]);
  });
  it("a project with a goal: Projects and Seeking funding", () => {
    expect(chipsOf(passion({ goal: 500 }))).toEqual(["projects", "funding"]);
    expect(chipsOf(passion({ stage: "raising" }))).toEqual(["projects", "funding"]);
    expect(chipsOf(passion({ raising: true }))).toEqual(["projects", "funding"]);
  });
  it("a project with an unpaid role: Projects and Seeking people", () => {
    expect(chipsOf(passion({ openRoles: [volunteerRole] }))).toEqual(["projects", "people"]);
  });
  it("a project with a paid role: Projects, Seeking people and Jobs and gigs", () => {
    expect(chipsOf(passion({ openRoles: [paidRole] }))).toEqual(["projects", "people", "work"]);
  });
  it("a project that asks for money and people answers to every chip but Jobs and gigs (unpaid roles)", () => {
    expect(chipsOf(passion({ goal: 500, openRoles: [volunteerRole] }))).toEqual(["projects", "funding", "people"]);
  });
  it("a one-off job: Jobs and gigs only", () => {
    expect(chipsOf(paid())).toEqual(["work"]);
    expect(chipsOf(paid({ goal: 900, openRoles: [paidRole] }))).toEqual(["work"]);
  });
  it("a recurring gig: Jobs and gigs only, never Seeking funding", () => {
    expect(chipsOf(gig())).toEqual(["work"]);
    expect(chipsOf(gig({ goal: 900, raising: true }))).toEqual(["work"]);
  });
  it("an unpaid posting: Seeking people only", () => {
    expect(chipsOf(paid({ budgetType: "volunteer" }))).toEqual(["people"]);
  });
  it("Seeking funding is a project asking for backing, so a paid posting never is", () => {
    expect(matchesLens(paid({ stage: "raising" }), "funding")).toBe(false);
  });
});

describe("matchesStage", () => {
  it("matches the stage the card shows", () => {
    expect(matchesStage(passion({ stage: "working" }), "working")).toBe(true);
    expect(matchesStage(passion({ stage: "working" }), "planning")).toBe(false);
    // No stage set: a passion project derives to planning, a paid one to forming.
    expect(matchesStage(passion(), "planning")).toBe(true);
    expect(matchesStage(paid({ budgetType: "volunteer" }), "forming")).toBe(true);
  });
  it("lets everything through for any stage, and for a word that is not a stage", () => {
    expect(matchesStage(passion({ stage: "working" }), "")).toBe(true);
    expect(matchesStage(passion({ stage: "working" }), "raising")).toBe(true);
    expect(matchesStage(passion({ stage: "working" }), "nonsense")).toBe(true);
  });
});

describe("the Stage menu", () => {
  it("is Any stage, Planning, Forming team, Working, Released, with no Raising", () => {
    expect(STAGE_OPTIONS.map((o) => o.label)).toEqual(["Any stage", "Planning", "Forming team", "Working", "Released"]);
    expect(STAGE_OPTIONS.map((o) => o.value)).toEqual(["", "planning", "forming", "working", "releasing"]);
    expect(BROWSE_STAGES).not.toContain("raising");
  });
  it("is captioned Stage until one is chosen, then says which", () => {
    expect(stageCaption("")).toBe("Stage");
    expect(stageCaption("working")).toBe("Working");
    expect(stageCaption("releasing")).toBe("Released");
    expect(stageCaption("forming")).toBe("Forming team");
    expect(stageCaption("raising")).toBe("Stage");
    expect(stageCaption("nonsense")).toBe("Stage");
  });
});

describe("lensCreate", () => {
  it("is Hire someone on Jobs and gigs and Start a project on the rest", () => {
    expect(lensCreate("work")).toEqual({ kind: "hire", label: "Hire someone" });
    for (const lens of ["projects", "funding", "people"] as const) {
      expect(lensCreate(lens)).toEqual({ kind: "project", label: "Start a project" });
    }
  });
});

describe("readProjectsView", () => {
  const read = (raw: Parameters<typeof readProjectsView>[0]) => readProjectsView(raw);
  const projects = (stage = "") => ({ lens: "projects", stage });

  it("defaults to Projects with any stage", () => {
    expect(read({})).toEqual(projects());
    expect(read({ view: null, kind: null, show: null, stage: null, seek: null })).toEqual(projects());
    expect(read({ show: "", stage: "", seek: "" })).toEqual(projects());
  });

  describe("canonical ?show= and ?stage=", () => {
    it("reads each chip", () => {
      expect(read({ show: "projects" }).lens).toBe("projects");
      expect(read({ show: "funding" }).lens).toBe("funding");
      expect(read({ show: "people" }).lens).toBe("people");
      expect(read({ show: "work" }).lens).toBe("work");
    });
    it("reads each stage, with Projects", () => {
      for (const stage of ["planning", "forming", "working", "releasing"]) {
        expect(read({ stage })).toEqual(projects(stage));
      }
    });
    it("combines a chip with a stage", () => {
      expect(read({ show: "funding", stage: "planning" })).toEqual({ lens: "funding", stage: "planning" });
      expect(read({ show: "people", stage: "working" })).toEqual({ lens: "people", stage: "working" });
      expect(read({ show: "projects", stage: "releasing" })).toEqual(projects("releasing"));
    });
    it("drops the stage under Jobs and gigs", () => {
      expect(read({ show: "work", stage: "planning" })).toEqual({ lens: "work", stage: "" });
    });
    it("is the same on the desk, whose own ?view= names the tool", () => {
      expect(read({ view: null, show: "funding", stage: "forming" })).toEqual({ lens: "funding", stage: "forming" });
    });
    it("reads an unknown word, or a stage that is not offered, as nothing", () => {
      expect(read({ show: "nonsense" })).toEqual(projects());
      expect(read({ stage: "nonsense" })).toEqual(projects());
      expect(read({ stage: "paused" })).toEqual(projects());
      expect(read({ stage: "completed" })).toEqual(projects());
      expect(read({ show: "constructor", stage: "__proto__" })).toEqual(projects());
    });
  });

  describe("old links still land where they did", () => {
    it("view=work, kind=paid, kind=gigs and the desk's Work toggle: Jobs and gigs", () => {
      expect(read({ view: "work" })).toEqual({ lens: "work", stage: "" });
      expect(read({ kind: "paid" })).toEqual({ lens: "work", stage: "" });
      expect(read({ kind: "gigs" })).toEqual({ lens: "work", stage: "" });
      expect(read({ work: true })).toEqual({ lens: "work", stage: "" });
    });
    it("show or stage = jobs or gigs: Jobs and gigs", () => {
      expect(read({ show: "jobs" }).lens).toBe("work");
      expect(read({ show: "gigs" }).lens).toBe("work");
      expect(read({ stage: "jobs" }).lens).toBe("work");
      expect(read({ stage: "gigs" }).lens).toBe("work");
      expect(read({ view: "work", show: "gigs" })).toEqual({ lens: "work", stage: "" });
      expect(read({ work: true, stage: "gigs" })).toEqual({ lens: "work", stage: "" });
      expect(read({ kind: "gigs", show: "" }).lens).toBe("work");
    });
    it("show or stage = roles or people: Seeking people", () => {
      expect(read({ show: "roles" }).lens).toBe("people");
      expect(read({ stage: "roles" }).lens).toBe("people");
      expect(read({ show: "people" }).lens).toBe("people");
      expect(read({ stage: "people" }).lens).toBe("people");
      // Roles on projects was a Work pill.
      expect(read({ view: "work", show: "roles" }).lens).toBe("people");
      expect(read({ work: true, stage: "roles" }).lens).toBe("people");
    });
    it("show or stage = raising, and seek=funding: Seeking funding", () => {
      expect(read({ show: "raising" }).lens).toBe("funding");
      expect(read({ stage: "raising" }).lens).toBe("funding");
      expect(read({ seek: "funding" }).lens).toBe("funding");
    });
    it("seek=people: Seeking people", () => {
      expect(read({ seek: "people" }).lens).toBe("people");
    });
    it("keeps the stage of an old stage + seek link", () => {
      expect(read({ show: "planning", seek: "funding" })).toEqual({ lens: "funding", stage: "planning" });
      expect(read({ stage: "working", seek: "people" })).toEqual({ lens: "people", stage: "working" });
    });
    it("reads an old stage id as that stage, with Projects", () => {
      for (const stage of ["planning", "forming", "working", "releasing"]) {
        expect(read({ show: stage })).toEqual(projects(stage));
      }
      expect(read({ view: "projects", show: "working" })).toEqual(projects("working"));
    });
    it("view=projects, kind=passion and an unknown word: Projects", () => {
      expect(read({ view: "projects" })).toEqual(projects());
      expect(read({ kind: "passion" })).toEqual(projects());
      expect(read({ kind: "nonsense", view: "nonsense" })).toEqual(projects());
      expect(read({ work: false })).toEqual(projects());
    });
    it("lets an explicit seek beat the chip an old param implies", () => {
      expect(read({ show: "raising", seek: "people" }).lens).toBe("people");
      expect(read({ show: "people", seek: "funding" }).lens).toBe("funding");
      expect(read({ view: "work", seek: "funding" }).lens).toBe("funding");
      expect(read({ kind: "paid", seek: "people" }).lens).toBe("people");
      expect(read({ work: true, seek: "funding" }).lens).toBe("funding");
      expect(read({ stage: "gigs", seek: "people" }).lens).toBe("people");
    });
    it("ignores a seek it does not know", () => {
      expect(read({ seek: "nonsense" })).toEqual(projects());
      expect(read({ seek: "nonsense", view: "work" }).lens).toBe("work");
      expect(read({ seek: "raising", show: "gigs" }).lens).toBe("work");
    });
    it("lets show beat stage, and either beat the old view", () => {
      expect(read({ show: "people", stage: "gigs" }).lens).toBe("people");
      expect(read({ show: "funding", view: "work" }).lens).toBe("funding");
      expect(read({ stage: "roles", view: "work" }).lens).toBe("people");
    });
    it("drops a stage the old Work view could not have", () => {
      expect(read({ view: "work", show: "planning" })).toEqual({ lens: "work", stage: "" });
      expect(read({ work: true, stage: "working" })).toEqual({ lens: "work", stage: "" });
    });
  });
});

describe("selectLens", () => {
  it("Projects resets the chip and the stage", () => {
    expect(selectLens({ lens: "funding", stage: "planning" }, "projects")).toEqual({ lens: "projects", stage: "" });
    expect(selectLens({ lens: "projects", stage: "working" }, "projects")).toEqual({ lens: "projects", stage: "" });
    expect(selectLens({ lens: "work", stage: "" }, "projects")).toEqual({ lens: "projects", stage: "" });
  });
  it("Seeking funding and Seeking people keep the stage", () => {
    expect(selectLens({ lens: "projects", stage: "working" }, "funding")).toEqual({ lens: "funding", stage: "working" });
    expect(selectLens({ lens: "funding", stage: "planning" }, "people")).toEqual({ lens: "people", stage: "planning" });
  });
  it("Jobs and gigs drops the stage", () => {
    expect(selectLens({ lens: "projects", stage: "working" }, "work")).toEqual({ lens: "work", stage: "" });
  });
  it("clicking the chip that is on leaves it on", () => {
    expect(selectLens({ lens: "people", stage: "forming" }, "people")).toEqual({ lens: "people", stage: "forming" });
  });
});

describe("writeProjectsView", () => {
  const write = (search: string, next: { lens: ProjectsLens; stage: string }, legacy: string[]) => {
    const params = new URLSearchParams(search);
    writeProjectsView(params, next, legacy);
    return params.toString();
  };
  const PAGE = ["view", "kind", "seek"];
  const DESK = ["tab", "seek"];

  it("writes ?show= for every chip but Projects, which is absent", () => {
    expect(write("", { lens: "projects", stage: "" }, PAGE)).toBe("");
    expect(write("", { lens: "funding", stage: "" }, PAGE)).toBe("show=funding");
    expect(write("", { lens: "people", stage: "" }, PAGE)).toBe("show=people");
    expect(write("", { lens: "work", stage: "" }, PAGE)).toBe("show=work");
  });
  it("writes ?stage= beside a chip, and not under Jobs and gigs", () => {
    expect(write("", { lens: "funding", stage: "planning" }, PAGE)).toBe("show=funding&stage=planning");
    expect(write("", { lens: "projects", stage: "working" }, PAGE)).toBe("stage=working");
    expect(write("stage=working", { lens: "work", stage: "working" }, PAGE)).toBe("show=work");
  });
  it("drops a stage it does not offer", () => {
    expect(write("", { lens: "projects", stage: "raising" }, PAGE)).toBe("");
  });
  it("cleans up the old params the page used, and keeps the rest", () => {
    expect(write("view=work&show=gigs&community=sd&interests=Music", { lens: "people", stage: "" }, PAGE)).toBe(
      "show=people&community=sd&interests=Music",
    );
    expect(write("kind=paid&seek=funding", { lens: "projects", stage: "" }, PAGE)).toBe("");
    expect(write("seek=people&show=raising", { lens: "work", stage: "" }, PAGE)).toBe("show=work");
  });
  it("cleans up the old params the desk used, and keeps the tool and the search", () => {
    expect(write("view=projects&tab=work&stage=gigs&q=band", { lens: "projects", stage: "" }, DESK)).toBe("view=projects&q=band");
    expect(write("view=projects&stage=raising&seek=people", { lens: "funding", stage: "" }, DESK)).toBe("view=projects&show=funding");
    expect(write("view=projects&tab=work", { lens: "people", stage: "forming" }, DESK)).toBe("view=projects&show=people&stage=forming");
  });
  it("reads back what it wrote", () => {
    for (const lens of PROJECT_LENSES.map((l) => l.value)) {
      for (const stage of ["", ...BROWSE_STAGES.filter((s) => s !== "raising")]) {
        const params = new URLSearchParams("view=work&seek=funding");
        writeProjectsView(params, { lens, stage }, PAGE);
        const back = readProjectsView({ view: params.get("view"), show: params.get("show"), stage: params.get("stage"), seek: params.get("seek") });
        expect(back).toEqual({ lens, stage: lens === "work" ? "" : stage });
      }
    }
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

  it("keeps the chip and the stage", () => {
    expect(ids(filterProjects(list as any, { lens: "projects" }) as any)).toEqual(["a", "b", "d"]);
    expect(ids(filterProjects(list as any, { lens: "projects", stage: "working" }) as any)).toEqual(["a", "d"]);
    expect(ids(filterProjects(list as any, { lens: "work" }) as any)).toEqual(["c"]);
  });
  it("ignores the stage under Jobs and gigs", () => {
    expect(ids(filterProjects(list as any, { lens: "work", stage: "working" }) as any)).toEqual(["c"]);
  });
  it("combines each chip with a stage", () => {
    const rows = [
      passion({ _id: "a", stage: "planning", goal: 500 }),
      passion({ _id: "b", stage: "planning" }),
      passion({ _id: "c", stage: "working", goal: 500, openRoles: [volunteerRole] }),
      passion({ _id: "d", stage: "working", openRoles: [volunteerRole] }),
      paid({ _id: "e", budgetType: "volunteer" }),
      gig({ _id: "f" }),
      passion({ _id: "g", stage: "forming", openRoles: [paidRole] }),
    ];
    const pick = (lens: ProjectsLens, stage = "") => ids(filterProjects(rows as any, { lens, stage }) as any);
    expect(pick("projects")).toEqual(["a", "b", "c", "d", "g"]);
    expect(pick("funding")).toEqual(["a", "c"]);
    expect(pick("funding", "planning")).toEqual(["a"]);
    expect(pick("funding", "working")).toEqual(["c"]);
    expect(pick("funding", "forming")).toEqual([]);
    expect(pick("people")).toEqual(["c", "d", "e", "g"]);
    expect(pick("people", "working")).toEqual(["c", "d"]);
    // An unpaid posting derives to Forming team.
    expect(pick("people", "forming")).toEqual(["e", "g"]);
    expect(pick("people", "planning")).toEqual([]);
    expect(pick("work")).toEqual(["f", "g"]);
    expect(pick("work", "planning")).toEqual(["f", "g"]);
    expect(pick("projects", "planning")).toEqual(["a", "b"]);
  });
  it("applies a community, a search and tags", () => {
    expect(ids(filterProjects(list as any, { lens: "projects", inCommunity: (p: any) => p.community?.slug === "sd" }) as any)).toEqual(["b"]);
    expect(ids(filterProjects(list as any, { lens: "projects", query: "  ZINE " }) as any)).toEqual(["d"]);
    expect(ids(filterProjects(list as any, { lens: "projects", tags: ["Music"] }) as any)).toEqual(["b", "d"]);
  });
  it("floats soft matches to the top without dropping anything", () => {
    const out = filterProjects(list as any, { lens: "projects", soft: { interests: ["Music"], location: "" } });
    expect(ids(out as any)).toEqual(["b", "d", "a"]);
  });
  it("does not reorder for an empty soft signal", () => {
    const out = filterProjects(list as any, { lens: "projects", soft: { interests: [], location: "" } });
    expect(ids(out as any)).toEqual(["a", "b", "d"]);
  });
});
