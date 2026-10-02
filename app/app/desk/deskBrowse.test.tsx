import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DeskFilterBar, browseParamsOf } from "./deskBrowse";

function bar(view: "people" | "projects" | "events", search = "") {
  return renderToString(
    <MemoryRouter initialEntries={[`/today?view=${view}${search}`]}>
      <DeskFilterBar view={view} />
    </MemoryRouter>,
  );
}

describe("DeskFilterBar", () => {
  it("People: search, Everyone / Following, Discipline and Near me", () => {
    const html = bar("people");
    expect(html).toContain('placeholder="Search people"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Everyone</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Following</);
    expect(html).toContain("Discipline");
    expect(html).toContain("Near me");
  });

  it("People, Following: no Near me, since the people you follow carry no location", () => {
    const html = bar("people", "&tab=following");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Following</);
    expect(html).not.toContain("Near me");
  });

  it("People: names the chosen Discipline", () => {
    expect(bar("people", "&interests=Music")).toContain("Music");
    expect(bar("people", "&interests=Music,Film")).toContain("2 filters");
  });

  it("Projects: the toggle and every stage chip, with the URL's stage on", () => {
    const html = bar("projects", "&stage=raising");
    for (const label of ["Passion", "Paid", "All", "Planning", "Raising", "Forming team", "Working", "Released"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toMatch(/aria-pressed="true"[^>]*>Raising</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Planning</);
  });

  it("Projects, Paid: paid work's own pills", () => {
    const html = bar("projects", "&tab=work&stage=gigs");
    expect(html).toContain('placeholder="Search paid work"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Shows</);
    expect(html).toContain(">Roles on projects<");
    expect(html).not.toContain(">Planning<");
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
    const kept = browseParamsOf(new URLSearchParams("view=projects&card=project:x&q=band&tab=work&stage=gigs&interests=Music"));
    expect(kept.toString()).toBe("q=band&tab=work&stage=gigs&interests=Music");
  });
});
