// The desk's palette, from the Claude Design handoff "Desk + Palette" (3a,
// docs/handoff/garden-desk-palette/README.md). Kept beside the desk rather
// than in tokens.css: the rest of the app still draws with --app-*.
//
// Two deliberate departures from the handoff:
// - muted text is #ACACA4 (--garden-muted), not the handoff's #8F8F8F,
//   which measures 5.65:1 on #151515 and fails the 6:1 floor for small text.
// - nothing renders under 12px; the handoff's 11px mono kickers and stack
//   headers are 12px here.

import type { CSSProperties } from "react";
import { useDeskCommunity, type DeskCommunity } from "./deskState";

export const DESK = {
  surface: "#151515",
  page: "#121212",
  panel: "#181818",
  panelDeep: "#171717",
  dot: "#262626",
  line: "#2e2e2e",
  lineStrong: "#333333",
  text: "#F4F4F2",
  textSoft: "#D6D6D6",
  textQuiet: "#B3B3B3",
  muted: "#ACACA4",
  accent: "#FFE066",
  accentHover: "#FFEA94",
  accentInk: "#121212",
  paper: "#EDE3B4",
  paperInk: "#1d1b12",
  /** The light mat an organization's logo sits on: logos are drawn for a light page. */
  plate: "#DEDBD2",
  hover: "#2a2a2a",
  ease: "cubic-bezier(.2,.8,.2,1)",
} as const;

export const DESK_SANS = "Inter, ui-sans-serif, system-ui, sans-serif";
export const DESK_MONO = "var(--garden-font-mono), ui-monospace, Menlo, monospace";

/** Mono label: the "THE GARDEN · YOUR DESK" voice. */
export function monoLabel(size = 12, tracking = "0.24em"): CSSProperties {
  return {
    fontFamily: DESK_MONO,
    fontSize: size,
    letterSpacing: tracking,
    textTransform: "uppercase",
  };
}

/** 2px accent focus ring, 2px offset — every focusable thing on the desk. */
export const FOCUS_RING_CLASS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFE066]";

/** An opened card's big button, before its fill: 52px, 10px corners. */
export const CARD_BUTTON_CLASS = `inline-flex h-[52px] items-center justify-center rounded-[10px] px-7 text-base font-semibold no-underline transition-colors ${FOCUS_RING_CLASS}`;

/** Card and palette motion: 620ms on the desk's ease. */
export const MOTION_MS = 620;

/** `transition` for these properties, or none when the visitor asked for
 *  less motion. */
export function motion(props: readonly string[], reduced: boolean, ms = MOTION_MS): string {
  return reduced ? "none" : props.map((p) => `${p} ${ms}ms ${DESK.ease}`).join(", ");
}

/** Whether this element has keyboard focus (:focus-visible), false where the
 *  browser doesn't know the selector. */
export function isFocusVisible(el: Element | null): boolean {
  if (!el) return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

// ——————————————————————————————————————————————————————————————
// Each community's desk (Rick, 2026-10-02): a warm dark for The Garden, a
// cool dark for The Exchange, no picker. Only the surface and its dots
// change; every text token stays, and both measure within 0.1:1 of #151515
// (muted text 7.9:1 warm, 8.0:1 cool).
// ——————————————————————————————————————————————————————————————

export type DeskTint = { surface: string; dot: string; rgb: string };

export const DESK_TINT: Record<DeskCommunity, DeskTint> = {
  garden: { surface: "#19150f", dot: "#2b251b", rgb: "25,21,15" },
  exchange: { surface: "#10151b", dot: "#212a35", rgb: "16,21,27" },
};

/** The surface of the community the member is on (the palette's switch). */
export function useDeskTint(): DeskTint {
  return DESK_TINT[useDeskCommunity()];
}

/** The tint at an alpha, for bands and fields over the dots. */
export function tintAlpha(tint: DeskTint, alpha: number): string {
  return `rgba(${tint.rgb},${alpha})`;
}

/** The dotted desk surface as a style. */
export function deskSurfaceStyle(tint: DeskTint): CSSProperties {
  return {
    backgroundColor: tint.surface,
    backgroundImage: `radial-gradient(${tint.dot} 1px, transparent 1px)`,
    backgroundSize: "24px 24px",
  };
}
