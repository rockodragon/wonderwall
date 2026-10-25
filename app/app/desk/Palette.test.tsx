import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { Palette } from "./Palette";

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
  it("rests open on a page: every tool on the arc, visible, the first one reachable by Tab", () => {
    const markup = html("/projects");
    const wrappers = tools(markup);
    expect(wrappers.length).toBeGreaterThanOrEqual(4);
    for (const w of wrappers) {
      expect(w).toContain("opacity:1");
      expect(w).toContain("visibility:visible");
      expect(w).toContain("pointer-events:auto");
    }
    expect(markup).toMatch(/<button [^>]*aria-label="People"[^>]*tabindex="0"/);
    expect(markup).toMatch(/<button [^>]*aria-label="Projects"[^>]*tabindex="-1"/);
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

  it("folds while a Canvas card is open, and the hover zone stays out of the way", () => {
    const markup = html("/today?view=projects&card=project:abc");
    for (const w of tools(markup)) {
      expect(w).toContain("opacity:0");
      expect(w).toContain("visibility:hidden");
    }
    expect(markup).not.toMatch(/tabindex="0"[^>]*aria-label="People"/);
    // The 340px zone takes no pointer events until a hover arms it.
    expect(html("/projects")).toMatch(/width:340px;height:340px;pointer-events:none/);
  });
});
