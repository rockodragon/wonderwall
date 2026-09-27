import { describe, expect, it } from "vitest";
import { parseOgMeta, resolveAgainst } from "./ogParse";

describe("parseOgMeta", () => {
  it("reads og:title, og:description and og:image", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Abiding Practice"/>
        <meta property="og:description" content="A ministry of contemplative art."/>
        <meta property="og:image" content="http://static1.squarespace.com/logo.jpg?format=1500w"/>
      </head></html>
    `;
    const result = parseOgMeta(html, "https://www.abidingpractice.com/");
    expect(result.title).toBe("Abiding Practice");
    expect(result.description).toBe("A ministry of contemplative art.");
    expect(result.imageUrl).toBe("http://static1.squarespace.com/logo.jpg?format=1500w");
  });

  it("falls back to <title> when there is no og:title", () => {
    const html = `<html><head><title>Plain Old Site</title></head></html>`;
    expect(parseOgMeta(html, "https://example.com").title).toBe("Plain Old Site");
  });

  it("falls back og:image -> og:image:secure_url ordering (secure wins)", () => {
    const html = `
      <meta property="og:image" content="http://example.com/plain.jpg"/>
      <meta property="og:image:secure_url" content="https://example.com/secure.jpg"/>
    `;
    expect(parseOgMeta(html, "https://example.com").imageUrl).toBe(
      "https://example.com/secure.jpg",
    );
  });

  it("falls back to twitter:image when there is no og:image", () => {
    const html = `<meta name="twitter:image" content="https://example.com/tw.jpg"/>`;
    expect(parseOgMeta(html, "https://example.com").imageUrl).toBe(
      "https://example.com/tw.jpg",
    );
  });

  it("falls back to a large apple-touch-icon when there is no og/twitter image", () => {
    const html = `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`;
    expect(parseOgMeta(html, "https://example.com").imageUrl).toBe(
      "https://example.com/apple-touch-icon.png",
    );
  });

  it("resolves a root-relative og:image against the final (post-redirect) URL", () => {
    const html = `<meta property="og:image" content="/static/cover.jpg"/>`;
    expect(parseOgMeta(html, "https://www.example.com/some/page").imageUrl).toBe(
      "https://www.example.com/static/cover.jpg",
    );
  });

  it("resolves a protocol-relative og:image", () => {
    const html = `<meta property="og:image" content="//cdn.example.com/cover.jpg"/>`;
    expect(parseOgMeta(html, "https://example.com").imageUrl).toBe(
      "https://cdn.example.com/cover.jpg",
    );
  });

  it("handles single-quoted attributes and content-before-property ordering", () => {
    const html = `<meta content='Single Quoted Title' property='og:title'>`;
    expect(parseOgMeta(html, "https://example.com").title).toBe("Single Quoted Title");
  });

  it("decodes HTML entities in title/description", () => {
    const html = `<meta property="og:title" content="Rock &amp; Roll &quot;Live&quot;"/>`;
    expect(parseOgMeta(html, "https://example.com").title).toBe('Rock & Roll "Live"');
  });

  it("returns nothing usable for a page with no relevant tags", () => {
    const result = parseOgMeta("<html><head></head><body>hi</body></html>", "https://example.com");
    expect(result.imageUrl).toBeUndefined();
    expect(result.description).toBeUndefined();
  });

  it("never resolves a javascript: or data: image reference", () => {
    const html = `<meta property="og:image" content="javascript:alert(1)"/>`;
    expect(parseOgMeta(html, "https://example.com").imageUrl).toBeUndefined();
  });
});

describe("resolveAgainst", () => {
  it("passes through an already-absolute https URL", () => {
    expect(resolveAgainst("https://a.test/x.jpg", "https://b.test")).toBe("https://a.test/x.jpg");
  });

  it("returns undefined for undefined input", () => {
    expect(resolveAgainst(undefined, "https://example.com")).toBeUndefined();
  });

  it("returns undefined for an unparseable reference", () => {
    expect(resolveAgainst("http://[::1", "https://example.com")).toBeUndefined();
  });
});
