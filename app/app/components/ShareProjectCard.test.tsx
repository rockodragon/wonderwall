import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ShareProjectCard } from "./ShareProjectCard";

const html = (tone: "desk" | "page") =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ShareProjectCard tone={tone} makingHref="/projects?new=project" finishedHref="/projects?new=project&stage=completed" className="mb-8" />
    </MemoryRouter>,
  );

describe("ShareProjectCard", () => {
  it("asks for a project with two ways in and no body text, nothing to close", () => {
    const markup = html("page");
    expect(markup).toContain('aria-label="Share a project"');
    expect(markup).toMatch(/<a [^>]*href="\/projects\?new=project"[^>]*>Something I&#x27;m making<\/a>/);
    expect(markup).toMatch(/<a [^>]*href="\/projects\?new=project&amp;stage=completed"[^>]*>Something I finished<\/a>/);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<p>");
    expect(markup).toContain("mb-8");
  });

  it("draws with the page's variables on a phone and the Canvas's tokens on a desktop", () => {
    expect(html("page")).toContain("var(--app-surface-raised)");
    expect(html("desk")).not.toContain("var(--app-");
  });
});
