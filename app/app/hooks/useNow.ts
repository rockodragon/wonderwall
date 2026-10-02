// The time, for what sorts by it (the Shortlist's This week, Needs you's
// 7-day windows). One clock for the whole app, so two readers (the desk and
// the palette) never disagree about what's due. It ticks once a minute, so a
// window opens or closes while the member is here, and again when the tab
// comes back into view, since a hidden tab's timers slow or stop.
//
// Every reader shares the one store: the first to subscribe starts the
// timer, the last to leave stops it.

import { useSyncExternalStore } from "react";

/** How often the clock ticks. */
export const NOW_TICK_MS = 60_000;

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
  now = Date.now();
  listeners.forEach((l) => l());
}

function onVisibility() {
  if (document.visibilityState === "visible") tick();
}

/** The clock's store, for useSyncExternalStore (and its tests). */
export function subscribeNow(listener: () => void): () => void {
  if (listeners.size === 0) {
    // Nobody was reading, so the last tick may be long past.
    now = Date.now();
    timer = setInterval(tick, NOW_TICK_MS);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    clearInterval(timer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function getNow(): number {
  return now;
}

/** Now, as of the clock's last tick: the same number for every reader. */
export function useNow(): number {
  return useSyncExternalStore(subscribeNow, getNow, getNow);
}
