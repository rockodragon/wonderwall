// The palette's decisions that don't need React: which tool is lit, where the
// tools sit on the arc, the badge text, the fan's transition. Kept pure so
// paletteLogic.test.ts can pin the rules in docs/features/desktop-desk-palette.md.

import { DESK_PATH, parseDeskView, type DeskView } from "./deskState";
import { DESK } from "./tokens";

export type ToolId =
  | "desk"
  | "today"
  | "people"
  | "projects"
  | "events"
  | "profile"
  | "signin";

/** Sizes and timings from the handoff, "Palette" section. `zone` is the
 *  square of the lower-left corner the palette claims (the desk keeps its
 *  cards clear of it). */
export const PALETTE = {
  button: 56,
  inset: 28,
  tool: 44,
  radius: 150,
  zone: 280,
  stagger: 35,
  fanMs: 340,
  stackMs: 240,
  bridge: 14,
} as const;

/** Where each tool sits on the quarter arc. Six tools use the handoff's exact
 *  angles (90 down to 0 in 18 degree steps); fewer spread evenly over the
 *  same quarter. */
export function fanAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [90];
  return Array.from({ length: count }, (_, i) => 90 - (90 * i) / (count - 1));
}

/** Offset of a tool's centre from the main button's centre, in px. x runs
 *  right, y runs up. */
export function fanOffset(angleDeg: number, radius: number = PALETTE.radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

const VIEW_TOOL: Record<DeskView, ToolId> = {
  all: "desk",
  today: "today",
  people: "people",
  projects: "projects",
  events: "events",
  fav: "events",
};

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The tool that reads as "you are here".
 *  - On the desk, the tool whose view is showing (hearted events light Events).
 *  - Elsewhere, the tool whose pages these are. */
export function activeToolId(pathname: string, search: string): ToolId | null {
  if (isUnder(pathname, DESK_PATH)) {
    return VIEW_TOOL[parseDeskView(new URLSearchParams(search).get("view"))];
  }
  if (["/people", "/search", "/profile"].some((base) => isUnder(pathname, base))) return "people";
  if (isUnder(pathname, "/projects")) return "projects";
  if (isUnder(pathname, "/events")) return "events";
  if (["/settings", "/messages"].some((base) => isUnder(pathname, base))) return "profile";
  return null;
}

/** "7", or "99+" past ninety-nine. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** The login link that brings a visitor back to where they are. */
export function loginHref(pathname: string, search: string): string {
  return `/login?redirect=${encodeURIComponent(pathname + search)}`;
}

/** The `transition` for one tool's wrapper as the fan opens and closes. Only
 *  transform and opacity are staggered (35ms per tool). Visibility is not: it
 *  flips at once on open, so a keyboard hand-off can focus any tool the moment
 *  the fan opens (a `visibility:hidden` element refuses focus), and flips
 *  after the fan-in finishes on close. "none" for a visitor who asked for less
 *  motion. */
export function fanTransition(open: boolean, index: number, reduced: boolean): string {
  if (reduced) return "none";
  const delay = PALETTE.stagger * index;
  const move = (prop: string) => `${prop} ${PALETTE.fanMs}ms ${DESK.ease} ${delay}ms`;
  const hideAfter = open ? 0 : delay + PALETTE.fanMs;
  return `${move("transform")}, ${move("opacity")}, visibility 0s linear ${hideAfter}ms`;
}

/** "#RRGGBB" (or "#RGB") at the given alpha, as an rgba() string. Lets the
 *  palette's washes and fills come from the DESK tokens. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`withAlpha: not a hex color: ${hex}`);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
