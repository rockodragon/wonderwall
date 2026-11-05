import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PieceMedia, pieceDisplay } from "./PieceMedia";

const SPOTIFY = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC";
const BANDCAMP_PAGE = "https://whatadall.bandcamp.com/album/christmas-dall-vol-1";
const BANDCAMP_PLAYER = "https://bandcamp.com/EmbeddedPlayer/album=3356185885/";

describe("pieceDisplay", () => {
  it("a YouTube link plays in its embed, whatever the type", () => {
    const d = pieceDisplay({ type: "video", mediaUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(d.kind).toBe("video-embed");
    expect(pieceDisplay({ type: "link", mediaUrl: "https://vimeo.com/76979871" }).kind).toBe("video-embed");
  });

  it("a Spotify link on a piece filed as a link plays as music", () => {
    const d = pieceDisplay({ type: "link", mediaUrl: SPOTIFY });
    expect(d.kind).toBe("music");
    if (d.kind === "music") expect(d.music.kind).toBe("spotify");
  });

  it("a Bandcamp player link plays as music", () => {
    expect(pieceDisplay({ type: "audio", mediaUrl: BANDCAMP_PLAYER }).kind).toBe("music");
  });

  it("an uploaded video, audio file and picture each show as themselves", () => {
    expect(pieceDisplay({ type: "video", mediaStorageId: "s", resolvedMediaUrl: "https://files.test/v" })).toEqual({
      kind: "video",
      src: "https://files.test/v",
    });
    expect(pieceDisplay({ type: "audio", mediaStorageId: "s", resolvedMediaUrl: "https://files.test/a" })).toEqual({
      kind: "audio",
      src: "https://files.test/a",
    });
    expect(pieceDisplay({ type: "image", mediaStorageId: "s", resolvedMediaUrl: "https://files.test/i" })).toEqual({
      kind: "image",
      src: "https://files.test/i",
    });
  });

  it("a link to an audio file plays as audio", () => {
    const url = "https://example.com/song.mp3";
    expect(pieceDisplay({ type: "audio", mediaUrl: url, resolvedMediaUrl: url })).toEqual({ kind: "audio", src: url });
  });

  it("an audio piece whose link is a Bandcamp album page is a link card, never audio", () => {
    const d = pieceDisplay({ type: "audio", mediaUrl: BANDCAMP_PAGE, resolvedMediaUrl: BANDCAMP_PAGE, ogImageUrl: "https://i.test/a.jpg" });
    expect(d).toEqual({ kind: "link", href: BANDCAMP_PAGE, host: "whatadall.bandcamp.com", image: "https://i.test/a.jpg" });
  });

  it("an audio piece whose link is any other page is a link card", () => {
    const url = "https://example.com/my-song";
    expect(pieceDisplay({ type: "audio", mediaUrl: url, resolvedMediaUrl: url }).kind).toBe("link");
  });

  it("a text piece shows its words", () => {
    expect(pieceDisplay({ type: "text", content: "A poem." })).toEqual({ kind: "text", text: "A poem." });
  });

  it("a plain link is a card with its host and still", () => {
    expect(pieceDisplay({ type: "link", mediaUrl: "https://example.com/work", ogImageUrl: null })).toEqual({
      kind: "link",
      href: "https://example.com/work",
      host: "example.com",
      image: null,
    });
  });

  it("a javascript: link shows nothing", () => {
    expect(pieceDisplay({ type: "link", mediaUrl: "javascript:alert(1)" })).toEqual({ kind: "none" });
    expect(pieceDisplay({ type: "image", resolvedMediaUrl: "javascript:alert(1)" })).toEqual({ kind: "none" });
  });

  it("a piece with nothing shows nothing", () => {
    expect(pieceDisplay({ type: "video" })).toEqual({ kind: "none" });
    expect(pieceDisplay({ type: "text", content: "" })).toEqual({ kind: "none" });
  });
});

describe("PieceMedia", () => {
  const video = { type: "video", mediaStorageId: "s", resolvedMediaUrl: "https://files.test/v.mp4" };

  it("an unframed video is a video with controls", () => {
    const html = renderToStaticMarkup(<PieceMedia piece={video} framed={false} />);
    expect(html).toContain('<video controls=""');
    expect(html).toContain('src="https://files.test/v.mp4"');
  });

  it("a framed video has controls too", () => {
    expect(renderToStaticMarkup(<PieceMedia piece={video} />)).toContain('<video controls=""');
  });

  it("a Bandcamp page draws a link, not an audio player", () => {
    const html = renderToStaticMarkup(
      <PieceMedia piece={{ type: "audio", mediaUrl: BANDCAMP_PAGE, resolvedMediaUrl: BANDCAMP_PAGE }} />,
    );
    expect(html).not.toContain("<audio");
    expect(html).toContain(`href="${BANDCAMP_PAGE}"`);
  });

  it("a piece with nothing draws nothing", () => {
    expect(renderToStaticMarkup(<PieceMedia piece={{ type: "video" }} />)).toBe("");
  });
});
