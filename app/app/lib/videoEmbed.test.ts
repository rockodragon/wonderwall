import { describe, expect, it } from "vitest";
import { isTikTokShortLink, toEmbedUrl } from "./videoEmbed";

const YT = "https://www.youtube.com/embed/dQw4w9WgXcQ";
const YT_WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT_THUMB = "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg";

describe("toEmbedUrl — YouTube", () => {
  it("converts watch?v=, and knows its shape, canonical link and still", () => {
    expect(toEmbedUrl(YT_WATCH)).toEqual({
      kind: "youtube",
      embedUrl: YT,
      aspect: "16/9",
      canonicalUrl: YT_WATCH,
      thumbnailUrl: YT_THUMB,
    });
  });

  it("ignores extra query params on a watch URL", () => {
    expect(
      toEmbedUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s&list=PLabc",
      ),
    ).toMatchObject({ kind: "youtube", embedUrl: YT, canonicalUrl: YT_WATCH });
  });

  it("converts youtu.be short links", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube",
      embedUrl: YT,
    });
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=30")).toMatchObject({
      kind: "youtube",
      embedUrl: YT,
    });
  });

  it("converts /live/ links — the shape the organizer is nudged toward", () => {
    expect(toEmbedUrl("https://www.youtube.com/live/dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube",
      embedUrl: YT,
    });
  });

  it("converts a Short, and knows it is portrait", () => {
    expect(toEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toEqual({
      kind: "youtube",
      embedUrl: YT,
      aspect: "9/16",
      canonicalUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      thumbnailUrl: YT_THUMB,
    });
  });

  it("normalizes a link that is already an embed URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube",
      embedUrl: YT,
    });
    expect(
      toEmbedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ).toMatchObject({
      kind: "youtube",
      embedUrl: YT,
    });
  });

  it("accepts the bare and mobile hosts", () => {
    expect(
      toEmbedUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl,
    ).toBe(YT);
    expect(
      toEmbedUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl,
    ).toBe(YT);
  });

  it("has no id on a channel or bare host URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/@somechannel")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/watch")).toBeNull();
  });
});

describe("toEmbedUrl — Vimeo", () => {
  it("converts vimeo.com/{id}", () => {
    expect(toEmbedUrl("https://vimeo.com/123456789")).toEqual({
      kind: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
      aspect: "16/9",
      canonicalUrl: "https://vimeo.com/123456789",
    });
  });

  it("normalizes an already-player URL", () => {
    expect(toEmbedUrl("https://player.vimeo.com/video/123456789")).toMatchObject({
      kind: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
      canonicalUrl: "https://vimeo.com/123456789",
    });
  });

  it("rejects a non-numeric vimeo path", () => {
    expect(toEmbedUrl("https://vimeo.com/somechannel")).toBeNull();
    expect(
      toEmbedUrl("https://vimeo.com/channels/staffpicks/123456789"),
    ).toBeNull();
  });
});

describe("toEmbedUrl — Instagram", () => {
  const REEL = "https://www.instagram.com/reel/DdSHmHWSDFn/";
  const REEL_EMBED = "https://www.instagram.com/reel/DdSHmHWSDFn/embed/captioned/";

  it("converts a reel link with its share token, and knows it is portrait", () => {
    expect(
      toEmbedUrl("https://www.instagram.com/reel/DdSHmHWSDFn/?stkn=bG0xZ2VsM2dmMDM0"),
    ).toEqual({
      kind: "instagram",
      embedUrl: REEL_EMBED,
      aspect: "9/16",
      canonicalUrl: REEL,
    });
  });

  it("converts the username-prefixed form the app's Share sheet hands out", () => {
    expect(
      toEmbedUrl("https://www.instagram.com/somecreative/reel/DdSHmHWSDFn/?igsh=abc123"),
    ).toMatchObject({ kind: "instagram", embedUrl: REEL_EMBED, canonicalUrl: REEL });
  });

  it("converts posts, IGTV and the /reels/ spelling", () => {
    expect(toEmbedUrl("https://www.instagram.com/p/DdSHmHWSDFn/")).toMatchObject({
      kind: "instagram",
      embedUrl: "https://www.instagram.com/p/DdSHmHWSDFn/embed/captioned/",
      canonicalUrl: "https://www.instagram.com/p/DdSHmHWSDFn/",
    });
    expect(toEmbedUrl("https://www.instagram.com/tv/DdSHmHWSDFn/")?.canonicalUrl).toBe(
      "https://www.instagram.com/tv/DdSHmHWSDFn/",
    );
    expect(toEmbedUrl("https://instagram.com/reels/DdSHmHWSDFn")?.canonicalUrl).toBe(REEL);
  });

  it("accepts the bare and mobile hosts", () => {
    expect(toEmbedUrl("https://instagram.com/reel/DdSHmHWSDFn/")?.embedUrl).toBe(REEL_EMBED);
    expect(toEmbedUrl("https://m.instagram.com/reel/DdSHmHWSDFn/")?.embedUrl).toBe(REEL_EMBED);
  });

  it("has no still of its own — the card falls back to ogImageUrl or a tile", () => {
    expect(toEmbedUrl(REEL)?.thumbnailUrl).toBeUndefined();
  });

  it("leaves profiles, stories and explore pages alone", () => {
    expect(toEmbedUrl("https://www.instagram.com/somecreative/")).toBeNull();
    expect(toEmbedUrl("https://www.instagram.com/stories/somecreative/3141592653/")).toBeNull();
    expect(toEmbedUrl("https://www.instagram.com/explore/")).toBeNull();
    expect(toEmbedUrl("https://www.instagram.com/")).toBeNull();
  });

  it("rejects a code carrying characters that could break out of the URL", () => {
    expect(toEmbedUrl('https://www.instagram.com/reel/DdSH"onload="x/')).toBeNull();
    expect(toEmbedUrl("https://www.instagram.com/reel/../../evil/")).toBeNull();
    expect(toEmbedUrl("https://www.instagram.com/reel/abc/")).toBeNull();
  });

  it("does not accept a lookalike host", () => {
    expect(toEmbedUrl("https://instagram.com.evil.example/reel/DdSHmHWSDFn/")).toBeNull();
    expect(toEmbedUrl("https://notinstagram.com/reel/DdSHmHWSDFn/")).toBeNull();
  });
});

describe("toEmbedUrl — TikTok", () => {
  const PLAYER = "https://www.tiktok.com/player/v1/6718335390845095173";
  const PERMALINK = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

  it("converts a permalink with its tracking params, and knows it is portrait", () => {
    expect(toEmbedUrl(`${PERMALINK}?_r=1&_t=8abcDEF&is_from_webapp=1`)).toEqual({
      kind: "tiktok",
      embedUrl: PLAYER,
      aspect: "9/16",
      canonicalUrl: PERMALINK,
    });
  });

  it("normalizes a link that is already a player or embed URL", () => {
    expect(toEmbedUrl(PLAYER)).toMatchObject({ kind: "tiktok", embedUrl: PLAYER, canonicalUrl: PLAYER });
    expect(
      toEmbedUrl("https://www.tiktok.com/embed/v2/6718335390845095173"),
    ).toMatchObject({ kind: "tiktok", embedUrl: PLAYER });
  });

  it("accepts the bare and mobile hosts", () => {
    expect(toEmbedUrl("https://tiktok.com/@scout2015/video/6718335390845095173")?.embedUrl).toBe(PLAYER);
    expect(toEmbedUrl("https://m.tiktok.com/@scout2015/video/6718335390845095173")?.embedUrl).toBe(PLAYER);
  });

  it("drops a username that fails the character class rather than storing it", () => {
    expect(
      toEmbedUrl("https://www.tiktok.com/@bad%20user/video/6718335390845095173")?.canonicalUrl,
    ).toBe(PLAYER);
  });

  it("leaves profiles and photo carousels alone", () => {
    expect(toEmbedUrl("https://www.tiktok.com/@scout2015")).toBeNull();
    expect(toEmbedUrl("https://www.tiktok.com/@scout2015/photo/6718335390845095173")).toBeNull();
    expect(toEmbedUrl("https://www.tiktok.com/")).toBeNull();
  });

  it("rejects a non-numeric or short id", () => {
    expect(toEmbedUrl("https://www.tiktok.com/@scout2015/video/abc")).toBeNull();
    expect(toEmbedUrl("https://www.tiktok.com/@scout2015/video/12345")).toBeNull();
    expect(toEmbedUrl("https://www.tiktok.com/@scout2015/video/6718335390845095173'")).toBeNull();
  });

  it("does not resolve a short link on its own — the server follows it", () => {
    expect(toEmbedUrl("https://vm.tiktok.com/ZMabcdef/")).toBeNull();
  });
});

describe("isTikTokShortLink", () => {
  it("recognises the app's Copy-link shapes", () => {
    expect(isTikTokShortLink("https://vm.tiktok.com/ZMabcdef/")).toBe(true);
    expect(isTikTokShortLink("https://vt.tiktok.com/ZSabcdef/")).toBe(true);
    expect(isTikTokShortLink("https://www.tiktok.com/t/ZTabcdef/")).toBe(true);
  });

  it("is false for a permalink, another host, or a bad scheme", () => {
    expect(isTikTokShortLink("https://www.tiktok.com/@scout2015/video/6718335390845095173")).toBe(false);
    expect(isTikTokShortLink("https://vm.tiktok.com.evil.example/ZMabcdef/")).toBe(false);
    expect(isTikTokShortLink("javascript:alert(1)")).toBe(false);
    expect(isTikTokShortLink(undefined)).toBe(false);
  });
});

describe("toEmbedUrl — everything else keeps the link-out button", () => {
  it.each([
    "https://zoom.us/j/98765432101?pwd=abcdef",
    "https://us02web.zoom.us/j/98765432101",
    "https://meet.google.com/abc-defg-hij",
    "https://example.daily.co/the-room",
    "https://example.com/some/video",
    "https://twitch.tv/somestreamer",
  ])("returns null for %s", (url) => {
    expect(toEmbedUrl(url)).toBeNull();
  });

  it("returns null for empty, blank and undefined input", () => {
    expect(toEmbedUrl(undefined)).toBeNull();
    expect(toEmbedUrl("")).toBeNull();
    expect(toEmbedUrl("   ")).toBeNull();
  });

  it("returns null for something that isn't a URL at all", () => {
    expect(toEmbedUrl("not a url")).toBeNull();
    expect(toEmbedUrl("youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("toEmbedUrl — hostile input", () => {
  it("rejects non-http(s) schemes even when they parse cleanly", () => {
    expect(toEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(
      toEmbedUrl("javascript:window.open('https://youtu.be/dQw4w9WgXcQ')"),
    ).toBeNull();
    expect(toEmbedUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(toEmbedUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects an id carrying characters that could break out of the URL", () => {
    expect(
      toEmbedUrl('https://www.youtube.com/watch?v=abc"onload="alert(1)'),
    ).toBeNull();
    expect(toEmbedUrl("https://youtu.be/abc'def'ghi")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/watch?v=../../evil")).toBeNull();
    expect(
      toEmbedUrl("https://www.youtube.com/watch?v=abc%20def%20ghi"),
    ).toBeNull();
    expect(toEmbedUrl("https://vimeo.com/123456789'")).toBeNull();
  });

  it("does not accept a lookalike host", () => {
    expect(
      toEmbedUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(toEmbedUrl("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toEmbedUrl("https://evil.example/vimeo.com/123456789")).toBeNull();
  });

  it("never returns an embed URL containing anything but id characters", () => {
    expect(toEmbedUrl(YT_WATCH)?.embedUrl).toMatch(
      /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]+$/,
    );
    expect(toEmbedUrl("https://www.instagram.com/reel/DdSHmHWSDFn/?stkn=x")?.embedUrl).toMatch(
      /^https:\/\/www\.instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+\/embed\/captioned\/$/,
    );
    expect(
      toEmbedUrl("https://www.tiktok.com/@scout2015/video/6718335390845095173?_r=1")?.embedUrl,
    ).toMatch(/^https:\/\/www\.tiktok\.com\/player\/v1\/[0-9]+$/);
  });
});
