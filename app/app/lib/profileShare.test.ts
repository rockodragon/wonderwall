import { describe, expect, it } from "vitest";
import {
  BADGE_ALT,
  badgePath,
  badgeSnippet,
  displayLink,
  embedPath,
  embedSnippet,
  profileLink,
  recentWorks,
  shownImageUrl,
} from "./profileShare";

describe("profileLink", () => {
  it("is the one address, tagged with where it was put", () => {
    expect(profileLink("ana")).toBe("https://thecreative.exchange/@ana");
    expect(profileLink("ana", "ig")).toBe("https://thecreative.exchange/@ana?ref=ig");
    expect(profileLink("ana.reyes", "linktree")).toBe("https://thecreative.exchange/@ana.reyes?ref=linktree");
    expect(profileLink("ana", "qr")).toBe("https://thecreative.exchange/@ana?ref=qr");
  });

  it("reads without the scheme", () => {
    expect(displayLink(profileLink("ana", "site"))).toBe("thecreative.exchange/@ana?ref=site");
  });
});

describe("badgeSnippet", () => {
  it("is the badge picture, linking to the profile with ref=badge", () => {
    expect(badgeSnippet("ana", "dark")).toBe(
      '<a href="https://thecreative.exchange/@ana?ref=badge"><img src="https://thecreative.exchange/badge/dark.svg" ' +
        'alt="See my work on TheCreative.exchange" width="221" height="48"></a>',
    );
    expect(badgeSnippet("ana", "light")).toContain('src="https://thecreative.exchange/badge/light.svg"');
    expect(badgePath("light")).toBe("/badge/light.svg");
    expect(BADGE_ALT).toBe("See my work on TheCreative.exchange");
  });
});

describe("embedSnippet", () => {
  it("frames /embed/@handle, lazily, at the card's size", () => {
    expect(embedPath("ana")).toBe("/embed/@ana");
    expect(embedSnippet("ana", "Ana Reyes")).toBe(
      '<iframe src="https://thecreative.exchange/embed/@ana" width="400" height="440" ' +
        'style="border:0;max-width:100%" loading="lazy" title="Ana Reyes on TheCreative.exchange"></iframe>',
    );
  });

  it("escapes the name in the title, and uses the address when there's no name", () => {
    expect(embedSnippet("ana", `"Ana" <b>`)).toContain('title="&quot;Ana&quot; &lt;b&gt; on TheCreative.exchange"');
    expect(embedSnippet("ana", "  ")).toContain('title="@ana on TheCreative.exchange"');
  });
});

describe("shownImageUrl", () => {
  it("keeps https and our own paths", () => {
    expect(shownImageUrl("https://thecreative.exchange/media/abc12345")).toBe("https://thecreative.exchange/media/abc12345");
    expect(shownImageUrl("/campaign/dee.jpg")).toBe("/campaign/dee.jpg");
  });

  it("sends a Convex file address through /media", () => {
    expect(shownImageUrl("https://happy-otter-123.convex.cloud/api/storage/2f8a1c3e-7b4d")).toBe(
      "https://thecreative.exchange/media/2f8a1c3e-7b4d",
    );
  });

  it("drops anything else", () => {
    for (const url of ["http://plain.example/a.jpg", "//cdn.example/a.jpg", "data:image/png;base64,AAA", "javascript:alert(1)", "", "  ", null, undefined]) {
      expect(shownImageUrl(url), String(url)).toBeNull();
    }
  });
});

describe("recentWorks", () => {
  const projects = [
    { projectId: "p2", title: "Newer", imageUrl: "https://x.test/p2.jpg" },
    { projectId: "p1", title: "Untitled image", imageUrl: "https://x.test/p1.jpg" },
    { projectId: "p0", title: "No picture", imageUrl: null },
  ];
  const pieces = [
    { _id: "a1", type: "image", mediaUrl: "https://x.test/a1.jpg", createdAt: 1 },
    { _id: "a3", type: "link", mediaUrl: "https://site.example", ogImageUrl: "https://x.test/a3.jpg", createdAt: 3 },
    { _id: "a2", type: "image", projectId: "p1", mediaUrl: "https://x.test/a2.jpg", createdAt: 2 },
    { _id: "a4", type: "text", createdAt: 4 },
  ];

  it("is projects with a picture first, then loose pieces newest first", () => {
    expect(recentWorks(projects, pieces, 6)).toEqual([
      { imageUrl: "https://x.test/p2.jpg", title: "Newer", projectId: "p2" },
      { imageUrl: "https://x.test/p1.jpg", title: undefined, projectId: "p1" },
      { imageUrl: "https://x.test/a3.jpg", title: undefined },
      { imageUrl: "https://x.test/a1.jpg", title: undefined },
    ]);
  });

  it("stops at the limit, and is empty with nothing loaded", () => {
    expect(recentWorks(projects, pieces, 3)).toHaveLength(3);
    expect(recentWorks(undefined, null, 6)).toEqual([]);
    expect(recentWorks(projects, pieces, 0)).toEqual([]);
  });
});
