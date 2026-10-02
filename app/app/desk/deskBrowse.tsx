// The desk's browse views (People, Projects, Events): what's on the desk once
// a tool is picked, and the filter row that narrows it. Filter state lives in
// the URL beside ?view= so Back and shared links keep it:
//
//   /today?view=projects&tab=work&stage=gigs&q=band
//   /today?view=people&tab=following&interests=Music,Film&q=maya
//   /today?view=events&tab=past&q=open+mic
//
//   q          search text (lib/useFilterState, debounced)
//   tab        the view's toggle: people following · projects work ·
//              events favorites (Saved) | past. Absent = Everyone / Projects / Upcoming.
//   stage      Projects' stage pill, or Work's (the /projects page's ?show=)
//   interests  People's Discipline multi-select
//
// The filtering is the list pages' own, extracted to lib/browse/ and shared:
// /people, /projects and /events call the same functions. Near me is state
// rather than URL, the way it is on those pages (it needs the browser's
// location); see publishNear below.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ChevronDownIcon, LocationIcon } from "../components/icons";
import { filterButtonLabel } from "../components/FilterMenu";
import { formatMoney } from "../garden/ui";
import { visibleChips } from "../lib/browse/foldChips";
import { INTEREST_OPTIONS } from "../lib/browse/peopleFilter";
import { PROJECT_VIEWS, SHOW_FILTERS, readProjectsView } from "../lib/browse/projectsFilter";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import { useFilterState } from "../lib/useFilterState";
import { NEAR_ME_RADIUS_OPTIONS, useNearMe } from "../lib/useNearMe";
import type { DeskCard, DeskEventInput, DeskProjectInput } from "./deskCards";
import { eventsCards, peopleCards, projectsCards, type ProfileRow } from "./deskBrowseCards";
import { fundFrom } from "./deskInput";
import { parseDeskView, type DeskCommunity, type DeskView } from "./deskState";
import { DESK, FOCUS_RING_CLASS } from "./tokens";

/** Views that browse a full list with filters. */
export type BrowseView = Extract<DeskView, "people" | "projects" | "events">;

export function isBrowseView(view: DeskView): view is BrowseView {
  return view === "people" || view === "projects" || view === "events";
}

export type DeskBrowse = {
  /** Every card that matches the current filters, in display order. undefined while loading. */
  cards: DeskCard[] | undefined;
  /** True when any filter is narrowing the list (drives "Clear filters"). */
  filtered: boolean;
  /** Reset this view's filters to their defaults. */
  clear: () => void;
};

// ——————————————————————————————————————————————————————————————
// The URL
// ——————————————————————————————————————————————————————————————

/** The params this module owns. A link that opens a card should carry them
 * along so the list behind the card keeps its filters. */
export const BROWSE_PARAMS = ["q", "tab", "stage", "interests"] as const;

/** The browse params present in `from`, and nothing else. */
export function browseParamsOf(from: URLSearchParams): URLSearchParams {
  const kept = new URLSearchParams();
  for (const key of BROWSE_PARAMS) {
    const value = from.get(key);
    if (value) kept.set(key, value);
  }
  return kept;
}

type Tab = { value: string; label: string };

/** Each view's toggle. The first is the default and carries no param. The
 * values match the pages' own where they have them (Events' ?tab=). */
const TABS: Record<BrowseView, Tab[]> = {
  people: [
    { value: "", label: "Everyone" },
    { value: "following", label: "Following" },
  ],
  projects: PROJECT_VIEWS.map((v) => ({ value: v.value === "projects" ? "" : v.value, label: v.label })),
  events: [
    { value: "", label: "Upcoming" },
    { value: "favorites", label: "Saved" },
    { value: "past", label: "Past" },
  ],
};

function readTab(view: BrowseView, raw: string | null): string {
  return TABS[view].some((t) => t.value === raw) ? (raw as string) : "";
}

/** The view's filters as the URL has them, and the ways to change them. Both
 * the cards and the filter row read this, so they never disagree. */
function useBrowseUrl(view: BrowseView) {
  const filters = useFilterState({ tagsParam: "interests" });
  const { searchParams, setSearchParams } = filters;

  const tab = readTab(view, searchParams.get("tab"));
  const projectsView = readProjectsView({ work: tab === "work", show: searchParams.get("stage") });
  const stage = view === "projects" ? projectsView.show : "";
  // Discipline is People's; a stray ?interests= on another view is ignored.
  const interests = view === "people" ? filters.tags : NO_TAGS;

  const edit = useCallback(
    (change: (params: URLSearchParams) => void) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          change(next);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // A new toggle starts its pills over: Work has different stages than Projects.
  const setTab = useCallback(
    (value: string) =>
      edit((p) => {
        if (value) p.set("tab", value);
        else p.delete("tab");
        p.delete("stage");
      }),
    [edit],
  );
  const setStage = useCallback(
    (value: string) =>
      edit((p) => {
        if (value) p.set("stage", value);
        else p.delete("stage");
      }),
    [edit],
  );
  const clearParams = useCallback(() => edit((p) => BROWSE_PARAMS.forEach((key) => p.delete(key))), [edit]);

  return {
    searchParams,
    query: filters.query,
    setQuery: filters.setQuery,
    /** The search text the lists answer to, after the debounce. */
    searched: filters.debouncedQuery.trim(),
    tab,
    setTab,
    stage,
    setStage,
    projectsView: projectsView.view,
    interests,
    toggleInterest: filters.toggleTag,
    clearInterests: filters.clearTags,
    clearParams,
    edit,
  };
}

const NO_TAGS: string[] = [];

// ——————————————————————————————————————————————————————————————
// Near me
// ——————————————————————————————————————————————————————————————

// Near me needs the browser's location, so it lives in lib/useNearMe's state,
// not the URL. The cards and the filter row are separate components, so the
// one useNearMe instance (the cards' hook) publishes its controls here and the
// row reads them.

type NearControls = {
  on: boolean;
  loading: boolean;
  error: string;
  radius: number;
  toggle: () => void;
  setRadius: (miles: number) => void;
};

let nearControls: NearControls | null = null;
const nearListeners = new Set<() => void>();

function publishNear(next: NearControls | null) {
  nearControls = next;
  nearListeners.forEach((l) => l());
}

function subscribeNear(listener: () => void) {
  nearListeners.add(listener);
  return () => {
    nearListeners.delete(listener);
  };
}

function useNearControls(): NearControls | null {
  return useSyncExternalStore(
    subscribeNear,
    () => nearControls,
    () => null,
  );
}

// ——————————————————————————————————————————————————————————————
// The cards
// ——————————————————————————————————————————————————————————————

/** What the last answer was while the next one loads, so typing in the search
 * doesn't blank the grid. A different key (another community) starts clean. */
function useStale<T>(key: string, value: T | undefined): T | undefined {
  const last = useRef<{ key: string; value: T } | null>(null);
  if (value !== undefined) last.current = { key, value };
  return value ?? (last.current?.key === key ? last.current.value : undefined);
}

/** Cards for a browse view under its current URL filters. */
export function useDeskBrowse(view: BrowseView, community: DeskCommunity, fallback: DeskCard[] | undefined): DeskBrowse {
  const url = useBrowseUrl(view);
  const { tab, searched, stage, interests } = url;

  // Queries run only while this view is the one on the desk, so a caller that
  // always passes a view doesn't pay for the other two.
  const onDesk = parseDeskView(url.searchParams.get("view")) === view;
  const peopleOn = onDesk && view === "people";
  const projectsOn = onDesk && view === "projects";
  const eventsOn = onDesk && view === "events";

  // Near me belongs to the view and toggle it was turned on in.
  const geo = useNearMe();
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const scope = onDesk ? `${view}:${tab}` : "off";
  useEffect(() => {
    if (geoRef.current.nearMe) geoRef.current.toggleNearMe();
  }, [scope]);
  // ?near=1 (the palette's "Meet people near me") turns Near me on, as it
  // does on /people, then leaves the URL (replace) so Back and refresh don't
  // ask for location again.
  const wantsNear = peopleOn && url.searchParams.get("near") === "1";
  useEffect(() => {
    if (!wantsNear) return;
    geoRef.current.requestLocation();
    url.edit((params) => params.delete("near"));
    // The param is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNear]);
  useEffect(() => {
    publishNear({
      on: geo.nearMe,
      loading: geo.geoLoading,
      error: geo.geoError,
      radius: geo.radius,
      toggle: geo.toggleNearMe,
      setRadius: geo.setRadius,
    });
  }, [geo.nearMe, geo.geoLoading, geo.geoError, geo.radius, geo.toggleNearMe, geo.setRadius]);
  useEffect(() => () => publishNear(null), []);
  const near = useMemo(
    () => (geo.nearMe && geo.userPos ? { pos: geo.userPos, radius: geo.radius } : null),
    [geo.nearMe, geo.userPos, geo.radius],
  );

  // People. Everyone is the same query /people runs (the Garden's members, or
  // everyone in The Exchange); Following is the member's own list.
  const following = view === "people" && tab === "following";
  const communitySlug = community === "garden" ? GARDEN_SLUG : undefined;
  const directory = useStale(
    `people:${communitySlug}`,
    useQuery(api.profiles.search, peopleOn && !following ? { query: searched || undefined, communitySlug } : "skip") as
      | ProfileRow[]
      | undefined,
  );
  const favorites = useQuery(api.favorites.getMyFavorites, peopleOn || eventsOn ? {} : "skip");

  // Projects.
  const projectRows = useQuery(api.garden.projects.listProjects, projectsOn ? {} : "skip") as
    | DeskProjectInput[]
    | undefined;
  const fundPage = useQuery(
    api.garden.allocations.getFundPage,
    projectsOn && community === "garden" ? { hostOrgSlug: SOPHIA_FUND_SLUG } : "skip",
  );

  // Events. Past is its own query: "everything that already happened, newest
  // first" is a different sort as well as a different slice.
  const past = eventsOn && tab === "past";
  const upcomingRows = useQuery(api.events.list, eventsOn && !past ? { upcoming: true } : "skip");
  const pastRows = useQuery(api.events.list, past ? { past: true } : "skip");

  const built = useMemo((): DeskCard[] | undefined => {
    if (peopleOn) {
      const followed: ProfileRow[] | undefined = favorites
        ? favorites.profiles.flatMap((f) => (f ? [{ ...f.profile, _id: String(f.profile._id), interests: [...f.profile.interests] }] : []))
        : undefined;
      const rows = following ? followed : directory;
      if (!rows || !favorites) return undefined;
      const followedIds = new Set(favorites.profiles.flatMap((f) => (f ? [String(f.profile._id)] : [])));
      return peopleCards({ rows, followedIds, following, query: searched, interests, near });
    }
    if (projectsOn) {
      if (!projectRows || (community === "garden" && fundPage === undefined)) return undefined;
      return projectsCards({
        rows: projectRows,
        view: url.projectsView,
        stage,
        query: searched,
        community,
        fund: fundFrom(fundPage),
        money: formatMoney,
      });
    }
    if (eventsOn) {
      const rows = (past ? pastRows : upcomingRows) as DeskEventInput[] | undefined;
      if (!rows || !favorites) return undefined;
      const favoriteIds = new Set(favorites.events.flatMap((f) => (f ? [String(f.event._id)] : [])));
      return eventsCards({ rows, tab, query: searched, community, near, favoriteIds, now: Date.now() });
    }
    return undefined;
  }, [peopleOn, projectsOn, eventsOn, favorites, following, directory, searched, interests, near, projectRows, fundPage, community, url.projectsView, stage, past, pastRows, upcomingRows, tab]);

  const filtered =
    !!searched ||
    (view === "people" && (interests.length > 0 || !!near || following)) ||
    (view === "projects" && (!!stage || tab === "work")) ||
    (view === "events" && (!!near || tab !== ""));

  // Until this view's own answer arrives, the desk's cards for it stand in,
  // but only where they are the same list: not Everyone (the directory is
  // not the people you follow), and not a list the filters have narrowed.
  const standIn = filtered ? following && !searched && interests.length === 0 : view !== "people";
  const cards = built ?? (standIn ? fallback : undefined);

  const clearParams = url.clearParams;
  const clear = useCallback(() => {
    clearParams();
    if (geoRef.current.nearMe) geoRef.current.toggleNearMe();
  }, [clearParams]);

  return useMemo(() => ({ cards, filtered, clear }), [cards, filtered, clear]);
}

// ——————————————————————————————————————————————————————————————
// The filter row
// ——————————————————————————————————————————————————————————————

const PILL_GAP = 8;
const ROW_GAP = 12;

const PILL =
  `inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13.5px] font-medium leading-none transition-colors disabled:opacity-60 ${FOCUS_RING_CLASS}`;
const PILL_OFF = "border-[#333] bg-transparent text-[#D6D6D6] hover:bg-[#2a2a2a]";
// The palette button's look: a yellow outline, an 8% yellow fill, yellow text.
const PILL_ON = "border-[#FFE066] bg-[rgba(255,224,102,0.08)] text-[#FFE066]";

function pillClass(on: boolean) {
  return `${PILL} ${on ? PILL_ON : PILL_OFF}`;
}

type Chip = { key: string; label: string; on: boolean; select: () => void };

/** One row, no panel, on the dotted surface: search, the view's toggle, then
 * its filters. Chips that don't fit fold into a More menu rather than wrapping.
 * Fills the width its parent gives it (put it in a flex row). */
export function DeskFilterBar({ view }: { view: BrowseView }) {
  const url = useBrowseUrl(view);
  const near = useNearControls();
  const { tab } = url;
  const following = view === "people" && tab === "following";

  // Following carries no coordinates, so Near me has nothing to measure there.
  const canNear = (view === "people" && !following) || view === "events";

  const chips: Chip[] = useMemo(() => {
    if (view === "projects") {
      return SHOW_FILTERS[url.projectsView].map((f) => ({
        key: f.value || "all",
        label: f.label,
        on: url.stage === f.value,
        select: () => url.setStage(f.value),
      }));
    }
    if (canNear && near?.on) {
      return NEAR_ME_RADIUS_OPTIONS.map((opt) => ({
        key: `within-${opt.value}`,
        label: opt.label,
        on: near.radius === opt.value,
        select: () => near.setRadius(opt.value),
      }));
    }
    return [];
  }, [view, url.projectsView, url.stage, url.setStage, canNear, near]);
  const chipsLabel = view === "projects" ? "Stage" : "Within";

  // Fit the chips on the one row. The widths come from a hidden copy of every
  // chip, so a folded chip's width is known before it is needed.
  const rootRef = useRef<HTMLDivElement>(null);
  const fixedRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ widths: number[]; more: number; room: number } | null>(null);
  const chipKey = chips.map((c) => c.label).join("|");
  useLayoutEffect(() => {
    const root = rootRef.current;
    const fixed = fixedRef.current;
    const copy = measureRef.current;
    if (!root || !fixed || !copy) return;
    const measure = () => {
      const widths = [...copy.children].map((el) => Math.ceil(el.getBoundingClientRect().width));
      const more = widths.pop() ?? 0;
      const room = Math.floor(root.clientWidth - fixed.offsetWidth - ROW_GAP);
      setFit((prev) =>
        prev && prev.more === more && prev.room === room && prev.widths.length === widths.length && prev.widths.every((w, i) => w === widths[i])
          ? prev
          : { widths, more, room },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(fixed);
    observer.observe(copy);
    // Pills are a different width once the page font arrives.
    let live = true;
    void document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [chipKey]);

  const activeIndex = chips.findIndex((c) => c.on);
  const shown =
    fit && fit.widths.length === chips.length
      ? visibleChips(fit.widths, { available: fit.room, gap: PILL_GAP, moreWidth: fit.more, activeIndex })
      : chips.map((_, i) => i);
  const folded = chips.filter((_, i) => !shown.includes(i));

  const placeholder = view === "projects" ? (tab === "work" ? "Search work" : "Search projects") : view === "people" ? "Search people" : "Search events";

  return (
    <div
      ref={rootRef}
      role="search"
      aria-label={`Filter ${view}`}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: ROW_GAP, flex: "1 1 auto", minWidth: 0, minHeight: 40 }}
    >
      <div ref={fixedRef} style={{ display: "flex", alignItems: "center", gap: ROW_GAP, flexShrink: 0 }}>
        <DeskSearch value={url.query} onChange={url.setQuery} placeholder={placeholder} />
        <div role="group" aria-label="Show" className="flex items-center gap-2">
          {TABS[view].map((t) => (
            <button key={t.value || "default"} type="button" aria-pressed={tab === t.value} onClick={() => url.setTab(t.value)} className={pillClass(tab === t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        {view === "people" && (
          <PillMenu
            label="Discipline"
            on={url.interests.length > 0}
            caption={url.interests.length === 0 ? "Discipline" : filterButtonLabel(INTEREST_OPTIONS, url.interests)}
            align="left"
          >
            {() => (
              <>
                {url.interests.length > 0 && (
                  <button type="button" onClick={url.clearInterests} className={`${MENU_ROW} text-[#FFE066]`}>
                    Clear
                  </button>
                )}
                {INTEREST_OPTIONS.map((o) => {
                  const on = url.interests.includes(o.value);
                  return (
                    <button key={o.value} type="button" aria-pressed={on} onClick={() => url.toggleInterest(o.value)} className={`${MENU_ROW} ${on ? "text-[#FFE066]" : "text-[#D6D6D6]"}`}>
                      <span>{o.label}</span>
                      {on && <CheckMark />}
                    </button>
                  );
                })}
              </>
            )}
          </PillMenu>
        )}
        {canNear && (
          <button
            type="button"
            aria-pressed={!!near?.on}
            disabled={!near || near.loading}
            onClick={() => near?.toggle()}
            className={pillClass(!!near?.on)}
          >
            <LocationIcon className="h-4 w-4" />
            {near?.loading ? "Locating…" : "Near me"}
          </button>
        )}
        {canNear && near?.error && (
          <span role="status" className="whitespace-nowrap text-[13.5px] text-[#FF9B8F]">
            {near.error}
          </span>
        )}
      </div>

      {chips.length > 0 && (
        <div role="group" aria-label={chipsLabel} className="flex shrink-0 items-center gap-2">
          {shown.map((i) => (
            <button key={chips[i].key} type="button" aria-pressed={chips[i].on} onClick={chips[i].select} className={pillClass(chips[i].on)}>
              {chips[i].label}
            </button>
          ))}
          {folded.length > 0 && (
            <PillMenu label={`More ${chipsLabel.toLowerCase()}`} on={false} caption="More" align="right">
              {(close) =>
                folded.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={c.on}
                    onClick={() => {
                      c.select();
                      close();
                    }}
                    className={`${MENU_ROW} ${c.on ? "text-[#FFE066]" : "text-[#D6D6D6]"}`}
                  >
                    <span>{c.label}</span>
                    {c.on && <CheckMark />}
                  </button>
                ))
              }
            </PillMenu>
          )}
        </div>
      )}

      {/* A hidden copy of every chip and the More button, for their widths. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{ position: "absolute", left: 0, top: 0, display: "flex", gap: PILL_GAP, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}
      >
        {chips.map((c) => (
          <span key={c.key} className={pillClass(false)}>
            {c.label}
          </span>
        ))}
        <span className={pillClass(false)}>
          More
          <ChevronDownIcon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Pieces
// ——————————————————————————————————————————————————————————————

function DeskSearch({ value, onChange, placeholder }: { value: string; onChange: (next: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", width: 280, height: 40, flexShrink: 0 }}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "absolute", left: 14, top: 12, width: 16, height: 16, color: DESK.muted, pointerEvents: "none" }}
      >
        <path d="M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className={`block w-full rounded-lg border border-[#333] text-[15px] placeholder:text-[#ACACA4] ${FOCUS_RING_CLASS}`}
        style={{ height: 40, paddingLeft: 38, paddingRight: 36, background: "rgba(21,21,21,.6)", color: DESK.text }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className={`absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-[#ACACA4] hover:text-[#F4F4F2] ${FOCUS_RING_CLASS}`}
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

const MENU_ROW = `flex h-9 w-full items-center justify-between gap-4 rounded-lg px-3 text-left text-[13.5px] hover:bg-[#2a2a2a] ${FOCUS_RING_CLASS}`;

function CheckMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A pill that opens a small panel under it. Closes on Escape (focus returns
 * to the pill), on a press outside, and when focus leaves. */
function PillMenu({
  label,
  caption,
  on,
  align,
  children,
}: {
  label: string;
  caption: ReactNode;
  on: boolean;
  align: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onPress = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", flexShrink: 0 }}
      onBlur={(e) => {
        if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={pillClass(on)}
      >
        {caption}
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="group"
          aria-label={label}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            [align]: 0,
            zIndex: 40,
            minWidth: 200,
            maxHeight: 360,
            overflowY: "auto",
            padding: 6,
            borderRadius: 12,
            border: `1px solid ${DESK.lineStrong}`,
            background: DESK.panel,
            boxShadow: "0 18px 40px rgba(0,0,0,.5)",
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
