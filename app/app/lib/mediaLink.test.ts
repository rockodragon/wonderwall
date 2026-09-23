import { describe, expect, it } from "vitest";
import { describeMediaLink, MEDIA_LINK_PROBLEM } from "./mediaLink";

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
      hint: "TikTok video. It plays here on your page.",
    });
  });

  it("accepts a TikTok short link as typed, for the server to follow", () => {
    expect(describeMediaLink("https://vm.tiktok.com/ZMabcdef/")).toEqual({
      state: "ok",
      url: "https://vm.tiktok.com/ZMabcdef/",
      kind: "tiktok-short",
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
