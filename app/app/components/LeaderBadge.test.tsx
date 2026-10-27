import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeaderBadge } from "./LeaderBadge";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) => markup.replace(/<[^>]+>/g, "");

describe("LeaderBadge", () => {
  it("says community leader as real text, in small block letters", () => {
    const markup = html(<LeaderBadge />);
    // The words are in the page's text (a screen reader reads them); the
    // capitals are the style's, not the string's.
    expect(text(markup)).toBe("community leader");
    expect(markup).toMatch(/<span class="[^"]*\buppercase\b[^"]*">community leader<\/span>/);
    expect(markup).toContain("font-semibold");
    expect(markup).toContain("tracking-[0.06em]");
    expect(markup).toContain("text-[11px]");
  });

  it("draws the sprout as decoration: hidden from a screen reader, with no label of its own", () => {
    const markup = html(<LeaderBadge />);
    expect(markup).toMatch(/^<span [^>]*><svg [^>]*aria-hidden="true"/);
    expect(markup).not.toContain("aria-label");
    expect(markup).not.toContain("role=");
    expect(markup).not.toContain("title=");
    // Phosphor's Plant is the sprout: a stem with leaves, filled.
    expect(markup).toContain('fill="currentColor"');
  });

  it("is crimson, a darker one on light and a lighter one on dark (dark is the default)", () => {
    const markup = html(<LeaderBadge />);
    expect(markup).toContain("text-[#be123c]");
    expect(markup).toContain("dark:text-[#fb7185]");
  });

  it("wraps with the line it sits in rather than running off a phone's edge", () => {
    expect(html(<LeaderBadge />)).toContain("max-w-full");
  });

  it("takes a class from the page it sits on", () => {
    expect(html(<LeaderBadge className="mt-1" />)).toContain("mt-1");
  });
});

describe("LeaderBadge compact", () => {
  const markup = html(<LeaderBadge compact />);

  it("is the sprout alone, with the words as its label and its tooltip", () => {
    expect(text(markup)).toBe("");
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Community leader"');
    expect(markup).toContain('title="Community leader"');
    expect(markup).toMatch(/<svg [^>]*aria-hidden="true"/);
  });

  it("is the same crimson, and never shrinks away beside a long name", () => {
    expect(markup).toContain("text-[#be123c]");
    expect(markup).toContain("dark:text-[#fb7185]");
    expect(markup).toContain("shrink-0");
  });
});

describe("LeaderBadge on the desk's dark cards", () => {
  const markup = html(<LeaderBadge surface="dark" />);

  it("keeps the light crimson in either theme, on a near-black chip, at the desk's 12px", () => {
    expect(markup).toContain("text-[#fb7185]");
    expect(markup).not.toContain("dark:");
    expect(markup).not.toContain("text-[#be123c]");
    expect(markup).toContain("bg-[rgba(12,12,12,0.9)]");
    expect(markup).toContain("text-xs");
    expect(markup).not.toContain("text-[11px]");
  });
});

// WCAG contrast, so a colour change that stops being readable fails here.
const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` over `bg`, as a hex colour. */
const over = (fg: string, bg: string, alpha: number) =>
  "#" +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");

// The surfaces are the app's own (public/tokens.css), read from it so that
// moving one of them moves the check too.
const tokens = readFileSync(join(__dirname, "../../public/tokens.css"), "utf8");
// The first block is dark (the default) and holds the palette; the second is
// what data-theme="light" swaps in.
const [rootTokens, lightTokens] = tokens.split(':root[data-theme="light"]');
const token = (css: string, name: string) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))![1];

describe("LeaderBadge colours read at 4.5:1 or better on the surfaces they sit on", () => {
  const markup = html(<LeaderBadge />);
  const onLight = markup.match(/\btext-\[(#[0-9a-f]{6})\]/)![1];
  const onDark = markup.match(/dark:text-\[(#[0-9a-f]{6})\]/)![1];

  it.each([
    ["the page", "#ffffff"],
    ["the paper page", token(rootTokens, "--garden-paper")],
    ["a raised card", token(lightTokens, "--app-surface-raised")],
  ])("light theme, on %s", (_, surface) => {
    expect(contrast(onLight, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["the html background (gray-950)", "#030712"],
    ["the page", token(rootTokens, "--garden-ink")],
    ["a raised card", token(rootTokens, "--app-surface-raised")],
  ])("dark theme, on %s", (_, surface) => {
    expect(contrast(onDark, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("the desk's chip, even over a white photo", () => {
    const chip = over("#0c0c0c", "#ffffff", 0.9);
    expect(contrast(onDark, chip)).toBeGreaterThanOrEqual(4.5);
  });
});
