// One card on the desk: a poster or a paper note that rests at an angle,
// straightens and rises when you point at it, and opens to fill the page.
// The face (picture or tone, scrim, kicker, title, foot) is the same element
// open and closed, so opening is one motion rather than a swap.
//
// Opened, a card with a picture splits: the picture on the left, as wide as
// the picture's shape wants (46 to 62 percent), and the detail panel beside
// it. A card with no picture is a centered sheet, the panel alone. An award's
// paper side is its trophy, large, and nothing else: the panel has the rest.
//
// On a project, event, person or organization, the picture side is also a
// mouse click target for the full page (the yellow button is the keyboard way
// there). An organization's logo is never cropped: it sits whole on a light
// plate, and with no logo the face is its monogram in a square frame. At rest
// the plate (or the monogram's field) is the card's top two-thirds, edge to
// edge, the name and foot are under it, and a small "ORG" tag is in the lower
// right corner; there is no kicker at the top.
//
// Geometry comes from deskLayout.ts; this file draws it. All motion is 620ms
// DESK.ease, and none of it runs under prefers-reduced-motion.

import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import { AbstractCover } from "../components/AbstractCover";
import { CelebrationMark } from "../components/CelebrationMark";
import { CreateCard } from "../components/CreateCard";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { initialsOf } from "../lib/initials";
import type { DeskCreateLink } from "./deskBrowse";
import { opensAsSheet, picturePage, type DeskCard } from "./deskCards";
import { PIC_MIN, Z_HOVER, pictureShare, type Place } from "./deskLayout";
import { DetailPanel, type Stepper } from "./OpenedCard";
import { DESK, DESK_MONO, DESK_SANS, DESK_SCRIPT, FOCUS_RING_CLASS, MOTION_MS, isFocusVisible, motion } from "./tokens";

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
/** An organization at rest: the band under its logo plate (or monogram) that is
 * left for the name and foot. A little over a third, so a two-line name and a
 * foot fit under the plate on the smallest grid card without touching it. */
const ORG_BAND = "36%";

/** False on the first frame, true after: a card that has just arrived starts
 * below the window and rises to its place. Two animation frames let the
 * browser draw the starting position first; a timer covers a hidden tab,
 * where frames don't run. A card that arrives already in its place (one
 * scrolled into the window, or waiting below it) skips the rise. */
function useEntered(reduced: boolean, instant: boolean): boolean {
  const [entered, setEntered] = useState(reduced || instant);
  useEffect(() => {
    if (reduced || instant) {
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
  }, [reduced, instant]);
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
  instant,
  lift,
  open,
  inert,
  onHover,
  dialogLabel,
  flat = false,
  children,
}: {
  place: Place;
  vh: number;
  instant: boolean;
  lift: boolean;
  open: boolean;
  inert: boolean;
  onHover: (hovered: boolean) => void;
  dialogLabel?: string;
  /** No shadow, resting or lifted: an empty slot is not a thing on the desk. */
  flat?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const entered = useEntered(reduced, instant);
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
          boxShadow: flat ? "none" : open ? SHADOW_OPEN : lift ? SHADOW_HOVER : SHADOW,
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

export const DeskCardView = memo(function DeskCardView({
  card,
  place,
  open,
  inert,
  vh,
  onOpen,
  onClose,
  stepper,
}: {
  card: DeskCard;
  place: Place;
  open: boolean;
  /** Another card is open: this one can't be reached. */
  inert: boolean;
  vh: number;
  onOpen: (id: DeskCard["id"]) => void;
  /** Closes the card; given an id, only if that card is still the one open. */
  onClose: (only?: DeskCard["id"]) => void;
  /** Open from a Shortlist list: ← / → through it. */
  stepper?: Stepper;
}) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  // Set once, when the card is first drawn: one that appears below the first
  // screen (scrolled to, or waiting offscreen) doesn't rise from the bottom.
  const [instant] = useState(() => place.y > vh + 1);

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

  // The picture's shape, known once it has loaded, sets the picture side's width.
  const [aspect, setAspect] = useState(0);
  const sheet = opensAsSheet(card);
  // Worked out against the open card, then held while it closes: the card is
  // grid-sized by then, and the panel is still fading.
  const shareRef = useRef(PIC_MIN);
  if (open) shareRef.current = pictureShare(aspect, place.w, place.h);
  const share = shareRef.current;

  const pagePath = picturePage(card);
  const lift = hovered && place.opacity > 0 && !open;
  const radius = open ? RADIUS_OPEN : RADIUS;
  // An organization has no kicker (its "ORG" tag is a corner mark), so its name is
  // said in the label: "Organization, Abiding Practice, Collective · San Diego".
  const label = [card.face.kicker || (card.kind === "org" ? "Organization" : ""), card.face.title, card.face.foot].filter(Boolean).join(", ");

  return (
    <Shell
      place={place}
      vh={vh}
      instant={instant}
      lift={lift}
      open={open}
      inert={inert}
      onHover={setHovered}
      dialogLabel={card.detail.title}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, transition: motion(["border-radius"], reduced) }}>
        <Face card={card} open={open} sheet={sheet} share={share} scale={place.w / CARD_W} onAspect={setAspect} />
        {open && pagePath && <PictureLink to={pagePath} share={share} />}
        {panel && <DetailPanel card={card} visible={open} sheet={sheet} share={share} onClose={onClose} stepper={open ? stepper : undefined} />}
      </div>
      {!open && (
        <button
          type="button"
          data-desk-card={card.id}
          aria-label={label}
          aria-haspopup="dialog"
          onClick={() => onOpen(card.id)}
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
});

const NO_ASPECT = () => {};

/**
 * A card at rest off the desk, as a link to its page: The Garden's home page
 * shelves (brand/GardenHome.tsx). The same face, tilt, shadow and lift as on
 * the desk, in normal flow rather than placed, and it never opens. `stamp`
 * (an event's date) sits on a small dark chip of its own instead of as the
 * face's kicker, so it reads over a poster's own lettering. `label` (a paper
 * note's name, "The Sophia Grant Fund") is set plainly at the top, in place
 * of the face's mono kicker.
 */
export function RestingCard({
  card,
  width,
  height,
  tilt,
  stamp,
  label,
}: {
  card: DeskCard;
  width: number;
  height: number;
  tilt: number;
  stamp?: string;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [lift, setLift] = useState(false);
  const name = [stamp ?? label ?? card.face.kicker, card.face.title, card.face.foot].filter(Boolean).join(", ");
  return (
    <div
      onPointerEnter={() => setLift(true)}
      onPointerLeave={() => setLift(false)}
      style={{
        position: "relative",
        flex: "none",
        width,
        height,
        borderRadius: RADIUS,
        transform: `translateY(${lift ? -8 : 0}px) rotate(${lift ? 0 : tilt}deg)`,
        boxShadow: lift ? SHADOW_HOVER : SHADOW,
        transition: motion(["transform", "box-shadow"], reduced),
      }}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: RADIUS }}>
        <Face card={card} open={false} sheet={false} share={1} scale={width / CARD_W} onAspect={NO_ASPECT} />
        {stamp && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              padding: "6px 9px",
              borderRadius: 3,
              background: "rgba(18,18,18,.86)",
              color: DESK.text,
              fontFamily: DESK_MONO,
              fontSize: 12,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {stamp}
          </span>
        )}
        {label && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 20,
              left: 22,
              right: 22,
              color: card.note ? DESK.paperInk : DESK.text,
              fontFamily: DESK_SANS,
              fontSize: 17,
              fontWeight: 500,
              lineHeight: 1.25,
              textWrap: "balance",
            }}
          >
            {label}
          </span>
        )}
      </div>
      <Link
        to={card.href}
        aria-label={name}
        onFocus={(e) => {
          if (isFocusVisible(e.currentTarget)) setLift(true);
        }}
        onBlur={() => setLift(false)}
        className={FOCUS_RING_CLASS}
        style={{ position: "absolute", inset: 0, borderRadius: RADIUS }}
      />
    </div>
  );
}

/**
 * The "+" card that leads Projects' and Events' grids (deskBrowse
 * browseCreateCard): placed, sized, lifted and risen like the cards around it,
 * but a link to the create flow, not a card that opens. Flat, since an empty
 * slot casts no shadow. Keyboard focus lifts it as it lifts a card.
 */
export const DeskCreateCell = memo(function DeskCreateCell({
  create,
  place,
  vh,
  inert,
}: {
  create: DeskCreateLink;
  place: Place;
  vh: number;
  /** A card is open: this one can't be reached. */
  inert: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  // As for a card: one that arrives below the first screen doesn't rise.
  const [instant] = useState(() => place.y > vh + 1);
  return (
    <Shell place={place} vh={vh} instant={instant} lift={hovered && place.opacity > 0} open={false} inert={inert} onHover={setHovered} flat>
      <div
        style={{ width: "100%", height: "100%" }}
        onFocus={(e) => {
          if (isFocusVisible(e.target as Element)) setHovered(true);
        }}
        onBlur={() => setHovered(false)}
      >
        <CreateCard look="desk" label={create.label} to={create.href} />
      </div>
    </Shell>
  );
});

/** The picture side of an opened card as a mouse click target for the full
 * page: a pointer, and a slight brightening under it. Not a tab stop and not
 * announced: the panel's button says the same thing, for the keyboard. It
 * waits out the opening motion, so the second click of a double-click on a
 * closed card doesn't carry the visitor straight off the desk. */
function PictureLink({ to, share }: { to: string; share: number }) {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setArmed(true);
      return;
    }
    const timer = setTimeout(() => setArmed(true), MOTION_MS);
    return () => clearTimeout(timer);
  }, [reduced]);
  return (
    <Link
      to={to}
      aria-hidden
      tabIndex={-1}
      data-desk-picture-link=""
      className="bg-transparent transition-colors duration-150 hover:bg-[rgba(255,255,255,0.07)]"
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${share * 100}%`, cursor: "pointer", pointerEvents: armed ? "auto" : "none" }}
    />
  );
}

function Face({
  card,
  open,
  sheet,
  share,
  scale,
  onAspect,
}: {
  card: DeskCard;
  open: boolean;
  /** This card opens as a sheet: its face fades out as it does. */
  sheet: boolean;
  /** Width of the face when open, as a share of the open card. */
  share: number;
  scale: number;
  onAspect: (aspect: number) => void;
}) {
  const reduced = useReducedMotion();
  const { face, note, image, tone } = card;
  const [broken, setBroken] = useState(false);
  const pic = image && !broken ? image : null;
  // The picture's shape decides cropped or framed, so it stays hidden until
  // it's measured: no cropped poster that then fades into its frame. A cached
  // picture can finish before onLoad is attached; read it on mount too.
  const [shape, setShape] = useState<"unknown" | "wide" | "tall">("unknown");
  const settle = useCallback(
    (el: HTMLImageElement) => {
      setShape(isWide(el) ? "wide" : "tall");
      // A logo sits on its plate whatever its shape; the picture side stays narrow.
      if (el.naturalHeight > 0 && card.kind !== "org") onAspect(el.naturalWidth / el.naturalHeight);
    },
    [onAspect, card.kind],
  );
  const measure = useCallback(
    (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalHeight > 0) settle(el);
    },
    [settle],
  );
  const wide = shape === "wide";
  // The picture's layers take their final look the moment it is revealed and
  // only animate from then on, so a poster never shows cropped and then fades
  // into its frame.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (shape === "unknown") {
      setArmed(false);
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setArmed(true));
    });
    const fallback = setTimeout(() => setArmed(true), 300);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(fallback);
    };
  }, [shape]);
  // The picture side of an opened card (a sheet has none).
  const split = open && !sheet;
  // Event posters carry their own lettering, so they stay whole: framed,
  // uncropped, on a dimmed blur of themselves. Project and people pictures
  // are photos, which read best full-bleed whatever their shape, resting or open.
  const poster = card.kind === "event";
  // An organization's logo is always framed, on a plate rather than a blur.
  const logo = card.kind === "org";
  const framed = Boolean(pic) && (logo || (poster && (split || wide)));

  // No picture, or not loaded yet: each kind gets a face of its own, so a
  // card is never blank while its picture is on the way.
  const waiting = !pic || shape === "unknown";
  const personCard = waiting && card.kind === "person";
  // No logo (or not loaded yet): the monogram, in a square frame where a person's are bare.
  const orgMark = waiting && logo;
  // An Update is from the house, and a celebration is for you: both wear the
  // accent kicker, with or without a picture.
  const fromTheHouse = card.kind === "update" || card.kind === "celebration";
  const dateCard = waiting && card.kind === "event";
  // Paper is the fund and grant notes' alone; a person with no photo is a dark
  // card with their initials in the paper's color.
  const paper = note;
  const ink = paper ? DESK.paperInk : DESK.text;
  const t = (props: string[]) => motion(props, reduced);
  const tPic = (props: string[]) => (armed ? t(props) : "none");
  // An award's mark: opened, it is the whole paper side. Its amount and fund
  // are in the panel, so saying them on the paper too would say them twice.
  const trophy = card.kind === "celebration" && note ? face.icon : undefined;
  // The words (and the corner mark) leave the face when it opens: from a
  // photo, and from an award, whose trophy takes their place.
  const wordsGo = split && (Boolean(pic) || Boolean(trophy));
  const small = Math.min(1, scale);
  // The card's side padding at rest: where its words start.
  const edge = Math.round(22 * Math.min(1, Math.max(0.7, scale)));
  // An organization has no kicker at the top: it wears a small tag in the lower
  // right corner instead, and the words keep clear of it. With a logo, the plate
  // fills the card's top, edge to edge, and the name is held to two lines and the
  // foot to one so they stay in the band under it.
  const kickerless = logo && !face.kicker;
  const plated = logo && Boolean(pic);
  // The tag is 12px mono at 0.2em tracking (0.8em a letter), plus a gap.
  const tagRoom = face.tag && !split ? Math.ceil(face.tag.length * 12 * 0.8) + 10 : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: split ? `${share * 100}%` : "100%",
        padding: split ? 56 : edge,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 16,
        overflow: "hidden",
        color: ink,
        fontFamily: DESK_SANS,
        background: paper ? DESK.paper : pic && !logo ? DESK.page : `linear-gradient(165deg, ${tone}, #161616 92%)`,
        // A sheet's face goes as the sheet opens; the panel is all that is left.
        opacity: open && sheet ? 0 : 1,
        transition: t(["width", "padding", "opacity"]),
      }}
    >
      {!pic && card.kind === "project" && (
        // No photo yet: the same cover the project gets on Today.
        <div aria-hidden style={FILL}>
          <AbstractCover seed={card.projectId ?? card.id.slice("project:".length)} />
          <div style={{ ...FILL, background: SCRIM }} />
        </div>
      )}

      {fromTheHouse && waiting && !paper && (
        // An Update with no picture: a letterhead. A warm light from the top
        // corner and a thin accent frame inset from the edge, so it reads as
        // a note from the house and not as an event or a person.
        <div aria-hidden style={{ ...FILL, pointerEvents: "none", background: "radial-gradient(120% 70% at 88% 0%, rgba(255,224,102,.17), transparent 60%)" }}>
          <div style={{ position: "absolute", inset: 8, border: "1px solid rgba(255,224,102,.26)", borderRadius: 2 }} />
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
            decoding="async"
            onError={() => setBroken(true)}
            ref={measure}
            onLoad={(e) => settle(e.currentTarget)}
            style={{ ...FILL, objectFit: "cover", opacity: framed ? 0 : 1, transition: tPic(["opacity"]) }}
          />
          <div
            aria-hidden
            style={{
              ...FILL,
              background: SCRIM,
              // Words go from a photo's face when it opens: they move to the panel.
              opacity: framed || split ? 0 : 1,
              transition: tPic(["opacity"]),
            }}
          />
          {/* Framed: the whole picture, uncropped, on a dimmed blur of
              itself. An opened poster is framed; a resting event card frames a
              wide poster, which a portrait card would otherwise crop to half
              its lettering. */}
          <img
            src={pic}
            alt=""
            aria-hidden
            decoding="async"
            style={{ ...FILL, objectFit: "cover", filter: "blur(28px) brightness(.4)", transform: "scale(1.15)", opacity: framed && !logo ? 1 : 0, transition: tPic(["opacity"]) }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              // Open, the side is the poster's own shape, so a small margin
              // lets the poster fill its larger side. A resting logo's plate
              // is the card's top, edge to edge (the card's own clip rounds
              // its corners), with the name and foot in the band below.
              ...(split
                ? { top: 28, left: 28, right: 28, bottom: 28 }
                : logo
                  ? { top: 0, left: 0, right: 0, bottom: ORG_BAND }
                  : { top: 50, left: 14, right: 14, bottom: "44%" }),
              opacity: framed ? 1 : 0,
              transition: tPic(["opacity", "top", "left", "right", "bottom"]),
            }}
          >
            {/* A logo's plate: the card's whole top resting, with the logo
                as large as a modest margin allows; a shorter one centered in
                the picture side open, so it reads as a mat around the logo
                and not as a light slab. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: logo && split ? "14%" : 0,
                bottom: logo && split ? "14%" : 0,
                boxSizing: "border-box",
                ...(logo ? { background: DESK.plate, borderRadius: split ? 8 : 0, padding: split ? 56 : "11%" } : {}),
                transition: tPic(["top", "bottom", "padding", "border-radius"]),
              }}
            >
              <img
                src={pic}
                alt=""
                decoding={logo ? "sync" : "async"}
                style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: split || logo ? "center" : "center top" }}
              />
            </div>
          </div>
        </div>
      )}

      {face.icon && (
        // A celebration's mark in the top corner, so a cheer, a backing and
        // an award tell apart at a glance. Over a photo it goes with the
        // words when the card opens; an award's goes too, for its big one.
        // That one holds its resting size and place as it fades, so it
        // doesn't jump on the way out.
        <CelebrationMark
          icon={face.icon}
          size={split && !trophy ? 44 : Math.max(24, Math.round(32 * small))}
          color={paper ? ink : DESK.accent}
          style={{
            position: "absolute",
            top: split && !trophy ? 52 : edge - 2,
            right: split && !trophy ? 52 : edge - 2,
            filter: pic ? "drop-shadow(0 1px 8px rgba(0,0,0,.65))" : undefined,
            opacity: wordsGo ? 0 : 1,
            transition: t(["opacity", "top", "right"]),
          }}
        />
      )}

      {trophy && (
        // Opened, the award's paper side is its trophy alone, centered both
        // ways and sized by the side, not by pixels, so it fills a wide
        // window and a narrow one alike; the cap keeps it off the edges on a
        // short one. It grows in a little as the card opens.
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div
            style={{
              width: "42%",
              maxWidth: 260,
              aspectRatio: "1",
              opacity: split ? 1 : 0,
              transform: `scale(${split ? 1 : 0.85})`,
              transition: t(["opacity", "transform"]),
            }}
          >
            <CelebrationMark icon={trophy} size="100%" color={ink} />
          </div>
        </div>
      )}

      {dateCard ? (
        // No poster: the date, set large, is the face.
        <p
          style={{
            position: "relative",
            margin: 0,
            fontSize: Math.max(28, Math.round(40 * Math.min(1.1, scale))),
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
            opacity: split ? 0 : 1,
            transition: t(["opacity"]),
          }}
        >
          {face.kicker}
        </p>
      ) : kickerless ? null : (
        <p
          style={{
            position: "relative",
            margin: 0,
            fontFamily: DESK_MONO,
            fontSize: 12,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            // "Recurring gig · Fridays 8–10pm" runs to two lines on a card; no more than three.
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
            overflowWrap: "break-word",
            color: fromTheHouse && !paper ? DESK.accent : undefined,
            // Room for a celebration's mark in the corner.
            paddingRight: face.icon ? 40 : undefined,
            // Over a picture the accent needs a little help to stay readable.
            textShadow: fromTheHouse && pic ? "0 1px 10px rgba(0,0,0,.65)" : undefined,
            opacity: wordsGo ? 0 : fromTheHouse ? 1 : 0.9,
            transition: t(["opacity"]),
          }}
        >
          {face.kicker}
        </p>
      )}

      {personCard && (
        // No photo: the initials, large, in the paper's color.
        <div aria-hidden style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}>
          <span
            style={{
              fontSize: Math.max(56, Math.round(92 * Math.min(1.15, scale))),
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: DESK.paper,
              opacity: split ? 0 : 0.92,
              transition: t(["opacity"]),
            }}
          >
            {initialsOf(face.title)}
          </span>
        </div>
      )}

      {orgMark && (
        // No logo: the initials, in a square frame (a person's are round-feeling
        // and bare), centered in the same top area a logo's plate fills.
        <div
          aria-hidden
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: ORG_BAND, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: Math.max(72, Math.round(120 * Math.min(1.25, scale))),
              height: Math.max(72, Math.round(120 * Math.min(1.25, scale))),
              border: "1.5px solid rgba(237,227,180,.5)",
              borderRadius: 6,
              fontSize: Math.max(30, Math.round(52 * Math.min(1.25, scale))),
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: DESK.paper,
              opacity: split ? 0 : 0.92,
              transition: t(["opacity"]),
            }}
          >
            {initialsOf(face.title)}
          </span>
        </div>
      )}

      {/* An organization's words are the only thing in the flow, so they hold the bottom themselves. */}
      <div style={{ position: "relative", minWidth: 0, marginTop: logo ? "auto" : undefined, opacity: wordsGo ? 0 : 1, transition: t(["opacity"]) }}>
        {fromTheHouse && <span aria-hidden style={{ display: "block", width: 28, height: 2, marginBottom: 12, background: paper ? ink : DESK.accent }} />}
        <h3
          style={{
            margin: 0,
            // Type follows the card's size on small desks, never below 17px.
            // A sheet keeps the resting size while its face fades.
            fontSize: split ? 72 : Math.max(17, Math.round((note || face.large ? 40 : 26) * small)),
            fontWeight: 500,
            lineHeight: split ? 1 : 1.04,
            letterSpacing: "-0.02em",
            // A word never breaks mid-way; only one wider than its whole line gives way.
            overflowWrap: "break-word",
            hyphens: "manual",
            // With a foot, the foot's row is the tag's; without one, the name's last line is.
            paddingRight: face.foot || !tagRoom ? undefined : tagRoom,
            transition: t(["font-size", "padding-right"]),
            ...(split ? {} : { display: "-webkit-box", WebkitLineClamp: plated ? 2 : 3, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
          }}
        >
          {face.title}
        </h3>
        {face.foot && face.script ? (
          // A signature: the fund's name in handwriting under an award.
          <p
            style={{
              margin: "8px 0 0",
              fontFamily: DESK_SCRIPT,
              fontWeight: 600,
              fontSize: split ? 40 : Math.max(20, Math.round(26 * small)),
              lineHeight: 1.05,
              transform: "rotate(-2deg)",
              transformOrigin: "left center",
              overflowWrap: "break-word",
              transition: t(["font-size"]),
            }}
          >
            {face.foot}
          </p>
        ) : face.foot && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: split ? 16 : 13,
              lineHeight: 1.35,
              opacity: 0.85,
              hyphens: "manual",
              overflowWrap: "break-word",
              paddingRight: tagRoom || undefined,
              transition: t(["font-size", "padding-right"]),
              ...(split ? {} : { display: "-webkit-box", WebkitLineClamp: plated ? 1 : 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }),
            }}
          >
            {face.foot}
          </p>
        )}
      </div>

      {face.tag && (
        // A small tag in the lower-right corner, on the last line of the words
        // (the foot, or the name without one). The tracking leaves a gap after
        // the last letter, which the negative margin takes back so the letters,
        // not the gap, sit on the edge. The label says what it stands for.
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: edge,
            bottom: edge,
            marginRight: "-0.2em",
            fontFamily: DESK_MONO,
            fontSize: 12,
            lineHeight: 1.35,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            opacity: split ? 0 : 0.9,
            transition: t(["opacity"]),
          }}
        >
          {face.tag}
        </span>
      )}
    </div>
  );
}

/** Wider than about square: a portrait card would crop it hard. */
function isWide(img: HTMLImageElement): boolean {
  return img.naturalHeight > 0 && img.naturalWidth / img.naturalHeight > 0.95;
}
