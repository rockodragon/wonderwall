// Takes a file someone picks and puts it in storage the same way everywhere:
// check what it is and how big it is, upload it through uploadToStorage
// (which strips where a photo was taken), and show it back from the file
// until the stored copy loads. Problems are worded for the person and shown
// next to the picker, never in alert(), which is poor on phones. Avatars,
// logos, portfolio pieces, event gallery shots, offering photos and the
// pictures in a project's story and in Updates all go through here; avatars
// are shrunk to a small square on the way (`square`, shrinkImage.ts). Covers
// don't: useCoverPick frames and shrinks them first.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "./convexError";
import { UNREADABLE_PICTURE, squareJpeg } from "./shrinkImage";
import { uploadToStorage } from "./uploadFile";

export type UploadKind = "image" | "video" | "audio";

const MB = 1024 * 1024;

/** The most a file can weigh, by kind. This is the one place the caps are
 *  set. Stored files go to every visitor exactly as uploaded (nothing
 *  shrinks them), so the caps stay modest: a full-size phone photo fits,
 *  and a video past 64 MB belongs on YouTube or Vimeo, pasted as a link. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  image: 12 * MB,
  video: 64 * MB,
  audio: 64 * MB,
};

/** A cap the way people read it: "12 MB". */
export function maxSize(kind: UploadKind): string {
  return `${Math.round(MAX_UPLOAD_BYTES[kind] / MB)} MB`;
}

export const UPLOAD_FAILED = "That didn't upload. Try again.";

const NOUN: Record<UploadKind, string> = { image: "picture", video: "video", audio: "audio file" };
const PLURAL: Record<UploadKind, string> = { image: "Pictures", video: "Videos", audio: "Audio files" };

export function kindOf(file: Blob): UploadKind | null {
  const top = file.type.split("/")[0];
  return top === "image" || top === "video" || top === "audio" ? top : null;
}

/** Why this file can't go up through a picker that takes `kinds`, worded
 *  for the person, or null when it can. */
export function fileProblem(file: Blob, kinds: readonly UploadKind[], takesLinks = false): string | null {
  const kind = kindOf(file);
  if (!kind || !kinds.includes(kind)) return `Choose ${oneOf(kinds)}.`;
  if (file.size > MAX_UPLOAD_BYTES[kind]) {
    const cap = `${PLURAL[kind]} up to ${maxSize(kind)}.`;
    return takesLinks && kind !== "image" ? `${cap} For a longer one, paste its link.` : cap;
  }
  return null;
}

/** "a picture", "a picture or video", "a picture, video or audio file". */
function oneOf(kinds: readonly UploadKind[]): string {
  const nouns = kinds.map((k) => NOUN[k]);
  const list = nouns.length < 2 ? nouns[0] : `${nouns.slice(0, -1).join(", ")} or ${nouns[nouns.length - 1]}`;
  return `${/^[aeiou]/.test(list) ? "an" : "a"} ${list}`;
}

export type Uploaded = {
  storageId: Id<"_storage">;
  kind: UploadKind;
  /** The file itself as an object URL, to show (by `kind`) until the stored
   *  copy loads. */
  preview: string;
};

export type FileUpload = {
  /** Checks a file and uploads it. Resolves to what was stored, or to null
   *  when the file was refused or didn't go up, and `error` says why. Pass
   *  `kinds` when this one pick takes less than the hook does (an image
   *  block in the story editor). */
  upload: (file: Blob, pick?: { kinds?: readonly UploadKind[] }) => Promise<Uploaded | null>;
  /** onChange for an <input type="file">. Uploads the picked file and
   *  clears the input, so the same file can be picked again. */
  onPick: (e: ChangeEvent<HTMLInputElement>) => Promise<Uploaded | null>;
  /** True while a file is going up, and while onUploaded saves it. */
  uploading: boolean;
  /** Why the last file didn't go up, for the person. Show it next to the picker. */
  error: string | null;
  /** The last file stored, until reset(). */
  storageId: Id<"_storage"> | null;
  kind: UploadKind | null;
  preview: string | null;
  /** Forgets the upload and the error, and lets go of the previews. A file
   *  still going up when this runs is dropped. */
  reset: () => void;
};

export function useFileUpload(options: {
  /** What the picker takes. */
  kinds: readonly UploadKind[];
  generateUploadUrl: () => Promise<string>;
  /** Saves the upload where it belongs (a profile photo, a logo). It runs
   *  before `uploading` turns off, and if it throws, `error` says why. */
  onUploaded?: (uploaded: Uploaded) => Promise<unknown> | unknown;
  /** The form also takes a link, so a video or audio file too big to
   *  upload says to paste one. */
  takesLinks?: boolean;
  /** Store a picture as its centred square, this many pixels wide, as a
   *  JPEG (AVATAR_PX for faces). The preview shows the small copy. */
  square?: number;
}): FileUpload {
  // Callers can pass inline functions; each pick uses the latest render's.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Uploaded | null>(null);
  // Every preview made here stays valid until reset() or unmount, so a form
  // showing several at once (the project story editor) never shows a dead one.
  const previews = useRef<string[]>([]);
  const mounted = useRef(true);
  // Bumped by reset(), so an upload that finishes after it is dropped.
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previews.current.splice(0).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const upload = useCallback(async (file: Blob, pick?: { kinds?: readonly UploadKind[] }) => {
    const { kinds, generateUploadUrl, onUploaded, takesLinks, square } = optionsRef.current;
    const kind = kindOf(file);
    const problem = fileProblem(file, pick?.kinds ?? kinds, takesLinks);
    setError(problem);
    if (problem || !kind) return null;

    const started = generation.current;
    setInFlight((n) => n + 1);
    try {
      const body = square && kind === "image" ? await squareJpeg(file, square).catch(() => null) : file;
      if (!body) {
        setError(UNREADABLE_PICTURE);
        return null;
      }
      const storageId = await uploadToStorage(generateUploadUrl, body);
      if (started !== generation.current) return null;
      const preview = URL.createObjectURL(body);
      if (mounted.current) previews.current.push(preview);
      else URL.revokeObjectURL(preview);
      const uploaded: Uploaded = { storageId, kind, preview };
      await onUploaded?.(uploaded);
      setLast(uploaded);
      return uploaded;
    } catch (err) {
      console.error("Upload error:", err);
      setError(errorMessage(err, UPLOAD_FAILED));
      return null;
    } finally {
      setInFlight((n) => n - 1);
    }
  }, []);

  const onPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      return file ? upload(file) : null;
    },
    [upload],
  );

  const reset = useCallback(() => {
    generation.current += 1;
    previews.current.splice(0).forEach((url) => URL.revokeObjectURL(url));
    setLast(null);
    setError(null);
  }, []);

  return {
    upload,
    onPick,
    uploading: inFlight > 0,
    error,
    storageId: last?.storageId ?? null,
    kind: last?.kind ?? null,
    preview: last?.preview ?? null,
    reset,
  };
}
