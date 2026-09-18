// The author half of rich project content (docs/features/rich-project-
// content.md) — the composer behind a project's full description and behind
// every project update.
//
// It edits the same block array convex/garden/richText.ts defines and
// RichContent.tsx renders, so what an author arranges here is literally the
// stored document: no conversion step, and nothing to keep in sync.
//
// WHY NOT A CONTENTEDITABLE WYSIWYG
//
// Inline marks are written as `**bold**` / `*italic*` / `[text](url)` into
// plain <textarea>s, with a format bar that wraps the author's selection so
// nobody has to type a marker. That trades a little polish for a lot:
// textareas give native undo, native spellcheck, native mobile keyboards
// and native accessibility, none of which a contenteditable surface gets
// for free — and the document can never hold markup, which is what keeps
// the renderer a plain switch instead of a sanitizer.
//
// The parent owns save/cancel and the mutation; this component owns only
// the blocks.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { RichContent } from "./RichContent";
import {
  RICH_LIMITS,
  isRichDocEmpty,
  normalizeBlocks,
  type ResolvedRichBlock,
  type RichBlockType,
} from "../lib/richText";

// Convex file storage takes larger files than this, but a project page that
// streams a 200MB upload to every visitor is a bad page. Video past this
// belongs on YouTube or Vimeo — which the video block also accepts, and
// which is the better answer anyway.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

// ————— shared field chrome —————

const FIELD: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--garden-hairline-raised)",
  backgroundColor: "var(--garden-ink)",
  color: "var(--garden-paper)",
  fontSize: 15,
  lineHeight: 1.6,
  fontFamily: "inherit",
  outline: "none",
};

function TinyButton({
  onClick,
  children,
  title,
  ariaLabel,
  active,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  title: string;
  /** Only for buttons whose visible content is a glyph rather than a word
      (↑, ↓, B, I). A button that already reads as its label must NOT get an
      aria-label saying something else — that makes the accessible name
      disagree with what a sighted user is told to click (WCAG 2.5.3). */
  ariaLabel?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        borderRadius: 6,
        border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
        backgroundColor: active ? "rgba(215,242,90,0.12)" : "transparent",
        color: active ? "var(--garden-citron)" : "var(--garden-body)",
        fontSize: 13.5,
        lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** A textarea that grows with its content — an author writing five
    paragraphs should not be typing into a three-line window. */
function AutoTextarea({
  value,
  onChange,
  placeholder,
  minRows = 3,
  inputRef,
  style,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minRows?: number;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  style?: CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ownRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? ownRef;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      style={{ ...FIELD, resize: "none", overflow: "hidden", ...style }}
    />
  );
}

/**
 * Wraps the current selection in `before`/`after` and hands back the new
 * string plus where the caret should land. With nothing selected it inserts
 * the markers and puts the caret between them, so clicking B and typing
 * works the way it does everywhere else.
 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { text: string; selStart: number; selEnd: number } {
  const selected = text.slice(start, end);
  const next = `${text.slice(0, start)}${before}${selected}${after}${text.slice(end)}`;
  return {
    text: next,
    selStart: start + before.length,
    selEnd: start + before.length + selected.length,
  };
}

function FormatBar({
  inputRef,
  value,
  onChange,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  function apply(before: string, after: string) {
    const el = inputRef.current;
    if (!el) return;
    const { text, selStart, selEnd } = wrapSelection(
      value,
      el.selectionStart,
      el.selectionEnd,
      before,
      after,
    );
    onChange(text);
    // After React re-renders with the new value, put the caret back around
    // what the author had selected — otherwise it jumps to the end and the
    // next click of B wraps the wrong thing.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function addLink() {
    const el = inputRef.current;
    if (!el) return;
    const selected = value.slice(el.selectionStart, el.selectionEnd);
    const url = window.prompt("Link to what? (paste a web address)", "https://");
    if (!url || url === "https://") return;
    const label = selected || "link";
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const inserted = `[${label}](${url.trim()})`;
    onChange(`${value.slice(0, start)}${inserted}${value.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + inserted.length, start + inserted.length);
    });
  }

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      <TinyButton title="Bold" ariaLabel="Bold" onClick={() => apply("**", "**")}>
        <b style={{ fontWeight: 800 }}>B</b>
      </TinyButton>
      <TinyButton title="Italic" ariaLabel="Italic" onClick={() => apply("*", "*")}>
        <i style={{ fontStyle: "italic" }}>I</i>
      </TinyButton>
      <TinyButton title="Add a link" onClick={addLink}>
        Link
      </TinyButton>
    </div>
  );
}

// ————— block scaffolding —————

const BLOCK_MENU: { type: RichBlockType; label: string; ordered?: boolean; level?: number }[] = [
  { type: "text", label: "Text" },
  { type: "heading", label: "Heading" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "list", label: "List" },
  { type: "quote", label: "Quote" },
  { type: "divider", label: "Divider" },
];

function blankBlock(type: RichBlockType): ResolvedRichBlock {
  switch (type) {
    case "heading":
      return { type: "heading", text: "", level: 2 };
    case "quote":
      return { type: "quote", text: "" };
    case "list":
      return { type: "list", items: [] };
    case "image":
      return { type: "image" };
    case "video":
      return { type: "video" };
    case "divider":
      return { type: "divider" };
    default:
      return { type: "text", text: "" };
  }
}

const BLOCK_LABELS: Record<RichBlockType, string> = {
  text: "Text",
  heading: "Heading",
  quote: "Quote",
  list: "List",
  image: "Image",
  video: "Video",
  divider: "Divider",
};

function BlockFrame({
  label,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--garden-hairline)",
        borderRadius: 10,
        padding: 10,
        backgroundColor: "var(--garden-ink-raised)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: "var(--garden-font-mono)",
            color: "var(--garden-dim)",
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <TinyButton title="Move up" ariaLabel="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            ↑
          </TinyButton>
          <TinyButton
            title="Move down"
            ariaLabel="Move down"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
          >
            ↓
          </TinyButton>
          <TinyButton title="Remove this block" onClick={onRemove}>
            Remove
          </TinyButton>
        </div>
      </div>
      {children}
    </div>
  );
}

// ————— media block editors —————

function MediaFields({
  block,
  onPatch,
  onUpload,
  uploading,
  accept,
  urlPlaceholder,
  urlHelp,
}: {
  block: ResolvedRichBlock & { type: "image" | "video" };
  onPatch: (patch: Partial<ResolvedRichBlock>) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
  accept: string;
  urlPlaceholder: string;
  urlHelp: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const preview = block.resolvedUrl ?? block.url ?? null;
  const isImage = block.type === "image";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {preview && (
        <div style={{ borderRadius: 8, overflow: "hidden" }}>
          {isImage ? (
            <img
              src={preview}
              alt=""
              style={{ display: "block", width: "100%", height: "auto", maxHeight: 260, objectFit: "cover" }}
            />
          ) : (
            <RichContent blocks={[block]} />
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
        <TinyButton
          title={`Upload ${isImage ? "an image" : "a video"}`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : block.storageId ? "Replace file" : "Upload"}
        </TinyButton>
        <span style={{ fontSize: 13, color: "var(--garden-dim)" }}>or paste a link</span>
      </div>

      <input
        type="url"
        inputMode="url"
        value={block.storageId ? "" : (block.url ?? "")}
        disabled={!!block.storageId}
        placeholder={block.storageId ? "Using the uploaded file" : urlPlaceholder}
        onChange={(e) => onPatch({ url: e.target.value })}
        style={{ ...FIELD, fontSize: 14, opacity: block.storageId ? 0.5 : 1 }}
      />
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--garden-dim)" }}>
        {block.storageId ? "Remove the file to paste a link instead." : urlHelp}
      </p>

      {isImage && (
        <input
          type="text"
          value={(block as { alt?: string }).alt ?? ""}
          placeholder="Describe the image (for screen readers)"
          maxLength={RICH_LIMITS.altChars}
          onChange={(e) => onPatch({ alt: e.target.value } as Partial<ResolvedRichBlock>)}
          style={{ ...FIELD, fontSize: 14 }}
        />
      )}

      <input
        type="text"
        value={block.caption ?? ""}
        placeholder="Caption (optional)"
        maxLength={RICH_LIMITS.captionChars}
        onChange={(e) => onPatch({ caption: e.target.value } as Partial<ResolvedRichBlock>)}
        style={{ ...FIELD, fontSize: 14 }}
      />

      {block.storageId && (
        <TinyButton
          title="Remove the uploaded file"
          onClick={() => onPatch({ storageId: undefined, resolvedUrl: undefined } as Partial<ResolvedRichBlock>)}
        >
          Remove file
        </TinyButton>
      )}
    </div>
  );
}

// ————— the editor —————

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Tell people what you're making…",
  autoFocus,
}: {
  value: ResolvedRichBlock[];
  onChange: (next: ResolvedRichBlock[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const [uploadingAt, setUploadingAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const firstRef = useRef<HTMLTextAreaElement | null>(null);
  // Object URLs created for just-uploaded files, revoked on unmount so a
  // long editing session doesn't hold every file it previewed in memory.
  const objectUrls = useRef<string[]>([]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  useEffect(() => {
    if (autoFocus) firstRef.current?.focus();
  }, [autoFocus]);

  // An empty document still needs something to type into.
  const blocks = value.length ? value : [blankBlock("text")];

  function commit(next: ResolvedRichBlock[]) {
    onChange(next);
  }

  function patchBlock(index: number, patch: Partial<ResolvedRichBlock>) {
    commit(
      blocks.map((block, i) => (i === index ? ({ ...block, ...patch } as ResolvedRichBlock) : block)),
    );
  }

  function addBlock(type: RichBlockType) {
    commit([...blocks, blankBlock(type)]);
  }

  function removeBlock(index: number) {
    const next = blocks.filter((_, i) => i !== index);
    commit(next);
  }

  function moveBlock(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  async function uploadInto(index: number, file: File, kind: "image" | "video") {
    const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > cap) {
      setError(
        kind === "image"
          ? `That image is ${mb(file.size)}MB — images need to be under ${mb(cap)}MB.`
          : `That video is ${mb(file.size)}MB. Files need to be under ${mb(cap)}MB — for anything longer, put it on YouTube or Vimeo and paste the link.`,
      );
      return;
    }
    setError(null);
    setUploadingAt(index);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = await res.json();
      // The real URL arrives on the next read; until the author saves, the
      // local file is the preview.
      const localUrl = URL.createObjectURL(file);
      objectUrls.current.push(localUrl);
      patchBlock(index, {
        storageId,
        url: undefined,
        resolvedUrl: localUrl,
      } as Partial<ResolvedRichBlock>);
    } catch {
      setError("That file didn't upload. Try again, or paste a link instead.");
    } finally {
      setUploadingAt(null);
    }
  }

  if (preview) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            border: "1px solid var(--garden-hairline)",
            borderRadius: 10,
            padding: 14,
            backgroundColor: "var(--garden-ink-raised)",
          }}
        >
          {isRichDocEmpty(blocks) ? (
            <p style={{ margin: 0, fontSize: 15, color: "var(--garden-dim)" }}>
              Nothing to preview yet.
            </p>
          ) : (
            // Normalized, so the preview is what SAVES — an empty block
            // still being typed into, or a trailing divider, would otherwise
            // show here and then vanish on save.
            <RichContent blocks={normalizeBlocks(blocks) as ResolvedRichBlock[]} />
          )}
        </div>
        <div>
          <TinyButton title="Keep editing" onClick={() => setPreview(false)} active>
            ← Keep editing
          </TinyButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {blocks.map((block, index) => {
        const label = BLOCK_LABELS[block.type] ?? "Block";
        const common = {
          label,
          index,
          count: blocks.length,
          onMove: (delta: number) => moveBlock(index, delta),
          onRemove: () => removeBlock(index),
        };

        switch (block.type) {
          case "heading":
            return (
              <BlockFrame key={index} {...common}>
                <input
                  type="text"
                  value={block.text}
                  placeholder="Section heading"
                  maxLength={RICH_LIMITS.headingChars}
                  onChange={(e) => patchBlock(index, { text: e.target.value } as Partial<ResolvedRichBlock>)}
                  style={{
                    ...FIELD,
                    fontFamily: "var(--garden-font-display)",
                    fontSize: block.level === 3 ? 16 : 19,
                    fontWeight: 600,
                  }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <TinyButton
                    title="Large — a section heading"
                    active={block.level !== 3}
                    onClick={() => patchBlock(index, { level: 2 } as Partial<ResolvedRichBlock>)}
                  >
                    Large
                  </TinyButton>
                  <TinyButton
                    title="Small — a sub-heading"
                    active={block.level === 3}
                    onClick={() => patchBlock(index, { level: 3 } as Partial<ResolvedRichBlock>)}
                  >
                    Small
                  </TinyButton>
                </div>
              </BlockFrame>
            );

          case "text":
          case "quote": {
            const isQuote = block.type === "quote";
            return (
              <TextBlockEditor
                key={index}
                frame={common}
                value={block.text}
                placeholder={isQuote ? "A line worth pulling out" : placeholder}
                italic={isQuote}
                inputRef={index === 0 && !isQuote ? firstRef : undefined}
                onChange={(text) => patchBlock(index, { text } as Partial<ResolvedRichBlock>)}
              />
            );
          }

          case "list":
            return (
              <BlockFrame key={index} {...common}>
                <AutoTextarea
                  value={block.items.join("\n")}
                  placeholder={"One item per line\nLike this"}
                  onChange={(text) =>
                    patchBlock(index, {
                      items: text.split("\n"),
                    } as Partial<ResolvedRichBlock>)
                  }
                />
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <TinyButton
                    title="Bullets — an unordered list"
                    active={!block.ordered}
                    onClick={() => patchBlock(index, { ordered: undefined } as Partial<ResolvedRichBlock>)}
                  >
                    Bullets
                  </TinyButton>
                  <TinyButton
                    title="Numbers — an ordered list"
                    active={!!block.ordered}
                    onClick={() => patchBlock(index, { ordered: true } as Partial<ResolvedRichBlock>)}
                  >
                    Numbers
                  </TinyButton>
                </div>
              </BlockFrame>
            );

          case "image":
            return (
              <BlockFrame key={index} {...common}>
                <MediaFields
                  block={block}
                  uploading={uploadingAt === index}
                  accept="image/*"
                  urlPlaceholder="https://…/photo.jpg"
                  urlHelp="Any image on the web works — paste the direct link to the picture."
                  onPatch={(patch) => patchBlock(index, patch)}
                  onUpload={(file) => uploadInto(index, file, "image")}
                />
              </BlockFrame>
            );

          case "video":
            return (
              <BlockFrame key={index} {...common}>
                <MediaFields
                  block={block}
                  uploading={uploadingAt === index}
                  accept="video/*"
                  urlPlaceholder="https://youtube.com/watch?v=…"
                  urlHelp="YouTube and Vimeo links play right here. Any other link becomes a button people can click."
                  onPatch={(patch) => patchBlock(index, patch)}
                  onUpload={(file) => uploadInto(index, file, "video")}
                />
              </BlockFrame>
            );

          case "divider":
            return (
              <BlockFrame key={index} {...common}>
                <hr style={{ border: 0, borderTop: "1px solid var(--garden-hairline-raised)", margin: "6px 0" }} />
              </BlockFrame>
            );

          default:
            return null;
        }
      })}

      {error && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--garden-citron)" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--garden-dim)", marginRight: 2 }}>Add</span>
        {BLOCK_MENU.map((item) => (
          <TinyButton
            key={item.type}
            title={`Add a ${item.label.toLowerCase()} block`}
            onClick={() => addBlock(item.type)}
            disabled={blocks.length >= RICH_LIMITS.blocks}
          >
            {item.label}
          </TinyButton>
        ))}
        <span style={{ flex: 1 }} />
        <TinyButton title="Preview how this will look" onClick={() => setPreview(true)}>
          Preview
        </TinyButton>
      </div>
    </div>
  );
}

/** Split out so the format bar can hold a ref to its own textarea — a
    single shared ref would point at whichever block rendered last. */
function TextBlockEditor({
  frame,
  value,
  placeholder,
  italic,
  inputRef,
  onChange,
}: {
  frame: {
    label: string;
    index: number;
    count: number;
    onMove: (delta: number) => void;
    onRemove: () => void;
  };
  value: string;
  placeholder: string;
  italic?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (text: string) => void;
}) {
  const ownRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = inputRef ?? ownRef;
  return (
    <BlockFrame {...frame}>
      <AutoTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputRef={ref}
        style={italic ? { fontStyle: "italic" } : undefined}
      />
      <FormatBar inputRef={ref} value={value} onChange={onChange} />
    </BlockFrame>
  );
}
