// One card on the desk: a poster or a paper note that rests at an angle,
// straightens and rises when you point at it, and opens to fill the page.
// The face (picture or tone, scrim, kicker, title, foot) is the same element
// open and closed, so opening is one motion rather than a swap.
//
// Geometry comes from deskLayout.ts; this file draws it. All motion is 620ms
// DESK.ease, and none of it runs under prefers-reduced-motion.

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { AbstractCover } from "../components/AbstractCover";
import { useReducedMotion } from "../hooks/useMediaQuery";
import type { DeskCard } from "./deskCards";
import { Z_HOVER, type Place } from "./deskLayout";
import { DetailPanel } from "./OpenedCard";
import { DESK, DESK_MONO, DESK_SANS, FOCUS_RING_CLASS, MOTION_MS, isFocusVisible, motion } from "./tokens";

const RADIUS = 4;
/** The handoff's card width at scale 1; a card's face type scales from it. */
const CARD_W = 230;
const RADIUS_OPEN = 12;
const SHADOW = "0 10px 30px rgba(0,0,0,.45)";
const SHADOW_HOVER = "0 40px 80px rgba(0,0,0,.6)";
const SHADOW_OPEN = "0 40px 120px rgba(0,0,0,.65)";
// Words over a picture: a deeper scrim than the handoff's (.85 → transparent
// at 55%), since event posters carry their own lettering, plus a lighter one
// over the kicker for bright pictures.
const SCRIM =
  "linear-gradient(to top, rgba(18,18,18,.94) 0%, rgba(18,18,18,.8) 32%, rgba(18,18,18,0) 62%), linear-gradient(to bottom, rgba(18,18,18,.55), transparent 30%)";
const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

/** False on the first frame, true after: a card that has just arrived starts
 * below the window and rises to its place. Two animation frames let the
 * browser draw the starting position first; a timer covers a hidden tab,
 * where frames don't run. */
function useEntered(reduced: boolean): boolean {
  const [entered, setEntered] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setEntered(true);
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    const fallback = setTimeout(() => setEntered(true), 300);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(fallback);
    };
  }, [reduced]);
  return entered;
}

/**
 * Positions a card and animates it. The outer box holds still and only slides,
 * so the pointer doesn't flicker in and out as the card inside straightens;
 * the inner box is the card itself, turned and lifted.
 */
function Shell({
  place,
  vh,
  lift,
  open,
  inert,
  onHover,
  dialogLabel,
  children,
}: {
  place: Place;
  vh: number;
  lift: boolean;
  open: boolean;
  inert: boolean;
  onHover: (hovered: boolean) => void;
  dialogLabel?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const entered = useEntered(reduced);
  const p: Place = entered ? place : { ...place, y: vh + 80, opacity: 0, r: place.r * 3 };
  const hidden = p.opacity === 0;

  return (
    <div
      inert={inert || hidden}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: p.w,
        height: p.h,
        transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
        opacity: p.opacity,
        zIndex: lift ? p.z + Z_HOVER : p.z,
        pointerEvents: hidden ? "none" : "auto",
        transition: motion(["transform", "width", "height", "opacity"], reduced),
      }}
    >
      <div
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? dialogLabel : undefined}
        data-desk-dialog={open ? "" : undefined}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transform: `translateY(${lift ? -8 : 0}px) rotate(${lift ? 0 : p.r}deg)`,
          borderRadius: open ? RADIUS_OPEN : RADIUS,
          boxShadow: open ? SHADOW_OPEN : lift ? SHADOW_HOVER : SHADOW,
          transition: motion(["transform", "box-shadow", "border-radius"], reduced),
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// A card
// ——————————————————————————————————————————————————————————————

export function DeskCardView({
  card,
  place,
  open,
  inert,
  vh,
  onOpen,
  onClose,
}: {
  card: DeskCard;
  place: Place;
  open: boolean;
  /** Another card is open: this one can't be reached. */
  inert: boolean;
  vh: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);

  // The detail panel stays up while the card shrinks back, then goes.
  const [panel, setPanel] = useState(open);
  useEffect(() => {
    if (open) {
      setPanel(true);
      return;
    }
    const timer = setTimeout(() => setPanel(false), reduced ? 0 : MOTION_MS + 80);
    return () => clearTimeout(timer);
  }, [open, reduced]);

  const lift = hovered && place.opacity > 0 && !open;
  const radius = open ? RADIUS_OPEN : RADIUS;
  const label = [card.face.kicker, card.face.title, card.face.foot].filter(Boolean).join(", ");

  return (
    <Shell
      place={place}
      vh={vh}
      lift={lift}
      open={open}
      inert={inert}
      onHover={setHovered}
      dialogLabel={card.detail.title}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, transition: motion(["border-radius"], reduced) }}>
        <Face card={card} open={open} scale={place.w / CARD_W} />
        {panel && <DetailPanel card={card} visible={open} onClose={onClose} />}
      </div>
      {!open && (
        <button
          type="button"
          data-desk-card={card.id}
          aria-label={label}
          aria-haspopup="dialog"
          onClick={onOpen}
          onFocus={(e) => {
            if (isFocusVisible(e.currentTarget)) setHovered(true);
          }}
          onBlur={() => setHovered(false)}
          className={FOCUS_RING_CLASS}
          style={{ position: "absolute", inset: 0, border: 0, padding: 0, background: "transparent", borderRadius: radius, cursor: "pointer" }}
        />
      )}
    </Shell>
  );
}

function Face({ card, open, scale }: { card: DeskCard; open: boolean; scale: number }) {
  const reduced = useReducedMotion();
  const { face, note, image, tone } = card;
  const [broken, setBroken] = useState(false);
  const pic = image && !broken ? image : null;
  // The picture's shape decides cropped or framed, so it stays hidden until
  // it's measured: no cropped poster that then fades into its frame. A cached
  // picture can finish before onLoad is attached; read it on mount too.
  const [shape, setShape] = useState<"unknown" | "wide" | "tall">("unknown");
  const measure = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalHeight > 0) setShape(isWide(el) ? "wide" : "tall");
  }, []);
  const wide = shape === "wide";
  // Event posters carry their own lettering; project and people pictures are
  // photos, which read best full-bleed whatever their shape.
  const framed = Boolean(pic) && (open || (wide && card.kind === "event"));
  const ink = note ? DESK.paperInk : DESK.text;
  const t = (props: string[]) => motion(props, reduced);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: open ? "46%" : "100%",
        padding: open ? 56 : Math.round(22 * Math.min(1, Math.max(0.7, scale))),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 16,
        overflow: "hidden",
        color: ink,
        fontFamily: DESK_SANS,
        background: note ? DESK.paper : pic ? DESK.page : `linear-gradient(165deg, ${tone}, #161616 92%)`,
        transition: t(["width", "padding"]),
      }}
    >
      {!pic && card.kind === "project" && (
        // No photo yet: the same cover the project gets on Today.
        <div aria-hidden style={FILL}>
          <AbstractCover seed={card.id.slice("project:".length)} />
          <div style={{ ...FILL, background: SCRIM }} />
        </div>
      )}

      {pic && (
        <div
          aria-hidden
          style={{ ...FILL, visibility: shape === "unknown" ? "hidden" : "visible", opacity: shape === "unknown" ? 0 : 1, transition: motion(["opacity"], reduced, 240) }}
        >
          <img
            src={pic}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            ref={measure}
            onLoad={(e) => setShape(isWide(e.currentTarget) ? "wide" : "tall")}
            style={{ ...FILL, objectFit: "cover", opacity: framed ? 0 : 1, transition: t(["opacity"]) }}
          />
          <div
            aria-hidden
            style={{
              ...FILL,
              background: SCRIM,
              opacity: framed ? 0 : 1,
              transition: t(["opacity"]),
            }}
          />
          {/* Framed: the whole picture, uncropped, on a dimmed blur of
              itself. Opened cards always frame (the title moves to the
              detail panel); resting event cards frame a wide poster, which
              a portrait card would otherwise crop to half its lettering. */}
          <img
            src={pic}
            alt=""
            aria-hidden
            decoding="async"
            style={{ ...FILL, objectFit: "cover", filter: "blur(28px) brightness(.4)", transform: "scale(1.15)", opacity: framed ? 1 : 0, transition: t(["opacity"]) }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              ...(open ? { top: 40, left: 40, right: 40, bottom: 40 } : { top: 50, left: 14, right: 14, bottom: "44%" }),
              opacity: framed ? 1 : 0,
              transition: t(["opacity", "top", "left", "right", "bottom"]),
            }}
          >
            <img
              src={pic}
              alt=""
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: open ? "center" : "center top" }}
            />
          </div>
        </div>
      )}

      <p
        style={{
          position: "relative",
          margin: 0,
          fontFamily: DESK_MONO,
          fontSize: 12,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          opacity: open && pic ? 0 : 0.9,
          transition: t(["opacity"]),
        }}
      >
        {face.kicker}
      </p>

      <div style={{ position: "relative", minWidth: 0, opacity: open && pic ? 0 : 1, transition: t(["opacity"]) }}>
        <h3
          style={{
            margin: 0,
            // Type follows the card's size on small desks, never below 17px.
            fontSize: open ? 72 : Math.max(17, Math.round((note ? 40 : 26) * Math.min(1, scale))),
            fontWeight: 500,
            lineHeight: open ? 1 : 1.04,
            letterSpacing: "-0.02em",
            overflowWrap: "break-word",
            hyphens: "auto",
            transition: t(["font-size"]),
            ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
          }}
        >
          {face.title}
        </h3>
        {face.foot && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: open ? 16 : 13,
              lineHeight: 1.35,
              opacity: 0.85,
              transition: t(["font-size"]),
              ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
            }}
          >
            {face.foot}
          </p>
        )}
      </div>
    </div>
  );
}

/** Wider than about square: a portrait card would crop it hard. */
function isWide(img: HTMLImageElement): boolean {
  return img.naturalHeight > 0 && img.naturalWidth / img.naturalHeight > 0.95;
}

// ——————————————————————————————————————————————————————————————
// The tail of a long row
// ——————————————————————————————————————————————————————————————

/** "All 12 events →": the last slot of a row that runs long. A link to the full page. */
export function TailCard({ place, vh, inert, label, href }: { place: Place; vh: number; inert: boolean; label: string; href: string }) {
  const [hovered, setHovered] = useState(false);
  const lift = hovered && place.opacity > 0;
  return (
    <Shell place={place} vh={vh} lift={lift} open={false} inert={inert} onHover={setHovered}>
      <Link
        to={href}
        onFocus={(e) => {
          if (isFocusVisible(e.currentTarget)) setHovered(true);
        }}
        onBlur={() => setHovered(false)}
        className={`flex h-full w-full items-center justify-center rounded-[4px] border border-[#333] p-6 text-center no-underline ${FOCUS_RING_CLASS}`}
        style={{ background: DESK.panel, color: DESK.text, fontFamily: DESK_SANS, fontSize: 22, fontWeight: 500, lineHeight: 1.2, letterSpacing: "-0.01em" }}
      >
        {label}
      </Link>
    </Shell>
  );
}
