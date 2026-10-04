// The cover framer (docs/features/cover-4x5.md). Opens when someone picks a
// cover that isn't 4:5. Fill: the picture fills a 4:5 frame; drag it into
// place, zoom with the slider, nudge with the arrow keys. Whole: the picture
// kept as it is, shown over a blurred copy of itself, as every page shows it.
//
// Fill's preview is drawn from cropRect(), the same function the encoder
// uses, so what the frame shows is what gets saved.

import { useEffect, useRef, useState } from "react";
import { cropRect } from "../lib/coverCrop";
import { CoverFrame } from "./CoverFrame";

export type CoverChoice =
  | { mode: "fill"; zoom: number; x: number; y: number }
  | { mode: "whole" };

type Mode = "fill" | "whole";

const NUDGE = 0.02;
const NUDGE_BIG = 0.1;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--app-accent-ink)]";

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function CoverPicker({
  src,
  naturalWidth: w,
  naturalHeight: h,
  onUse,
  onCancel,
}: {
  /** An object URL of the picked picture. */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onUse: (choice: CoverChoice) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<Mode>("fill");
  const [zoom, setZoomState] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [dragging, setDragging] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    px: number;
    py: number;
    x: number;
    y: number;
    frameW: number;
  } | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus the dialog on open, give focus back on close, and take Escape before
  // anything behind the dialog can see it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onCancelRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (before?.isConnected) before.focus();
    };
  }, []);

  const rect = cropRect({ w, h, zoom, x: pos.x, y: pos.y });

  // Zooming holds the middle of what's in the frame still.
  function setZoom(next: number) {
    const from = cropRect({ w, h, zoom, x: pos.x, y: pos.y });
    const to = cropRect({ w, h, zoom: next, x: 0, y: 0 });
    const slackX = w - to.sw;
    const slackY = h - to.sh;
    setZoomState(next);
    setPos({
      x: slackX > 0.5 ? clamp01((from.sx + from.sw / 2 - to.sw / 2) / slackX) : 0.5,
      y: slackY > 0.5 ? clamp01((from.sy + from.sh / 2 - to.sh / 2) / slackY) : 0.5,
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "fill" || (e.pointerType === "mouse" && e.button !== 0)) return;
    const frame = frameRef.current;
    if (!frame) return;
    frame.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      px: e.clientX,
      py: e.clientY,
      x: pos.x,
      y: pos.y,
      frameW: frame.getBoundingClientRect().width || 1,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    // The picture follows the pointer, so the crop window moves the other way.
    const perPx = rect.sw / d.frameW;
    const slackX = w - rect.sw;
    const slackY = h - rect.sh;
    setPos({
      x: slackX > 0.5 ? clamp01(d.x - ((e.clientX - d.px) * perPx) / slackX) : d.x,
      y: slackY > 0.5 ? clamp01(d.y - ((e.clientY - d.py) * perPx) / slackY) : d.y,
    });
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  }

  function onFrameKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mode !== "fill") return;
    const step = e.shiftKey ? NUDGE_BIG : NUDGE;
    // The picture moves the way the arrow points, like a drag.
    const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
    const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    setPos((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) }));
  }

  // Keep Tab inside the dialog.
  function onDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.key !== "Tab") return;
    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
      ) ?? [],
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function use() {
    onUse(mode === "fill" ? { mode: "fill", zoom, x: pos.x, y: pos.y } : { mode: "whole" });
  }

  const chip = (value: Mode, label: string) => {
    const on = mode === value;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setMode(value)}
        className={`px-3 py-1.5 rounded-full text-[13.5px] font-medium transition-colors ${FOCUS}`}
        style={
          on
            ? { backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }
            : { color: "var(--app-text-muted)" }
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.72)" }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Cover"
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          className="rounded-2xl border p-5 shadow-2xl outline-none"
          style={{
            backgroundColor: "var(--app-surface-raised)",
            borderColor: "var(--app-hairline-raised)",
          }}
        >
          <div style={{ width: "min(80vw, 360px)" }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                Cover
              </h2>
              <div
                role="group"
                aria-label="Fit"
                className="flex items-center gap-1 rounded-full border p-0.5"
                style={{ borderColor: "var(--app-hairline-raised)" }}
              >
                {chip("fill", "Fill")}
                {chip("whole", "Whole")}
              </div>
            </div>

            {mode === "fill" ? (
              <div
                ref={frameRef}
                role="group"
                aria-label="Cover frame"
                tabIndex={0}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onFrameKeyDown}
                className={`relative aspect-[4/5] w-full overflow-hidden rounded-lg select-none touch-none ${FOCUS}`}
                style={{
                  backgroundColor: "#111",
                  cursor: dragging ? "grabbing" : "grab",
                }}
              >
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="absolute pointer-events-none select-none"
                  style={{
                    maxWidth: "none",
                    width: `${(w / rect.sw) * 100}%`,
                    height: `${(h / rect.sh) * 100}%`,
                    left: `${-(rect.sx / rect.sw) * 100}%`,
                    top: `${-(rect.sy / rect.sh) * 100}%`,
                  }}
                />
              </div>
            ) : (
              <div role="group" aria-label="Cover frame">
                <CoverFrame src={src} alt="" className="w-full rounded-lg" />
              </div>
            )}

            <div className="min-h-[3.75rem] pt-3">
              {mode === "fill" && (
                <>
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    onKeyDown={(e) => {
                      // A slider's Enter must not reach a form behind the dialog.
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    className={`block w-full ${FOCUS}`}
                    style={{ accentColor: "var(--app-accent-ink)" }}
                  />
                  <p
                    className="mt-2 text-[13.5px] leading-5"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Drag to frame it.
                  </p>
                </>
              )}
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className={`px-4 py-2.5 rounded-lg text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline)] ${FOCUS}`}
                style={{ color: "var(--app-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={use}
                className={`px-4 py-2.5 rounded-lg text-[13.5px] font-semibold transition-opacity hover:opacity-90 ${FOCUS}`}
                style={{
                  backgroundColor: "var(--app-accent)",
                  color: "var(--garden-ink)",
                }}
              >
                Use this
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
