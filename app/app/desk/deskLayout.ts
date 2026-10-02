// Where each card sits on the desk. Pure geometry: no DOM, no React, so it
// can be tested at any viewport size.
//
// Three arrangements (docs/features/desktop-desk-palette.md, "Geometry"):
//   scatter — view "all": cards rest at slight angles, spread over the desk
//   row     — any other view: matching cards stand straight in a centered row
//   open    — one card fills the page, inset 24px
// A card that doesn't belong to the view falls off the bottom.
//
// Positions are in viewport pixels. The handoff's 1200x760 artboard is scaled
// by s = clamp(min(vw/1200, vh/760), .75, 1.3).

import type { DeskView } from "./deskState";
import { PALETTE } from "./paletteLogic";

/** What the layout needs to know about a card. */
export type LayoutCard = {
  id: string;
  /** Views this card belongs to ("all" included when it rests on the desk). */
  sections: readonly DeskView[];
  /** A paper note: it takes the short slots and the short row height. */
  note: boolean;
};

/** x, y, w, h in px; r is the rotation in degrees. */
export type Place = { x: number; y: number; w: number; h: number; r: number; opacity: number; z: number };

export type Rect = { x: number; y: number; w: number; h: number };

/** The "All N events →" card that closes a row that is too long to fit. */
export const TAIL_ID = "__tail__";

export const OPEN_INSET = 24;
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
/** A row shrinks its cards (down to ROW_MIN_K) to show up to ROW_MAX before
 *  giving its last slot to the tail card — four events shouldn't read as
 *  "2 and a link". */
const ROW_MAX = 5;
const ROW_MIN_K = 0.72;
const ROW_SIDE_TIGHT = 48;

/** Views whose row ends in a link to a full page when it runs long. */
export const TAIL_HREF: Partial<Record<DeskView, string>> = {
  events: "/events",
  projects: "/projects",
  people: "/favorites",
  fav: "/favorites",
};

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

/** How many cards a row holds before its last slot becomes the tail card. */
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

/** How many cards a row shows before it ends in a tail card: everything that
 *  fits at full size, or up to ROW_MAX if shrinking them a little fits more. */
export function rowCapacity(vw: number, vh: number): number {
  let cap = rowFit(vw, vh);
  for (let n = cap + 1; n <= ROW_MAX; n++) {
    if (rowShrink(n, vw, vh) >= ROW_MIN_K) cap = n;
  }
  return cap;
}

// ——————————————————————————————————————————————————————————————
// Scatter
// ——————————————————————————————————————————————————————————————

export function isSmallDesk(vw: number, vh: number): boolean {
  return vw < SMALL_W || vh < SMALL_H;
}

/** Which cards a small desk keeps, by priority: the next event, the fund, the
 *  grant, the featured project, then other events. Ids are typed
 *  (deskState DeskCardId); anything else ranks last. The rest wait offscreen
 *  as unmatched cards do. */
function priorityRank(c: LayoutCard, i: number, firstEvent: number): number {
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
// Row
// ——————————————————————————————————————————————————————————————

function row(matched: readonly LayoutCard[], view: DeskView, vw: number, vh: number): Map<string, Place> {
  const out = new Map<string, Place>();
  const s = deskScale(vw, vh);
  const fit = rowFit(vw, vh);
  const capacity = rowCapacity(vw, vh);
  const tailed = TAIL_HREF[view] !== undefined && matched.length > capacity;
  const shown = tailed ? matched.slice(0, Math.max(1, capacity - 1)) : [...matched];
  const count = shown.length + (tailed ? 1 : 0);
  if (count === 0) return out;

  // Past the full-size fit, cards shrink. A view with no full page to point
  // at (Today) can't end in a tail card, so it may shrink further.
  const k = count > fit ? clamp(rowShrink(count, vw, vh), 0.5, 1) : 1;
  const w = ROW_W * s * k;
  const gap = ROW_GAP * s * k;
  const tall = ROW_H * s * k;
  const total = count * w + (count - 1) * gap;
  const startX = (vw - total) / 2;
  const top = ROW_TOP * s;

  const put = (id: string, i: number, note: boolean) => {
    const h = (note ? ROW_NOTE_H : ROW_H) * s * k;
    out.set(id, { x: startX + i * (w + gap), y: top + (tall - h) / 2, w, h, r: 0, opacity: 1, z: i + 1 });
  };
  shown.forEach((c, i) => put(c.id, i, c.note));
  if (tailed) put(TAIL_ID, shown.length, true);
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
  vw: number;
  vh: number;
};

/**
 * A place for every card, plus one for the tail card (TAIL_ID) when a row
 * runs long. Cards that don't belong to the view sit below the bottom edge,
 * invisible, tilted three times their resting angle.
 */
export function layoutDesk({ cards, view, openId = null, vw, vh }: LayoutInput): Map<string, Place> {
  // Where each resting card would sit: also where an unmatched card falls
  // from and returns to, so it drops straight down.
  const home = scatter(
    cards.filter((c) => matchesView(c, "all")),
    vw,
    vh,
  );

  const arranged = view === "all" ? home : row(cards.filter((c) => matchesView(c, view)), view, vw, vh);

  const out = new Map<string, Place>();
  let spare = 0;
  for (const c of cards) {
    const placed = arranged.get(c.id);
    if (placed) {
      out.set(c.id, placed);
      continue;
    }
    const h = home.get(c.id);
    const tilt = h?.r ?? REST_TILTS[spare % REST_TILTS.length];
    const w = h?.w ?? ROW_W * deskScale(vw, vh);
    const ht = h?.h ?? (c.note ? ROW_NOTE_H : ROW_H) * deskScale(vw, vh);
    out.set(c.id, {
      x: h?.x ?? vw / 2 - w / 2 + (spare - 2) * 70,
      y: vh + 80,
      w,
      h: ht,
      r: tilt * 3,
      opacity: 0,
      z: 0,
    });
    if (!h) spare++;
  }
  const tail = arranged.get(TAIL_ID);
  if (tail) out.set(TAIL_ID, tail);

  // A card opened from a view it isn't in rises from where it waits.
  if (openId) {
    out.set(openId, {
      x: OPEN_INSET,
      y: OPEN_INSET,
      w: Math.max(0, vw - 2 * OPEN_INSET),
      h: Math.max(0, vh - 2 * OPEN_INSET),
      r: 0,
      opacity: 1,
      z: Z_OPEN,
    });
  }
  return out;
}
