// The one picture for a project on a card (convex/coverRules.ts), read by
// the server's cards and the app's coverOf alike.

import { describe, expect, it } from "vitest";
import { linkStill, pieceStill } from "./coverRules";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const YT_STILL = "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg";

describe("linkStill", () => {
  it("is the fetched still, else a YouTube link's own, else nothing", () => {
    expect(linkStill({ mediaPreviewUrl: "https://files.test/reel", mediaUrl: YT })).toBe("https://files.test/reel");
    expect(linkStill({ mediaUrl: YT })).toBe(YT_STILL);
    expect(linkStill({ mediaUrl: "https://vimeo.com/123456789" })).toBeNull();
    expect(linkStill({})).toBeNull();
  });
});

describe("pieceStill", () => {
  it("is the piece's still, then the image itself, then its YouTube video's", () => {
    expect(pieceStill({ type: "video", mediaUrl: YT, ogImageUrl: "https://files.test/cover" }, null)).toBe("https://files.test/cover");
    expect(pieceStill({ type: "image" }, "https://files.test/photo")).toBe("https://files.test/photo");
    expect(pieceStill({ type: "video", mediaUrl: YT }, null)).toBe(YT_STILL);
    expect(pieceStill({ type: "link", mediaUrl: YT }, null)).toBe(YT_STILL);
  });

  it("is nothing for a piece with no picture", () => {
    expect(pieceStill({ type: "audio", mediaUrl: "https://bandcamp.com/EmbeddedPlayer/album=1/" }, null)).toBeNull();
    expect(pieceStill({ type: "link", mediaUrl: "https://example.com" }, null)).toBeNull();
    // A non-image piece's file is never its picture.
    expect(pieceStill({ type: "audio" }, "https://files.test/song.mp3")).toBeNull();
  });
});
