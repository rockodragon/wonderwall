import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { canonicalMediaUrl, parseInstagramPreview, wantsPreviewFetch } from "./linkPreview";

const REEL = "https://www.instagram.com/reel/DdSHmHWSDFn/";
const IMAGE = `<meta property="og:image" content="https://scontent.cdninstagram.com/a.jpg" />`;

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

  it("clamps a long caption line", () => {
    const long = "x".repeat(200);
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram: &quot;${long}&quot;" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toHaveLength(120);
  });

  it("keeps an apostrophe in the title and in the image URL", () => {
    const html = `<meta property="og:title" content="Jane on Instagram: &quot;Don't miss Friday's show&quot;" />
<meta property="og:image" content="https://scontent.cdninstagram.com/v/it's.jpg?oe=1" />`;
    expect(parseInstagramPreview(html, REEL)).toEqual({
      canonicalUrl: REEL,
      title: "Don't miss Friday's show",
      imageUrl: "https://scontent.cdninstagram.com/v/it's.jpg?oe=1",
    });
  });

  it("skips a caption's leading blank lines", () => {
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram: &quot;

Second line is the first with words&quot;" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toBe("Second line is the first with words");
  });

  it("gives no title for a captionless post, so 'Jane on Instagram' never names a work", () => {
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toBeUndefined();
    // …nor does an og:title that isn't Instagram's shape at all.
    expect(
      parseInstagramPreview(`${IMAGE}<meta property="og:title" content="Instagram" />`, REEL)?.title,
    ).toBeUndefined();
  });

  it("decodes entities once: a caption that spelled out &quot; keeps it", () => {
    const html = `${IMAGE}<meta property="og:title" content="Jane on Instagram: &quot;She said &amp;quot;hi&amp;quot; &amp; left&quot;" />`;
    expect(parseInstagramPreview(html, REEL)?.title).toBe("She said &quot;hi&quot; & left");
  });

  it("returns null for the login shell a browser UA gets, and for a non-https image", () => {
    expect(parseInstagramPreview("<html><head><title>Instagram</title></head></html>", REEL)).toBeNull();
    expect(
      parseInstagramPreview(`<meta property="og:image" content="javascript:alert(1)" />`, REEL),
    ).toBeNull();
  });
});

describe("canonicalMediaUrl", () => {
  it("treats blank as no link", () => {
    expect(canonicalMediaUrl(undefined)).toBeUndefined();
    expect(canonicalMediaUrl("")).toBeUndefined();
    expect(canonicalMediaUrl("   ")).toBeUndefined();
  });

  it("gives a bare host its scheme and keeps an ordinary page as typed", () => {
    expect(canonicalMediaUrl("vimeo.com/123456789")).toBe("https://vimeo.com/123456789");
    expect(canonicalMediaUrl("https://example.com/flyer")).toBe("https://example.com/flyer");
  });

  it("refuses a link that is not a web address, with a reason the client can show", () => {
    let thrown: unknown;
    try {
      canonicalMediaUrl("javascript:alert(1)");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ConvexError);
    expect((thrown as ConvexError<{ code: string }>).data.code).toBe("invalid_media_url");
  });

  it("stores a pasted reel in its canonical form, share token dropped", () => {
    expect(
      canonicalMediaUrl("https://www.instagram.com/reel/DdSHmHWSDFn/?stkn=bG0xZ2VsM2dmMDM0"),
    ).toBe(REEL);
  });

  it("keeps a TikTok short link as pasted — the server resolves it when it fetches the still", () => {
    expect(canonicalMediaUrl("https://vm.tiktok.com/ZMabcdef/")).toBe("https://vm.tiktok.com/ZMabcdef/");
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
