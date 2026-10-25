import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Palette } from "./Palette";
import { paletteCss } from "./PaletteParts";

// The signed-out palette: no queries behind it, so it renders on the server
// as the browser first draws it. Signed in differs only in its tools.
const html = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Palette isAuthenticated={false} profile={null} badgeCount={0} />
    </MemoryRouter>,
  );

const tools = (markup: string) => markup.match(/<div data-pal-hit[^>]*>/g) ?? [];

describe("the palette", () => {
  it("rests folded on every page: the tools stay hidden until a hover or the keyboard fans them out", () => {
    for (const url of ["/projects", "/today?view=projects&card=project:abc"]) {
      const markup = html(url);
      const wrappers = tools(markup);
      expect(wrappers.length).toBeGreaterThanOrEqual(4);
      for (const w of wrappers) {
        expect(w).toContain("opacity:0");
        expect(w).toContain("visibility:hidden");
      }
      expect(markup).toMatch(/<button [^>]*aria-label="Navigation"[^>]*aria-expanded="false"/);
    }
    // The 340px zone takes no pointer events until a hover arms it.
    expect(html("/projects")).toMatch(/width:340px;height:340px;pointer-events:none/);
  });

  it("starts without the newcomer's glow: it comes on after the page settles, until they open it once", () => {
    const markup = html("/projects");
    const main = markup.match(/<button [^>]*aria-label="Navigation"[^>]*>/)![0];
    expect(main).not.toContain("desk-pal-glow");
    expect(main).toMatch(/box-shadow:0 0 0 6px/);
  });

  it("names each tool beside its circle, the active one in the accent", () => {
    const markup = html("/projects");
    for (const name of ["People", "Projects", "Events", "Sign in"]) {
      expect(markup).toContain(`>${name}</span>`);
    }
    const projects = markup.match(/<button [^>]*aria-label="Projects".*?<\/button>/)![0];
    expect(projects).toContain("color:#FFE066");
    expect(projects).toContain("font-size:12px");
  });
});

describe("the palette's glow", () => {
  it("breathes, unless the visitor asked for less motion: then it holds still", () => {
    expect(paletteCss(false)).toMatch(/\.desk-pal-glow \{ animation: desk-pal-glow [^;]*infinite; \}/);
    expect(paletteCss(true)).toContain(".desk-pal-glow { animation: none; }");
  });
});
