// SupportButtons: the heart and the dollar on a project. On a page of posts
// each one needs the project in its accessible name, or a screen reader hears
// "Cheer, Cheer, Cheer". No `name` leaves the buttons exactly as they were.

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SupportButtons } from "./ProjectSupport";

// Backing is off by default (FF_BACKING); these are drawn with it open.
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  FF_BACKING: true,
}));

// React marks the seams between text pieces and the icons are long paths;
// neither is what these tests are about.
const markup = (el: React.ReactElement) =>
  renderToString(el).replace(/<!-- -->/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>");

describe("SupportButtons with a name", () => {
  it("puts the project in both buttons' names and tooltips", () => {
    const html = markup(<SupportButtons raising count={3} onSupport={() => {}} name="Songs of Safety" />);
    expect(html).toContain('aria-label="Cheer Songs of Safety" title="Cheer Songs of Safety"');
    expect(html).toContain('aria-label="Back Songs of Safety" title="Back Songs of Safety"');
    expect(html).not.toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
  });

  it("names the Cheer button alone when the project isn't raising", () => {
    const html = markup(<SupportButtons raising={false} onSupport={() => {}} name="Songs of Safety" />);
    expect(html).toContain('aria-label="Cheer Songs of Safety"');
    expect(html).not.toContain("Back");
  });
});

describe("SupportButtons with no name", () => {
  // The markup as it was before `name` existed, icons stood in for.
  const was = (box: string, heart: string, count: string) =>
    `<div class="flex items-center gap-1 shrink-0"><button type="button" aria-label="Cheer" title="Cheer" class="${box} inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-80" style="color:${heart}"><svg/></button>${count}<button type="button" aria-label="Back this" title="Back this" class="${box} inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-90" style="background-color:var(--garden-citron);color:var(--garden-ink)"><svg/></button></div>`;
  const small = '<span class="text-[13.5px] tabular-nums pr-1" style="color:var(--garden-muted);font-family:var(--garden-font-mono)">3<span class="sr-only"> supporters</span></span>';
  const post = '<span class="text-[15px] font-semibold tabular-nums pr-2" style="color:var(--app-text)">3<span class="sr-only"> supporters</span></span>';

  it("is byte for byte what it was, at every size", () => {
    const draw = (size?: "sm" | "md" | "post") => markup(<SupportButtons raising count={3} onSupport={() => {}} size={size} />);
    expect(draw("sm")).toBe(was("w-9 h-9", "var(--garden-paper)", small));
    expect(draw("md")).toBe(was("w-10 h-10", "var(--garden-paper)", small));
    expect(draw()).toBe(was("w-10 h-10", "var(--garden-paper)", small));
    expect(draw("post")).toBe(was("w-11 h-11", "var(--app-text)", post));
  });

  it("is the lone Cheer button when nothing is being raised", () => {
    expect(markup(<SupportButtons raising={false} onSupport={() => {}} />)).toBe(
      '<div class="flex items-center gap-1 shrink-0"><button type="button" aria-label="Cheer" title="Cheer" class="w-10 h-10 inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-80" style="color:var(--garden-paper)"><svg/></button></div>',
    );
  });
});
