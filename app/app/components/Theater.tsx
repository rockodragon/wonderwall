// Theater mode: a person's work, or a project's, one piece at a time on the
// whole screen, moving on by itself (Rick, 2026-11-04: "so you can just sit
// back and watch"). The slides come from lib/theaterSlides.ts.
//
// Each piece is as large as the screen allows without cropping or
// stretching: a portrait one fills the height, a landscape one the width.
// Around it is a dark wall with the faintest wash of the piece's own colour
// (ImageFill's blurred copy, dimmed). Between pieces the room dims and the
// next one comes up out of the dark, its label a moment later, like a
// gallery wall.
//
// Keys: ← → move, ↑ ↓ faster or slower, Space pauses, Esc leaves. On a
// phone: swipe to move, tap for the controls. The controls and the cursor
// fade when the mouse is still. A picture stays up for the chosen seconds; a
// video plays to its end first (YouTube and Vimeo say when they finish;
// Instagram and TikTok wait for you). Speed and order are remembered on this
// device.

import { CaretLeft, CaretRight, Pause, Play, SortAscending, SortDescending, X } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useMediaQuery, useReducedMotion } from "../hooks/useMediaQuery";
import {
  DEFAULT_SECONDS,
  embedEnded,
  nextSpeed,
  orderSlides,
  theaterEmbedUrl,
  THEATER_SPEEDS,
  type TheaterOrder,
  type TheaterSlide,
} from "../lib/theaterSlides";
import type { VideoEmbed } from "../lib/videoEmbed";
import { EMBED_ALLOW } from "./EmbedPlayer";
import { ImageFill } from "./ImageFill";

/** The dark between two pieces: the old one goes down, the new comes up. */
const OUT_MS = 1100;
const IN_DELAY_MS = 380;
const IN_MS = 1700;
const CHROME_MS = 2600;
/** The arrows at the edges: up on opening and while the mouse moves, gone
 *  this long after it stops (Rick, 2026-11-04). */
const EDGE_MS = 5000;
const HINT_MS = 5200;
/** The strip under a video that holds the controls. */
const BAND_PX = 72;

const PAPER = "#f7f7f4";
const PAPER_DIM = "rgba(247,247,244,0.82)";
const WALL = "#0a0a09";
const GLASS = "rgba(18,18,16,0.66)";

const ORDER_KEY = "theater:order";
const SECONDS_KEY = "theater:seconds";
const HINT_KEY = "theater:hinted";

function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the choice lasts this visit only.
  }
}

const KEYFRAMES = `
@keyframes theater-in { from { opacity: 0; filter: blur(5px) brightness(0.55); } to { opacity: 1; filter: blur(0) brightness(1); } }
@keyframes theater-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes theater-out { from { opacity: 1; filter: brightness(1); } to { opacity: 0; filter: brightness(0.35); } }
@keyframes theater-label { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes theater-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`;

export function Theater({
  slides,
  startKey,
  ordered,
  label,
  onClose,
}: {
  slides: readonly TheaterSlide[];
  /** The piece to open on; the first one otherwise. */
  startKey?: string | null;
  /** True: newest or oldest first, the viewer's choice (a portfolio). False:
   *  the order given (a project's page order). */
  ordered: boolean;
  /** What is showing, for a screen reader: "Ana's work". */
  label: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const finePointer = useMediaQuery("(pointer: fine)");
  const [order, setOrder] = useState<TheaterOrder>(() => (readPref(ORDER_KEY) === "oldest" ? "oldest" : "newest"));
  const [seconds, setSeconds] = useState<number>(() => {
    const saved = Number(readPref(SECONDS_KEY));
    return (THEATER_SPEEDS as readonly number[]).includes(saved) ? saved : DEFAULT_SECONDS;
  });
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const list = useMemo(
    () => (ordered ? orderSlides(slides, order) : [...slides]).filter((s) => !broken.has(s.key)),
    [slides, ordered, order, broken],
  );
  const n = list.length;
  const many = n > 1;
  const [currentKey, setCurrentKey] = useState<string | null>(startKey ?? null);
  const found = list.findIndex((s) => s.key === currentKey);
  const index = found === -1 ? 0 : found;
  const current: TheaterSlide | undefined = list[index];

  const [leaving, setLeaving] = useState<TheaterSlide | null>(null);
  const [playing, setPlaying] = useState(true);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [edges, setEdges] = useState(true);
  const [note, setNote] = useState<{ text: string; at: number } | null>(null);
  const [hint, setHint] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const edgeTimer = useRef<number | undefined>(undefined);
  const enteredFullscreen = useRef(false);
  const closing = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  function poke() {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), CHROME_MS);
  }

  function showEdges() {
    setEdges(true);
    window.clearTimeout(edgeTimer.current);
    edgeTimer.current = window.setTimeout(() => setEdges(false), EDGE_MS);
  }

  function close() {
    if (closing.current) return;
    closing.current = true;
    onClose();
  }

  function show(to: TheaterSlide | undefined) {
    if (!current || !to || to.key === current.key) return;
    setLeaving(current);
    setCurrentKey(to.key);
  }

  function go(delta: number) {
    if (many) show(list[(index + delta + n) % n]);
  }

  function setSpeed(next: number) {
    setSeconds(next);
    writePref(SECONDS_KEY, String(next));
    setNote({ text: `${next} seconds each`, at: Date.now() });
  }

  function cycleSpeed() {
    const i = THEATER_SPEEDS.findIndex((s) => s === seconds);
    setSpeed(THEATER_SPEEDS[(i + 1) % THEATER_SPEEDS.length]);
  }

  function flipOrder() {
    const next: TheaterOrder = order === "newest" ? "oldest" : "newest";
    setOrder(next);
    writePref(ORDER_KEY, next);
    setNote({ text: next === "newest" ? "Newest first" : "Oldest first", at: Date.now() });
  }

  function togglePlay() {
    if (many) setPlaying((p) => !p);
  }

  function markBroken(key: string) {
    if (key === current?.key && many) setCurrentKey(list[(index + 1) % n].key);
    setBroken((prev) => new Set(prev).add(key));
  }

  // The latest of everything above, for listeners attached once.
  const act = useRef({ go, show, setSpeed, seconds, togglePlay, close, poke, showEdges, list });
  act.current = { go, show, setSpeed, seconds, togglePlay, close, poke, showEdges, list };

  // Nothing left to show (every piece failed to load): leave.
  useEffect(() => {
    if (n === 0) act.current.close();
  }, [n]);

  // The whole screen, where the browser allows it (an iPhone doesn't, for
  // anything but a video: the fixed layer covers the page there). Runs in
  // the click that opened this, so the browser counts it as asked for.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    root?.focus({ preventScroll: true });
    if (root?.requestFullscreen && !document.fullscreenElement) {
      root
        .requestFullscreen()
        .then(() => {
          enteredFullscreen.current = true;
        })
        .catch(() => {});
    }
    // Esc in full screen is the browser's: it leaves full screen, and so do we.
    const onFullscreen = () => {
      if (enteredFullscreen.current && !document.fullscreenElement) act.current.close();
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.documentElement.style.overflow = overflow;
      if (root && document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = act.current;
      switch (e.key) {
        case "ArrowRight":
          a.go(1);
          break;
        case "ArrowLeft":
          a.go(-1);
          break;
        case "ArrowUp":
          a.setSpeed(nextSpeed(a.seconds, true));
          break;
        case "ArrowDown":
          a.setSpeed(nextSpeed(a.seconds, false));
          break;
        case " ":
        case "k":
          a.togglePlay();
          break;
        case "Home":
          a.show(a.list[0]);
          break;
        case "End":
          a.show(a.list[a.list.length - 1]);
          break;
        case "Escape":
          a.close();
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
    // A click inside a player's frame takes the keyboard with it; give it
    // back so the arrows keep working.
    function onBlur() {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active instanceof HTMLIFrameElement && rootRef.current?.contains(active)) {
          rootRef.current.focus({ preventScroll: true });
        }
      }, 0);
    }
    function onVisibility() {
      setHidden(document.hidden);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    act.current.poke();
    act.current.showEdges();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(edgeTimer.current);
    };
  }, []);

  // Once per device: how to drive it.
  useEffect(() => {
    if (readPref(HINT_KEY)) return;
    writePref(HINT_KEY, "1");
    setHint(true);
    const t = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(t);
  }, []);

  // The one leaving fades into the dark, then goes.
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), reduced ? 300 : OUT_MS);
    return () => window.clearTimeout(t);
  }, [leaving, reduced]);

  const currentSlideKey = current?.key;

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 1400);
    return () => window.clearTimeout(t);
  }, [note]);

  // A picture stays up for `seconds` once it has fully arrived; a video
  // moves on when it ends (its slide calls onEnded).
  const arriveMs = reduced ? 300 : IN_DELAY_MS + IN_MS;
  const advancing = !!current && current.kind === "image" && readyKey === current.key && playing && !hidden && many;
  useEffect(() => {
    if (!advancing) return;
    const t = window.setTimeout(() => act.current.go(1), arriveMs + seconds * 1000);
    return () => window.clearTimeout(t);
  }, [advancing, currentSlideKey, seconds, arriveMs]);

  // The next and previous pictures load while this one is up.
  useEffect(() => {
    if (!many) return;
    for (const s of [list[(index + 1) % n], list[(index - 1 + n) % n]]) {
      if (s.kind === "image") new window.Image().src = s.src;
    }
  }, [list, index, n, many]);

  if (!current) return null;

  const layers = leaving && leaving.key !== current.key ? [leaving, current] : [current];
  // A player brings its own controls along its bottom edge, and the mouse
  // over its frame never reaches this page. So a video sits above a band
  // that holds ours, and they stay up while it plays.
  const band = many ? BAND_PX : 0;
  const onPlayer = current.kind !== "image";
  const chromeShown = chrome || !playing || !many || onPlayer;
  const fade = (on: boolean): CSSProperties => ({
    opacity: on ? 1 : 0,
    transition: "opacity 600ms ease",
    pointerEvents: on ? undefined : "none",
  });

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="fixed inset-0 z-[100] overflow-hidden outline-none select-none"
      style={{ backgroundColor: WALL, color: PAPER, cursor: chromeShown ? "auto" : "none" }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        poke();
        showEdges();
      }}
      onFocusCapture={(e) => {
        if (e.target === rootRef.current) return;
        poke();
        // Tabbing to an arrow shows it.
        showEdges();
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* The stage: the piece, edge to edge. Swipe to move; a tap shows or
          hides the controls. */}
      <div
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") touch.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start || e.pointerType === "mouse") return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
          else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            if (chromeShown && !onPlayer && playing && many) {
              window.clearTimeout(hideTimer.current);
              setChrome(false);
            } else poke();
          }
        }}
      >
        {layers.map((s) => (
          <Layer
            key={s.key}
            slide={s}
            entering={s.key === current.key}
            playing={playing && !hidden}
            reduced={reduced}
            band={band}
            onReady={() => setReadyKey(s.key)}
            onEnded={() => {
              if (s.key === current.key && playing) go(1);
            }}
            onBroken={() => markBroken(s.key)}
          />
        ))}
      </div>

      {/* The label, like the card beside a piece on a gallery wall: under
          every picture for as long as it's up, its title and who made it
          (Rick, 2026-11-04). A video has its own title, so none there. Then
          the way out. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10"
        style={{
          background: onPlayer ? "transparent" : "linear-gradient(rgba(0,0,0,0.42), transparent)",
          transition: "background 600ms ease",
        }}
      >
        {onPlayer ? (
          <span />
        ) : (
        <div
          key={current.key}
          className="min-w-0 max-w-[min(640px,100%)] pt-2"
          style={{
            animation: reduced ? undefined : "theater-label 900ms ease 1000ms both",
            textShadow: "0 1px 3px rgba(0,0,0,0.6)",
          }}
        >
          {current.title && (
            <p className="text-[16px] font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>
              {current.title}
            </p>
          )}
          {(current.by || current.projectId) && (
            <p className="mt-0.5 text-[13.5px]" style={{ color: PAPER_DIM }}>
              {current.by}
              {current.by && current.projectId && " · "}
              {current.projectId && (
                <Link
                  to={`/projects/${current.projectId}`}
                  onClick={close}
                  className="pointer-events-auto underline underline-offset-2 hover:opacity-90"
                >
                  Open project
                </Link>
              )}
            </p>
          )}
        </div>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          title="Close (Esc)"
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ ...fade(chromeShown), backgroundColor: GLASS }}
        >
          <X size={20} weight="bold" aria-hidden />
        </button>
      </div>

      {/* Back and forward at the edges: there on opening, then only while
          the mouse moves. */}
      {many && (
        <>
          <EdgeButton side="left" onClick={() => go(-1)} style={fade(edges)} />
          <EdgeButton side="right" onClick={() => go(1)} style={fade(edges)} />
        </>
      )}

      {/* A word when the speed or the order changes. */}
      <div
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-[15px]"
        style={{ ...fade(!!note), backgroundColor: GLASS, color: PAPER }}
      >
        {note?.text}
      </div>

      {/* The controls along the bottom. */}
      {many && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center justify-end gap-2 px-4 pb-[max(14px,env(safe-area-inset-bottom))]"
          style={{ minHeight: band }}
        >
          {hint && (
            <p className="rounded-full px-3 py-1 text-center text-[13.5px]" style={{ backgroundColor: GLASS, color: PAPER_DIM }}>
              {finePointer ? "← → move  ·  ↑ ↓ speed  ·  Space pause  ·  Esc close" : "Swipe to move  ·  Tap for controls"}
            </p>
          )}
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-full px-1.5 py-1 backdrop-blur-md"
            style={{ ...fade(chromeShown), backgroundColor: GLASS }}
          >
            <PillButton label="Previous (←)" onClick={() => go(-1)}>
              <CaretLeft size={18} weight="bold" aria-hidden />
            </PillButton>
            <PillButton label={playing ? "Pause (Space)" : "Play (Space)"} onClick={togglePlay}>
              {playing ? <Pause size={18} weight="fill" aria-hidden /> : <Play size={18} weight="fill" aria-hidden />}
            </PillButton>
            <PillButton label="Next (→)" onClick={() => go(1)}>
              <CaretRight size={18} weight="bold" aria-hidden />
            </PillButton>
            <span className="px-2 text-[13.5px] tabular-nums" style={{ color: PAPER_DIM }}>
              {index + 1} / {n}
            </span>
            <span className="mx-0.5 h-5 w-px bg-white/20" aria-hidden />
            <button
              type="button"
              onClick={cycleSpeed}
              title="Speed (↑ ↓)"
              aria-label={`${seconds} seconds each. Change speed`}
              className="h-10 rounded-full px-3 text-[13.5px] tabular-nums transition-colors hover:bg-white/10"
            >
              {seconds} s
            </button>
            {ordered && (
              <button
                type="button"
                onClick={flipOrder}
                aria-label={order === "newest" ? "Newest first. Change to oldest first" : "Oldest first. Change to newest first"}
                title={order === "newest" ? "Newest first" : "Oldest first"}
                className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[13.5px] transition-colors hover:bg-white/10"
              >
                {order === "newest" ? <SortDescending size={16} aria-hidden /> : <SortAscending size={16} aria-hidden />}
                <span className="hidden sm:inline">{order === "newest" ? "Newest first" : "Oldest first"}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* How long this picture has left, a hairline along the bottom. */}
      {advancing && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" style={fade(chromeShown)} aria-hidden>
          <div
            key={`${current.key}:${seconds}`}
            className="h-full origin-left"
            style={{
              backgroundColor: PAPER_DIM,
              animation: `theater-progress ${seconds * 1000}ms linear ${arriveMs}ms both`,
            }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

/** What opens it, on a person's page and a project's. `className` gives it
 *  another page's button look (the Canvas header's outline). */
export function TheaterButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline)]"
      }
      style={className ? undefined : { borderColor: "var(--app-hairline-raised)", color: "var(--app-text)" }}
    >
      <Play size={14} weight="fill" aria-hidden />
      Theater
    </button>
  );
}

function PillButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function EdgeButton({ side, onClick, style }: { side: "left" | "right"; onClick: () => void; style: CSSProperties }) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-3" : "right-3"} hidden h-14 w-14 items-center justify-center rounded-full transition-colors hover:bg-white/15 sm:flex`}
      style={{ ...style, backgroundColor: GLASS }}
    >
      <Icon size={26} weight="bold" aria-hidden />
    </button>
  );
}

/** One piece on the wall: coming up out of the dark, or going into it. */
function Layer({
  slide,
  entering,
  playing,
  reduced,
  band,
  onReady,
  onEnded,
  onBroken,
}: {
  slide: TheaterSlide;
  entering: boolean;
  playing: boolean;
  reduced: boolean;
  /** Room kept under a video for the controls. */
  band: number;
  onReady: () => void;
  onEnded: () => void;
  onBroken: () => void;
}) {
  // A picture waits in the dark until it has loaded, so it never fades up
  // half drawn. A player is drawn by its own frame and comes up at once.
  const [ready, setReady] = useState(slide.kind !== "image");
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    if (ready && entering) readyRef.current();
  }, [ready, entering]);
  const animation = reduced
    ? entering
      ? ready
        ? "theater-fade 300ms ease both"
        : "none"
      : "theater-fade 300ms ease reverse both"
    : !entering
      ? `theater-out ${OUT_MS}ms cubic-bezier(0.4, 0, 0.2, 1) both`
      : !ready
        ? "none"
        : slide.kind === "image"
          ? `theater-in ${IN_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) ${IN_DELAY_MS}ms both`
          : `theater-fade 1200ms ease ${IN_DELAY_MS}ms both`;
  const player = slide.kind !== "image";
  return (
    <div
      aria-hidden={!entering}
      className="absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden"
      style={{
        bottom: player ? band : 0,
        animation,
        opacity: entering && !ready ? 0 : undefined,
        pointerEvents: entering ? undefined : "none",
      }}
    >
      {slide.kind === "image" ? (
        // ImageFill: the piece whole, over a blurred copy of itself, here
        // dimmed nearly to the wall. Its two pictures share one address, so
        // their load (or failure) is one event for this frame.
        <div
          className="relative h-full w-full overflow-hidden [&>img:first-child]:opacity-[0.22]"
          onLoad={() => setReady(true)}
          onError={onBroken}
        >
          <ImageFill src={slide.src} alt={slide.title ?? ""} />
        </div>
      ) : slide.kind === "video" ? (
        <VideoSlide src={slide.src} title={slide.title} active={entering} playing={playing} onEnded={onEnded} onBroken={onBroken} />
      ) : (
        <EmbedSlide embed={slide.embed} title={slide.title} active={entering} playing={playing} band={band} onEnded={onEnded} />
      )}
    </div>
  );
}

function VideoSlide({
  src,
  title,
  active,
  playing,
  onEnded,
  onBroken,
}: {
  src: string;
  title: string | null;
  active: boolean;
  playing: boolean;
  onEnded: () => void;
  onBroken: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (active && playing) {
      // With sound if the browser allows it, else muted rather than not at all.
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    } else video.pause();
  }, [active, playing]);
  return (
    <video
      ref={ref}
      src={src}
      playsInline
      controls
      preload="auto"
      aria-label={title || "Video"}
      onEnded={active ? onEnded : undefined}
      onError={onBroken}
      className="h-full w-full object-contain"
    />
  );
}

const PLAYER_ORIGIN: Partial<Record<VideoEmbed["kind"], string>> = {
  youtube: "https://www.youtube.com",
  vimeo: "https://player.vimeo.com",
};

function EmbedSlide({
  embed,
  title,
  active,
  playing,
  band,
  onEnded,
}: {
  embed: VideoEmbed;
  title: string | null;
  active: boolean;
  playing: boolean;
  band: number;
  onEnded: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const src = useMemo(() => theaterEmbedUrl(embed, window.location.origin), [embed]);
  const target = PLAYER_ORIGIN[embed.kind];
  const ended = useRef(onEnded);
  ended.current = onEnded;

  function post(message: object) {
    if (target) ref.current?.contentWindow?.postMessage(JSON.stringify(message), target);
  }
  // Ask the player to say when it finishes.
  function subscribe() {
    if (embed.kind === "youtube") {
      post({ event: "listening", id: 1, channel: "widget" });
      post({ event: "command", func: "addEventListener", args: ["onStateChange"], id: 1, channel: "widget" });
    } else if (embed.kind === "vimeo") {
      post({ method: "addEventListener", value: "ended" });
    }
  }
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!target || e.origin !== target || e.source !== ref.current?.contentWindow) return;
      if (embed.kind === "vimeo" && typeof e.data === "string" && e.data.includes('"ready"')) subscribeRef.current();
      if (embedEnded(embed.kind, e.data)) ended.current();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embed.kind, target]);

  // Space pauses the player too, and leaving stops it.
  const live = active && playing;
  const postRef = useRef(post);
  postRef.current = post;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (embed.kind === "youtube") {
      postRef.current({ event: "command", func: live ? "playVideo" : "pauseVideo", args: [], id: 1, channel: "widget" });
    } else if (embed.kind === "vimeo") postRef.current({ method: live ? "play" : "pause" });
  }, [live, embed.kind]);

  // As large as the screen holds at the player's own shape.
  const tall = `(100dvh - ${band}px)`;
  const box: CSSProperties =
    embed.aspect === "9/16"
      ? { height: `min(calc${tall}, calc(100vw * 16 / 9))`, aspectRatio: "9 / 16" }
      : { width: `min(100vw, calc(${tall} * 16 / 9))`, aspectRatio: "16 / 9" };
  return (
    <div style={box}>
      <iframe
        ref={ref}
        src={src}
        title={title || "Video"}
        onLoad={() => subscribeRef.current()}
        className="h-full w-full"
        style={{ border: 0, display: "block" }}
        allow={`${EMBED_ALLOW}; fullscreen`}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
