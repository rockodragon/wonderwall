import { describe, expect, it, vi } from "vitest";

// The module imports the hook's dependencies; only the pure functions are used here.
vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => async () => "",
  useAction: () => async () => ({}),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

import { MAX_DESCRIPTION_LENGTH } from "../../../convex/pieceNote";
import { draftIsEmpty, keepsOwnCover, readDraft, takesCover, updateArgs, type DraftState, type EditablePiece } from "./usePieceDraft";

const state = (over: Partial<DraftState> = {}): DraftState => ({
  writing: false,
  text: "",
  link: "",
  file: null,
  keptFile: null,
  title: "",
  description: "",
  cover: null,
  coverRemoved: false,
  note: null,
  noteRemoved: false,
  ...over,
});

const FILE = (kind: "image" | "video" | "audio") => ({ storageId: "_storage:f" as any, kind });
const ok = (s: DraftState) => {
  const r = readDraft(s);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("readDraft", () => {
  it("words alone make a text piece, trimmed, with no cover", () => {
    const r = ok(state({ writing: true, text: "  A poem.  ", title: " Dusk ", cover: "_storage:c" as any }));
    expect(r.mediaSent).toBe(false);
    expect(r.input).toMatchObject({ type: "text", content: "A poem.", title: "Dusk", coverStorageId: undefined });
  });

  it("a text piece with no words says to write something", () => {
    expect(readDraft(state({ writing: true, text: "   " }))).toEqual({ ok: false, error: "Write something to share." });
  });

  it("a new file sends its kind and storage id", () => {
    const r = ok(state({ file: FILE("video") }));
    expect(r).toMatchObject({ mediaSent: true, input: { type: "video", mediaStorageId: "_storage:f" } });
  });

  it("a kept file sends no media, only its kind", () => {
    const r = ok(state({ keptFile: { type: "audio" } }));
    expect(r.mediaSent).toBe(false);
    expect(r.input).toMatchObject({ type: "audio" });
    expect(r.input.mediaStorageId).toBeUndefined();
    expect(r.input.mediaUrl).toBeUndefined();
  });

  it.each([
    ["https://vimeo.com/76979871", "video"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "video"],
    ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc", "audio"],
    ["https://whatadall.bandcamp.com/album/christmas-dall-vol-1", "audio"],
    ["https://example.com/portfolio", "link"],
  ])("the link %s makes a %s piece", (link, type) => {
    const r = ok(state({ link }));
    expect(r.mediaSent).toBe(true);
    expect(r.input.type).toBe(type);
  });

  it("a Spotify link is sent in its canonical form", () => {
    const r = ok(state({ link: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc" }));
    expect(r.input.mediaUrl).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  });

  it("an empty link and nothing else asks for a file or a link", () => {
    expect(readDraft(state())).toEqual({ ok: false, error: "Upload a file or paste a link." });
    expect(readDraft(state({ link: "   " }))).toEqual({ ok: false, error: "Upload a file or paste a link." });
  });

  it("a link that isn't one we can show gives the problem", () => {
    const r = readDraft(state({ link: "javascript:alert(1)" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toBe("Upload a file or paste a link.");
  });

  it("a description over the cap is refused, at the cap it is kept", () => {
    const over = readDraft(state({ link: "https://example.com/a", description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) }));
    expect(over.ok).toBe(false);
    const at = ok(state({ link: "https://example.com/a", description: ` ${"x".repeat(MAX_DESCRIPTION_LENGTH)} ` }));
    expect(at.input.description).toHaveLength(MAX_DESCRIPTION_LENGTH);
  });

  it("a blank description and title are left out", () => {
    const r = ok(state({ link: "https://example.com/a", title: "  ", description: "  " }));
    expect(r.input.title).toBeUndefined();
    expect(r.input.description).toBeUndefined();
  });

  it("carries the voice note and a cover for a link", () => {
    const r = ok(state({ link: "https://vimeo.com/76979871", note: "_storage:n" as any, cover: "_storage:c" as any }));
    expect(r.input).toMatchObject({ audioNoteStorageId: "_storage:n", coverStorageId: "_storage:c" });
  });

  it("drops a cover picked for a picture", () => {
    expect(ok(state({ file: FILE("image"), cover: "_storage:c" as any })).input.coverStorageId).toBeUndefined();
  });
});

describe("takesCover", () => {
  it("is false for an image, a kept image, and text", () => {
    expect(takesCover(state({ file: FILE("image") }))).toBe(false);
    expect(takesCover(state({ keptFile: { type: "image" } }))).toBe(false);
    expect(takesCover(state({ writing: true, text: "hi" }))).toBe(false);
  });
  it("is true for a video or audio file, kept or new", () => {
    expect(takesCover(state({ file: FILE("video") }))).toBe(true);
    expect(takesCover(state({ file: FILE("audio") }))).toBe(true);
    expect(takesCover(state({ keptFile: { type: "video" } }))).toBe(true);
  });
  it("is true for a link that works, false for none or a bad one", () => {
    expect(takesCover(state({ link: "https://example.com/a" }))).toBe(true);
    expect(takesCover(state({ link: "https://vimeo.com/76979871" }))).toBe(true);
    expect(takesCover(state({ link: "" }))).toBe(false);
    expect(takesCover(state({ link: "javascript:alert(1)" }))).toBe(false);
  });
});

describe("draftIsEmpty", () => {
  it("is true with nothing given", () => {
    expect(draftIsEmpty(state())).toBe(true);
    expect(draftIsEmpty(state({ link: "  ", title: "A title", description: "words" }))).toBe(true);
    expect(draftIsEmpty(state({ writing: true, text: "  " }))).toBe(true);
  });
  it("is false with a file, a kept file, a link or words", () => {
    expect(draftIsEmpty(state({ file: FILE("image") }))).toBe(false);
    expect(draftIsEmpty(state({ keptFile: { type: "video" } }))).toBe(false);
    expect(draftIsEmpty(state({ link: "https://example.com" }))).toBe(false);
    expect(draftIsEmpty(state({ writing: true, text: "hi" }))).toBe(false);
  });
});

describe("updateArgs", () => {
  const piece: EditablePiece = { _id: "artifacts:p" as any, type: "video", mediaUrl: "https://vimeo.com/76979871" };
  const args = (s: DraftState) => updateArgs(piece, s, ok(s));

  it("sends the media when it changed", () => {
    expect(args(state({ link: "https://vimeo.com/111222333" }))).toMatchObject({
      artifactId: "artifacts:p",
      type: "video",
      mediaUrl: "https://vimeo.com/111222333",
    });
    expect(args(state({ file: FILE("audio") }))).toMatchObject({ type: "audio", mediaStorageId: "_storage:f" });
  });

  it("sends no media when a kept file stays", () => {
    const a = args(state({ keptFile: { type: "video" }, title: "T" }));
    expect(a.mediaUrl).toBeUndefined();
    expect(a.mediaStorageId).toBeUndefined();
    expect(a.type).toBe("video");
  });

  it("sends the description trimmed, and \"\" to clear it", () => {
    expect(args(state({ link: "https://example.com/a", description: "  hi " })).description).toBe("hi");
    expect(args(state({ link: "https://example.com/a", description: "  " })).description).toBe("");
  });

  it("sets clearAudioNote only when the note was removed with no new one", () => {
    const base = { link: "https://example.com/a" };
    expect(args(state({ ...base, noteRemoved: true })).clearAudioNote).toBe(true);
    expect(args(state({ ...base, noteRemoved: true, note: "_storage:n" as any }))).toMatchObject({
      clearAudioNote: undefined,
      audioNoteStorageId: "_storage:n",
    });
    expect(args(state(base)).clearAudioNote).toBeUndefined();
  });

  it("sets clearCover only when the cover was removed with no new one", () => {
    const base = { link: "https://example.com/a" };
    expect(args(state({ ...base, coverRemoved: true })).clearCover).toBe(true);
    expect(args(state({ ...base, coverRemoved: true, cover: "_storage:c" as any }))).toMatchObject({
      clearCover: undefined,
      coverStorageId: "_storage:c",
    });
    expect(args(state(base)).clearCover).toBeUndefined();
  });

  it("a cover removed from a piece that has become a picture is still cleared", () => {
    const s = state({ file: FILE("image"), coverRemoved: true });
    expect(args(s)).toMatchObject({ clearCover: true, coverStorageId: undefined });
  });
});

// The independent review, 2026-11-04: an edit that keeps the work must send
// it back as it is, and the form must show the cover the server will keep.
describe("an edit that keeps the piece's own link", () => {
  const OLD_IMAGE: EditablePiece = {
    _id: "artifacts:old" as any,
    type: "image",
    mediaUrl: "https://example.com/image.jpg",
    resolvedMediaUrl: "https://example.com/image.jpg",
  };

  it("keeps its type and sends no link, even one the link field wouldn't take as a picture", () => {
    const s = state({ link: OLD_IMAGE.mediaUrl!, title: "Renamed" });
    const r = readDraft(s, OLD_IMAGE);
    if (!r.ok) throw new Error(r.error);
    expect(r.mediaSent).toBe(false);
    expect(r.input.type).toBe("image");
    expect(updateArgs(OLD_IMAGE, s, r)).toMatchObject({ type: "image", mediaUrl: undefined, title: "Renamed" });
  });

  it("an old link the field would refuse can still have its title changed", () => {
    const odd = { ...OLD_IMAGE, type: "link", mediaUrl: "localhost:3000/demo" };
    const r = readDraft(state({ link: odd.mediaUrl, title: "Demo" }), odd);
    expect(r.ok).toBe(true);
  });

  it("a changed link is sent, with the kind it now is", () => {
    const s = state({ link: "https://youtu.be/jNQXAC9IVRw" });
    const r = readDraft(s, OLD_IMAGE);
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ mediaSent: true, input: { type: "video" } });
  });

  it("a new piece that starts on a link (a project's old link) always sends it", () => {
    const r = readDraft(state({ link: "https://youtu.be/jNQXAC9IVRw" }), { mediaUrl: "https://youtu.be/jNQXAC9IVRw" });
    expect(r).toMatchObject({ ok: true, mediaSent: true });
  });
});

describe("keepsOwnCover: the form shows the cover the server keeps", () => {
  const COVERED: EditablePiece = {
    _id: "artifacts:c" as any,
    type: "audio",
    mediaUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    coverStorageId: "_storage:cover" as any,
    ogImageUrl: "https://files.test/cover",
  };
  const UPLOADED: EditablePiece = { _id: "artifacts:u" as any, type: "video", mediaStorageId: "_storage:clip" as any, coverStorageId: "_storage:cover" as any, ogImageUrl: "https://files.test/cover" };

  it("while the work is the same", () => {
    expect(keepsOwnCover(COVERED, state({ link: COVERED.mediaUrl! }))).toBe(true);
    expect(keepsOwnCover(UPLOADED, state({ keptFile: { type: "video" } }))).toBe(true);
  });

  it("not once the link changes, a file replaces it, the file goes, or it becomes words", () => {
    expect(keepsOwnCover(COVERED, state({ link: "https://soundcloud.com/forss/flickermood" }))).toBe(false);
    expect(keepsOwnCover(COVERED, state({ file: FILE("audio") }))).toBe(false);
    expect(keepsOwnCover(UPLOADED, state({ keptFile: null }))).toBe(false);
    expect(keepsOwnCover(COVERED, state({ link: COVERED.mediaUrl!, writing: true, text: "x" }))).toBe(false);
  });

  it("not once it is taken off, and never for a piece with no cover", () => {
    expect(keepsOwnCover(COVERED, state({ link: COVERED.mediaUrl!, coverRemoved: true }))).toBe(false);
    expect(keepsOwnCover({ ...COVERED, coverStorageId: null }, state({ link: COVERED.mediaUrl! }))).toBe(false);
  });
});
