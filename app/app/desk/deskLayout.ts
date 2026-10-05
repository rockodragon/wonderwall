// Where each card sits on the desk. Pure geometry: no DOM, no React, so it
// can be tested at any viewport size.
//
// Four arrangements (docs/features/desktop-desk-palette.md, "Geometry" and
// "Round 2"):
//   scatter — view "all": cards rest at slight angles, spread over the desk
//   row     — Today: matching cards stand straight in a short centered row,
//             under Needs you when that's there
//   grid    — People, Projects, Events: a wrapping grid on the header's left
//             edge. The desk scrolls; the layout reports how tall the page is.
// The Shortlist lays out no cards: it is rows (ShortlistView.tsx), and only
// its opened card is placed here.
//   open    — one card fills the window (inset 24px), or a card with no
//             picture opens as a centered sheet
// A card that doesn't belong to the view falls off the bottom of the page.
//
// Positions are in pixels of the desk's scroll content: its top is the top of
// the page, not of the window. The handoff's 1200x760 artboard is scaled by
// s = clamp(min(vw/1200, vh/760), .62, 1.3).

import type { DeskView } from "./deskState";
import { PALETTE } from "./paletteLogic";

/** What the layout needs to know about a card. */
export type LayoutCard = {
  id: string;
  /** Views this card belongs to ("all" included when it rests on the desk). */
  sections: readonly DeskView[];
  /** A paper note: it takes the short slots and the short row height. */
  note: boolean;
  /** No picture to show: the card opens as a centered sheet (the detail
   *  panel alone) instead of picture-and-panel. */
  sheet?: boolean;
};

/** x, y, w, h in px; r is the rotation in degrees. */
export type Place = { x: number; y: number; w: number; h: number; r: number; opacity: number; z: number };

export type Rect = { x: number; y: number; w: number; h: number };

export const OPEN_INSET = 24;
/** The sheet a card with no picture opens as: this wide, this tall at most. */
export const SHEET_W = 720;
export const SHEET_H = 680;
/** Under the dim layer and the opened card, above every resting card. */
export const Z_DIM = 20;
export const Z_OPEN = 30;
/** How much a hovered card is raised. Stays under Z_DIM. */
export const Z_HOVER = 10;

const REF_W = 1200;
const REF_H = 760;

/** The greeting's clear zone, top-left, in px (it doesn't scale). */
export const GREETING_BOX: Rect = { x: 0, y: 0, w: 520, h: 140 };
/** Breathing room kept between a card and either clear zone. */
const CLEAR_PAD = 8;

type Slot = { x: number; y: number; w: number; h: number; r: number };

// The handoff's four slots, in 1200x760 space, then two more that keep clear
// of the greeting (top-left) and the palette (bottom-left).
const TALL_SLOTS: Slot[] = [
  { x: 330, y: 170, w: 230, h: 310, r: -5 },
  { x: 640, y: 215, w: 220, h: 295, r: 3 },
  { x: 925, y: 150, w: 240, h: 320, r: -2 },
  { x: 60, y: 205, w: 200, h: 240, r: 3 },
];
const NOTE_SLOTS: Slot[] = [
  { x: 560, y: 520, w: 240, h: 170, r: 4 },
  { x: 880, y: 540, w: 240, h: 170, r: -3 },
];

/** A desk narrower than this or shorter than this is "small": six cards at
 *  the scaled-down slots land on top of each other, so it scatters SMALL_MAX. */
const SMALL_W = 1000;
const SMALL_H = 650;
const SMALL_MAX = 4;

// Where cards with no slot wait, off the bottom: a repeating tilt.
const REST_TILTS = [-5, 3, -2, 4, -3, 2];

// The straight row: 230x310 (notes 230x200), 44 apart, 230 from the top.
const ROW_W = 230;
const ROW_H = 310;
const ROW_NOTE_H = 200;
const ROW_GAP = 44;
const ROW_TOP = 230;
const ROW_SIDE = 96;
/** A row shrinks its cards, down to half size, to fit the window. */
const ROW_SIDE_TIGHT = 48;

// The grid (People, Projects, Events): as many columns as fit at
// GRID_MIN_W, cards at most GRID_MAX_W wide, 3:4, left on the header's edge.
export const GRID_MIN_W = 240;
export const GRID_MAX_W = 300;
export const GRID_GAP = 32;
/** The header's left edge, and the same margin on the right. */
export const GRID_SIDE = 48;
/** Clear space under the last row, so it can scroll out from behind the palette. */
export const GRID_BOTTOM = 140;
/** Air between the header and the first row. */
export const GRID_BELOW_HEADER = 16;
/** Height of the title block plus filter row before they have been measured. */
export const DEFAULT_HEADER_H = 190;
const GRID_ASPECT = 4 / 3;

/** Views that lay out as a scrolling grid. */
export function isGridView(view: DeskView): boolean {
  return view === "people" || view === "projects" || view === "events";
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Low end .62 so a portrait tablet (768 wide) still holds the whole
 *  scatter; the card's type scales with it, with a floor (DeskCard Face). */
export const MIN_SCALE = 0.62;

export function deskScale(vw: number, vh: number): number {
  return clamp(Math.min(vw / REF_W, vh / REF_H), MIN_SCALE, 1.3);
}

export function matchesView(card: { sections: readonly DeskView[] }, view: DeskView): boolean {
  return card.sections.includes(view);
}

/** The bounding box of a card once it's turned about its center. */
export function rotatedBounds(p: { x: number; y: number; w: number; h: number; r: number }): Rect {
  const rad = (p.r * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const bw = p.w * c + p.h * s;
  const bh = p.w * s + p.h * c;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The two zones a resting card keeps out of, for a viewport. */
export function clearZones(vh: number): { greeting: Rect; palette: Rect } {
  return {
    greeting: GREETING_BOX,
    palette: { x: 0, y: vh - PALETTE.zone, w: PALETTE.zone, h: PALETTE.zone },
  };
}

/** How many cards a row holds at full size. */
export function rowFit(vw: number, vh: number): number {
  const s = deskScale(vw, vh);
  const w = ROW_W * s;
  const gap = ROW_GAP * s;
  return Math.max(1, Math.floor((vw - 2 * ROW_SIDE + gap) / (w + gap)));
}

/** How far a row of `count` cards has to shrink to fit (1 = not at all). */
function rowShrink(count: number, vw: number, vh: number): number {
  const s = deskScale(vw, vh);
  const need = count * ROW_W * s + (count - 1) * ROW_GAP * s;
  return clamp((vw - 2 * ROW_SIDE_TIGHT) / need, 0, 1);
}

/** Share of the open card the picture side takes. It follows the picture's
 *  shape (a tall picture a narrow side, a wide one a wide side), held between
 *  these. */
export const PIC_MIN = 0.46;
export const PIC_MAX = 0.62;

/** The text side never goes under this, so a title wraps between words on
 *  a tablet (an iPad's portrait card left it ~274px and broke "Renaissance"
 *  mid-word, 2026-10-03). On a narrow card the picture gives way first. */
export const TEXT_MIN_PX = 360;

/** The picture side's share of an open card `w` by `h`, for a picture whose
 *  width over height is `aspect` (0 while unknown): the share at which the
 *  side is the picture's own shape, held to PIC_MIN..PIC_MAX — and capped
 *  so the text side keeps TEXT_MIN_PX, down to PIC_MIN. */
export function pictureShare(aspect: number, w: number, h: number): number {
  if (!(aspect > 0) || !(w > 0)) return PIC_MIN;
  const hi = Math.max(PIC_MIN, Math.min(PIC_MAX, 1 - TEXT_MIN_PX / w));
  return clamp((h * aspect) / w, PIC_MIN, hi);
}

// ——————————————————————————————————————————————————————————————
// Scatter
// ——————————————————————————————————————————————————————————————

export function isSmallDesk(vw: number, vh: number): boolean {
  return vw < SMALL_W || vh < SMALL_H;
}

/** Which cards a small desk keeps, by priority: celebrations, then Updates (each in their own order),
 *  the next event, the fund, the grant, the featured project, then other
 *  events. Ids are typed (deskState DeskCardId); anything else ranks last. The
 *  rest wait offscreen as unmatched cards do. */
function priorityRank(c: LayoutCard, i: number, firstEvent: number): number {
  if (c.id.startsWith("celebration:")) return i - 200;
  if (c.id.startsWith("update:")) return i - 100;
  if (c.id.startsWith("event:")) return i === firstEvent ? 0 : 4 + i;
  if (c.id === "fund") return 1;
  if (c.id === "grant") return 2;
  if (c.id.startsWith("project:")) return 3;
  return 100 + i;
}

function pickForSmallDesk(cards: readonly LayoutCard[]): LayoutCard[] {
  if (cards.length <= SMALL_MAX) return [...cards];
  const firstEvent = cards.findIndex((c) => c.id.startsWith("event:"));
  const keep = new Set(
    cards
      .map((c, i) => ({ c, rank: priorityRank(c, i, firstEvent) }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, SMALL_MAX)
      .map((r) => r.c),
  );
  // Slots are taken in the cards' own order, so keep that order.
  return cards.filter((c) => keep.has(c));
}

function assignSlots(cards: readonly LayoutCard[]): Map<string, Slot> {
  const talls = [...TALL_SLOTS];
  const notes = [...NOTE_SLOTS];
  const out = new Map<string, Slot>();
  for (const c of cards) {
    const slot = c.note ? (notes.shift() ?? talls.shift()) : (talls.shift() ?? notes.shift());
    if (slot) out.set(c.id, slot);
  }
  return out;
}

function padded(zone: Rect): Rect {
  return { x: zone.x - CLEAR_PAD, y: zone.y - CLEAR_PAD, w: zone.w + 2 * CLEAR_PAD, h: zone.h + 2 * CLEAR_PAD };
}

/** How much of the smaller card a resting card may lie over another before it
 *  is moved. Tilted slots that touch at the corners are the handoff's own look. */
const CARD_OVERLAP_OK = 0.1;
/** Air left between a card that was moved and what it moved away from. */
const NUDGE_GAP = 8;
/** Keep a turned card this far inside the window. */
const EDGE_MARGIN = 12;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Move a card the shortest way that leaves it clear of both zones, of the
 * cards already down, and inside the window. It can go up out of the palette's
 * corner, right past it, down out of the greeting, or beside a neighbour, and
 * the moves are tried together because getting out of one can walk a card into
 * another. On the viewports the desk is built for the slots already clear all
 * of it and nothing moves. When nothing is fully clear, the least-bad spot wins.
 */
function settle(p: Place, placed: readonly Place[], greeting: Rect, palette: Rect, vw: number, vh: number): Place {
  const zones = [padded(greeting), padded(palette)];
  const others = placed.map((q) => ({ b: rotatedBounds(q), area: q.w * q.h }));
  const inside: Rect = { x: EDGE_MARGIN, y: EDGE_MARGIN, w: vw - 2 * EDGE_MARGIN, h: vh - 2 * EDGE_MARGIN };

  /** 0 when the card is where it can stay; otherwise how badly it is not. */
  const penalty = (q: Place) => {
    const b = rotatedBounds(q);
    let total = b.w * b.h - overlapArea(b, inside);
    for (const z of zones) total += overlapArea(b, z);
    for (const o of others) {
      const ov = overlapArea(b, o.b);
      const allowed = CARD_OVERLAP_OK * Math.min(q.w * q.h, o.area);
      if (ov > allowed) total += ov;
    }
    return total;
  };
  if (penalty(p) === 0) return p;

  const b = rotatedBounds(p);
  const obstacles = [...zones, ...others.map((o) => o.b)];
  const dxs = new Set([
    0,
    inside.x - b.x,
    inside.x + inside.w - (b.x + b.w),
    ...obstacles.flatMap((o) => [o.x + o.w + NUDGE_GAP - b.x, o.x - NUDGE_GAP - (b.x + b.w)]),
  ]);
  const dys = new Set([
    0,
    inside.y - b.y,
    inside.y + inside.h - (b.y + b.h),
    ...obstacles.flatMap((o) => [o.y + o.h + NUDGE_GAP - b.y, o.y - NUDGE_GAP - (b.y + b.h)]),
  ]);

  let best = p;
  let bestPenalty = penalty(p);
  let bestCost = 0;
  for (const dx of dxs) {
    for (const dy of dys) {
      const q = { ...p, x: p.x + dx, y: p.y + dy };
      const pen = penalty(q);
      const cost = Math.abs(dx) + Math.abs(dy);
      if (pen < bestPenalty - 1e-6 || (Math.abs(pen - bestPenalty) <= 1e-6 && cost < bestCost)) {
        best = q;
        bestPenalty = pen;
        bestCost = cost;
      }
    }
  }
  return best;
}

function scatter(cards: readonly LayoutCard[], vw: number, vh: number): Map<string, Place> {
  const s = deskScale(vw, vh);
  const slots = assignSlots(isSmallDesk(vw, vh) ? pickForSmallDesk(cards) : cards);
  const out = new Map<string, Place>();
  if (slots.size === 0) return out;

  const used = [...slots.values()];
  const minX = Math.min(...used.map((sl) => sl.x));
  const maxX = Math.max(...used.map((sl) => sl.x + sl.w));
  // Center the cluster that's actually there, not the whole artboard.
  const offX = (vw - (maxX - minX) * s) / 2 - minX * s;
  const offY = Math.max(0, (vh - REF_H * s) / 2);
  const { greeting, palette } = clearZones(vh);

  let z = 1;
  for (const c of cards) {
    const sl = slots.get(c.id);
    if (!sl) continue;
    const p: Place = {
      x: offX + sl.x * s,
      y: offY + sl.y * s,
      w: sl.w * s,
      h: sl.h * s,
      r: sl.r,
      opacity: 1,
      z: z++,
    };
    out.set(c.id, settle(p, [...out.values()], greeting, palette, vw, vh));
  }
  return out;
}

// ——————————————————————————————————————————————————————————————
// Row (Today)
// ——————————————————————————————————————————————————————————————

/** Clear space under Today's row once Needs you has pushed it down the page. */
const ROW_BOTTOM = 48;

/** The row's places, and how far down the page its cards reach. `minTop`
 *  holds the row below whatever sits over it (Today's Needs you rows). */
function row(
  matched: readonly LayoutCard[],
  vw: number,
  vh: number,
  minTop = 0,
): { places: Map<string, Place>; bottom: number } {
  const out = new Map<string, Place>();
  const s = deskScale(vw, vh);
  const fit = rowFit(vw, vh);
  const count = matched.length;
  if (count === 0) return { places: out, bottom: 0 };

  // Past the full-size fit, cards shrink (Today holds a handful, never more).
  let k = count > fit ? clamp(rowShrink(count, vw, vh), 0.5, 1) : 1;
  const top = Math.max(ROW_TOP * s, minTop);
  // Pushed down under Needs you, they shrink to stay in the window, down to
  // half size; past that the page scrolls.
  if (top > ROW_TOP * s) k = Math.min(k, clamp((vh - top - ROW_BOTTOM) / (ROW_H * s), 0.5, 1));
  const w = ROW_W * s * k;
  const gap = ROW_GAP * s * k;
  const tall = ROW_H * s * k;
  const total = count * w + (count - 1) * gap;
  const startX = (vw - total) / 2;

  matched.forEach((c, i) => {
    const h = (c.note ? ROW_NOTE_H : ROW_H) * s * k;
    out.set(c.id, { x: startX + i * (w + gap), y: top + (tall - h) / 2, w, h, r: 0, opacity: 1, z: i + 1 });
  });
  return { places: out, bottom: top + tall };
}

// ——————————————————————————————————————————————————————————————
// Grid (People, Projects, Events)
// ——————————————————————————————————————————————————————————————

export type GridMetrics = {
  /** Columns that fit. */
  cols: number;
  /** Card width and height (3:4). */
  w: number;
  h: number;
  gap: number;
  /** The left edge of the first column. */
  x0: number;
};

/** The grid for a window `vw` wide: as many columns as fit at GRID_MIN_W,
 *  filling the width up to GRID_MAX_W per card; whatever is left of a wide
 *  window stays on the right, so the left edge is always the header's. */
export function gridMetrics(vw: number): GridMetrics {
  const side = GRID_SIDE;
  const gap = GRID_GAP;
  const avail = Math.max(0, vw - 2 * side);
  const cols = Math.max(1, Math.floor((avail + gap) / (GRID_MIN_W + gap)));
  const w = Math.min(GRID_MAX_W, (avail - (cols - 1) * gap) / cols);
  return { cols, w, h: w * GRID_ASPECT, gap, x0: side };
}

/** The "+" card's id in the layout. It is not a DeskCard (nothing opens, it is
 *  not counted, it is no row of the list): it holds a cell as a card does. */
export const CREATE_CELL_ID = "create-cell";

/** The "+" card as the layout sees it. Handed in with the cards, it is placed
 *  when `cellsOnShow` names it and falls below the page when it does not, as
 *  a card that leaves the view does. */
export const CREATE_CELL: LayoutCard = { id: CREATE_CELL_ID, sections: [], note: false };

/** The cells on show in a grid view: the "+" card first when the view has one,
 *  then the list in its own order. First, so it holds one cell whatever the
 *  filters: the fund's note, which comes and goes with them, comes after it. */
export function cellsOnShow(ids: readonly string[], create: boolean): string[] {
  return create ? [CREATE_CELL_ID, ...ids] : [...ids];
}

/** The room the first row leaves beside the "+" card, where an empty list's
 *  words go ("No projects match." and Clear filters), as wide as the grid
 *  past that cell. A one-column grid has none beside it: under the card. */
export function emptyLane(g: GridMetrics, top: number, vw: number): Rect {
  const rowTop = top + GRID_BELOW_HEADER;
  if (g.cols < 2) return { x: g.x0, y: rowTop + g.h + g.gap, w: Math.max(0, vw - 2 * g.x0), h: g.h };
  const x = g.x0 + g.w + g.gap;
  return { x, y: rowTop, w: Math.max(0, vw - g.x0 - x), h: g.h };
}

/** How tall the page is for `count` cards in the grid, and where each row starts. */
function gridHeight(count: number, g: GridMetrics, top: number, vh: number): number {
  if (count === 0) return vh;
  const rows = Math.ceil(count / g.cols);
  return Math.max(vh, top + rows * g.h + (rows - 1) * g.gap + GRID_BOTTOM);
}

function grid(matched: readonly LayoutCard[], g: GridMetrics, top: number): Map<string, Place> {
  const out = new Map<string, Place>();
  matched.forEach((c, i) => {
    const col = i % g.cols;
    const rowIx = Math.floor(i / g.cols);
    // One layer for every card: a long grid must not climb over the dim layer.
    out.set(c.id, { x: g.x0 + col * (g.w + g.gap), y: top + rowIx * (g.h + g.gap), w: g.w, h: g.h, r: 0, opacity: 1, z: 1 });
  });
  return out;
}

// ——————————————————————————————————————————————————————————————
// The whole desk
// ——————————————————————————————————————————————————————————————

export type LayoutInput = {
  cards: readonly LayoutCard[];
  view: DeskView;
  /** The card standing open, if any. */
  openId?: string | null;
  /** The scroller's visible width and height (not the page's). */
  vw: number;
  vh: number;
  /** Grid views: how tall the header is. The first row starts just under it. */
  top?: number;
  /** How far the page is scrolled. An open card sits in the window, so it
   *  sits this far down the page, and a card leaving the view falls below the
   *  window as well as below the page. */
  scrollTop?: number;
  /** Row views: the row starts no higher than this. Today passes the bottom
   *  of its header when Needs you sits in it; the page then grows to fit. */
  rowTop?: number;
  /** The cards on show in this view, in order. Without it, the cards whose
   *  sections name the view, in the order given. */
  shown?: readonly string[];
};

export type DeskLayout = {
  places: Map<string, Place>;
  /** How tall the page is: the window's height unless a grid runs longer. */
  height: number;
  /** The grid's columns, for the views that have one. */
  grid: GridMetrics | null;
};

/**
 * A place for every card, and the page's height. Cards that don't belong to
 * the view sit below the bottom of the page, invisible, tilted three times
 * their resting angle.
 */
export function layoutDeskFull({
  cards,
  view,
  openId = null,
  vw,
  vh,
  top = DEFAULT_HEADER_H,
  scrollTop = 0,
  shown,
  rowTop,
}: LayoutInput): DeskLayout {
  // Where each resting card would sit: also where an unmatched card falls
  // from and returns to, so it drops straight down.
  const home = scatter(
    cards.filter((c) => matchesView(c, "all")),
    vw,
    vh,
  );

  const onShow = (): LayoutCard[] => {
    if (!shown) return cards.filter((c) => matchesView(c, view));
    const byId = new Map(cards.map((c) => [c.id, c]));
    return shown.map((id) => byId.get(id)).filter((c): c is LayoutCard => c !== undefined);
  };

  let arranged: Map<string, Place>;
  let height = vh;
  let metrics: GridMetrics | null = null;
  if (view === "all") {
    arranged = home;
  } else if (isGridView(view)) {
    const matched = onShow();
    metrics = gridMetrics(vw);
    const gridTop = top + GRID_BELOW_HEADER;
    arranged = grid(matched, metrics, gridTop);
    height = gridHeight(matched.length, metrics, gridTop, vh);
  } else {
    const laid = row(onShow(), vw, vh, rowTop);
    arranged = laid.places;
    if (rowTop !== undefined) height = Math.max(vh, laid.bottom + ROW_BOTTOM);
  }

  // Below the page, and below the window when the page is taller than this
  // layout knows (the Shortlist's rows are in the page's flow, not placed).
  const below = Math.max(height, scrollTop + vh) + 80;

  const places = new Map<string, Place>();
  let spare = 0;
  for (const c of cards) {
    const placed = arranged.get(c.id);
    if (placed) {
      places.set(c.id, placed);
      continue;
    }
    const h = home.get(c.id);
    const tilt = h?.r ?? REST_TILTS[spare % REST_TILTS.length];
    const w = h?.w ?? ROW_W * deskScale(vw, vh);
    const ht = h?.h ?? (c.note ? ROW_NOTE_H : ROW_H) * deskScale(vw, vh);
    places.set(c.id, {
      x: h?.x ?? vw / 2 - w / 2 + (spare - 2) * 70,
      y: below,
      w,
      h: ht,
      r: tilt * 3,
      opacity: 0,
      z: 0,
    });
    if (!h) spare++;
  }

  // A card opened from a view it isn't in rises from where it waits.
  const open = openId ? cards.find((c) => c.id === openId) : undefined;
  if (openId) {
    const winW = Math.max(0, vw - 2 * OPEN_INSET);
    const winH = Math.max(0, vh - 2 * OPEN_INSET);
    if (open?.sheet) {
      const w = Math.min(SHEET_W, winW);
      const h = Math.min(SHEET_H, winH);
      places.set(openId, { x: (vw - w) / 2, y: scrollTop + (vh - h) / 2, w, h, r: 0, opacity: 1, z: Z_OPEN });
    } else {
      places.set(openId, { x: OPEN_INSET, y: scrollTop + OPEN_INSET, w: winW, h: winH, r: 0, opacity: 1, z: Z_OPEN });
    }
  }
  return { places, height, grid: metrics };
}

/** Just the places: see layoutDeskFull. */
export function layoutDesk(input: LayoutInput): Map<string, Place> {
  return layoutDeskFull(input).places;
}
