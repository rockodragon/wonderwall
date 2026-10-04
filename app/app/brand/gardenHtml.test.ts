import { describe, expect, it } from "vitest";
import { gardenizeHtml } from "./gardenHtml";

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

  it("leaves the icon links to React and adds The Garden's manifest, color and font", () => {
    expect(out).toContain('href="/favicon.svg"');
    expect(out).toContain('href="/apple-touch-icon.png"');
    expect(out).toContain('<link rel="manifest" href="/brand/garden/site.webmanifest">');
    expect(out).toContain('<meta name="theme-color" content="#121212">');
    expect(out).toContain("family=Jost:wght@500&amp;display=swap");
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
    expect(twice.match(/family=Jost/g)).toHaveLength(1);
    expect(twice.match(/rel="manifest"/g)).toHaveLength(1);
  });
});
