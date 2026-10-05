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
// height). People, Projects and Events run long as a grid; Home is a scatter
// and Today a short row, under Needs you when something needs the member.
// The Shortlist is rows in the page's flow (ShortlistView.tsx); only the card
// one of them opens is placed.
//
// Hooks stay above every return. A Rules-of-Hooks violation crashed a page
// before.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { cardIdOf, openInScope, todayNeedsEventIds, type ShortlistScope } from "../components/shortlist/items";
import type { RowModel } from "../components/shortlist/rowModel";
import { useShortlist } from "../lib/shortlist/useShortlist";
import { buildDeskCards, cardsInView, opensAsSheet, type DeskCard } from "./deskCards";
import { DeskCardView, DeskCreateCell } from "./DeskCard";
import { DeskCreate } from "./DeskCreate";
import { isBrowseView, useDeskBrowse, type BrowseView, type DeskBrowse } from "./deskBrowse";
import { greetingFor, headerCount } from "./deskGreeting";
import { DeskHeader, type HeaderParts, type HeaderSize } from "./DeskHeader";
import { DeskToast } from "./DeskToast";
import { CREATE_CELL, CREATE_CELL_ID, DEFAULT_HEADER_H, Z_DIM, cellsOnShow, emptyLane, layoutDeskFull, type LayoutCard, type Place, type Rect } from "./deskLayout";
import {
  DESK_VIEW_LABEL,
  SHORTLIST_VIEW,
  isOpenCard,
  parseDeskView,
  parseShortlistArea,
  parseShortlistKind,
  stepTo,
  useDeskCommunity,
  type DeskCardId,
  type DeskView,
} from "./deskState";
import type { Stepper } from "./OpenedCard";
import { shortlistCard } from "./shortlistCards";
import { ShortlistBody, TodayNeedsYou, shortlistHeader } from "./ShortlistView";
import { DESK, DESK_SANS, FOCUS_RING_CLASS, MOTION_MS, motion, deskSurfaceStyle, useDeskTint } from "./tokens";
import { useDeskData } from "./useDeskData";
import { useUpdateReads } from "./useUpdateReads";
import { useAwardConfetti, useCelebrationReads } from "./useCelebrations";

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
/** Air between Today's Needs you rows and its card row. */
const BELOW_NEEDS = 32;
const NO_IDS: readonly string[] = [];

export function Desk() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const community = useDeskCommunity();
  const tint = useDeskTint();
  const reduced = useReducedMotion();

  const view = parseDeskView(searchParams.get("view"));
  const cardParam = searchParams.get("card");
  const browsing = isBrowseView(view);
  const shortlistOn = view === SHORTLIST_VIEW;
  const area = parseShortlistArea(searchParams.get("area"));
  const kind = parseShortlistKind(searchParams.get("kind"), area);

  const { input, loaded, profile } = useDeskData();
  // The Shortlist and Today's Needs you. The palette reads the same query, so
  // this is one subscription, not a second.
  const shortlist = useShortlist();

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
  // The card the member opened, before any ← / → step took them elsewhere.
  const openedFirst = useRef<string | null>(null);
  // The URL's other params (filters) ride along when a card opens or closes.
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;

  // ——— Cards ———

  // Events Today's Needs you rows show (rule 2): its next-event card skips
  // them. Keyed by the ids, so the clock's minute tick doesn't rebuild the cards.
  const todayEvents = shortlist.status === "ready" ? todayNeedsEventIds(shortlist.needs).join(" ") : "";
  const needsYouEventIds = useMemo(() => (todayEvents ? todayEvents.split(" ") : NO_IDS), [todayEvents]);
  const deskCards = useMemo(() => buildDeskCards({ ...input, needsYouEventIds }, community), [input, community, needsYouEventIds]);
  // Today's card row waits for the Shortlist: which event is next depends on
  // Needs you, and a card that swaps once it arrives reads as a glitch.
  const todayHeld = view === "today" && shortlist.status !== "ready";

  // A Shortlist item opened as a card, and the list ← / → step through. On
  // Today only Needs you's rows open this way; the rest is the desk's own.
  const opened = useMemo(() => {
    if (!cardParam || shortlist.status !== "ready") return null;
    const scope: ShortlistScope | null = shortlistOn ? { view: "shortlist", area, kind } : view === "today" ? { view: "today" } : null;
    if (!scope) return null;
    const found = openInScope(shortlist.data, shortlist.now, scope, cardParam);
    if (!found) return null;
    const card = shortlistCard(found.item, {
      now: shortlist.now,
      money: input.formatMoney,
      events: input.events,
      projects: input.projects,
    });
    return { card, ids: found.ids };
  }, [cardParam, shortlist, shortlistOn, view, area, kind, input]);
  const shortlistOpen = opened?.card ?? null;

  // Today's matching cards stand in until the list's own data arrives.
  const fallback = useMemo(() => (loaded && browsing ? cardsInView(deskCards, view) : undefined), [loaded, browsing, deskCards, view]);
  const browse = useDeskBrowse(browsing ? view : IDLE_BROWSE, community, fallback);

  // The "+" card that leads Projects' and Events' grids. It holds its last
  // words after its view (or tab) is left, so it falls away below the page
  // and comes back up as a card does, rather than blinking out.
  const create = browsing ? browse.create : null;
  const lastCreate = useRef(create);
  if (create) lastCreate.current = create;
  const cell = create ?? lastCreate.current;

  // What is on show in this view, in order. A browse view's own list is the
  // whole view; its cards replace the desk's own versions of the same cards.
  const shown: readonly DeskCard[] | undefined = useMemo(
    () => (browsing ? browse.cards : cardsInView(deskCards, view)),
    [browsing, browse.cards, deskCards, view],
  );
  const current = useMemo(() => {
    let cards = deskCards;
    if (browsing && browse.cards) {
      const own = new Set(browse.cards.map((c) => c.id));
      cards = [...browse.cards, ...deskCards.filter((c) => !own.has(c.id))];
    }
    // The Shortlist's version of a card stands in for the desk's while it's open.
    if (shortlistOpen) cards = [...cards.filter((c) => c.id !== shortlistOpen.id), shortlistOpen];
    return cards;
  }, [browsing, browse.cards, deskCards, shortlistOpen]);
  // Cards that just left (a filter narrowed the list, another view came up)
  // fall away rather than blink out.
  const leaving = useLeaving(current, reduced);
  const allCards = useMemo(() => (leaving.length ? [...current, ...leaving] : current), [current, leaving]);

  const openId = cardParam && current.some((c) => c.id === cardParam) ? cardParam : null;

  // An Update that opens is seen; one that closes is done and leaves the desk.
  // A celebration that closes is read and leaves too. An award on show gets
  // its confetti once.
  useUpdateReads(openId);
  useCelebrationReads(openId);
  useAwardConfetti(shown, loaded);

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

  const hasCell = cell !== null;
  const layoutCards: LayoutCard[] = useMemo(() => {
    const gone = new Set(leaving.map((c) => c.id));
    // Held, Today's cards wait below the window, as cards of another view do.
    const own = allCards.map((c) => ({ id: c.id, sections: gone.has(c.id) || todayHeld ? [] : c.sections, note: c.note, sheet: opensAsSheet(c) }));
    return hasCell ? [...own, CREATE_CELL] : own;
  }, [allCards, leaving, todayHeld, hasCell]);
  // The "+" card is the grid's first cell, ahead of the list and its fund note.
  const shownIds = useMemo(() => (browsing ? cellsOnShow((shown ?? []).map((c) => c.id), create !== null) : undefined), [browsing, shown, create]);

  // Today's card row starts under Needs you when Needs you is there.
  const todayNeeds = view === "today" && shortlist.status === "ready" && shortlist.needs.length > 0;
  // The Shortlist's rows are in the page, which the layout doesn't measure:
  // what isn't on show waits below the window, wherever it was scrolled to.
  const scrollTop = openId || shortlistOn ? openScroll : 0;

  const layout = useMemo(
    () =>
      layoutDeskFull({
        cards: layoutCards,
        view,
        openId,
        vw: size.w,
        vh: size.h,
        top: header.total,
        scrollTop,
        shown: shownIds,
        rowTop: todayNeeds ? header.total + BELOW_NEEDS : undefined,
      }),
    [layoutCards, view, openId, size.w, size.h, header.total, scrollTop, shownIds, todayNeeds],
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
      openedFirst.current = id;
      const next = new URLSearchParams(paramsRef.current);
      next.set("card", id);
      navigate({ search: `?${next.toString()}` });
    },
    [navigate],
  );

  // Given a card, closes it only if it's still the one open: an action that
  // lands late must not close whatever the member moved on to.
  const close = useCallback(
    (only?: DeskCardId) => {
      if (only && !isOpenCard(paramsRef.current, only)) return;
      if (pushed.current) {
        navigate(-1);
        return;
      }
      const next = new URLSearchParams(paramsRef.current);
      next.delete("card");
      const qs = next.toString();
      navigate({ search: qs ? `?${qs}` : "" }, { replace: true });
    },
    [navigate],
  );

  // A link from before a Shortlist card took its own id (items.ts) opens it
  // under the old one: the URL takes the card's own, so it opens and steps.
  useEffect(() => {
    if (!opened || !cardParam || opened.card.id === cardParam) return;
    if (openedFirst.current === cardParam) openedFirst.current = opened.card.id;
    const next = new URLSearchParams(paramsRef.current);
    next.set("card", opened.card.id);
    navigate({ search: `?${next.toString()}` }, { replace: true });
  }, [opened, cardParam, navigate]);

  // Once nothing is open, Back is just Back again.
  useEffect(() => {
    if (!cardParam) pushed.current = false;
  }, [cardParam]);

  const openRow = useCallback((row: RowModel) => open(row.id), [open]);

  // ← / → through the list a Shortlist card was opened from. The step
  // replaces the URL, so Back still closes the card. While the card's action
  // runs, stepping waits (busyCard), so the action lands where it started.
  const stepped = useRef<{ id: string; by: -1 | 1 } | null>(null);
  const [busyCard, setBusyCard] = useState<DeskCardId | null>(null);
  const stepper: Stepper | undefined = useMemo(() => {
    if (!opened || opened.card.id !== openId) return undefined;
    const { ids } = opened;
    const id = opened.card.id;
    const index = ids.indexOf(id);
    if (index < 0 || ids.length < 2) return undefined;
    const step = { index, total: ids.length, busy: busyCard === id };
    return {
      ...step,
      arrived: stepped.current?.id === openId ? stepped.current.by : undefined,
      onBusy: (busy) => setBusyCard((was) => (busy ? id : was === id ? null : was)),
      onStep: (by) => {
        const at = stepTo(step, by);
        if (at === null) return;
        const to = ids[at];
        stepped.current = { id: to, by };
        const next = new URLSearchParams(paramsRef.current);
        next.set("card", to);
        navigate({ search: `?${next.toString()}` }, { replace: true });
      },
    };
  }, [opened, openId, busyCard, navigate]);
  const stepRef = useRef(stepper);
  stepRef.current = stepper;
  // A card opened afresh, not stepped to, starts with focus on Close.
  useEffect(() => {
    if (!cardParam) stepped.current = null;
  }, [cardParam]);

  // Escape closes. Tab stays inside the open card. The palette's own Escape
  // (closing its stack or fan) marks the event handled, and this stands down.
  // ← / → step a Shortlist card, unless someone is typing or in the palette.
  useEffect(() => {
    if (!openId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        trapTab(e);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = stepRef.current;
        if (!step || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || isTyping(e.target)) return;
        if (e.target instanceof Element && e.target.closest(PALETTE_SELECTOR)) return;
        const by = e.key === "ArrowLeft" ? -1 : 1;
        if (stepTo(step, by) === null) return;
        e.preventDefault();
        step.onStep(by);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openId, close]);

  // Where focus goes if the open card's row has gone by the time it closes
  // (its action removed it). Read off the page while the row is still there.
  const focusNext = useRef<string[]>([]);
  useLayoutEffect(() => {
    if (openId) focusNext.current = focusFallbacks(rootRef.current, openId);
  }, [openId]);

  // Hand focus back to the card that was open; else, its row gone, to a row
  // beside it or its heading; else (stepped to one with no row on show) to
  // the one the member opened. A card that's hidden or leaving is inert and
  // won't take focus, so the next in line does.
  useEffect(() => {
    const was = lastOpen.current;
    lastOpen.current = openId;
    if (!was || openId) return;
    const first = openedFirst.current;
    for (const selector of [cardSelector(was), ...focusNext.current, ...(first ? [cardSelector(first)] : [])]) {
      const el = rootRef.current?.querySelector<HTMLElement>(selector);
      if (!el) continue;
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) continue;
      // A row or heading is in the page's flow: bring it into view if it's
      // out of it. A card is still flying back to its place, so it's left be.
      if (el.closest("[data-shortlist-rows]") || el.hasAttribute("data-shortlist-heading")) el.scrollIntoView({ block: "nearest" });
      break;
    }
  }, [openId]);

  // ——— Header and empty view ———

  // How many cards are on show; null while the list is still arriving (or held).
  const listed = browsing ? browse.cards : loaded && !todayHeld ? (shown ?? []) : undefined;
  const shownCount = listed ? listed.length : null;
  // What the header counts beside the view's name; Today's include its Needs you rows.
  const count = headerCount(view, listed, shortlist.status === "ready" ? shortlist.needs.map(cardIdOf) : undefined);
  // The Shortlist has empty states of its own; Today with Needs you rows
  // isn't empty, even with no cards.
  const empty = shownCount === 0 && !shortlistOn && !todayNeeds;
  // With the "+" card in the first cell, an empty list's words sit beside it.
  const lane = create && layout.grid ? emptyLane(layout.grid, header.total, size.w) : undefined;
  const greeting = greetingFor(new Date().getHours(), profile?.name);

  const money = input.formatMoney;
  const headerParts: HeaderParts | undefined = shortlistOn
    ? shortlistHeader(shortlist, area, kind)
    : view === "today"
      ? { below: <TodayNeedsYou state={shortlist} money={money} onOpen={openRow} /> }
      : undefined;
  // A Shortlist card rises from below the window, wherever the rows were scrolled to.
  const enterFrom = size.h + (shortlistOn ? openScroll : 0);

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        isolation: "isolate",
        width: "100%",
        height: "100dvh",
        overflow: "hidden",
        ...deskSurfaceStyle(tint),
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
            it longer, and the filter row inside still pins to the scroller.
            The Shortlist's rows are in the flow, so its page grows with them. */}
        <div style={{ position: "relative", ...(shortlistOn ? { minHeight: layout.height } : { height: layout.height }), overflow: "clip" }}>
          <DeskHeader
            view={view}
            community={community}
            greeting={greeting}
            greetingReady={profile !== undefined}
            count={count}
            countText={browsing ? browse.count : null}
            stuck={scroll.stuck}
            inert={!!openId}
            onMeasure={onMeasure}
            parts={headerParts}
          />

          {empty && <EmptyDesk view={view} browse={browsing ? browse : null} top={header.total} height={size.h} lane={lane} />}

          {shortlistOn && <ShortlistBody state={shortlist} area={area} kind={kind} money={money} onOpen={openRow} inert={!!openId} />}

          {/* Ahead of the cards in the page, so the keyboard reaches it first. */}
          {cell && <DeskCreateCell create={cell} place={places.get(CREATE_CELL_ID) ?? OFFSCREEN} vh={enterFrom} inert={!!openId} />}

          {mounted.map((card) => (
            <DeskCardView
              key={card.id}
              card={card}
              place={places.get(card.id) ?? OFFSCREEN}
              open={card.id === openId}
              inert={!!openId && card.id !== openId}
              vh={enterFrom}
              onOpen={open}
              onClose={close}
              stepper={card.id === openId ? stepper : undefined}
            />
          ))}
        </div>
      </div>

      <div
        aria-hidden
        onClick={() => close()}
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
      <DeskToast />
    </div>
  );
}

const OFFSCREEN: Place = { x: 0, y: 0, w: 230, h: 310, r: 0, opacity: 0, z: 0 };

// ——————————————————————————————————————————————————————————————
// Empty view
// ——————————————————————————————————————————————————————————————

const NOUN: Record<BrowseView, string> = { people: "people", projects: "projects", events: "events" };

function EmptyDesk({
  view,
  browse,
  top,
  height,
  lane,
}: {
  view: DeskView;
  browse: DeskBrowse | null;
  top: number;
  height: number;
  /** Where the words go when the "+" card holds the grid's first cell: the room beside it. */
  lane?: Rect;
}) {
  const reduced = useReducedMotion();
  const noMatch = browse !== null && browse.filtered && isBrowseView(view);
  // The "+" card says all there is to say to a list nothing narrowed: make the first one.
  if (lane && !noMatch) return null;
  const findPeople = view === "people";
  const linkClass = `pointer-events-auto text-[15px] text-[#FFE066] underline-offset-4 hover:underline ${FOCUS_RING_CLASS}`;
  return (
    <div
      style={{
        position: "absolute",
        ...(lane ? { left: lane.x, width: lane.w, top: lane.y, height: lane.h } : { left: 0, right: 0, top, height: Math.max(0, height - top) }),
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
          <p style={{ margin: 0, fontSize: 20, color: DESK.muted }}>No {browse.noun ?? NOUN[view]} match.</p>
          <button type="button" onClick={browse.clear} className={`${linkClass} border-0 bg-transparent p-0`}>
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 20, color: DESK.muted }}>
            {view === "all" ? "Nothing on your canvas yet." : `Nothing from ${DESK_VIEW_LABEL[view]} on the canvas yet.`}
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

function cardSelector(id: string): string {
  return `[data-desk-card="${CSS.escape(id)}"]`;
}

/** `items` other than the one at `at`, nearest first, the one after before
 *  the one before. */
function nearestFirst<T>(items: readonly T[], at: number): T[] {
  const out: T[] = [];
  for (let d = 1; d < items.length; d++) {
    if (at + d < items.length) out.push(items[at + d]);
    if (at - d >= 0) out.push(items[at - d]);
  }
  return out;
}

/** Where focus goes if card `id`'s Shortlist row is gone when the card
 *  closes: the rows beside it in its list, then its section's heading, then
 *  the headings nearest that. As selectors, read while the row is on the
 *  page; none when the card wasn't opened from a row. */
function focusFallbacks(root: HTMLElement | null, id: string): string[] {
  const row = root?.querySelector<HTMLElement>(`[data-shortlist-rows] ${cardSelector(id)}`);
  const list = row?.closest("[data-shortlist-rows]");
  if (!root || !row || !list) return [];
  const rows = [...list.querySelectorAll<HTMLElement>("[data-desk-card]")].map((el) => el.dataset.deskCard ?? "");
  const headings = [...root.querySelectorAll<HTMLElement>("[data-shortlist-heading]")].map((el) => el.dataset.shortlistHeading ?? "");
  const own = row.closest("section")?.querySelector<HTMLElement>("[data-shortlist-heading]")?.dataset.shortlistHeading;
  const at = own === undefined ? -1 : headings.indexOf(own);
  return [
    ...nearestFirst(rows, rows.indexOf(id)).map((rowId) => `[data-shortlist-rows] ${cardSelector(rowId)}`),
    ...(at < 0 ? [] : [headings[at], ...nearestFirst(headings, at)]).map((key) => `[data-shortlist-heading="${CSS.escape(key)}"]`),
  ];
}

/** The palette's corner: it sits above the opened card on purpose, so the
 * keyboard can reach it while a card is open. */
const PALETTE_SELECTOR = '.desk-pal, [aria-label="Navigation"]';

/** Focus is in something that takes arrow keys for itself. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

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
