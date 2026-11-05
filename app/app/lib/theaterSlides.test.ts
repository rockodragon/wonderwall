import { describe, expect, it } from "vitest";
import {
  embedEnded,
  latestSlides,
  nextSpeed,
  orderSlides,
  pieceSlide,
  portfolioSlides,
  projectSlides,
  theaterEmbedUrl,
} from "./theaterSlides";
import { toEmbedUrl } from "./videoEmbed";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("pieceSlide", () => {
  it("plays a pasted video link before showing an uploaded cover", () => {
    const s = pieceSlide({ _id: "a", type: "image", file: "https://cdn/x.jpg", link: YT });
    expect(s).toMatchObject({ kind: "embed", embed: { kind: "youtube" } });
  });

  it("shows a picture, a video file, or else a cover", () => {
    expect(pieceSlide({ _id: "a", type: "image", file: "https://cdn/x.jpg" })).toMatchObject({ kind: "image", src: "https://cdn/x.jpg" });
    expect(pieceSlide({ _id: "b", type: "video", file: "https://cdn/x.mp4" })).toMatchObject({ kind: "video", src: "https://cdn/x.mp4" });
    expect(pieceSlide({ _id: "c", type: "link", link: "https://site.example", ogImageUrl: "https://og/c.png" })).toMatchObject({
      kind: "image",
      src: "https://og/c.png",
    });
  });

  it("leaves out what has nothing to look at, and placeholder titles", () => {
    expect(pieceSlide({ _id: "t", type: "text" })).toBeNull();
    expect(pieceSlide({ _id: "u", type: "image", file: "https://cdn/u.jpg", title: "Untitled image" })?.title).toBeNull();
  });
});

describe("portfolioSlides", () => {
  const projects = [
    { projectId: "p1", title: "Mural", kind: "passion", imageUrl: "https://cdn/mural.jpg", createdAt: 300 },
    { projectId: "p2", title: "Album", kind: "passion", imageUrl: "https://cdn/album-cover.jpg", createdAt: 200 },
    { projectId: "hire", title: "Need a drummer", kind: "paid", imageUrl: "https://cdn/hire.jpg", createdAt: 400 },
  ];

  it("is every piece, plus covers of projects with none, newest first", () => {
    const pieces = [
      { _id: "a1", type: "image", mediaUrl: "https://cdn/track.jpg", projectId: "p2", createdAt: 250 },
      { _id: "loose", type: "image", mediaUrl: "https://cdn/old.jpg", createdAt: 10 },
    ];
    const slides = portfolioSlides(pieces, projects);
    expect(slides.map((s) => s.key)).toEqual(["p1", "a1", "loose"]);
    // A piece takes its project's name when it has none, and links to it.
    expect(slides[1]).toMatchObject({ title: "Album", projectId: "p2" });
  });

  it("keeps out hire posts and pieces of projects the page doesn't list", () => {
    const pieces = [{ _id: "d", type: "image", mediaUrl: "https://cdn/draft.jpg", projectId: "draft", createdAt: 999 }];
    const keys = portfolioSlides(pieces, projects).map((s) => s.key);
    expect(keys).not.toContain("d");
    expect(keys).not.toContain("hire");
  });

  it("plays a project's pasted video when it has no piece", () => {
    const slides = portfolioSlides([], [{ projectId: "v", title: "Film", kind: "passion", mediaUrl: YT, imageUrl: "https://still" }]);
    expect(slides[0]).toMatchObject({ kind: "embed", projectId: "v" });
  });
});

describe("projectSlides", () => {
  it("is the photo, the link, then the pieces, each picture once", () => {
    const slides = projectSlides({
      _id: "p",
      title: "Mural",
      resolvedPhotoUrl: "https://cdn/mural.jpg",
      mediaUrl: YT,
      media: [
        { _id: "same", type: "image", resolvedMediaUrl: "https://cdn/mural.jpg" },
        { _id: "detail", type: "image", resolvedMediaUrl: "https://cdn/detail.jpg" },
      ],
    });
    expect(slides.map((s) => s.key)).toEqual(["p:photo", "p:link", "detail"]);
    expect(slides.every((s) => s.projectId === null)).toBe(true);
  });
});

describe("latestSlides", () => {
  it("is every project's work, newest project first, kept together, with who made it", () => {
    const slides = latestSlides([
      {
        _id: "old",
        title: "Mural",
        kind: "passion",
        createdAt: 1,
        resolvedPhotoUrl: "https://cdn/mural.jpg",
        creator: { _id: "pr-1", name: "Marta Reyes" },
      },
      {
        _id: "new",
        title: "Album",
        kind: "passion",
        createdAt: 2,
        resolvedPhotoUrl: "https://cdn/album.jpg",
        media: [{ _id: "track", type: "image", resolvedMediaUrl: "https://cdn/track.jpg" }],
        organization: { name: "The Grove", slug: "grove" },
        creator: { _id: "pr-2", name: "June Park" },
      },
      { _id: "job", title: "Need a drummer", kind: "paid", createdAt: 3, resolvedPhotoUrl: "https://cdn/job.jpg" },
    ]);
    expect(slides.map((s) => s.key)).toEqual(["new:photo", "track", "old:photo"]);
    expect(slides[0]).toMatchObject({ projectId: "new", by: "The Grove" });
    expect(slides[2]).toMatchObject({ projectId: "old", by: "Marta Reyes" });
  });
});

describe("order and speed", () => {
  it("reverses for oldest first", () => {
    const s = [
      { key: "old", at: 1, title: null, projectId: null, kind: "image" as const, src: "1" },
      { key: "new", at: 2, title: null, projectId: null, kind: "image" as const, src: "2" },
    ];
    expect(orderSlides(s, "newest").map((x) => x.key)).toEqual(["new", "old"]);
    expect(orderSlides(s, "oldest").map((x) => x.key)).toEqual(["old", "new"]);
  });

  it("steps through the speeds and stops at either end", () => {
    expect(nextSpeed(8, true)).toBe(5);
    expect(nextSpeed(8, false)).toBe(12);
    expect(nextSpeed(3, true)).toBe(3);
    expect(nextSpeed(20, false)).toBe(20);
  });
});

describe("players", () => {
  it("hears YouTube and Vimeo say they finished", () => {
    expect(embedEnded("youtube", JSON.stringify({ event: "onStateChange", info: 0 }))).toBe(true);
    expect(embedEnded("youtube", JSON.stringify({ event: "infoDelivery", info: { playerState: 0 } }))).toBe(true);
    expect(embedEnded("youtube", JSON.stringify({ event: "infoDelivery", info: { playerState: 1 } }))).toBe(false);
    expect(embedEnded("vimeo", '{"event":"ended"}')).toBe(true);
    expect(embedEnded("vimeo", "not json")).toBe(false);
  });

  it("asks YouTube to play and report, keeping the player's own address", () => {
    const url = new URL(theaterEmbedUrl(toEmbedUrl(YT)!, "https://thecreative.exchange"));
    expect(url.origin + url.pathname).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe("https://thecreative.exchange");
  });
});
