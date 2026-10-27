// A short piece of plain text its owner edits in place: the text with a
// pencil, a box with Save and Cancel while editing. A project's description
// and a piece's description (PieceNote) both use it, so they look and behave
// the same. Everyone else sees the text, or nothing when there is none.

import { useState } from "react";
import { PencilIcon } from "./icons";
import { errorMessage } from "../lib/convexError";

/** The small pencil beside something its owner can change. */
export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-[rgba(198,198,190,0.15)] transition-colors"
      style={{ color: "var(--garden-dim)" }}
    >
      <PencilIcon size={13} />
    </button>
  );
}

export function InlineEditableText({
  value,
  isOwner,
  onSave,
  editLabel,
  emptyLabel,
  maxLength,
  className = "mb-6",
}: {
  value: string | undefined | null;
  isOwner: boolean;
  /** Saves the trimmed text; "" means clear it. */
  onSave: (text: string) => Promise<unknown>;
  /** The pencil's label, e.g. "Edit description". */
  editLabel: string;
  /** What the owner sees while there is no text. */
  emptyLabel: string;
  maxLength?: number;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "That didn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className={className}>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={maxLength}
          disabled={saving}
          className="w-full px-3 py-2 rounded-lg border text-base sm:text-sm outline-none resize-none leading-relaxed"
          style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
        />
        {error && (
          <p role="alert" className="mt-1 text-sm" style={{ color: "var(--garden-citron)" }}>
            {error}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[13.5px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[13.5px] hover:opacity-80"
            style={{ color: "var(--garden-body)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!value && !isOwner) return null;

  return (
    <div className={`flex items-start gap-1 ${className}`}>
      {/* pre-line: the blank lines between paragraphs show as written. */}
      <p
        className="text-sm leading-relaxed flex-1 whitespace-pre-line"
        style={{ color: value ? "var(--garden-body)" : "var(--garden-dim)" }}
      >
        {value || emptyLabel}
      </p>
      {isOwner && <EditButton onClick={open} label={editLabel} />}
    </div>
  );
}
