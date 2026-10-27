import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverFrame } from "./CoverFrame";

// A list crops to fill, like Instagram's grid; the 4:5 cover everywhere
// else (a project's page) shows the whole picture over its blur.
describe("CoverFrame", () => {
  it("crops a square (a list's picture) to fill it, edge to edge", () => {
    const html = renderToStaticMarkup(<CoverFrame src="/c.jpg" alt="" square />);
    expect(html).toContain("aspect-square");
    expect(html).toContain("object-cover");
    expect(html).not.toContain("object-contain");
    expect(html).not.toContain("blur-2xl");
  });

  it("shows the whole picture in the 4:5 cover", () => {
    const html = renderToStaticMarkup(<CoverFrame src="/c.jpg" alt="" />);
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("object-contain");
  });
});
