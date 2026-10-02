import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { DESK } from "../desk/tokens";
import { CreateCard } from "./CreateCard";

const noop = () => {};
const html = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe("CreateCard, page look (/projects and /events)", () => {
  const page = html(<CreateCard label="Host an event" onClick={noop} />);

  it("is a button with the dashed outline, the ring with its plus, and the verb", () => {
    expect(page).toMatch(/^<button type="button" class="group /);
    expect(page).toContain("border-2 border-dashed");
    expect(page).toContain('<path d="M12 5v14M5 12h14"></path>');
    expect(page).toContain(">Host an event</span>");
  });

  it("is on the garden tokens, as before: 16px corners, a row-high minimum, the citron hover", () => {
    expect(page).toContain("rounded-2xl");
    expect(page).toContain("min-h-[140px] sm:min-h-[220px]");
    expect(page).toContain("border-[color:var(--garden-hairline-raised)]");
    expect(page).toContain("hover:border-[color:var(--garden-citron)]");
    expect(page).toContain("text-[color:var(--garden-body)]");
    expect(page).toContain("font-family:var(--garden-font-body)");
    // It hides the outline and shows the border change instead, as it always has.
    expect(page).toContain("outline-none");
  });

  it("carries nothing of the desk's", () => {
    expect(page).not.toContain("--cc-");
    expect(page).not.toContain("style=\"--");
    expect(page).not.toContain("#FFE066");
  });

  it("is the same whether the look is named or left out", () => {
    expect(html(<CreateCard label="Host an event" look="page" onClick={noop} />)).toBe(page);
  });
});

describe("CreateCard, desk look", () => {
  const desk = html(<CreateCard look="desk" label="Start a project" to="/today?view=projects&create=project" />);

  it("is a link to the create flow, not a button", () => {
    expect(desk).toMatch(/^<a class="group /);
    expect(desk).toContain('href="/today?view=projects&amp;create=project"');
    expect(desk).not.toContain("<button");
  });

  it("is dashed with the plus and the verb, as the page's is", () => {
    expect(desk).toContain("border-2 border-dashed");
    expect(desk).toContain('<path d="M12 5v14M5 12h14"></path>');
    expect(desk).toContain(">Start a project</span>");
  });

  it("fills the cell it is put in (the grid's 3:4) and has the desk's 4px corners", () => {
    expect(desk).toContain("h-full w-full");
    expect(desk).toContain(" rounded ");
    expect(desk).not.toContain("min-h-");
    expect(desk).not.toContain("rounded-2xl");
  });

  it("takes its colours from the desk's tokens", () => {
    expect(desk).toContain(`--cc-line:${DESK.lineStrong}`);
    expect(desk).toContain(`--cc-mark:${DESK.muted}`);
    expect(desk).toContain(`--cc-text:${DESK.textSoft}`);
    expect(desk).toContain(`--cc-hi:${DESK.text}`);
    expect(desk).toContain(`--cc-accent:${DESK.accent}`);
    expect(desk).not.toContain("--garden-");
  });

  it("has the desk's 2px accent focus ring, like its other cards, and lights up on hover and focus", () => {
    expect(desk).toContain("focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFE066]");
    expect(desk).not.toContain("outline-none");
    expect(desk).toContain("hover:border-[color:var(--cc-accent)]");
    expect(desk).toContain("focus-visible:border-[color:var(--cc-accent)]");
    expect(desk).toContain("group-hover:text-[color:var(--cc-accent)]");
    expect(desk).toContain("group-focus-visible:text-[color:var(--cc-accent)]");
  });

  it("stops its colour changes for a visitor who asked for less motion", () => {
    expect(desk).toContain("motion-reduce:transition-none");
  });

  it("says the verb at 18px, in the desk's face, and never below the muted tone", () => {
    expect(desk).toContain("text-[18px]");
    expect(desk).toContain("font-family:Inter");
    expect(desk).not.toContain("opacity");
  });

  it("hides the ring from a screen reader, so the link reads as its verb", () => {
    expect(desk).toContain('aria-hidden="true"');
    expect(desk.replace(/<[^>]+>/g, "")).toBe("Start a project");
  });
});
