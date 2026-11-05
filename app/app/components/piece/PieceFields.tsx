// The fields of a piece: the work (an upload, or a link to anywhere it
// lives), a cover when the work isn't a picture, and — in the full form —
// its title, a few words with the mic, and a voice note. The start form's
// "Show it" draws the first two (`compact`); the piece editor draws all of
// it. State lives in usePieceDraft, so the caller decides when to save.

import { useId, useRef } from "react";
import { maxSize } from "../../lib/useFileUpload";
import { useTalk } from "../../lib/useTalk";
import { AudioNoteRecorder } from "../AudioNoteRecorder";
import { gardenField } from "../gardenField";
import { MediaLinkField } from "../MediaLinkField";
import { SpokenNote, SpokenTextarea, useSpokenInto } from "../SpokenTextarea";
import { takesCover, type PieceDraft } from "./usePieceDraft";

const LINK_PLACEHOLDER = "YouTube, Vimeo, Bandcamp, Spotify, SoundCloud or any page";
const textButton = "text-[13.5px] font-medium underline underline-offset-2 hover:opacity-80";
const textButtonStyle = { color: "var(--garden-citron)" };
const FILE_NOUN: Record<string, string> = { image: "Picture", video: "Video", audio: "Audio" };

export function PieceFields({ draft, compact = false }: { draft: PieceDraft; compact?: boolean }) {
  const uid = useId();
  const { state, set, upload, coverPick } = draft;
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const showCover = takesCover(state);

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void upload.onPick(e)}
      />
      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) coverPick.pick(file);
        }}
      />

      {/* The work */}
      {state.writing ? (
        <div>
          <label htmlFor={`${uid}-text`} className={gardenField.label} style={gardenField.labelStyle}>
            Your words
          </label>
          <textarea
            id={`${uid}-text`}
            rows={6}
            value={state.text}
            onChange={(e) => set({ text: e.target.value })}
            className={`${gardenField.input} resize-y`}
            style={gardenField.inputStyle}
          />
          <button type="button" className={`${textButton} mt-2`} style={textButtonStyle} onClick={() => set({ writing: false })}>
            Upload or link instead
          </button>
        </div>
      ) : draft.filePreview ? (
        <div>
          <div className={gardenField.label} style={gardenField.labelStyle}>
            {FILE_NOUN[draft.filePreview.kind] ?? "File"}
          </div>
          <FilePreview kind={draft.filePreview.kind} url={draft.filePreview.url} />
          <div className="flex gap-4 mt-2">
            <button type="button" className={textButton} style={textButtonStyle} onClick={() => fileInput.current?.click()}>
              Replace
            </button>
            <button
              type="button"
              className={textButton}
              style={textButtonStyle}
              onClick={() => {
                upload.reset();
                set({ file: null, keptFile: null });
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={upload.uploading}
            className="w-full py-8 rounded-lg border-2 border-dashed text-center disabled:opacity-60"
            style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          >
            <span className="block text-[15px] font-medium">
              {upload.uploading ? "Uploading…" : "Upload a picture, video or song"}
            </span>
            {!upload.uploading && (
              <span className="block text-[13px] mt-1" style={{ color: "var(--garden-dim)" }}>
                Pictures up to {maxSize("image")}, video and audio up to {maxSize("video")}
              </span>
            )}
          </button>
          <MediaLinkField
            variant="garden"
            accept="piece"
            label="Or paste a link"
            placeholder={LINK_PLACEHOLDER}
            value={state.link}
            onChange={(link) => set({ link })}
          />
          {!compact && (
            <button type="button" className={`${textButton} self-start`} style={textButtonStyle} onClick={() => set({ writing: true })}>
              Write something instead
            </button>
          )}
        </div>
      )}
      {upload.error && (
        <p role="alert" className="text-sm -mt-3" style={{ color: "var(--garden-error)" }}>
          {upload.error}
        </p>
      )}

      {/* A cover, for work that isn't a picture */}
      {showCover && (
        <div>
          <div className={gardenField.label} style={gardenField.labelStyle}>
            Cover picture (optional)
          </div>
          {draft.coverPreview ? (
            <div className="flex items-end gap-4">
              <img src={draft.coverPreview} alt="" className="w-24 aspect-[4/5] object-cover rounded-lg" />
              <div className="flex gap-4">
                <button type="button" className={textButton} style={textButtonStyle} onClick={() => coverInput.current?.click()}>
                  Change
                </button>
                <button
                  type="button"
                  className={textButton}
                  style={textButtonStyle}
                  onClick={() => set({ cover: null, coverRemoved: true })}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => coverInput.current?.click()}
              disabled={coverPick.busy}
              className="min-h-11 px-4 rounded-lg border text-[15px] disabled:opacity-60"
              style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
            >
              {coverPick.busy ? "Adding…" : "Add a cover"}
            </button>
          )}
          {coverPick.error && (
            <p role="alert" className="text-sm mt-2" style={{ color: "var(--garden-error)" }}>
              {coverPick.error}
            </p>
          )}
          {coverPick.picker}
        </div>
      )}

      {!compact && <AboutFields draft={draft} />}
    </div>
  );
}

/** What it's called and what the maker says about it. */
function AboutFields({ draft }: { draft: PieceDraft }) {
  const uid = useId();
  const { state, set } = draft;
  const speech = useTalk();
  const heard = useSpokenInto(speech, state.description, (description) => set({ description }));
  return (
    <>
      <div>
        <label htmlFor={`${uid}-title`} className={gardenField.label} style={gardenField.labelStyle}>
          Title (optional)
        </label>
        <input
          id={`${uid}-title`}
          type="text"
          value={state.title}
          onChange={(e) => set({ title: e.target.value })}
          className={gardenField.input}
          style={gardenField.inputStyle}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-about`} className={gardenField.label} style={gardenField.labelStyle}>
          About it (optional)
        </label>
        <SpokenTextarea
          id={`${uid}-about`}
          value={state.description}
          onChange={(description) => set({ description })}
          rows={3}
          placeholder="What it is, and how you made it"
          listening={speech.listening}
          transcribing={speech.transcribing}
          onStart={heard.start}
          onStop={speech.stop}
          className={gardenField.input}
          style={gardenField.inputStyle}
        />
        <SpokenNote working={false} error={speech.error} className={gardenField.hint} />
      </div>
      <div>
        <div className={gardenField.label} style={gardenField.labelStyle}>
          Voice note (optional)
        </div>
        <AudioNoteRecorder
          url={draft.noteUrl}
          generateUploadUrl={draft.generateUploadUrl}
          onRecorded={(note) => set({ note, noteRemoved: false })}
          onRemove={() => set({ note: null, noteRemoved: true })}
          onBusyChange={draft.setNoteBusy}
        />
      </div>
    </>
  );
}

/** The file the piece holds, small: a picture shows, the rest say what they are. */
function FilePreview({ kind, url }: { kind: string; url: string | null }) {
  if (kind === "image" && url) {
    return <img src={url} alt="" className="w-full max-h-64 object-contain rounded-lg" style={{ backgroundColor: "var(--garden-ink-raised)" }} />;
  }
  if (kind === "video" && url) {
    return <video src={url} controls preload="metadata" playsInline className="w-full max-h-64 rounded-lg" />;
  }
  if (kind === "audio" && url) {
    return <audio src={url} controls preload="none" className="w-full" />;
  }
  return (
    <p className="text-[15px]" style={{ color: "var(--garden-body)" }}>
      {FILE_NOUN[kind] ?? "File"} added.
    </p>
  );
}
