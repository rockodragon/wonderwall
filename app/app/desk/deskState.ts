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

import { useSyncExternalStore } from "react";

export const DESK_PATH = "/today";

export const DESK_VIEWS = ["all", "today", "people", "projects", "events", "fav"] as const;
export type DeskView = (typeof DESK_VIEWS)[number];

/** Greeting label for each view: "THE GARDEN · YOUR DESK". */
export const DESK_VIEW_LABEL: Record<DeskView, string> = {
  all: "Your desk",
  today: "Today",
  people: "People",
  projects: "Projects",
  events: "Events",
  fav: "Favorites",
};

export function parseDeskView(raw: string | null | undefined): DeskView {
  return (DESK_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as DeskView) : "all";
}

/** Card ids are typed so the URL says what kind of thing is open. */
export type DeskCardId =
  | `update:${string}`
  | `event:${string}`
  | `project:${string}`
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
