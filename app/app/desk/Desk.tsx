// The desk: /today on a desktop. A dotted dark surface, a greeting, and the
// things that matter right now resting on it as paper (docs/features/
// desktop-desk-palette.md, "Desk"). The palette in the lower-left corner
// chooses what's on the desk by writing the URL; this reads it:
//
//   /today?view=events&card=event:<id>
//
// Hooks stay above every return. A Rules-of-Hooks violation crashed a page
// before.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { buildDeskCards, cardsInView, tailLabel } from "./deskCards";
import { DeskCardView, TailCard } from "./DeskCard";
import { greetingFor } from "./deskGreeting";
import { Z_DIM, TAIL_HREF, TAIL_ID, layoutDesk, type Place } from "./deskLayout";
import { COMMUNITY_LABEL, DESK_VIEW_LABEL, deskHref, parseDeskView, useDeskCommunity, type DeskCardId, type DeskView } from "./deskState";
import { DESK, DESK_SANS, FOCUS_RING_CLASS, monoLabel, motion } from "./tokens";
import { useDeskData } from "./useDeskData";

// Cards that aren't on show wait below the window. Past this many, the extras
// aren't drawn at all (a tail card or a full page reaches them).
const MOUNT_LIMIT = 36;

export function Desk() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const community = useDeskCommunity();
  const reduced = useReducedMotion();

  const view = parseDeskView(searchParams.get("view"));
  const cardParam = searchParams.get("card");

  const { input, loaded, profile } = useDeskData();

  const rootRef = useRef<HTMLDivElement>(null);
  const size = useDeskSize(rootRef);

  // Whether I pushed the open card onto the history (so Back is how it closes).
  const pushed = useRef(false);
  const lastOpen = useRef<string | null>(null);

  const cards = useMemo(() => buildDeskCards(input, community), [input, community]);

  const openId = cardParam && cards.some((c) => c.id === cardParam) ? cardParam : null;

  const places = useMemo(
    () => layoutDesk({ cards, view, openId, vw: size.w, vh: size.h }),
    [cards, view, openId, size.w, size.h],
  );

  // The cards that are drawn: every one on show, plus the first few waiting.
  const mounted = useMemo(
    () => cards.filter((c, i) => i < MOUNT_LIMIT || (places.get(c.id)?.opacity ?? 0) > 0),
    [cards, places],
  );

  const inView = useMemo(() => cardsInView(cards, view), [cards, view]);

  // The tail card keeps its last wording so it can fall away rather than blink out.
  const tailPlace = places.get(TAIL_ID) ?? null;
  const tailText = useRef<{ label: string; href: string } | null>(null);
  const tailHref = TAIL_HREF[view];
  if (tailPlace && tailHref) tailText.current = { label: tailLabel(view, inView.length), href: tailHref };

  const open = useCallback(
    (id: DeskCardId) => {
      pushed.current = true;
      navigate(deskHref(view, id));
    },
    [navigate, view],
  );

  const close = useCallback(() => {
    if (pushed.current) navigate(-1);
    else navigate(deskHref(view), { replace: true });
  }, [navigate, view]);

  // Once nothing is open, Back is just Back again.
  useEffect(() => {
    if (!cardParam) pushed.current = false;
  }, [cardParam]);

  // Escape closes. Tab stays inside the open card. The palette's own Escape
  // (closing its stack or fan) marks the event handled, and this stands down.
  useEffect(() => {
    if (!openId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        trapTab(e);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openId, close]);

  // Hand focus back to the card that was open.
  useEffect(() => {
    const was = lastOpen.current;
    lastOpen.current = openId;
    if (was && !openId) {
      rootRef.current?.querySelector<HTMLElement>(`[data-desk-card="${CSS.escape(was)}"]`)?.focus({ preventScroll: true });
    }
  }, [openId]);

  const empty = loaded && inView.length === 0;
  const greeting = greetingFor(new Date().getHours(), profile?.name);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        isolation: "isolate",
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        background: DESK.surface,
        backgroundImage: `radial-gradient(${DESK.dot} 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
        color: DESK.text,
        fontFamily: DESK_SANS,
      }}
    >
      <div aria-hidden={!!openId} style={{ position: "absolute", left: 48, top: 44, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ ...monoLabel(12, "0.24em"), margin: 0, color: DESK.muted }}>
          {COMMUNITY_LABEL[community]} · {DESK_VIEW_LABEL[view]}
        </p>
        {/* Held back until the profile arrives, so the name doesn't pop in. */}
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            color: DESK.text,
            visibility: profile === undefined ? "hidden" : "visible",
          }}
        >
          {greeting}
        </h1>
      </div>

      {empty && <EmptyDesk view={view} />}

      {mounted.map((card) => (
        <DeskCardView
          key={card.id}
          card={card}
          place={places.get(card.id) ?? OFFSCREEN}
          open={card.id === openId}
          inert={!!openId && card.id !== openId}
          vh={size.h}
          onOpen={() => open(card.id)}
          onClose={close}
        />
      ))}

      {tailText.current && (
        <TailCard
          place={tailPlace ?? { x: size.w / 2 - 115, y: size.h + 80, w: 230, h: 200, r: 0, opacity: 0, z: 0 }}
          vh={size.h}
          inert={!!openId || !tailPlace}
          label={tailText.current.label}
          href={tailText.current.href}
        />
      )}

      <div
        aria-hidden
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: Z_DIM,
          background: "rgba(10,10,10,.6)",
          opacity: openId ? 1 : 0,
          pointerEvents: openId ? "auto" : "none",
          transition: motion(["opacity"], reduced),
        }}
      />
    </div>
  );
}

const OFFSCREEN: Place = { x: 0, y: 0, w: 230, h: 310, r: 0, opacity: 0, z: 0 };

// ——————————————————————————————————————————————————————————————
// Empty view
// ——————————————————————————————————————————————————————————————

function EmptyDesk({ view }: { view: DeskView }) {
  const reduced = useReducedMotion();
  const findPeople = view === "people" || view === "fav";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: 48,
        pointerEvents: "none",
        animation: reduced ? "none" : "desk-fade-in 400ms ease 300ms both",
      }}
    >
      <style>{"@keyframes desk-fade-in { from { opacity: 0 } to { opacity: 1 } }"}</style>
      <p style={{ margin: 0, fontSize: 20, color: DESK.muted }}>
        {view === "all" ? "Nothing on your desk yet." : `Nothing from ${DESK_VIEW_LABEL[view]} on the desk yet.`}
      </p>
      {findPeople && (
        <Link to="/people" className={`pointer-events-auto text-[15px] text-[#FFE066] underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`}>
          Find people →
        </Link>
      )}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————————————————————————

/** The window the desk fills. Cards are laid out in these pixels. */
function useDeskSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 1200 : window.innerWidth,
    h: typeof window === "undefined" ? 760 : window.innerHeight,
  }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize((prev) => (Math.round(prev.w) === Math.round(r.width) && Math.round(prev.h) === Math.round(r.height) ? prev : { w: r.width, h: r.height }));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** The palette's corner: it sits above the opened card on purpose, so the
 * keyboard can reach it while a card is open. */
const PALETTE_SELECTOR = '.desk-pal, [aria-label="Navigation"]';

function trapTab(e: KeyboardEvent) {
  const dialog = document.querySelector<HTMLElement>("[data-desk-dialog]");
  if (!dialog) return;
  const active = document.activeElement;
  // Focus is in the palette: Tab moves through it as it would anywhere.
  if (active?.closest(PALETTE_SELECTOR)) return;
  const items = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => !el.closest("[inert]") && el.offsetParent !== null);
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (!dialog.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
