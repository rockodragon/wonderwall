import { describe, expect, it } from "vitest";
import { justPublished, needsPictureOrLink } from "./justPublished";

describe("justPublished", () => {
  it("adds ?new=1, or &new=1 after an existing query", () => {
    expect(justPublished("/events/abc")).toBe("/events/abc?new=1");
    expect(justPublished("/projects/p1?tab=team")).toBe("/projects/p1?tab=team&new=1");
  });
});

describe("needsPictureOrLink", () => {
  const bare = { kind: "passion", thumb: null, mediaEmbed: null, hasPieces: false };
  it("asks a passion project with nothing to look at, at any stage", () => {
    expect(needsPictureOrLink(bare)).toBe(true);
    expect(needsPictureOrLink({ ...bare, thumb: undefined })).toBe(true);
  });
  it("stops once there is a picture, a link that plays, or an attached piece", () => {
    expect(needsPictureOrLink({ ...bare, thumb: "https://x.test/a.jpg" })).toBe(false);
    expect(needsPictureOrLink({ ...bare, mediaEmbed: { src: "https://www.youtube.com/embed/x" } })).toBe(false);
    expect(needsPictureOrLink({ ...bare, hasPieces: true })).toBe(false);
  });
  it("leaves a paid post alone", () => {
    expect(needsPictureOrLink({ ...bare, kind: "paid" })).toBe(false);
  });
});
