// The contract between the palette (rendered by the _app shell) and the desk
// (rendered by /today on desktop). They never share React state: the palette
// writes the URL, the desk reads it. The community choice is the one piece
// of state that lives outside the URL, in a tiny store both sides subscribe
// to.
//
// /today?view=events&card=event:abc123
//   view   — which tool's cards are on the desk (absent = everything)
//   card   — the card opened full-page (absent = none open)
//   create — a create flow open as a card on the desk (project | hire | event)
// Each view's own filters (q, stage, tab, …) ride along as more params.
//
// /today?view=shortlist&area=projects&kind=paid&card=role:abc123
//   area   — the Shortlist's area (absent = the overview)
//   kind   — Projects only: paid | passion (absent = both)

import { useSyncExternalStore } from "react";
import type { ShortlistArea } from "../lib/shortlist/url";

export const DESK_PATH = "/today";

/** The Shortlist's view (docs/handoff/favorites-redesign/README.md). It
 *  replaced "fav", which old links still name. */
export const SHORTLIST_VIEW = "shortlist";

export const DESK_VIEWS = ["all", "today", "people", "projects", "events", SHORTLIST_VIEW] as const;
export type DeskView = (typeof DESK_VIEWS)[number];

/** Greeting label for each view: "THE GARDEN · YOUR DESK". */
export const DESK_VIEW_LABEL: Record<DeskView, string> = {
  all: "Your desk",
  today: "Today",
  people: "People",
  projects: "Projects",
  events: "Events",
  shortlist: "Shortlist",
};

/** Old names a view still answers to, so links people saved keep working. */
const LEGACY_VIEWS: ReadonlyMap<string, DeskView> = new Map([["fav", SHORTLIST_VIEW]]);

export function parseDeskView(raw: string | null | undefined): DeskView {
  const name = raw ?? "";
  if ((DESK_VIEWS as readonly string[]).includes(name)) return name as DeskView;
  return LEGACY_VIEWS.get(name) ?? "all";
}

/** Card ids are typed so the URL says what kind of thing is open. A role
 *  and a request are the Shortlist's (`role:<projectRoles id>`,
 *  `request:<projectMembers or eventApplications id>`). */
export type DeskCardId =
  | `update:${string}`
  | `event:${string}`
  | `project:${string}`
  | `role:${string}`
  | `request:${string}`
  | `person:${string}`
  | `org:${string}`
  | "fund"
  | "grant";

/** Create flows that open as a focused card on the desk. "hire" is Hire
 * someone: one job or a recurring gig, the chooser /projects mounts. */
export const DESK_CREATE_KINDS = ["project", "hire", "event"] as const;
export type DeskCreateKind = (typeof DESK_CREATE_KINDS)[number];

export function parseDeskCreate(raw: string | null | undefined): DeskCreateKind | null {
  return (DESK_CREATE_KINDS as readonly string[]).includes(raw ?? "") ? (raw as DeskCreateKind) : null;
}

/** The desk as it is now with a create flow open on top: the view's filters
 * stay in the URL, so closing the card finds the list where it was. */
export function deskCreateHref(current: URLSearchParams, kind: DeskCreateKind): string {
  const params = new URLSearchParams(current);
  params.delete("card");
  params.set("create", kind);
  return `${DESK_PATH}?${params.toString()}`;
}

export function deskHref(view: DeskView = "all", card?: DeskCardId | null, create?: DeskCreateKind | null): string {
  const params = new URLSearchParams();
  if (view !== "all") params.set("view", view);
  if (card) params.set("card", card);
  if (create) params.set("create", create);
  const qs = params.toString();
  return qs ? `${DESK_PATH}?${qs}` : DESK_PATH;
}

/** Whether `card` is the one the URL has open. A Shortlist action that lands
 *  after the member closed its card, or stepped to another, closes nothing:
 *  it only ever closes its own. */
export function isOpenCard(search: URLSearchParams, card: string): boolean {
  return search.get("card") === card;
}

/** Where ← (-1) or → (1) goes in the list an opened card steps through, or
 *  null: past either end, or while the card's action runs, so the action
 *  lands on the card it started on. */
export function stepTo(step: { index: number; total: number; busy?: boolean }, by: -1 | 1): number | null {
  const to = step.index + by;
  return step.busy || to < 0 || to >= step.total ? null : to;
}

// ——————————————————————————————————————————————————————————————
// The Shortlist's own params
// ——————————————————————————————————————————————————————————————

// The params themselves live in lib/shortlist/url.ts, shared with the phone
// page; re-exported here so desk code keeps one import.
export { SHORTLIST_AREAS, parseShortlistArea, parseShortlistKind, type ShortlistArea } from "../lib/shortlist/url";

/** The Shortlist's overview, or one of its areas. Paid or Passion is a
 *  filter set on the page, so a link starts without one. */
export function shortlistHref(area?: ShortlistArea): string {
  const params = new URLSearchParams({ view: SHORTLIST_VIEW });
  if (area) params.set("area", area);
  return `${DESK_PATH}?${params.toString()}`;
}

// ——————————————————————————————————————————————————————————————
// Community: The Garden or The Exchange
// ——————————————————————————————————————————————————————————————

export type DeskCommunity = "garden" | "exchange";

export const COMMUNITY_LABEL: Record<DeskCommunity, string> = {
  garden: "The Garden",
  exchange: "The Exchange",
};

export function otherCommunity(c: DeskCommunity): DeskCommunity {
  return c === "garden" ? "exchange" : "garden";
}

/** A small value saved in this browser that every component can read and
 *  set: the community choice, the spacing dial. Falls back to `fallback`
 *  where storage is off (private browsing) or on the server. */
function localStore<T>(key: string, parse: (raw: string | null) => T, fallback: T) {
  const listeners = new Set<() => void>();
  let current: T | undefined;
  const read = (): T => {
    if (current !== undefined) return current;
    try {
      current = parse(localStorage.getItem(key));
    } catch {
      current = fallback;
    }
    return current;
  };
  const set = (next: T) => {
    current = next;
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Private browsing — the value lasts for this tab only.
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const use = (): T => useSyncExternalStore(subscribe, read, () => fallback);
  return { use, set };
}

const communityStore = localStore<DeskCommunity>(
  "desk.community",
  (raw) => (raw === "exchange" ? "exchange" : "garden"),
  "garden",
);

export const setDeskCommunity = communityStore.set;
export const useDeskCommunity = communityStore.use;

// ——————————————————————————————————————————————————————————————
// Spacing: an admin's dial for the desk's negative space
// ——————————————————————————————————————————————————————————————

/** 1 is the layout as designed. Gaps and margins scale by it; scattered
 *  cards shrink by its square root. Per browser, admins only, while the
 *  right value is found — then it becomes the default here. */
export const DESK_SPACING = { min: 0.75, max: 2, step: 0.05, initial: 1 } as const;

export function clampSpacing(n: number): number {
  if (!Number.isFinite(n)) return DESK_SPACING.initial;
  return Math.min(DESK_SPACING.max, Math.max(DESK_SPACING.min, n));
}

const spacingStore = localStore<number>(
  "desk.spacing",
  (raw) => (raw === null ? DESK_SPACING.initial : clampSpacing(Number(raw))),
  DESK_SPACING.initial,
);

export const useDeskSpacing = spacingStore.use;
export function setDeskSpacing(n: number) {
  spacingStore.set(clampSpacing(n));
}
