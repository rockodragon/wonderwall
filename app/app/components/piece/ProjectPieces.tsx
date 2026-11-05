// A project's work, at the top of its page: each piece playing, what its
// maker says about it under it, and for the maker an Edit that opens the
// piece editor in its place. The project's owner gets "Add a piece".
//
// A project shared from a profile and one started from the start form show
// their work the same way now (Rick, 2026-11-04). Before, a shared piece
// played under About and a started project's one link played up here. A
// project started before its link was a piece still has that link on the
// project row; it shows here as its first piece, and editing it makes it
// one (artifacts.addToProject, replacesProjectLink).

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage } from "../../lib/convexError";
import { PieceNote } from "../PieceNote";
import { PieceEditor } from "./PieceEditor";
import { PieceMedia } from "./PieceMedia";
import type { EditablePiece } from "./usePieceDraft";

type ProjectWithPieces = {
  _id: Id<"projects">;
  kind: string;
  title: string;
  blurb?: string | null;
  mediaUrl?: string | null;
  mediaPreviewUrl?: string | null;
  resolvedPhotoUrl?: string | null;
  media?: (EditablePiece & { profileId: string })[];
};

const editButton = "self-start text-[13.5px] font-medium underline underline-offset-2 hover:opacity-80";
const editStyle = { color: "var(--garden-citron)" };

/** A piece the page already shows: the hero's photo, or the blurb. */
export function shownAbove(
  piece: { type: string; resolvedMediaUrl?: string | null; content?: string | null },
  project: { resolvedPhotoUrl?: string | null; blurb?: string | null },
): boolean {
  if (piece.type === "image" && piece.resolvedMediaUrl && piece.resolvedMediaUrl === project.resolvedPhotoUrl) return true;
  return piece.type === "text" && (piece.content ?? "").trim() === (project.blurb ?? "").trim();
}

export function ProjectPieces({
  project,
  isOwner,
  myProfileId,
  adding,
  onAdding,
}: {
  project: ProjectWithPieces;
  isOwner: boolean;
  myProfileId?: string;
  /** The add form is open (the just-published card opens it too). */
  adding: boolean;
  onAdding: (open: boolean) => void;
}) {
  const updateProject = useMutation(api.garden.projects.updateProject);
  // The piece being edited: its id, or "link" for the project's own link.
  const [editing, setEditing] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const pieces = project.media ?? [];
  const oldLink = project.kind === "passion" && project.mediaUrl ? project.mediaUrl : null;

  if (!oldLink && pieces.length === 0 && !isOwner) return null;

  async function removeOldLink() {
    setLinkError("");
    try {
      await updateProject({ projectId: project._id, mediaUrl: "" });
    } catch (err) {
      setLinkError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-6 mb-6">
      {oldLink &&
        (editing === "link" ? (
          <PieceEditor target={{ mode: "add", projectId: project._id, link: oldLink }} onDone={() => setEditing(null)} />
        ) : (
          <div className="flex flex-col gap-3">
            <PieceMedia
              piece={{ type: "video", mediaUrl: oldLink, ogImageUrl: project.mediaPreviewUrl }}
              title={project.title}
            />
            {isOwner && (
              <div className="flex gap-4">
                <button type="button" className={editButton} style={editStyle} onClick={() => setEditing("link")}>
                  Edit
                </button>
                <button type="button" className={editButton} style={{ color: "var(--garden-dim)" }} onClick={() => void removeOldLink()}>
                  Remove
                </button>
                {linkError && (
                  <span role="alert" className="text-[13.5px]" style={{ color: "var(--garden-error)" }}>
                    {linkError}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

      {pieces.map((piece) =>
        editing === piece._id ? (
          <PieceEditor key={piece._id} target={{ mode: "edit", piece }} onDone={() => setEditing(null)} />
        ) : (
          <div key={piece._id} className="flex flex-col gap-3">
            {!shownAbove(piece, project) && <PieceMedia piece={piece} title={project.title} />}
            <PieceNote piece={piece} canEdit={false} />
            {/* Its maker edits it, as the server checks (artifacts.update). */}
            {!!myProfileId && piece.profileId === myProfileId && (
              <button type="button" className={editButton} style={editStyle} onClick={() => setEditing(piece._id)}>
                Edit piece
              </button>
            )}
          </div>
        ),
      )}

      {isOwner &&
        (adding ? (
          <PieceEditor target={{ mode: "add", projectId: project._id }} onDone={() => onAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => onAdding(true)}
            className="self-start min-h-11 px-4 rounded-lg border text-[15px]"
            style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          >
            + Add a piece
          </button>
        ))}
    </div>
  );
}
