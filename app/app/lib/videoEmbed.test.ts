import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "./videoEmbed";

const YT = "https://www.youtube.com/embed/dQw4w9WgXcQ";

describe("toEmbedUrl — YouTube", () => {
  it("converts watch?v=", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      embedUrl: YT,
    });
  });

  it("ignores extra query params on a watch URL", () => {
    expect(
      toEmbedUrl(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s&list=PLabc",
      ),
    ).toEqual({ kind: "youtube", embedUrl: YT });
  });

  it("converts youtu.be short links", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      embedUrl: YT,
    });
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=30")).toEqual({
      kind: "youtube",
      embedUrl: YT,
    });
  });

  it("converts /live/ links — the shape the organizer is nudged toward", () => {
    expect(toEmbedUrl("https://www.youtube.com/live/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      embedUrl: YT,
    });
  });

  it("normalizes a link that is already an embed URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      embedUrl: YT,
    });
    expect(
      toEmbedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    ).toEqual({
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
    });
  });

  it("normalizes an already-player URL", () => {
    expect(toEmbedUrl("https://player.vimeo.com/video/123456789")).toEqual({
      kind: "vimeo",
      embedUrl: "https://player.vimeo.com/video/123456789",
    });
  });

  it("rejects a non-numeric vimeo path", () => {
    expect(toEmbedUrl("https://vimeo.com/somechannel")).toBeNull();
    expect(
      toEmbedUrl("https://vimeo.com/channels/staffpicks/123456789"),
    ).toBeNull();
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
    const embed = toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(embed?.embedUrl).toMatch(
      /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]+$/,
    );
  });
});
