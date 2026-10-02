import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { NOW, event, follow, on, project, sampleShortlist, shortlist } from "../../lib/shortlist/fixtures";
import { summary } from "../../lib/shortlist/model";
import type { ShortlistData } from "../../lib/shortlist/types";
import { TilePreview, type TileVariant } from "./TilePreview";

const tile = (data: ShortlistData, area: "projects" | "events" | "people", variant: TileVariant = "desk") =>
  renderToString(<TilePreview area={area} summary={summary(data, NOW)} variant={variant} />);

/** The text of the tile, tags gone. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const SAMPLE = sampleShortlist();

describe("a Projects or Events tile", () => {
  it("names three, each with what it is to you, then 'and N more →'", () => {
    expect(text(tile(SAMPLE, "projects"))).toBe(
      "Hollow Creek Field Recordings · Invited Psalms Zine, Vol. 3 · Saved Photographer for the Advent Catalog · Leading and 12 more →",
    );
    expect(text(tile(SAMPLE, "events"))).toBe(
      "Open Studio Night · Going · Tomorrow 7PM Printmaking Workshop · Going · Thu 6PM Zine Workshop · Hosting · Oct 15 6PM and 7 more →",
    );
  });

  it("is three lines and the 'more' line, no more", () => {
    // Each line has its note; the tile adds one line for "and N more".
    expect(tile(SAMPLE, "projects").match(/title="/g)).toHaveLength(3);
    expect(tile(SAMPLE, "projects")).toContain("and 12 more →");
  });

  it("says no 'and more' when everything is named", () => {
    const three = shortlist({ projects: [project("leading", "A"), project("team", "B"), project("saved", "C")] });
    expect(text(tile(three, "projects"))).toBe("A · Leading B · On the team C · Saved");
    expect(tile(three, "projects")).not.toContain("more");
  });

  it("gives a long name an ellipsis and keeps the note whole, with the full line as a tooltip", () => {
    const html = tile(shortlist({ events: [event("going", "A Very Long Evening of Songs and Stories for Everyone", on(10, 3, 19))] }), "events");
    expect(html).toMatch(/text-overflow:ellipsis[^>]*>A Very Long Evening/);
    expect(html).toContain('title="A Very Long Evening of Songs and Stories for Everyone · Going · Tomorrow 7PM"');
    expect(html).toMatch(/flex:none[^>]*>· Going · Tomorrow 7PM</);
  });
});

describe("a People tile", () => {
  const people = shortlist({
    people: [
      { ...follow("Kofi Mensah", [], on(9, 30)), imageUrl: "https://img/kofi.jpg" },
      follow("Grace Mun", [], on(9, 28)),
      { ...follow("Mara Lin", [], on(9, 10)), imageUrl: "https://img/mara.jpg" },
      follow("Jo Alvarez", [], on(9, 2)),
      follow("Esther Park", [], on(8, 18)),
      follow("Sam Ito", [], on(7, 12)),
      follow("Ana Reyes", [], on(6, 3)),
    ],
  });

  it("shows the photos of the five followed most recently, and initials where there's none", () => {
    const html = tile(people, "people");
    expect(html).toContain('src="https://img/kofi.jpg"');
    expect(html).toContain('src="https://img/mara.jpg"');
    expect((html.match(/<img /g) ?? []).length).toBe(2);
    // Grace, Jo and Esther have no photo; Sam and Ana are past five.
    for (const initials of ["GM", "JA", "EP"]) expect(html).toContain(initials);
    for (const left of ["SI", "AR"]) expect(html).not.toContain(left);
  });

  it("names three by first name, then how many more", () => {
    expect(text(tile(people, "people"))).toContain("Kofi, Grace, Mara and 4 more");
  });

  it("keeps the faces for the eye alone: the names say who", () => {
    expect(tile(people, "people")).toMatch(/<span aria-hidden="true"/);
  });

  it("falls back to initials in the sample, which has no photos", () => {
    expect(text(tile(SAMPLE, "people"))).toBe("KM GM ML JA EP Kofi, Grace, Mara and 11 more");
  });
});

describe("the desk's and the phone's", () => {
  it("say the same words", () => {
    for (const area of ["projects", "events", "people"] as const) {
      expect(text(tile(SAMPLE, area, "phone"))).toBe(text(tile(SAMPLE, area, "desk")));
    }
  });

  it("are drawn in their own colors: the desk's dark palette, the phone's app tokens", () => {
    expect(tile(SAMPLE, "projects", "desk")).not.toContain("var(--app-");
    expect(tile(SAMPLE, "projects", "phone")).toContain("var(--app-text-muted)");
    expect(tile(SAMPLE, "people", "phone")).toContain("var(--app-hairline-raised)");
    expect(tile(SAMPLE, "people", "desk")).toContain("#EDE3B4");
  });
});
