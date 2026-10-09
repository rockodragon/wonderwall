import { describe, expect, it } from "vitest";
import { gardenizeHtml, needsShareTags, shareDescription } from "./gardenHtml";

const PAGE = `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/><link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
<title>Sign In - TheCreative.exchange</title><meta name="description" content="Sign in to TheCreative.exchange to connect with creatives."/><meta property="og:title" content="Sign In - TheCreative.exchange"/><meta property="og:url" content="https://thecreative.exchange/login"/><meta property="og:image" content="https://thecreative.exchange/og-image.png"/><meta name="twitter:card" content="summary_large_image"/>
<link rel="stylesheet" href="/tokens.css"/></head><body><p>TheCreative.exchange</p></body></html>`;

const ORIGIN = "https://createthegarden.com";

describe("gardenizeHtml", () => {
  const out = gardenizeHtml(PAGE, ORIGIN);

  it("marks the page as The Garden's before anything runs", () => {
    expect(out).toContain('<html data-brand="garden" lang="en">');
  });

  it("names The Garden in the title and what a link preview reads", () => {
    expect(out).toContain("<title>Sign In - The Garden</title>");
    expect(out).toContain('<meta property="og:title" content="Sign In - The Garden"/>');
    expect(out).toContain('content="Sign in to The Garden to connect with creatives."');
  });

  it("keeps addresses as they are", () => {
    expect(out).toContain('content="https://thecreative.exchange/login"');
  });

  it("leaves the icon links to React and adds The Garden's manifest and color", () => {
    expect(out).toContain('href="/favicon.svg"');
    expect(out).toContain('href="/apple-touch-icon.png"');
    expect(out).toContain('<link rel="manifest" href="/brand/garden/site.webmanifest">');
    expect(out).toContain('<meta name="theme-color" content="#121212">');
    expect(out).toContain('href="/tokens.css"');
  });

  it("shares the disc, as a square card, in place of the site-wide picture", () => {
    expect(out).toContain('content="https://createthegarden.com/brand/garden/social-avatar-800.png"');
    expect(out).toContain('<meta name="twitter:card" content="summary"/>');
  });

  it("keeps an event's own cover", () => {
    const event = PAGE.replace("https://thecreative.exchange/og-image.png", "https://x.convex.cloud/api/storage/abc");
    const shared = gardenizeHtml(event, ORIGIN);
    expect(shared).toContain('content="https://x.convex.cloud/api/storage/abc"');
    expect(shared).toContain('content="summary_large_image"');
  });

  it("leaves the body to React", () => {
    expect(out).toContain("<body><p>TheCreative.exchange</p></body>");
  });

  it("is safe to run twice", () => {
    const twice = gardenizeHtml(out, ORIGIN);
    expect(twice.match(/data-brand/g)).toHaveLength(1);
    expect(twice.match(/rel="manifest"/g)).toHaveLength(1);
  });
});

// The SPA shell: "/" on a Garden domain, and every page not prerendered.
const SHELL = `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><link rel="icon" href="/favicon.svg"/></head><body><div id="root"></div></body></html>`;

describe("link previews for pages with none of their own", () => {
  it("knows the shell from a page that brings its own", () => {
    expect(needsShareTags(SHELL)).toBe(true);
    expect(needsShareTags(PAGE)).toBe(false);
    expect(needsShareTags("<p>no head</p>")).toBe(false);
  });

  it("gives the shell The Garden's name, disc, address and words", () => {
    const out = gardenizeHtml(SHELL, ORIGIN, { url: `${ORIGIN}/`, description: 'Grow "our" crafts & <faith>' });
    expect(out).toContain("<title>The Garden</title>");
    expect(out).toContain('<meta property="og:title" content="The Garden">');
    expect(out).toContain('<meta property="og:url" content="https://createthegarden.com/">');
    expect(out).toContain('<meta property="og:image" content="https://createthegarden.com/brand/garden/social-avatar-800.png">');
    expect(out).toContain('<meta name="twitter:card" content="summary">');
    expect(out).toContain('<meta property="og:description" content="Grow &quot;our&quot; crafts &amp; &lt;faith&gt;">');
    expect(out).toContain('<meta name="description" content="Grow &quot;our&quot; crafts &amp; &lt;faith&gt;">');
    expect(out).toContain('<body><div id="root"></div></body>');
  });

  it("goes without words when there are none", () => {
    const out = gardenizeHtml(SHELL, ORIGIN, { url: `${ORIGIN}/` });
    expect(out).toContain('<meta property="og:title" content="The Garden">');
    expect(out).not.toContain("description");
  });

  it("leaves a page's own preview alone, and adds nothing twice", () => {
    const own = gardenizeHtml(PAGE, ORIGIN, { url: `${ORIGIN}/login`, description: "x" });
    expect(own.match(/property="og:title"/g)).toHaveLength(1);
    expect(own).toContain('content="Sign In - The Garden"');
    const shell = gardenizeHtml(SHELL, ORIGIN, { url: `${ORIGIN}/`, description: "x" });
    const again = gardenizeHtml(shell, ORIGIN, { url: `${ORIGIN}/`, description: "x" });
    expect(again.match(/property="og:title"/g)).toHaveLength(1);
    expect(again.match(/<title>/g)).toHaveLength(1);
  });
});

describe("shareDescription", () => {
  it("takes the first paragraph of the host-tools description", () => {
    expect(
      shareDescription({
        description: "A community of Christian creatives.\n\n\nWe promote good work.",
        tagline: "To love our neighbor",
      }),
    ).toBe("A community of Christian creatives.");
  });

  it("falls back to the tagline, then nothing", () => {
    expect(shareDescription({ description: "  ", tagline: "To love our neighbor" })).toBe("To love our neighbor");
    expect(shareDescription({ description: null, tagline: null })).toBeUndefined();
    expect(shareDescription(null)).toBeUndefined();
  });

  it("keeps a long paragraph to preview length", () => {
    const out = shareDescription({ description: "word ".repeat(80) })!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
  });
});
