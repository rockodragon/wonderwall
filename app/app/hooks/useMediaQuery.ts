// A CSS media query as React state, following the window as it changes. The
// server snapshot is false (no window); every route here renders on the
// client in SPA mode, and prerendered pages don't use these.

import { useSyncExternalStore } from "react";

function matches(query: string): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => matches(query),
    () => false,
  );
}

/** Tailwind's md breakpoint and up: the desk and the palette. Phones keep
 *  the bottom bar and the old Today page. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

/** The visitor asked their system for less motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
