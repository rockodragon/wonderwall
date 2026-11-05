// Adding a piece to a project, or changing one: the whole piece form
// (PieceFields) with its Save, Cancel and, for a piece already there,
// Remove. On a project's page and in Settings; the start form saves its
// first piece with the project instead (ProjectModal).

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage } from "../../lib/convexError";
import { PieceFields } from "./PieceFields";
import { updateArgs, usePieceDraft, type EditablePiece } from "./usePieceDraft";

const BUTTON = "min-h-11 px-5 rounded-lg text-[15px] font-medium disabled:opacity-50";

export type PieceEditorTarget =
  /** A new piece on this project. `link` starts it on a link: the project's
      own old link, which moves over to the piece when it is saved. */
  | { mode: "add"; projectId: Id<"projects">; link?: string }
  | { mode: "edit"; piece: EditablePiece };

export function PieceEditor({ target, onDone }: { target: PieceEditorTarget; onDone: () => void }) {
  const addToProject = useMutation(api.artifacts.addToProject);
  const update = useMutation(api.artifacts.update);
  const remove = useMutation(api.artifacts.remove);
  const draft = usePieceDraft(target.mode === "edit" ? target.piece : target.link ? { mediaUrl: target.link } : undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function save() {
    setError("");
    const read = draft.read();
    if (!read.ok) {
      setError(read.error);
      return;
    }
    setSaving(true);
    try {
      if (target.mode === "edit") await update(updateArgs(target.piece, draft.state, read));
      else await addToProject({ projectId: target.projectId, ...read.input, replacesProjectLink: !!target.link || undefined });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  async function removePiece() {
    if (target.mode !== "edit") return;
    setSaving(true);
    try {
      await remove({ artifactId: target.piece._id });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form
      className="rounded-2xl p-4 md:p-5 flex flex-col gap-6"
      style={{ backgroundColor: "var(--garden-ink-raised)", border: "1px solid var(--garden-hairline-raised)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving && !draft.busy) void save();
      }}
    >
      <PieceFields draft={draft} />
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--garden-error)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || draft.busy}
          className={BUTTON}
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {saving ? "Saving…" : target.mode === "edit" ? "Save" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className={`${BUTTON} border`}
          style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
        >
          Cancel
        </button>
        {target.mode === "edit" &&
          (confirmRemove ? (
            <span className="ml-auto flex items-center gap-3 text-[13.5px]" style={{ color: "var(--garden-body)" }}>
              Remove this piece?
              <button type="button" onClick={() => void removePiece()} disabled={saving} className="font-medium underline underline-offset-2" style={{ color: "var(--garden-error)" }}>
                Remove
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="underline underline-offset-2">
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={saving}
              className="ml-auto text-[13.5px] underline underline-offset-2"
              style={{ color: "var(--garden-dim)" }}
            >
              Remove piece
            </button>
          ))}
      </div>
    </form>
  );
}
