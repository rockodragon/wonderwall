import { useState } from "react";
import { Microphone, Stop } from "@phosphor-icons/react";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "../lib/convexError";
import { MAX_NOTE_SECONDS, formatClock, useAudioRecorder } from "../lib/useAudioRecorder";
import { useFileUpload, type FileUpload } from "../lib/useFileUpload";

const SAVE_FAILED = "That didn't save. Try again.";
const REMOVE_FAILED = "That didn't remove. Try again.";

const buttonStyle = {
  minHeight: 44,
  padding: "0 18px",
  fontSize: 13.5,
  cursor: "pointer",
} as const;

const textButton = "inline-flex items-center underline underline-offset-4";
const textButtonStyle = {
  minHeight: 44,
  padding: "0 4px",
  fontSize: 13.5,
  cursor: "pointer",
  background: "none",
  border: 0,
  color: "var(--garden-body)",
} as const;

type Props = {
  /** The note already saved on the piece, to play back. Null/undefined = none yet. */
  url?: string | null;
  /** Upload URL maker: pass straight to useFileUpload. */
  generateUploadUrl: () => Promise<string>;
  /** Called with the new note's storage id once it is uploaded. May be async;
   *  while it runs "Saving…" shows, and if it throws the reason shows. */
  onRecorded: (storageId: Id<"_storage">) => Promise<unknown> | unknown;
  /** Removes the saved note. Absent = no Remove control. */
  onRemove?: () => Promise<unknown> | unknown;
};

type Uploader = Pick<FileUpload, "upload" | "reset">;

/** Puts a finished take in storage and hands its id to the parent. Resolves
 *  to the line to show when the parent couldn't save it, else null (an
 *  upload that didn't go up says why itself, in the upload's `error`). */
export async function saveTake(take: Blob, uploader: Uploader, onRecorded: Props["onRecorded"]): Promise<string | null> {
  const uploaded = await uploader.upload(take);
  if (!uploaded) return null;
  try {
    await onRecorded(uploaded.storageId);
    return null;
  } catch (err) {
    // Not saved on the piece, so don't play it back as if it were.
    uploader.reset();
    return errorMessage(err, SAVE_FAILED);
  }
}

/** Removes the saved note. Resolves to the line to show when it didn't go. */
export async function removeNote(uploader: Uploader, onRemove: () => Promise<unknown> | unknown): Promise<string | null> {
  try {
    await onRemove();
    // Let go of the take just made, so it isn't what plays next.
    uploader.reset();
    return null;
  } catch (err) {
    return errorMessage(err, REMOVE_FAILED);
  }
}

// A spoken note left on a portfolio piece. Nothing is drawn where the browser
// can't record, unless a note is already saved: that still plays. Recording
// goes through useAudioRecorder, the upload through useFileUpload (it checks
// the size and words the problems), and the parent saves the file's id.
export function AudioNoteRecorder({ url, generateUploadUrl, onRecorded, onRemove }: Props) {
  const upload = useFileUpload({ kinds: ["audio"], generateUploadUrl });
  const [working, setWorking] = useState<"saving" | "removing" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Runs a step with the working label up and the last problem cleared.
  async function work(label: "saving" | "removing", step: () => Promise<string | null>) {
    setWorking(label);
    setProblem(null);
    try {
      setProblem(await step());
    } finally {
      setWorking(null);
    }
  }

  // A finished take, by Stop or by the time limit, goes up and is handed on.
  const save = (take: Blob) => work("saving", () => saveTake(take, upload, onRecorded));
  const remove = () => (onRemove ? work("removing", () => removeNote(upload, onRemove)) : undefined);

  const recorder = useAudioRecorder({ onFinish: (take) => void save(take) });

  const src = url ?? upload.preview;
  if (!recorder.supported && !src) return null;

  const error = recorder.error ?? problem ?? upload.error;
  const busy = working !== null || upload.uploading;

  return (
    <div className="flex flex-col gap-2" style={{ color: "var(--garden-body)" }}>
      {busy ? (
        <p role="status" style={{ margin: 0, minHeight: 44, display: "flex", alignItems: "center", fontSize: 13.5 }}>
          {working === "removing" ? "Removing…" : "Saving…"}
        </p>
      ) : recorder.recording || !src ? (
        // One button for both, so keyboard focus stays on it when it turns to Stop.
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={recorder.recording}
            onClick={() => void (recorder.recording ? recorder.stop() : recorder.start())}
            className="inline-flex items-center justify-center gap-2 rounded-full border"
            style={{
              ...buttonStyle,
              backgroundColor: recorder.recording ? "var(--garden-citron)" : "var(--garden-ink)",
              borderColor: recorder.recording ? "var(--garden-citron)" : "var(--garden-hairline-raised)",
              color: recorder.recording ? "var(--garden-ink)" : "var(--garden-paper)",
            }}
          >
            {recorder.recording ? (
              <Stop size={18} weight="fill" aria-hidden="true" />
            ) : (
              <Microphone size={20} aria-hidden="true" />
            )}
            {recorder.recording ? "Stop" : "Record a note"}
          </button>
          {recorder.recording && (
            <span style={{ fontSize: 13.5, color: "var(--garden-dim)", fontVariantNumeric: "tabular-nums" }}>
              {`${formatClock(recorder.seconds)} / ${formatClock(MAX_NOTE_SECONDS)}`}
            </span>
          )}
        </div>
      ) : (
        <>
          <audio controls src={src} preload="none" className="w-full" />
          {recorder.supported || onRemove ? (
            <div className="flex flex-wrap items-center gap-3">
              {recorder.supported && (
                <button type="button" onClick={() => void recorder.start()} className={textButton} style={textButtonStyle}>
                  Record again
                </button>
              )}
              {onRemove && (
                <button type="button" onClick={() => void remove()} className={textButton} style={textButtonStyle}>
                  Remove
                </button>
              )}
            </div>
          ) : null}
        </>
      )}
      {error && !recorder.recording && (
        <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--garden-paper)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
