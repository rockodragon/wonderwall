// A piece being made or changed: what the form holds, and what it becomes
// when saved. One hook behind every form that saves a piece — the start
// form's "Show it" (ProjectModal), "Add a piece" and Edit on a project's
// page (PieceEditor), and Edit in Settings — so a piece is the same thing
// whichever door it came in by (convex/pieces.ts is the server's half).

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MAX_DESCRIPTION_LENGTH } from "../../../convex/pieceNote";
import type { PieceInput } from "../../../convex/pieces";
import { describeMediaLink } from "../../lib/mediaLink";
import { uploadToStorage } from "../../lib/uploadFile";
import { useCoverPick, type CoverPick } from "../../lib/useCoverPick";
import { useFileUpload, type FileUpload, type UploadKind } from "../../lib/useFileUpload";

/** A piece as the page has it, to edit. */
export type EditablePiece = {
  _id: Id<"artifacts">;
  type: string;
  title?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  mediaStorageId?: Id<"_storage"> | null;
  resolvedMediaUrl?: string | null;
  coverStorageId?: Id<"_storage"> | null;
  ogImageUrl?: string | null;
  description?: string | null;
  audioNoteUrl?: string | null;
};

/** What the form holds. Pure data, so readDraft can be unit-tested. */
export type DraftState = {
  /** Words alone, no file or link (a text piece). */
  writing: boolean;
  text: string;
  /** The link field, as typed. */
  link: string;
  /** A file picked in this form. */
  file: { storageId: Id<"_storage">; kind: UploadKind } | null;
  /** The piece's own uploaded file, while it is kept. */
  keptFile: { type: string } | null;
  title: string;
  description: string;
  /** A cover picked in this form, and whether the piece's own was taken off. */
  cover: Id<"_storage"> | null;
  coverRemoved: boolean;
  /** A voice note recorded in this form, and whether the piece's own was taken off. */
  note: Id<"_storage"> | null;
  noteRemoved: boolean;
};

export type ReadDraft =
  | {
      ok: true;
      /** The piece to create. A blank description is left out. */
      input: PieceInput;
      /** The piece's media changed (a new file, or a link to send). */
      mediaSent: boolean;
    }
  | { ok: false; error: string };

/** Nothing given yet: no file, no link, no words. "Show it" may be left so. */
export function draftIsEmpty(state: DraftState): boolean {
  return !state.file && !state.keptFile && !state.link.trim() && !(state.writing && state.text.trim());
}

/** A cover goes with a piece that isn't a picture already. */
export function takesCover(state: Pick<DraftState, "writing" | "file" | "keptFile" | "link">): boolean {
  if (state.writing) return false;
  const kind = state.file?.kind ?? state.keptFile?.type;
  if (kind) return kind !== "image";
  return describeMediaLink(state.link, "piece").state === "ok";
}

/** The piece being edited still has its own link: the field holds it as it
 *  was. Then it is sent back as it is, type and all — the link field's rule
 *  only judges a link someone typed (an old picture's address, say, which
 *  it would call a page). */
function keepsOwnLink(state: DraftState, piece?: Partial<EditablePiece>): boolean {
  return (
    !!piece?._id &&
    !!piece.type &&
    !!piece.mediaUrl &&
    !state.writing &&
    !state.file &&
    !state.keptFile &&
    state.link.trim() === piece.mediaUrl.trim()
  );
}

/** The cover the piece already has stays only while its work does: new work
 *  (another link, a file, or words) takes it away on the server
 *  (artifacts.update), so the form stops showing it too. */
export function keepsOwnCover(piece: Partial<EditablePiece> | undefined, state: DraftState): boolean {
  if (!piece?.coverStorageId || !piece.ogImageUrl || state.coverRemoved) return false;
  if (state.writing || state.file) return false;
  return piece.mediaStorageId ? !!state.keptFile : keepsOwnLink(state, piece);
}

/** The piece the form describes, or what's missing. `piece` is the one
 *  being edited, if any. */
export function readDraft(state: DraftState, piece?: Partial<EditablePiece>): ReadDraft {
  const description = state.description.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Keep the words under ${MAX_DESCRIPTION_LENGTH} characters.` };
  }
  const shared = {
    title: state.title.trim() || undefined,
    description: description || undefined,
    audioNoteStorageId: state.note ?? undefined,
    coverStorageId: takesCover(state) ? (state.cover ?? undefined) : undefined,
  };
  if (state.writing) {
    const content = state.text.trim();
    if (!content) return { ok: false, error: "Write something to share." };
    return { ok: true, mediaSent: false, input: { ...shared, type: "text", content, coverStorageId: undefined } };
  }
  if (state.file) {
    return { ok: true, mediaSent: true, input: { ...shared, type: state.file.kind, mediaStorageId: state.file.storageId } };
  }
  if (state.keptFile) {
    return { ok: true, mediaSent: false, input: { ...shared, type: state.keptFile.type } };
  }
  if (keepsOwnLink(state, piece)) {
    return { ok: true, mediaSent: false, input: { ...shared, type: piece!.type! } };
  }
  const link = describeMediaLink(state.link, "piece");
  if (link.state === "empty") return { ok: false, error: "Upload a file or paste a link." };
  if (link.state === "invalid") return { ok: false, error: link.message };
  return { ok: true, mediaSent: true, input: { ...shared, type: link.pieceType, mediaUrl: link.url } };
}

/** The args artifacts.update takes for an edit: everything the form shows
 *  is sent, so a cleared field clears; media only when it changed. */
export function updateArgs(piece: EditablePiece, state: DraftState, read: Extract<ReadDraft, { ok: true }>) {
  const { input } = read;
  return {
    artifactId: piece._id,
    type: input.type,
    title: input.title,
    content: input.content,
    mediaUrl: read.mediaSent ? input.mediaUrl : undefined,
    mediaStorageId: read.mediaSent ? input.mediaStorageId : undefined,
    description: state.description.trim(),
    audioNoteStorageId: state.note ?? undefined,
    clearAudioNote: !state.note && state.noteRemoved ? true : undefined,
    coverStorageId: input.coverStorageId,
    clearCover: !state.cover && state.coverRemoved ? true : undefined,
  };
}

function startState(piece?: Partial<EditablePiece>): DraftState {
  const uploaded = !!piece?.mediaStorageId;
  return {
    writing: piece?.type === "text",
    text: piece?.type === "text" ? (piece.content ?? "") : "",
    link: uploaded ? "" : (piece?.mediaUrl ?? ""),
    file: null,
    keptFile: uploaded && piece?.type ? { type: piece.type } : null,
    title: piece?.title ?? "",
    description: piece?.description ?? "",
    cover: null,
    coverRemoved: false,
    note: null,
    noteRemoved: false,
  };
}

export type PieceDraft = {
  state: DraftState;
  set: (patch: Partial<DraftState>) => void;
  /** The file picker (useFileUpload): its error, its preview, uploading. */
  upload: FileUpload;
  /** The cover picker: pick(file) frames it 4:5 and stores it. */
  coverPick: CoverPick;
  /** The picked cover, to show; or the piece's own, unless taken off. */
  coverPreview: string | null;
  /** The file the piece will have, to show: one picked here, or its own. */
  filePreview: { kind: string; url: string | null } | null;
  /** The piece's own voice note, unless taken off. */
  noteUrl: string | null;
  /** A file, a cover or a voice note is still going up: saving waits. */
  busy: boolean;
  /** AudioNoteRecorder says when its note is going up. */
  setNoteBusy: (busy: boolean) => void;
  generateUploadUrl: () => Promise<string>;
  read: () => ReadDraft;
  reset: () => void;
};

/** The form's state for a new piece, or for `piece` when editing one. A
 *  link handed in as `piece.mediaUrl` with no _id starts a new piece on it
 *  (a project's old link becoming its first piece). */
export function usePieceDraft(piece?: Partial<EditablePiece>): PieceDraft {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const [state, setState] = useState<DraftState>(() => startState(piece));
  const set = useCallback((patch: Partial<DraftState>) => setState((s) => ({ ...s, ...patch })), []);

  // A video or song too big to upload says to paste a link instead.
  const upload = useFileUpload({
    kinds: ["image", "video", "audio"],
    generateUploadUrl,
    takesLinks: true,
    onUploaded: (uploaded) => set({ file: { storageId: uploaded.storageId, kind: uploaded.kind }, keptFile: null, link: "" }),
  });

  // The cover: framed 4:5 (docs/features/cover-4x5.md), stored at once so
  // saving is one step.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverUrlRef = useRef<string | null>(null);
  const coverPick = useCoverPick(async (blob) => {
    setCoverUploading(true);
    try {
      const storageId = await uploadToStorage(generateUploadUrl, blob);
      if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current);
      coverUrlRef.current = URL.createObjectURL(blob);
      setCoverUrl(coverUrlRef.current);
      set({ cover: storageId });
    } finally {
      setCoverUploading(false);
    }
  });
  useEffect(
    () => () => {
      if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current);
    },
    [],
  );

  const ownCover = keepsOwnCover(piece, state) ? (piece?.ogImageUrl ?? null) : null;
  // A voice note still going up (AudioNoteRecorder uploads it itself).
  const [noteBusy, setNoteBusy] = useState(false);
  const reset = useCallback(() => {
    upload.reset();
    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current);
    coverUrlRef.current = null;
    setCoverUrl(null);
    setState(startState(piece));
  }, [upload, piece]);

  return {
    state,
    set,
    upload,
    coverPick,
    coverPreview: state.cover ? coverUrl : ownCover,
    filePreview: state.file
      ? { kind: state.file.kind, url: upload.preview }
      : state.keptFile
        ? { kind: state.keptFile.type, url: piece?.resolvedMediaUrl ?? null }
        : null,
    noteUrl: state.noteRemoved || state.note ? null : (piece?.audioNoteUrl ?? null),
    busy: upload.uploading || coverPick.busy || coverUploading || noteBusy,
    setNoteBusy,
    generateUploadUrl,
    read: () => readDraft(state, piece),
    reset,
  };
}
