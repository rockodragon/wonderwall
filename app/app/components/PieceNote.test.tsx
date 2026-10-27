// What the maker says under a piece (PieceNote): the description and the
// voice note. Everyone sees what's there; only its maker gets the pencil
// and the recorder; a visitor sees nothing when there's nothing.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PieceNote, type PieceNoteFields } from "./PieceNote";

vi.mock("convex/react", () => ({ useMutation: () => async () => {} }));
// The recorder has its own tests; here it only says which note it was given.
vi.mock("./AudioNoteRecorder", () => ({
  AudioNoteRecorder: ({ url, onRemove }: { url?: string | null; onRemove?: unknown }) => (
    <div data-recorder={url ?? "none"} data-removable={onRemove ? "yes" : "no"} />
  ),
}));

const piece = (over: Partial<PieceNoteFields> = {}): PieceNoteFields => ({ _id: "artifacts:a" as never, ...over });
const draw = (p: PieceNoteFields, canEdit: boolean) => renderToStaticMarkup(<PieceNote piece={p} canEdit={canEdit} />);

describe("PieceNote, for a visitor", () => {
  it("shows the description and plays the voice note", () => {
    const html = draw(piece({ description: "Six mornings on the pier.", audioNoteUrl: "https://media.test/note" }), false);
    expect(html).toContain("Six mornings on the pier.");
    expect(html).toContain("Voice note");
    expect(html).toMatch(/<audio[^>]*src="https:\/\/media.test\/note"[^>]*controls/);
    expect(html).not.toContain("data-recorder");
    expect(html).not.toContain("Edit words about the piece");
  });

  it("draws nothing for a piece with neither", () => {
    expect(draw(piece(), false)).toBe("");
  });

  it("shows only the note when there are no words", () => {
    const html = draw(piece({ audioNoteUrl: "https://media.test/note" }), false);
    expect(html).toContain("<audio");
    expect(html).not.toContain("Add a few words");
  });
});

describe("PieceNote, for its maker", () => {
  it("offers words and a recording on a bare piece", () => {
    const html = draw(piece(), true);
    expect(html).toContain("Add a few words about it");
    expect(html).toContain('aria-label="Edit words about the piece"');
    expect(html).toContain('data-recorder="none"');
    expect(html).toContain('data-removable="yes"');
  });

  it("hands the saved note to the recorder, which plays it and offers Record again", () => {
    const html = draw(piece({ description: "Mine.", audioNoteUrl: "https://media.test/note" }), true);
    expect(html).toContain("Mine.");
    expect(html).toContain('data-recorder="https://media.test/note"');
  });
});
