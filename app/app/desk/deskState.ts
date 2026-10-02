// The contract between the palette (rendered by the _app shell) and the desk
// (rendered by /today on desktop). They never share React state: the palette
// writes the URL, the desk reads it. The community choice is the one piece
// of state that lives outside the URL, in a tiny store both sides subscribe
// to.
//
// /today?view=events&card=event:abc123
//   view — which tool's cards are on the desk (absent = everything)
//   card — the card opened full-page (absent = none open)

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
  | `event:${string}`
  | `project:${string}`
  | `person:${string}`
  | "fund"
  | "grant";

export function deskHref(view: DeskView = "all", card?: DeskCardId | null): string {
  const params = new URLSearchParams();
  if (view !== "all") params.set("view", view);
  if (card) params.set("card", card);
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

const STORAGE_KEY = "desk.community";
const listeners = new Set<() => void>();
let current: DeskCommunity | null = null;

function read(): DeskCommunity {
  if (current) return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    current = stored === "exchange" ? "exchange" : "garden";
  } catch {
    current = "garden";
  }
  return current;
}

export function setDeskCommunity(next: DeskCommunity) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing — the choice lasts for this tab only.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDeskCommunity(): DeskCommunity {
  return useSyncExternalStore(subscribe, read, () => "garden" as const);
}
