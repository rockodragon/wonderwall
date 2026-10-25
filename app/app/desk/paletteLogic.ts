// The palette's decisions that don't need React: which tool is lit, where the
// tools sit on the arc, the badge text, the fan's transition. Kept pure so
// paletteLogic.test.ts can pin the rules in docs/features/desktop-desk-palette.md.

import { DESK_PATH, parseDeskView, type DeskView } from "./deskState";
import { DESK } from "./tokens";

export type ToolId =
  | "today"
  | "people"
  | "projects"
  | "events"
  | "tables"
  | "shortlist"
  | "profile"
  | "signin";

/** Remembers that this browser has opened the palette once: until then its
 *  button glows (Palette.tsx, hooks/useOnceNote.ts). */
export const PALETTE_GLOW_KEY = "desk.paletteOpened";

/** Sizes and timings from the handoff, "Palette" section. `zone` is the
 *  square of the lower-left corner the palette claims (the desk keeps its
 *  cards clear of it). The fanned tools carry their names, so the zone holds
 *  the widest label at the arc's foot (toolReach). */
export const PALETTE = {
  button: 56,
  inset: 28,
  tool: 44,
  radius: 170,
  zone: 340,
  stagger: 35,
  fanMs: 340,
  stackMs: 240,
  /** The invisible hover area between a tool and its menu. Half of it sits
   *  behind the tool's button (covering the gaps at the circle's corners); the
   *  other half is the visible gap to the menu. It runs the menu's full height. */
  bridge: 28,
  /** A tool's name: the gap from its circle, the widest it may run before it
   *  is cut short, and its line height. */
  labelGap: 6,
  // 56 holds "Projects" and "Shortlist" at 12px with room, and at seven
  // tools (15 degrees apart) the top two names stay clear of each other.
  labelMax: 56,
  labelHeight: 14,
} as const;

/** Where a tool's name sits: on the tool's own ray, just past its circle, so
 *  no name runs into the next circle on the arc (at seven tools the circles
 *  nearly touch). `x`/`y` is the point on the ray the name's box touches,
 *  from the tool's centre; `ax`/`ay` is how far along the box's width (from
 *  the left) and height (from the bottom) that point falls. Straight up the
 *  box is centred with its bottom on the point; straight right its left edge
 *  is on it at mid height; in between, the corner between the two. */
export function labelAnchor(angleDeg: number): { x: number; y: number; ax: number; ay: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const d = PALETTE.tool / 2 + PALETTE.labelGap;
  return { x: c * d, y: s * d, ax: (1 - c) / 2, ay: (1 - s) / 2 };
}

/** The box a tool's name takes, from the tool's centre, at a given width
 *  (the widest it may run, unless told otherwise). */
export function labelBox(angleDeg: number, width: number = PALETTE.labelMax): { x0: number; x1: number; y0: number; y1: number } {
  const a = labelAnchor(angleDeg);
  const x0 = a.x - a.ax * width;
  const y0 = a.y - a.ay * PALETTE.labelHeight;
  return { x0, x1: x0 + width, y0, y1: y0 + PALETTE.labelHeight };
}

/** How far a tool reaches from the main button's centre, name included: x to
 *  the right, y up. The zone has to hold both. */
export function toolReach(angleDeg: number): { x: number; y: number } {
  const { x, y } = fanOffset(angleDeg);
  const box = labelBox(angleDeg);
  const half = PALETTE.tool / 2;
  return { x: x + Math.max(half, box.x1), y: y + Math.max(half, box.y1) };
}

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

// Home has no tool of its own: the main button is the way back to it.
const VIEW_TOOL: Record<DeskView, ToolId | null> = {
  all: null,
  today: "today",
  people: "people",
  projects: "projects",
  events: "events",
  shortlist: "shortlist",
};

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The tool that reads as "you are here".
 *  - On the desk, the tool whose view is showing. The Shortlist view lights
 *    Shortlist in an area and under an opened card too; home lights none.
 *  - Elsewhere, the tool whose pages these are. */
export function activeToolId(pathname: string, search: string): ToolId | null {
  if (isUnder(pathname, DESK_PATH)) {
    return VIEW_TOOL[parseDeskView(new URLSearchParams(search).get("view"))];
  }
  if (["/people", "/search", "/profile"].some((base) => isUnder(pathname, base))) return "people";
  if (isUnder(pathname, "/projects")) return "projects";
  if (isUnder(pathname, "/events")) return "events";
  if (isUnder(pathname, "/tables")) return "tables";
  if (["/settings", "/messages", "/code"].some((base) => isUnder(pathname, base))) return "profile";
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

// ——————————————————————————————————————————————————————————————
// Hover intent: menus stay open while a finger travels to them
// ——————————————————————————————————————————————————————————————

/** How long the pointer must stay before the palette acts on it: before it
 *  switches to a neighbouring tool while a menu is open, and before it closes
 *  on leave. A diagonal move from a tool to its menu crosses other tools and
 *  the gaps between circles; this keeps that from closing the menu. */
export const HOVER_GRACE_MS = 300;

/** One waiting action. Starting a new one drops the old one. */
export interface Grace {
  start(fn: () => void): void;
  cancel(): void;
  readonly waiting: boolean;
}

export function createGrace(ms: number = HOVER_GRACE_MS): Grace {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    start(fn) {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel,
    get waiting() {
      return timer !== null;
    },
  };
}

export interface HoverIntentDeps {
  /** The tool whose menu is showing now. */
  current: () => ToolId | null;
  /** Show this tool's menu, or none. */
  showStack: (id: ToolId | null) => void;
  /** Fold the fan away. */
  closeAll: () => void;
  /** True while keyboard focus is inside the palette: leaving the zone then
   *  does not close it. */
  keepOpen?: () => boolean;
}

/** What a mouse does to the palette's menus (touch and keyboard are handled
 *  elsewhere):
 *  - no menu open: entering a tool opens its menu at once
 *  - a menu open: entering another tool switches after the grace period, and
 *    returning to the open tool (or its menu) drops the switch
 *  - leaving the tool and its menu closes the menu after the grace period;
 *    coming back drops that too
 *  - leaving the whole zone folds the fan after the grace period
 *  One timer serves all of it: the latest move wins. Pass your own `grace` to
 *  cancel its wait from outside (closing the palette does). */
export function createHoverIntent(deps: HoverIntentDeps, grace: Grace = createGrace()) {
  return {
    toolEnter(id: ToolId) {
      const open = deps.current();
      if (open === null) {
        grace.cancel();
        deps.showStack(id);
      } else if (open === id) {
        grace.cancel();
      } else {
        grace.start(() => deps.showStack(id));
      }
    },
    /** The pointer left a tool and its menu. */
    toolLeave() {
      if (deps.current() === null) {
        grace.cancel();
        return;
      }
      grace.start(() => deps.showStack(null));
    },
    zoneEnter() {
      grace.cancel();
    },
    zoneLeave() {
      if (deps.keepOpen?.()) return;
      grace.start(() => {
        if (!deps.keepOpen?.()) deps.closeAll();
      });
    },
    cancel: grace.cancel,
  };
}

export type HoverIntent = ReturnType<typeof createHoverIntent>;
