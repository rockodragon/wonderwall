import { describe, expect, it } from "vitest";
import { parseInstagramPreview, wantsPreviewFetch } from "./linkPreview";

const REEL = "https://www.instagram.com/reel/DdSHmHWSDFn/";

// The head of a reel page as Instagram serves it to a link crawler
// (checked 2026-09-23 with the Googlebot UA). A browser UA from a server
// gets the login shell instead, which carries none of these tags.
const CRAWLER_HEAD = `<!DOCTYPE html><html><head>
<meta property="og:site_name" content="Instagram" />
<meta property="og:title" content="AK, Sublab, Azaleh on Instagram: &quot;PRESENCE
A Creative Gathering for Worship and Reflection

Tickets at the link in bio&quot;" />
<meta property="og:image" content="https://scontent-ord5-1.cdninstagram.com/v/t51.82787-15/810148653_n.jpg?stp=dst-jpg&amp;_nc_ht=x&amp;oe=68D5B2C1" />
<meta property="og:description" content="63 likes, 4 comments - temple_sd" />
<meta property="og:url" content="${REEL}" />
</head><body></body></html>`;

describe("parseInstagramPreview", () => {
  it("reads the still and the caption's first line as the title", () => {
    expect(parseInstagramPreview(CRAWLER_HEAD, REEL)).toEqual({
      canonicalUrl: REEL,
      title: "PRESENCE",
      imageUrl:
        "https://scontent-ord5-1.cdninstagram.com/v/t51.82787-15/810148653_n.jpg?stp=dst-jpg&_nc_ht=x&oe=68D5B2C1",
    });
  });

  it("accepts content-before-property attribute order", () => {
    const html = `<meta content="https://scontent.cdninstagram.com/a.jpg" property="og:image">`;
    expect(parseInstagramPreview(html, REEL)?.imageUrl).toBe(
      "https://scontent.cdninstagram.com/a.jpg",
    );
  });

  it("clamps a long caption line and keeps a title without the Instagram wrapper", () => {
    const long = "x".repeat(200);
    const html = `<meta property="og:image" content="https://scontent.cdninstagram.com/a.jpg" /><meta property="og:title" content="${long}" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toHaveLength(120);
  });

  it("returns null for the login shell a browser UA gets, and for a non-https image", () => {
    expect(parseInstagramPreview("<html><head><title>Instagram</title></head></html>", REEL)).toBeNull();
    expect(
      parseInstagramPreview(`<meta property="og:image" content="javascript:alert(1)" />`, REEL),
    ).toBeNull();
  });
});

describe("wantsPreviewFetch", () => {
  it("is true only for the providers a server has to ask", () => {
    expect(wantsPreviewFetch(REEL)).toBe(true);
    expect(wantsPreviewFetch("https://www.tiktok.com/@scout2015/video/6718335390845095173")).toBe(true);
    expect(wantsPreviewFetch("https://vm.tiktok.com/ZMabcdef/")).toBe(true);
    // YouTube's still is derived client-side; Vimeo has none; other links
    // go through the plain og:image scrape, not this module.
    expect(wantsPreviewFetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(wantsPreviewFetch("https://vimeo.com/123456789")).toBe(false);
    expect(wantsPreviewFetch("https://example.com/page")).toBe(false);
    expect(wantsPreviewFetch(undefined)).toBe(false);
  });
});
