import { describe, expect, it } from "vitest";
import { describeMediaLink, MEDIA_LINK_PROBLEM, PIECE_LINK_PROBLEM } from "./mediaLink";

describe("describeMediaLink", () => {
  it("reads a blank or whitespace field as empty, not invalid", () => {
    expect(describeMediaLink("")).toEqual({ state: "empty" });
    expect(describeMediaLink("   ")).toEqual({ state: "empty" });
  });

  it("canonicalises a reel with a share token and calls it a video", () => {
    expect(
      describeMediaLink("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=MzRlODBiNWFlZA=="),
    ).toEqual({
      state: "ok",
      url: "https://www.instagram.com/reel/C1a2B3c4D5e/",
      kind: "instagram",
      pieceType: "video",
      hint: "Instagram video. It plays here on your page.",
    });
  });

  it("calls a /p/ permalink a post, since it may be a photo", () => {
    const link = describeMediaLink("instagram.com/p/C1a2B3c4D5e");
    expect(link).toMatchObject({
      state: "ok",
      url: "https://www.instagram.com/p/C1a2B3c4D5e/",
      hint: "Instagram post. It shows here on your page.",
    });
  });

  it("treats /tv/ like a reel", () => {
    expect(describeMediaLink("https://www.instagram.com/tv/C1a2B3c4D5e/")).toMatchObject({
      state: "ok",
      hint: "Instagram video. It plays here on your page.",
    });
  });

  it("names the provider for YouTube, Vimeo and TikTok", () => {
    expect(describeMediaLink("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      state: "ok",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      kind: "youtube",
      hint: "YouTube video. It plays here on your page.",
    });
    expect(describeMediaLink("vimeo.com/123456789")).toMatchObject({
      state: "ok",
      url: "https://vimeo.com/123456789",
      kind: "vimeo",
      hint: "Vimeo video. It plays here on your page.",
    });
    expect(
      describeMediaLink("https://www.tiktok.com/@scout2015/video/6718335390845095173"),
    ).toMatchObject({
      state: "ok",
      kind: "tiktok",
      pieceType: "video",
      hint: "TikTok video. It plays here on your page.",
    });
  });

  it("accepts a TikTok short link as typed, for the server to follow", () => {
    expect(describeMediaLink("https://vm.tiktok.com/ZMabcdef/")).toEqual({
      state: "ok",
      url: "https://vm.tiktok.com/ZMabcdef/",
      kind: "tiktok-short",
      pieceType: "video",
      hint: "TikTok video. It plays here on your page.",
    });
    expect(describeMediaLink("vm.tiktok.com/ZMabcdef/")).toMatchObject({
      state: "ok",
      url: "https://vm.tiktok.com/ZMabcdef/",
      kind: "tiktok-short",
    });
  });

  it("refuses a host it cannot show, with the one shared message", () => {
    expect(describeMediaLink("example.com")).toEqual({
      state: "invalid",
      message: MEDIA_LINK_PROBLEM,
    });
    expect(describeMediaLink("https://zoom.us/j/123456789")).toMatchObject({ state: "invalid" });
  });

  it("refuses a non-http scheme rather than prefixing https:// to it", () => {
    expect(describeMediaLink("javascript:alert(1)")).toMatchObject({ state: "invalid" });
  });
});

// A piece takes any link (Rick, 2026-11-04): a video, a song, an audio file,
// or a page. An event's or a job's link field still takes a video only.
describe("describeMediaLink for a piece", () => {
  const SPOTIFY = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";

  it("calls a Spotify or SoundCloud link a song that plays here, share tokens gone", () => {
    expect(describeMediaLink(`${SPOTIFY}?si=abc`, "piece")).toEqual({
      state: "ok",
      url: SPOTIFY,
      kind: "spotify",
      pieceType: "audio",
      hint: "Spotify track. It plays here on your page.",
    });
    expect(describeMediaLink("soundcloud.com/whatadall/sets/christmas", "piece")).toMatchObject({
      kind: "soundcloud",
      pieceType: "audio",
      hint: "SoundCloud playlist. It plays here on your page.",
    });
  });

  it("takes a Bandcamp album page as typed, for the server to read its player", () => {
    expect(describeMediaLink("https://whatadall.bandcamp.com/album/christmas-dall-vol-1", "piece")).toMatchObject({
      state: "ok",
      url: "https://whatadall.bandcamp.com/album/christmas-dall-vol-1",
      kind: "bandcamp",
      pieceType: "audio",
      hint: "Bandcamp album. It plays here on your page.",
    });
  });

  it("plays an audio file's link, and shows any other page as a card", () => {
    expect(describeMediaLink("https://files.example/mix.mp3", "piece")).toMatchObject({ kind: "audio-file", pieceType: "audio" });
    expect(describeMediaLink("www.abidingpractice.com/work", "piece")).toMatchObject({
      state: "ok",
      url: "https://www.abidingpractice.com/work",
      kind: "page",
      pieceType: "link",
      hint: "A link to abidingpractice.com. It shows as a card.",
    });
  });

  it("still plays a video as a video", () => {
    expect(describeMediaLink("https://youtu.be/jNQXAC9IVRw", "piece")).toMatchObject({ kind: "youtube", pieceType: "video" });
  });

  it("refuses what isn't a link, with the piece's own words", () => {
    for (const bad of ["javascript:alert(1)", "hello", "ftp://files.example/x"]) {
      expect(describeMediaLink(bad, "piece")).toEqual({ state: "invalid", message: PIECE_LINK_PROBLEM });
    }
  });

  it("leaves a video field as it was: a song or a page is not a video", () => {
    expect(describeMediaLink(SPOTIFY)).toEqual({ state: "invalid", message: MEDIA_LINK_PROBLEM });
    expect(describeMediaLink("https://example.com/page")).toEqual({ state: "invalid", message: MEDIA_LINK_PROBLEM });
  });
});
