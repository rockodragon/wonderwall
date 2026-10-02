import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DeskFilterBar, browseParamsOf, readDeskProjects } from "./deskBrowse";

function bar(view: "people" | "projects" | "events", search = "") {
  return renderToString(
    <MemoryRouter initialEntries={[`/today?view=${view}${search}`]}>
      <DeskFilterBar view={view} />
    </MemoryRouter>,
  );
}

describe("DeskFilterBar", () => {
  it("People: search, Everyone / Following / Organizations, Discipline and Near me", () => {
    const html = bar("people");
    expect(html).toContain('placeholder="Search people and orgs"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Everyone</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Following</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Organizations</);
    expect(html).toContain("Discipline");
    expect(html).toContain("Near me");
  });

  it("People, Organizations: only organizations, which have no Discipline and no place to measure", () => {
    const html = bar("people", "&tab=orgs");
    expect(html).toContain('placeholder="Search organizations"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Organizations</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Everyone</);
    expect(html).not.toContain("Discipline");
    expect(html).not.toContain("Near me");
  });

  it("People, Organizations: a Discipline left in the URL is not applied", () => {
    expect(bar("people", "&tab=orgs&interests=Music")).not.toContain("Music");
  });

  it("People, Following: no Near me, since the people you follow carry no location", () => {
    const html = bar("people", "&tab=following");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Following</);
    expect(html).toContain('placeholder="Search people"');
    expect(html).not.toContain("Near me");
  });

  it("People: names the chosen Discipline", () => {
    expect(bar("people", "&interests=Music")).toContain("Music");
    expect(bar("people", "&interests=Music,Film")).toContain("2 filters");
  });

  it("Projects: four chips and a Stage menu, with Projects on and no All, no Work toggle", () => {
    const html = bar("projects");
    for (const label of ["Projects", "Seeking funding", "Seeking people", "Jobs and gigs"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>Projects</);
    for (const label of ["Seeking funding", "Seeking people", "Jobs and gigs"]) {
      expect(html).toMatch(new RegExp(`aria-pressed="false"[^>]*>${label}<`));
    }
    expect(html).not.toContain(">All<");
    expect(html).not.toContain(">Work<");
    expect(html).not.toContain(">Shows<");
    expect(html).toContain('placeholder="Search projects"');
    // Stage is a menu, not a row of pills, and it is closed.
    expect(html).toMatch(/aria-haspopup="true"[^>]*>Stage</);
    for (const label of ["Planning", "Forming team", "Released", "Any stage"]) expect(html).not.toContain(`>${label}<`);
    expect(html).not.toContain(">Raising<");
  });

  it("Projects: the chip comes before Stage, with a divider between", () => {
    const html = bar("projects");
    expect(html).toContain('role="separator"');
    expect(html.indexOf(">Jobs and gigs<")).toBeLessThan(html.indexOf('role="separator"'));
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf(">Stage<"));
  });

  it("Projects: the URL's chip is on, and the Stage menu names the stage", () => {
    const html = bar("projects", "&show=funding&stage=planning");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Seeking funding</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Projects</);
    expect(html).toMatch(/aria-haspopup="true"[^>]*>Planning</);
    expect(bar("projects", "&stage=releasing")).toMatch(/aria-haspopup="true"[^>]*>Released</);
    expect(bar("projects", "&show=people&stage=forming")).toMatch(/aria-haspopup="true"[^>]*>Forming team</);
    expect(bar("projects", "&show=people")).toMatch(/aria-pressed="true"[^>]*>Seeking people</);
  });

  it("Projects, Jobs and gigs: no Stage, and a search that says what it searches", () => {
    const html = bar("projects", "&show=work");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Jobs and gigs</);
    expect(html).toContain('placeholder="Search jobs and gigs"');
    expect(html).not.toContain(">Stage<");
    expect(html).not.toContain('role="separator"');
    // A stage left in the URL is not applied here, and not shown.
    expect(bar("projects", "&show=work&stage=working")).not.toContain(">Working<");
  });

  it("Projects: old links land on the chip they used to mean", () => {
    expect(bar("projects", "&tab=work")).toMatch(/aria-pressed="true"[^>]*>Jobs and gigs</);
    expect(bar("projects", "&tab=work&stage=gigs")).toMatch(/aria-pressed="true"[^>]*>Jobs and gigs</);
    expect(bar("projects", "&tab=work&stage=roles")).toMatch(/aria-pressed="true"[^>]*>Seeking people</);
    expect(bar("projects", "&stage=raising")).toMatch(/aria-pressed="true"[^>]*>Seeking funding</);
    expect(bar("projects", "&stage=people")).toMatch(/aria-pressed="true"[^>]*>Seeking people</);
    expect(bar("projects", "&seek=funding")).toMatch(/aria-pressed="true"[^>]*>Seeking funding</);
    expect(bar("projects", "&stage=planning&seek=funding")).toMatch(/aria-haspopup="true"[^>]*>Planning</);
    expect(bar("projects", "&stage=working")).toMatch(/aria-pressed="true"[^>]*>Projects</);
    expect(bar("projects", "&stage=working")).toMatch(/aria-haspopup="true"[^>]*>Working</);
  });

  it("Projects: a People or Events param does not leak in", () => {
    expect(bar("projects", "&tab=following&interests=Music")).toMatch(/aria-pressed="true"[^>]*>Projects</);
    expect(bar("projects", "&interests=Music")).not.toContain("Music");
  });

  it("People: the first row holds search, the toggle, Discipline and Near me, no Stage", () => {
    const html = bar("people");
    expect(html).not.toContain("Stage");
    expect(html).not.toContain("Jobs and gigs");
    expect(html.indexOf("Everyone")).toBeLessThan(html.indexOf("Discipline"));
    expect(html.indexOf("Discipline")).toBeLessThan(html.indexOf("Near me"));
  });

  it("Events: Upcoming / Saved / Past and Near me", () => {
    const html = bar("events", "&tab=past");
    for (const label of ["Upcoming", "Saved", "Past", "Near me"]) expect(html).toContain(label);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Past</);
  });

  it("puts the search text from the URL in the field", () => {
    expect(bar("events", "&q=open+mic")).toContain('value="open mic"');
  });
});

describe("browseParamsOf", () => {
  it("keeps this module's params and drops the rest", () => {
    const kept = browseParamsOf(new URLSearchParams("view=projects&card=project:x&q=band&show=work&stage=gigs&interests=Music"));
    expect(kept.toString()).toBe("q=band&show=work&stage=gigs&interests=Music");
  });
  it("keeps the old Projects params too, so a card opened from an old link keeps its list", () => {
    const kept = browseParamsOf(new URLSearchParams("view=projects&card=project:x&tab=work&seek=funding"));
    expect(kept.toString()).toBe("tab=work&seek=funding");
  });
});

describe("readDeskProjects", () => {
  const read = (search: string) => readDeskProjects(new URLSearchParams(search));
  it("reads the canonical ?show= and ?stage=", () => {
    expect(read("")).toEqual({ lens: "projects", stage: "" });
    expect(read("show=work")).toEqual({ lens: "work", stage: "" });
    expect(read("show=funding&stage=planning")).toEqual({ lens: "funding", stage: "planning" });
  });
  it("reads the desk's old Work toggle and stage words", () => {
    expect(read("tab=work")).toEqual({ lens: "work", stage: "" });
    expect(read("tab=work&stage=gigs")).toEqual({ lens: "work", stage: "" });
    expect(read("tab=work&stage=roles")).toEqual({ lens: "people", stage: "" });
    expect(read("stage=raising")).toEqual({ lens: "funding", stage: "" });
    expect(read("stage=working&seek=people")).toEqual({ lens: "people", stage: "working" });
  });
  it("does not take ?tab= from another view for a Work toggle", () => {
    expect(read("tab=following")).toEqual({ lens: "projects", stage: "" });
    expect(read("tab=past")).toEqual({ lens: "projects", stage: "" });
  });
});
