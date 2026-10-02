// The desk's browse views (People, Projects, Events): what's on the desk once
// a tool is picked, and the filter row that narrows it. Filter state lives in
// the URL beside ?view= so Back and shared links keep it:
//
//   /today?view=projects&show=work&q=band
//   /today?view=projects&show=funding&stage=planning
//   /today?view=people&tab=following&interests=Music,Film&q=maya
//   /today?view=events&tab=past&q=open+mic
//
//   q          search text (lib/useFilterState, debounced)
//   tab        the view's toggle: people following | orgs (Organizations) ·
//              events favorites (Saved) | past. Absent = Everyone / Upcoming.
//   show       Projects' chip: funding | people | work (Seeking funding,
//              Seeking people, Jobs and gigs). Absent = Projects. The same
//              ?show= as the /projects page.
//   stage      Projects' Stage menu: planning | forming | working | releasing
//              (not under Jobs and gigs). The same ?stage= as /projects.
//   interests  People's Discipline multi-select
//
// The desk's old Projects | Work toggle (?tab=work) and ?stage=gigs|roles|
// raising, ?seek= still land where they did (lib/browse/projectsFilter
// readProjectsView).
//
// The filtering is the list pages' own, extracted to lib/browse/ and shared:
// /people, /projects and /events call the same functions. Near me is state
// rather than URL, the way it is on those pages (it needs the browser's
// location); see publishNear below.

import {
  Fragment,
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
import {
  PROJECT_LENSES,
  STAGE_OPTIONS,
  readProjectsView,
  selectLens,
  stageCaption,
  writeProjectsView,
  type ProjectsLens,
} from "../lib/browse/projectsFilter";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { SOPHIA_FUND_SLUG } from "../lib/namedFunds";
import { useFilterState } from "../lib/useFilterState";
import { NEAR_ME_RADIUS_OPTIONS, useNearMe } from "../lib/useNearMe";
import type { DeskCard, DeskEventInput, DeskOrgInput, DeskProjectInput } from "./deskCards";
import { peopleCountLabel } from "./deskGreeting";
import { eventsCards, everyoneCards, orgsCards, peopleCards, peopleNoun, projectsCards, type ProfileRow } from "./deskBrowseCards";
import { fundFrom } from "./deskInput";
import { parseDeskView, type DeskCommunity, type DeskView } from "./deskState";
import { DESK, FOCUS_RING_CLASS, monoLabel, tintAlpha, useDeskTint } from "./tokens";

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
  /** The header's count when it isn't just "N things": People mixes in
   * organizations ("30 people · 4 organizations"). null: use the default. */
  count: string | null;
  /** What the view calls its things when nothing matches ("No ___ match."). null: the view's own noun. */
  noun: string | null;
};

// ——————————————————————————————————————————————————————————————
// The URL
// ——————————————————————————————————————————————————————————————

/** The params this module owns. A link that opens a card should carry them
 * along so the list behind the card keeps its filters. */
export const BROWSE_PARAMS = ["q", "tab", "show", "stage", "seek", "interests"] as const;

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
  // Everyone is people and organizations together; Organizations narrows to
  // them (the same ?tab=orgs as /people). Organizations can't be followed yet.
  people: [
    { value: "", label: "Everyone" },
    { value: "following", label: "Following" },
    { value: "orgs", label: "Organizations" },
  ],
  // Projects has chips, not a toggle (see the filter row).
  projects: [],
  events: [
    { value: "", label: "Upcoming" },
    { value: "favorites", label: "Saved" },
    { value: "past", label: "Past" },
  ],
};

function readTab(view: BrowseView, raw: string | null): string {
  return TABS[view].some((t) => t.value === raw) ? (raw as string) : "";
}

/** The params the desk's Projects view used before the chips: the Projects |
 * Work toggle and the Seeking pills. Writing the chips drops them. */
const PROJECTS_LEGACY_PARAMS = ["tab", "seek"] as const;

/** The Projects chip and Stage a desk URL holds, old links included. */
export function readDeskProjects(params: URLSearchParams): { lens: ProjectsLens; stage: string } {
  return readProjectsView({
    work: params.get("tab") === "work",
    show: params.get("show"),
    stage: params.get("stage"),
    seek: params.get("seek"),
  });
}

/** The view's filters as the URL has them, and the ways to change them. Both
 * the cards and the filter row read this, so they never disagree. */
function useBrowseUrl(view: BrowseView) {
  const filters = useFilterState({ tagsParam: "interests" });
  const { searchParams, setSearchParams } = filters;

  const tab = readTab(view, searchParams.get("tab"));
  const projects = readDeskProjects(searchParams);
  const lens: ProjectsLens = view === "projects" ? projects.lens : "projects";
  const stage = view === "projects" ? projects.stage : "";
  // Discipline is People's, and an organization has none, so a stray
  // ?interests= on another view, or on Organizations, is ignored.
  const interests = view === "people" && tab !== "orgs" ? filters.tags : NO_TAGS;

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

  const setTab = useCallback(
    (value: string) =>
      edit((p) => {
        if (value) p.set("tab", value);
        else p.delete("tab");
      }),
    [edit],
  );
  // A chip and the Stage are written together, read the way the cards read
  // them: an old ?stage=gigs or ?seek=people becomes ?show= the first time
  // either is touched, rather than one undoing the other.
  const setProjects = useCallback(
    (change: (now: { lens: ProjectsLens; stage: string }) => { lens: ProjectsLens; stage: string }) =>
      edit((p) => writeProjectsView(p, change(readDeskProjects(p)), PROJECTS_LEGACY_PARAMS)),
    [edit],
  );
  /** A chip: Projects resets, Jobs and gigs has no Stage. */
  const setLens = useCallback((value: ProjectsLens) => setProjects((now) => selectLens(now, value)), [setProjects]);
  const setStage = useCallback((value: string) => setProjects((now) => ({ ...now, stage: value })), [setProjects]);
  const clearParams = useCallback(() => edit((p) => BROWSE_PARAMS.forEach((key) => p.delete(key))), [edit]);

  return {
    searchParams,
    query: filters.query,
    setQuery: filters.setQuery,
    /** The search text the lists answer to, after the debounce. */
    searched: filters.debouncedQuery.trim(),
    tab,
    setTab,
    lens,
    setLens,
    stage,
    setStage,
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
  const { tab, searched, lens, stage, interests } = url;

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
  // everyone in The Exchange) with the organizations mixed in; Following is
  // the member's own list; Organizations is the /people Organizations tab.
  const following = view === "people" && tab === "following";
  const orgsOnly = view === "people" && tab === "orgs";
  const communitySlug = community === "garden" ? GARDEN_SLUG : undefined;
  const directory = useStale(
    `people:${communitySlug}`,
    useQuery(
      api.profiles.search,
      peopleOn && !following && !orgsOnly ? { query: searched || undefined, communitySlug } : "skip",
    ) as ProfileRow[] | undefined,
  );
  // Every organization, as the /people Organizations tab asks for them. They
  // belong to no community, so the desk's community switch doesn't scope them.
  const orgRows = useQuery(api.organizations.list, peopleOn && !following ? {} : "skip") as DeskOrgInput[] | undefined;
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
      if (orgsOnly) return orgRows ? orgsCards(orgRows, searched) : undefined;
      const followed: ProfileRow[] | undefined = favorites
        ? favorites.profiles.flatMap((f) => (f ? [{ ...f.profile, _id: String(f.profile._id), interests: [...f.profile.interests] }] : []))
        : undefined;
      const rows = following ? followed : directory;
      if (!rows || !favorites) return undefined;
      const followedIds = new Set(favorites.profiles.flatMap((f) => (f ? [String(f.profile._id)] : [])));
      const people = peopleCards({ rows, followedIds, following, query: searched, interests, near });
      if (following) return people;
      if (!orgRows) return undefined;
      // Discipline and Near me are about people: an organization has neither.
      return everyoneCards(people, orgRows, { query: searched, peopleOnly: interests.length > 0 || !!near });
    }
    if (projectsOn) {
      if (!projectRows || (community === "garden" && fundPage === undefined)) return undefined;
      return projectsCards({
        rows: projectRows,
        lens,
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
  }, [peopleOn, projectsOn, eventsOn, favorites, following, orgsOnly, directory, orgRows, searched, interests, near, projectRows, fundPage, community, lens, stage, past, pastRows, upcomingRows, tab]);

  const filtered =
    !!searched ||
    (view === "people" && (interests.length > 0 || !!near || following || orgsOnly)) ||
    (view === "projects" && (!!stage || lens !== "projects")) ||
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

  // People mixes organizations in, so its count and its empty line say both.
  const count = useMemo(() => {
    if (view !== "people" || !cards) return null;
    const orgs = cards.filter((c) => c.kind === "org").length;
    return peopleCountLabel(cards.length - orgs, orgs, orgsOnly);
  }, [view, cards, orgsOnly]);
  const noun = view === "people" ? peopleNoun(tab, interests.length > 0 || !!near) : null;

  return useMemo(() => ({ cards, filtered, clear, count, noun }), [cards, filtered, clear, count, noun]);
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

/** A 36px chip, on or off. The Shortlist's chips are these too. */
export function pillClass(on: boolean) {
  return `${PILL} ${on ? PILL_ON : PILL_OFF}`;
}

/** One thing on the row after the search and the toggle: a chip, a menu, a
 * button. When the row is too narrow the last ones fold into a More menu. */
type Piece = {
  key: string;
  /** The live piece. */
  node: ReactNode;
  /** The same piece drawn flat, one element wide enough for it, to measure. */
  ghost: ReactNode;
  /** What it becomes inside the More menu. */
  folded: (close: () => void) => ReactNode;
  /** Switched on or chosen: it never folds, so the row always shows what is on. */
  on: boolean;
  /** A thin divider sits where the group changes. */
  group?: "refine";
  /** Folded, it goes after the rest in the More menu: a long list shouldn't
   * bury the short rows under it. */
  long?: boolean;
};

/** A chip: one choice among a few. */
function chipPiece(key: string, label: string, on: boolean, select: () => void): Piece {
  return {
    key,
    on,
    node: (
      <button type="button" aria-pressed={on} onClick={select} className={pillClass(on)}>
        {label}
      </button>
    ),
    ghost: <span className={pillClass(false)}>{label}</span>,
    folded: (close) => (
      <MenuRow
        label={label}
        on={on}
        onSelect={() => {
          select();
          close();
        }}
      />
    ),
  };
}

/** Room a divider takes between two pieces: its own width and one more gap. */
const DIVIDER_ROOM = 1 + PILL_GAP;

/** One row, no panel, on the dotted surface: search, the view's toggle, then
 * its filters. Pieces that don't fit fold into a More menu rather than
 * wrapping (the last first, never one that is switched on), so the row never
 * runs into the create button at its right end. Fills the width its parent
 * gives it (put it in a flex row). */
export function DeskFilterBar({ view }: { view: BrowseView }) {
  const url = useBrowseUrl(view);
  const near = useNearControls();
  const { tab } = url;
  const following = view === "people" && tab === "following";
  const orgsOnly = view === "people" && tab === "orgs";

  // Following carries no coordinates, and an organization's place isn't in the
  // list, so Near me has nothing to measure on either.
  const canNear = (view === "people" && !following && !orgsOnly) || view === "events";

  const pieces: Piece[] = useMemo(() => {
    const out: Piece[] = [];
    if (view === "projects") {
      // The chips: one at a time, Projects first. Then Stage, which narrows
      // any of them but Jobs and gigs.
      for (const l of PROJECT_LENSES) out.push(chipPiece(`lens-${l.value}`, l.label, url.lens === l.value, () => url.setLens(l.value)));
      if (url.lens !== "work") {
        const chosen = (value: string) => url.stage === value;
        const pick = (value: string, close: () => void) => {
          url.setStage(value);
          close();
        };
        out.push({
          key: "stage",
          on: !!url.stage,
          group: "refine",
          node: (
            <PillMenu label="Stage" on={!!url.stage} caption={stageCaption(url.stage)} align="left">
              {(close) =>
                STAGE_OPTIONS.map((o) => (
                  <MenuRow key={o.value || "any"} label={o.label} on={chosen(o.value)} onSelect={() => pick(o.value, close)} />
                ))
              }
            </PillMenu>
          ),
          ghost: <MenuPillGhost on={!!url.stage} caption={stageCaption(url.stage)} />,
          folded: (close) => (
            <>
              <MenuHeading>Stage</MenuHeading>
              {STAGE_OPTIONS.map((o) => (
                <MenuRow key={o.value || "any"} label={o.label} on={chosen(o.value)} onSelect={() => pick(o.value, close)} />
              ))}
            </>
          ),
        });
      }
      return out;
    }
    if (view === "people" && !orgsOnly) {
      const caption = url.interests.length === 0 ? "Discipline" : filterButtonLabel(INTEREST_OPTIONS, url.interests);
      const rows = () => (
        <>
          {url.interests.length > 0 && (
            <button type="button" onClick={url.clearInterests} className={`${MENU_ROW} text-[#FFE066]`}>
              Clear
            </button>
          )}
          {INTEREST_OPTIONS.map((o) => (
            <MenuRow key={o.value} label={o.label} on={url.interests.includes(o.value)} onSelect={() => url.toggleInterest(o.value)} />
          ))}
        </>
      );
      out.push({
        key: "discipline",
        long: true,
        on: url.interests.length > 0,
        node: (
          <PillMenu label="Discipline" on={url.interests.length > 0} caption={caption} align="left">
            {() => rows()}
          </PillMenu>
        ),
        ghost: <MenuPillGhost on={url.interests.length > 0} caption={caption} />,
        folded: () => (
          <>
            <MenuHeading>Discipline</MenuHeading>
            {rows()}
          </>
        ),
      });
    }
    if (canNear) {
      const label = near?.loading ? "Locating…" : "Near me";
      out.push({
        key: "near",
        on: !!near?.on,
        node: (
          <button
            type="button"
            aria-pressed={!!near?.on}
            disabled={!near || near.loading}
            onClick={() => near?.toggle()}
            className={pillClass(!!near?.on)}
          >
            <LocationIcon className="h-4 w-4" />
            {label}
          </button>
        ),
        ghost: (
          <span className={pillClass(!!near?.on)}>
            <LocationIcon className="h-4 w-4" />
            {label}
          </span>
        ),
        folded: (close) => (
          <MenuRow
            label={label}
            on={!!near?.on}
            disabled={!near || near.loading}
            onSelect={() => {
              near?.toggle();
              close();
            }}
          />
        ),
      });
      if (near?.on) {
        for (const opt of NEAR_ME_RADIUS_OPTIONS) out.push(chipPiece(`within-${opt.value}`, opt.label, near.radius === opt.value, () => near.setRadius(opt.value)));
      }
    }
    return out;
  }, [view, url.lens, url.setLens, url.stage, url.setStage, url.interests, url.toggleInterest, url.clearInterests, canNear, orgsOnly, near]);
  const piecesLabel = view === "projects" ? "Show" : "Filters";
  const hasDivider = pieces.some((c) => c.group) && pieces.some((c) => !c.group);

  // Fit the pieces on the one row. The widths come from a hidden copy of every
  // piece, so a folded piece's width is known before it is needed.
  const rootRef = useRef<HTMLDivElement>(null);
  const fixedRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ widths: number[]; more: number; room: number } | null>(null);
  const pieceKey = pieces.map((c) => c.key).join("|");
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
  }, [pieceKey]);

  const active = pieces.flatMap((c, i) => (c.on ? [i] : []));
  const shown =
    fit && fit.widths.length === pieces.length
      ? visibleChips(fit.widths, { available: fit.room - (hasDivider ? DIVIDER_ROOM : 0), gap: PILL_GAP, moreWidth: fit.more, activeIndex: active })
      : pieces.map((_, i) => i);
  const folded = pieces.filter((_, i) => !shown.includes(i)).sort((a, b) => Number(!!a.long) - Number(!!b.long));

  const placeholder =
    view === "projects"
      ? url.lens === "work"
        ? "Search jobs and gigs"
        : "Search projects"
      : view === "people"
        ? orgsOnly
          ? "Search organizations"
          : following
            ? "Search people"
            : "Search people and orgs"
        : "Search events";

  return (
    <div
      ref={rootRef}
      role="search"
      aria-label={`Filter ${view}`}
      style={{ position: "relative", display: "flex", alignItems: "center", gap: ROW_GAP, flex: "1 1 auto", minWidth: 0, minHeight: 40 }}
    >
      <div ref={fixedRef} style={{ display: "flex", alignItems: "center", gap: ROW_GAP, flexShrink: 0 }}>
        <DeskSearch value={url.query} onChange={url.setQuery} placeholder={placeholder} />
        {TABS[view].length > 0 && (
          <div role="group" aria-label="Show" className="flex items-center gap-2">
            {TABS[view].map((t) => (
              <button key={t.value || "default"} type="button" aria-pressed={tab === t.value} onClick={() => url.setTab(t.value)} className={pillClass(tab === t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {canNear && near?.error && (
          <span role="status" className="whitespace-nowrap text-[13.5px] text-[#FF9B8F]">
            {near.error}
          </span>
        )}
      </div>

      {pieces.length > 0 && (
        <div role="group" aria-label={piecesLabel} className="flex shrink-0 items-center gap-2">
          {shown.map((i, at) => (
            <Fragment key={pieces[i].key}>
              {pieces[i].group && at > 0 && pieces[shown[at - 1]].group !== pieces[i].group && (
                <span role="separator" aria-orientation="vertical" style={{ width: 1, height: 20, flexShrink: 0, background: DESK.lineStrong }} />
              )}
              {pieces[i].node}
            </Fragment>
          ))}
          {folded.length > 0 && (
            <PillMenu label="More filters" on={false} caption="More" align="right">
              {(close) => folded.map((c) => <Fragment key={c.key}>{c.folded(close)}</Fragment>)}
            </PillMenu>
          )}
        </div>
      )}

      {/* A hidden copy of every piece and the More button, for their widths. */}
      <div
        ref={measureRef}
        aria-hidden
        style={{ position: "absolute", left: 0, top: 0, display: "flex", gap: PILL_GAP, height: 0, overflow: "hidden", visibility: "hidden", pointerEvents: "none" }}
      >
        {pieces.map((c) => (
          <Fragment key={c.key}>{c.ghost}</Fragment>
        ))}
        <MenuPillGhost on={false} caption="More" />
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Pieces
// ——————————————————————————————————————————————————————————————

function DeskSearch({ value, onChange, placeholder }: { value: string; onChange: (next: string) => void; placeholder: string }) {
  const tint = useDeskTint();
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
        style={{ height: 40, paddingLeft: 38, paddingRight: 36, background: tintAlpha(tint, 0.6), color: DESK.text }}
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

function MenuRow({ label, on, onSelect, disabled }: { label: string; on: boolean; onSelect: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onSelect}
      className={`${MENU_ROW} ${on ? "text-[#FFE066]" : "text-[#D6D6D6]"} disabled:opacity-60`}
    >
      <span>{label}</span>
      {on && <CheckMark />}
    </button>
  );
}

/** A small label over a group of rows in a menu. */
function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <p style={{ ...monoLabel(12, "0.16em"), margin: 0, padding: "8px 12px 4px", color: DESK.muted }}>{children}</p>
  );
}

/** A menu pill drawn flat: the width of the real one, for measuring. */
function MenuPillGhost({ on, caption }: { on: boolean; caption: ReactNode }) {
  return (
    <span className={pillClass(on)}>
      {caption}
      <ChevronDownIcon className="h-4 w-4" />
    </span>
  );
}

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
