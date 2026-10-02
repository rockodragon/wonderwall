// The desk: /today on a desktop. A dotted dark surface, a header, and the
// things that matter right now resting on it as paper (docs/features/
// desktop-desk-palette.md, "Desk" and "Round 2"). The palette in the
// lower-left corner chooses what's on the desk by writing the URL; this reads
// it:
//
//   /today?view=events&card=event:<id>
//
// The surface is the window's size and scrolls inside: a scroller holds one
// page-high box, the header sits at its top in flow, and every card is
// absolutely placed in it (deskLayout.ts gives the places and the page's
// height). People, Projects, Events and Favorites run long as a grid; Home is a
// scatter and Today a short row, neither of which scrolls.
//
// Hooks stay above every return. A Rules-of-Hooks violation crashed a page
// before.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { buildDeskCards, cardsInView, opensAsSheet, type DeskCard } from "./deskCards";
import { DeskCardView } from "./DeskCard";
import { DeskCreate } from "./DeskCreate";
import { isBrowseView, useDeskBrowse, type BrowseView, type DeskBrowse } from "./deskBrowse";
import { greetingFor } from "./deskGreeting";
import { DeskHeader, type HeaderSize } from "./DeskHeader";
import { DEFAULT_HEADER_H, Z_DIM, layoutDeskFull, type LayoutCard, type Place } from "./deskLayout";
import { DESK_VIEW_LABEL, parseDeskView, useDeskCommunity, useDeskSpacing, type DeskCardId, type DeskView } from "./deskState";
import { SpacingControl } from "./SpacingControl";
import { DESK, DESK_SANS, FOCUS_RING_CLASS, MOTION_MS, motion } from "./tokens";
import { useDeskData } from "./useDeskData";

/** Cards that aren't on show wait below the page. Past this many, the extras
 *  aren't drawn at all. */
const WAITING_LIMIT = 36;
/** A grid card is drawn while it is within this many viewport heights of the
 *  window; one scrolled far away is not. */
const WINDOW_AHEAD = 1.75;
const WINDOW_BEHIND = 0.75;
/** The scroll position is tracked in steps this big, so scrolling does not
 *  redraw the desk on every pixel. */
const SCROLL_STEP = 240;
/** Cards that left the view keep falling for this long before they are dropped. */
const LEAVE_MS = MOTION_MS + 120;
const LEAVE_LIMIT = 48;
/** Views that browse a list read their cards from useDeskBrowse; the hook
 *  can't be skipped, so on any other view it is pointed at Events, whose
 *  upcoming list the desk has already loaded. */
const IDLE_BROWSE: BrowseView = "events";

export function Desk() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const community = useDeskCommunity();
  const space = useDeskSpacing();
  const reduced = useReducedMotion();

  const view = parseDeskView(searchParams.get("view"));
  const cardParam = searchParams.get("card");
  const browsing = isBrowseView(view);

  const { input, loaded, profile } = useDeskData();

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const size = useDeskSize(scrollRef);
  const [header, setHeader] = useState<HeaderSize>({ title: 0, total: DEFAULT_HEADER_H });
  const onMeasure = useCallback((next: HeaderSize) => {
    setHeader((prev) => (prev.title === next.title && prev.total === next.total ? prev : next));
  }, []);

  // Whether I pushed the open card onto the history (so Back is how it closes).
  const pushed = useRef(false);
  const lastOpen = useRef<string | null>(null);
  // The URL's other params (filters) ride along when a card opens or closes.
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;

  // ——— Cards ———

  const deskCards = useMemo(() => buildDeskCards(input, community), [input, community]);

  // Today's matching cards stand in until the list's own data arrives.
  const fallback = useMemo(() => (loaded && browsing ? cardsInView(deskCards, view) : undefined), [loaded, browsing, deskCards, view]);
  const browse = useDeskBrowse(browsing ? view : IDLE_BROWSE, community, fallback);

  // What is on show in this view, in order. A browse view's own list is the
  // whole view; its cards replace the desk's own versions of the same cards.
  const shown: readonly DeskCard[] | undefined = useMemo(
    () => (browsing ? browse.cards : cardsInView(deskCards, view)),
    [browsing, browse.cards, deskCards, view],
  );
  const current = useMemo(() => {
    if (!browsing || !browse.cards) return deskCards;
    const own = new Set(browse.cards.map((c) => c.id));
    return [...browse.cards, ...deskCards.filter((c) => !own.has(c.id))];
  }, [browsing, browse.cards, deskCards]);
  // Cards that just left (a filter narrowed the list, another view came up)
  // fall away rather than blink out.
  const leaving = useLeaving(current, reduced);
  const allCards = useMemo(() => (leaving.length ? [...current, ...leaving] : current), [current, leaving]);

  const openId = cardParam && current.some((c) => c.id === cardParam) ? cardParam : null;

  // ——— Scroll ———

  const [scroll, setScroll] = useState({ step: 0, stuck: false });
  const titleHeight = useRef(0);
  titleHeight.current = header.title;
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const top = scrollRef.current?.scrollTop ?? 0;
      const step = Math.floor(top / SCROLL_STEP);
      // The filter row pins once the title above it has scrolled away.
      const stuck = titleHeight.current > 0 && top >= titleHeight.current;
      setScroll((prev) => (prev.step === step && prev.stuck === stuck ? prev : { step, stuck }));
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // An open card sits in the window, so it needs to know how far down the page
  // that is. The page is locked while a card is open, so the number holds.
  const [openScroll, setOpenScroll] = useState(0);
  useLayoutEffect(() => {
    if (openId) setOpenScroll(scrollRef.current?.scrollTop ?? 0);
  }, [openId]);

  // A new view or a new filter starts at the top of its list; opening or
  // closing a card does not move the page.
  const filterKey = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    p.delete("card");
    p.delete("create");
    return p.toString();
  }, [searchParams]);
  const lastFilterKey = useRef(filterKey);
  useLayoutEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filterKey]);

  // ——— Layout ———

  const layoutCards: LayoutCard[] = useMemo(() => {
    const gone = new Set(leaving.map((c) => c.id));
    return allCards.map((c) => ({ id: c.id, sections: gone.has(c.id) ? [] : c.sections, note: c.note, sheet: opensAsSheet(c) }));
  }, [allCards, leaving]);
  const shownIds = useMemo(() => (browsing ? (shown ?? []).map((c) => c.id) : undefined), [browsing, shown]);

  const layout = useMemo(
    () =>
      layoutDeskFull({
        cards: layoutCards,
        view,
        openId,
        vw: size.w,
        vh: size.h,
        top: header.total,
        scrollTop: openId ? openScroll : 0,
        shown: shownIds,
        space,
      }),
    [layoutCards, view, openId, size.w, size.h, header.total, openScroll, shownIds, space],
  );
  const places = layout.places;

  // The cards that are drawn. On a long grid, only those near the window; a
  // card waiting offscreen is kept up to a limit so it can fall and return.
  const mounted = useMemo(() => {
    const long = layout.height > size.h * 1.5;
    const from = scroll.step * SCROLL_STEP - size.h * WINDOW_BEHIND;
    const to = (scroll.step + 1) * SCROLL_STEP + size.h * WINDOW_AHEAD;
    let waiting = 0;
    return allCards.filter((c) => {
      if (c.id === openId) return true;
      const p = places.get(c.id);
      if (!p || p.opacity === 0) return waiting++ < WAITING_LIMIT;
      if (!long) return true;
      // The first screen always stays drawn, so scrolling back up finds it.
      return p.y < size.h * 1.5 || (p.y + p.h >= from && p.y <= to);
    });
  }, [allCards, places, openId, layout.height, size.h, scroll.step]);

  // ——— Opening and closing ———

  const open = useCallback(
    (id: DeskCardId) => {
      pushed.current = true;
      const next = new URLSearchParams(paramsRef.current);
      next.set("card", id);
      navigate({ search: `?${next.toString()}` });
    },
    [navigate],
  );

  const close = useCallback(() => {
    if (pushed.current) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(paramsRef.current);
    next.delete("card");
    const qs = next.toString();
    navigate({ search: qs ? `?${qs}` : "" }, { replace: true });
  }, [navigate]);

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

  // ——— Header and empty view ———

  // How many cards are on show; null while the list is still arriving.
  const listed = browsing ? browse.cards : loaded ? (shown ?? []) : undefined;
  const shownCount = listed ? listed.length : null;
  // The header counts the view's own things: the fund and grant notes aren't projects.
  const count = view === "all" || !listed ? null : listed.filter((c) => !c.note).length;
  const empty = shownCount === 0;
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
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          position: "absolute",
          inset: 0,
          overflowX: "hidden",
          // Locked while a card is open: the card sits in the window.
          overflowY: openId ? "hidden" : "auto",
          // Keeps the width the same when the lock takes the scrollbar away.
          scrollbarGutter: "stable",
          overscrollBehavior: "contain",
          // A card that takes focus scrolls clear of the pinned filter row.
          scrollPaddingTop: 88,
        }}
      >
        {/* `clip`, not `hidden`: a card waiting below the page must not make
            it longer, and the filter row inside still pins to the scroller. */}
        <div style={{ position: "relative", height: layout.height, overflow: "clip" }}>
          <DeskHeader
            view={view}
            community={community}
            greeting={greeting}
            greetingReady={profile !== undefined}
            count={count}
            stuck={scroll.stuck}
            inert={!!openId}
            onMeasure={onMeasure}
          />

          {empty && <EmptyDesk view={view} browse={browsing ? browse : null} top={header.total} height={size.h} />}

          {mounted.map((card) => (
            <DeskCardView
              key={card.id}
              card={card}
              place={places.get(card.id) ?? OFFSCREEN}
              open={card.id === openId}
              inert={!!openId && card.id !== openId}
              vh={size.h}
              onOpen={open}
              onClose={close}
            />
          ))}
        </div>
      </div>

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

      <DeskCreate />
      {profile?.isAdmin && <SpacingControl />}
    </div>
  );
}

const OFFSCREEN: Place = { x: 0, y: 0, w: 230, h: 310, r: 0, opacity: 0, z: 0 };

// ——————————————————————————————————————————————————————————————
// Empty view
// ——————————————————————————————————————————————————————————————

const NOUN: Record<BrowseView, string> = { people: "people", projects: "projects", events: "events" };

function EmptyDesk({ view, browse, top, height }: { view: DeskView; browse: DeskBrowse | null; top: number; height: number }) {
  const reduced = useReducedMotion();
  const noMatch = browse !== null && browse.filtered && isBrowseView(view);
  const findPeople = view === "people" || view === "fav";
  const linkClass = `pointer-events-auto text-[15px] text-[#FFE066] underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        height: Math.max(0, height - top),
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
      {noMatch && isBrowseView(view) ? (
        <>
          <p style={{ margin: 0, fontSize: 20, color: DESK.muted }}>No {NOUN[view]} match.</p>
          <button type="button" onClick={browse.clear} className={`${linkClass} border-0 bg-transparent p-0`}>
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 20, color: DESK.muted }}>
            {view === "all" ? "Nothing on your desk yet." : `Nothing from ${DESK_VIEW_LABEL[view]} on the desk yet.`}
          </p>
          {findPeople && (
            <Link to="/people" className={linkClass}>
              Find people →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————————————————————————

/** Cards that were in the list a moment ago and aren't now. They stay (as
 *  cards that don't belong to the view) long enough to fall away. Derived
 *  while rendering, so the first frame already has them. */
function useLeaving(current: readonly DeskCard[], reduced: boolean): DeskCard[] {
  const [state, setState] = useState<{ prev: readonly DeskCard[]; leaving: DeskCard[] }>({ prev: current, leaving: [] });
  let leaving = state.leaving;
  if (state.prev !== current) {
    const ids = new Set(current.map((c) => c.id));
    const gone = state.prev.filter((c) => !ids.has(c.id));
    const goneIds = new Set(gone.map((c) => c.id));
    const still = state.leaving.filter((c) => !ids.has(c.id) && !goneIds.has(c.id));
    leaving = [...gone, ...still].slice(0, LEAVE_LIMIT);
    setState({ prev: current, leaving });
  }
  useEffect(() => {
    if (state.leaving.length === 0) return;
    const timer = setTimeout(() => setState((s) => (s.leaving.length === 0 ? s : { ...s, leaving: [] })), reduced ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [state.leaving, reduced]);
  return leaving;
}

/** The window the desk fills (the scroller's visible area, scrollbar
 *  excluded). Cards are laid out in these pixels. */
function useDeskSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 1200 : window.innerWidth,
    h: typeof window === "undefined" ? 760 : window.innerHeight,
  }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setSize((prev) => (Math.round(prev.w) === Math.round(w) && Math.round(prev.h) === Math.round(h) ? prev : { w, h }));
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
