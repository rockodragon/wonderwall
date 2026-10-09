// A stack of Canvas cards to flip through (The Garden's home page,
// brand/GardenHome.tsx). One card faces up and opens its page; the next few
// rest underneath, each turned a little further, so the stack reads as more
// to see. Next throws the top card off to the right and tucks it under the
// rest; Previous brings the bottom card back up. A swipe does the same on a
// phone. Pointing at the stack spreads it a little, and it does that once on
// its own when it first comes into view, to say "flip me".
//
// The cards are the Canvas's own (desk/DeskCard.tsx RestingCard). No motion
// under prefers-reduced-motion: the cards just change places.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { RestingCard } from "../desk/DeskCard";
import type { DeskCard } from "../desk/deskCards";
import { DESK, FOCUS_RING_CLASS } from "../desk/tokens";
import { useReducedMotion } from "../hooks/useMediaQuery";

export type StackItem = { card: DeskCard; stamp?: string; label?: string };

/** The cards under the top one: offset right and up, each turned further. */
const LAYERS = [
  { x: 0, y: 0, r: -1.5 },
  { x: 14, y: -8, r: 3 },
  { x: 26, y: -15, r: -4.5 },
  { x: 36, y: -21, r: 6.5 },
];
/** How far the stack spreads when pointed at, as a multiple of the above. */
const FAN = 1.7;
/** Room around the top card for the ones underneath and the spread. */
const ROOM_X = 70;
const ROOM_Y = 30;
const THROW_MS = 260;
const SETTLE_MS = 460;
const SWIPE_PX = 40;

export function CardStack({
  items,
  width,
  height,
  label,
  loading = false,
  nudgeAfter = 500,
}: {
  items: StackItem[];
  width: number;
  height: number;
  /** What the cards are, for the buttons: "projects". */
  label: string;
  loading?: boolean;
  /** When the first-view spread starts, so two stacks side by side don't move in step. */
  nudgeAfter?: number;
}) {
  const reduced = useReducedMotion();
  const n = items.length;
  const [top, setTop] = useState(0);
  const [throwing, setThrowing] = useState<string | null>(null);
  const [fanned, setFanned] = useState(false);
  const [nudged, setNudged] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; swiped: boolean } | null>(null);

  // Fewer cards after a refresh: keep the top in range.
  useEffect(() => {
    if (top >= n && n > 0) setTop(0);
  }, [n, top]);

  // Once, the first time the stack comes into view: spread and settle.
  useEffect(() => {
    const el = box.current;
    if (!el || reduced || n < 2 || typeof IntersectionObserver === "undefined") return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        timers = [setTimeout(() => setNudged(true), nudgeAfter), setTimeout(() => setNudged(false), nudgeAfter + 900)];
      },
      { threshold: 0.6 },
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [reduced, n, nudgeAfter]);

  const step = (dir: 1 | -1) => {
    if (n < 2 || throwing) return;
    if (dir === 1 && !reduced) {
      setThrowing(items[top].card.id);
      setTimeout(() => {
        setTop((t) => (t + 1) % n);
        setThrowing(null);
      }, THROW_MS);
      return;
    }
    setTop((t) => (t + dir + n) % n);
  };

  const spread = (fanned || nudged) && !throwing ? FAN : 1;
  const stackStyle: CSSProperties = { position: "relative", width: width + ROOM_X, height: height + ROOM_Y, touchAction: "pan-y" };

  if (loading) {
    return (
      <div aria-hidden style={stackStyle}>
        {LAYERS.slice(0, 3).map((l, d) => (
          <div
            key={d}
            style={{
              position: "absolute",
              left: 0,
              top: ROOM_Y,
              width,
              height,
              borderRadius: 4,
              background: DESK.panel,
              border: `1px solid ${DESK.line}`,
              transform: `translate(${l.x}px, ${l.y}px) rotate(${l.r}deg)`,
              zIndex: 10 - d,
            }}
          />
        ))}
      </div>
    );
  }
  if (n === 0) return null;

  return (
    <div>
      <div
        ref={box}
        style={stackStyle}
        onPointerEnter={() => setFanned(true)}
        onPointerLeave={() => setFanned(false)}
        onFocusCapture={() => setFanned(true)}
        onBlurCapture={() => setFanned(false)}
        onPointerDown={(e) => {
          press.current = { x: e.clientX, swiped: false };
        }}
        onPointerUp={(e) => {
          const p = press.current;
          if (!p) return;
          const dx = e.clientX - p.x;
          if (Math.abs(dx) > SWIPE_PX) {
            p.swiped = true;
            step(dx < 0 ? 1 : -1);
          }
        }}
        // A swipe isn't a click on the card under the finger.
        onClickCapture={(e) => {
          if (press.current?.swiped) {
            e.preventDefault();
            e.stopPropagation();
          }
          press.current = null;
        }}
      >
        {items.map((item, i) => {
          const depth = (i - top + n) % n;
          const thrown = item.card.id === throwing;
          if (depth >= LAYERS.length && !thrown) return null;
          const l = LAYERS[Math.min(depth, LAYERS.length - 1)];
          const transform = thrown
            ? `translate(${Math.round(width * 0.95)}px, 24px) rotate(14deg)`
            : `translate(${l.x * spread}px, ${l.y * spread}px) rotate(${l.r * spread}deg)`;
          const face = depth === 0 && !thrown;
          return (
            <div
              key={item.card.id}
              inert={!face}
              aria-hidden={!face}
              style={{
                position: "absolute",
                left: 0,
                top: ROOM_Y,
                zIndex: thrown ? 20 : 10 - depth,
                transform,
                transition: reduced ? "none" : `transform ${thrown ? THROW_MS : SETTLE_MS}ms ${DESK.ease}`,
              }}
            >
              <RestingCard card={item.card} stamp={item.stamp} label={item.label} width={width} height={height} tilt={0} />
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <StepButton label={`Previous ${label}`} onClick={() => step(-1)}>
            <CaretLeft size={18} weight="bold" aria-hidden />
          </StepButton>
          <span aria-live="polite" className="min-w-[3.5rem] text-center text-[15px]" style={{ color: DESK.textQuiet, fontVariantNumeric: "tabular-nums" }}>
            {top + 1} / {n}
          </span>
          <StepButton label={`Next ${label}`} onClick={() => step(1)}>
            <CaretRight size={18} weight="bold" aria-hidden />
          </StepButton>
        </div>
      )}
    </div>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#333333] bg-[rgba(24,24,24,.92)] text-[#F4F4F2] transition-colors hover:border-[#FFE066] hover:text-[#FFE066] ${FOCUS_RING_CLASS}`}
    >
      {children}
    </button>
  );
}
