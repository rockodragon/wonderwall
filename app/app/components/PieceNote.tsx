// What the maker says about a piece, under the work: a short description
// and a voice note they recorded (artifacts.description, audioNoteStorageId).
// Its maker edits both in place; everyone else sees what's there, or nothing.
// The project page (AttachedPieces) and the old work page both draw this.

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_DESCRIPTION_LENGTH } from "../../convex/pieceNote";
import { AudioNoteRecorder } from "./AudioNoteRecorder";
import { InlineEditableText } from "./InlineEditableText";

export type PieceNoteFields = {
  _id: Id<"artifacts">;
  description?: string | null;
  audioNoteUrl?: string | null;
};

export function PieceNote({ piece, canEdit }: { piece: PieceNoteFields; canEdit: boolean }) {
  const setDescription = useMutation(api.artifacts.setDescription);
  const setAudioNote = useMutation(api.artifacts.setAudioNote);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  if (!canEdit && !piece.description && !piece.audioNoteUrl) return null;

  return (
    <div className="flex flex-col gap-3">
      <InlineEditableText
        value={piece.description}
        isOwner={canEdit}
        onSave={(description) => setDescription({ artifactId: piece._id, description })}
        editLabel="Edit words about the piece"
        emptyLabel="Add a few words about it"
        maxLength={MAX_DESCRIPTION_LENGTH}
        className=""
      />
      {canEdit ? (
        <AudioNoteRecorder
          url={piece.audioNoteUrl}
          generateUploadUrl={generateUploadUrl}
          onRecorded={(storageId) => setAudioNote({ artifactId: piece._id, storageId })}
          onRemove={() => setAudioNote({ artifactId: piece._id })}
        />
      ) : (
        piece.audioNoteUrl && (
          <div>
            <p className="mb-1.5 text-[13px]" style={{ color: "var(--garden-muted)" }}>
              Voice note
            </p>
            <audio src={piece.audioNoteUrl} controls preload="none" className="w-full" />
          </div>
        )
      )}
    </div>
  );
}
