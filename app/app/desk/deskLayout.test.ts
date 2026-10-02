import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEADER_H,
  GREETING_BOX,
  GRID_BELOW_HEADER,
  GRID_BOTTOM,
  GRID_GAP,
  GRID_MAX_W,
  GRID_MIN_W,
  GRID_SIDE,
  OPEN_INSET,
  PIC_MAX,
  PIC_MIN,
  SHEET_H,
  SHEET_W,
  Z_DIM,
  Z_OPEN,
  clearZones,
  deskScale,
  gridMetrics,
  isGridView,
  isSmallDesk,
  layoutDesk,
  layoutDeskFull,
  pictureShare,
  rectsOverlap,
  rotatedBounds,
  rowFit,
  type LayoutCard,
} from "./deskLayout";
import type { DeskView } from "./deskState";
import { PALETTE } from "./paletteLogic";

function card(id: string, sections: DeskView[], note = false): LayoutCard {
  return { id, sections, note };
}

// What "all" holds when everything is there: three events, the fund and the
// grant note, and the featured project.
const FULL_DESK: LayoutCard[] = [
  card("event:1", ["all", "events", "today"]),
  card("event:2", ["all", "events"]),
  card("event:3", ["all", "events"]),
  card("fund", ["all", "projects", "today"], true),
  card("grant", ["all", "today"], true),
  card("project:1", ["all", "projects"]),
  // On the desk but not in "all".
  card("event:4", ["events"]),
  card("project:2", ["projects"]),
];

const VIEWPORTS: [number, number][] = [
  [768, 600],
  [1024, 600],
  [1024, 700],
  [1024, 768],
  [1280, 600],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];

const ALL_SIX = ["event:1", "event:2", "event:3", "fund", "grant", "project:1"];

/** The cards that rest on the desk (the rest wait below the window). */
function shownIds(places: Map<string, { opacity: number }>): string[] {
  return ALL_SIX.filter((id) => places.get(id)!.opacity === 1);
}

/** Overlap of two turned cards' bounding boxes, as a share of the smaller card. */
function overlapShare(a: Parameters<typeof rotatedBounds>[0], b: Parameters<typeof rotatedBounds>[0]): number {
  const ra = rotatedBounds(a);
  const rb = rotatedBounds(b);
  const w = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
  const h = Math.min(ra.y + ra.h, rb.y + rb.h) - Math.max(ra.y, rb.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

describe("deskScale", () => {
  it("is the smaller of the two ratios, held between .62 and 1.3", () => {
    expect(deskScale(1200, 760)).toBe(1);
    expect(deskScale(1440, 900)).toBeCloseTo(1.184, 3);
    expect(deskScale(600, 400)).toBe(0.62);
    expect(deskScale(768, 1024)).toBeCloseTo(0.64, 2);
    expect(deskScale(4000, 3000)).toBe(1.3);
  });
});

describe("scatter (view: all)", () => {
  it.each(VIEWPORTS)("keeps clear of the greeting and the palette corner at %i x %i", (vw, vh) => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw, vh });
    const { greeting, palette } = clearZones(vh);
    for (const id of shownIds(places)) {
      const p = places.get(id)!;
      const b = rotatedBounds(p);
      expect(rectsOverlap(b, greeting), `${id} over the greeting`).toBe(false);
      expect(rectsOverlap(b, palette), `${id} over the palette corner`).toBe(false);
    }
  });

  it.each(VIEWPORTS)("keeps every card inside the window at %i x %i", (vw, vh) => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw, vh });
    for (const id of shownIds(places)) {
      const b = rotatedBounds(places.get(id)!);
      expect(b.x, id).toBeGreaterThanOrEqual(0);
      expect(b.y, id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, id).toBeLessThanOrEqual(vw);
      expect(b.y + b.h, id).toBeLessThanOrEqual(vh);
    }
  });

  it.each([
    [1024, 600],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ])("lets no two cards cover each other by more than 15%% at %i x %i", (vw, vh) => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw, vh });
    const ids = shownIds(places);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const share = overlapShare(places.get(ids[i])!, places.get(ids[j])!);
        expect(share, `${ids[i]} over ${ids[j]}`).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it.each(VIEWPORTS)("keeps the cards apart on every desk size, %i x %i", (vw, vh) => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw, vh });
    const ids = shownIds(places);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(overlapShare(places.get(ids[i])!, places.get(ids[j])!), `${ids[i]} over ${ids[j]}`).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it("tilts cards by no more than 5 degrees and gives each its own layer", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    const resting = ALL_SIX.map((id) => places.get(id)!);
    for (const p of resting) expect(Math.abs(p.r)).toBeLessThanOrEqual(5);
    expect(new Set(resting.map((p) => p.z)).size).toBe(resting.length);
  });

  it("puts notes in the short slots", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    expect(places.get("fund")!.h).toBeLessThan(places.get("event:1")!.h);
    expect(places.get("grant")!.h).toBeLessThan(places.get("event:1")!.h);
  });

  it("centers the cluster it has, not the whole artboard", () => {
    const two = [card("event:1", ["all", "events"]), card("event:2", ["all", "events"])];
    const places = layoutDesk({ cards: two, view: "all", vw: 1440, vh: 900 });
    const bounds = [...places.values()].map(rotatedBounds);
    const left = Math.min(...bounds.map((b) => b.x));
    const right = Math.max(...bounds.map((b) => b.x + b.w));
    // Tilt widens the box a little, so allow a few pixels either side.
    expect(Math.abs(left - (1440 - right))).toBeLessThan(20);
  });

  it("scales with the window", () => {
    const small = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1024, vh: 768 }).get("event:1")!;
    const big = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1920, vh: 1080 }).get("event:1")!;
    expect(big.w).toBeGreaterThan(small.w);
  });

  it("sends the cards that aren't in 'all' below the window", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    for (const id of ["event:4", "project:2"]) {
      const p = places.get(id)!;
      expect(p.y).toBe(900 + 80);
      expect(p.opacity).toBe(0);
    }
  });

  it("holds a lone card on a card-sized spot", () => {
    const places = layoutDesk({ cards: [card("grant", ["all"], true)], view: "all", vw: 1440, vh: 900 });
    expect(places.get("grant")!.opacity).toBe(1);
  });
});

describe("a small desk", () => {
  it("is narrower than 1000 or shorter than 650", () => {
    expect(isSmallDesk(999, 900)).toBe(true);
    expect(isSmallDesk(1400, 649)).toBe(true);
    expect(isSmallDesk(1000, 650)).toBe(false);
    expect(isSmallDesk(1440, 900)).toBe(false);
  });

  it.each([
    [768, 600],
    [1024, 600],
    [1280, 600],
  ])("scatters four of the six at %i x %i, the next event, fund, grant and featured project", (vw, vh) => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", vw, vh });
    expect(shownIds(places)).toEqual(["event:1", "fund", "grant", "project:1"]);
    for (const id of ["event:2", "event:3"]) {
      const p = places.get(id)!;
      expect(p.opacity, id).toBe(0);
      expect(p.y, id).toBe(vh + 80);
    }
  });

  it("fills the spare places with other events when the fund and grant aren't there", () => {
    const cards = [
      card("event:1", ["all", "events"]),
      card("event:2", ["all", "events"]),
      card("event:3", ["all", "events"]),
      card("project:1", ["all", "projects"]),
      card("person:1", ["all"]),
    ];
    const places = layoutDesk({ cards, view: "all", vw: 1024, vh: 600 });
    const shown = cards.filter((c) => places.get(c.id)!.opacity === 1).map((c) => c.id);
    expect(shown).toEqual(["event:1", "event:2", "event:3", "project:1"]);
  });

  it("holds all six once the window is big enough", () => {
    expect(shownIds(layoutDesk({ cards: FULL_DESK, view: "all", vw: 1000, vh: 650 }))).toEqual(ALL_SIX);
  });

  it("keeps the palette's zone the palette's size", () => {
    expect(clearZones(600).palette).toEqual({ x: 0, y: 600 - PALETTE.zone, w: PALETTE.zone, h: PALETTE.zone });
  });
});

describe("row (Today)", () => {
  const today: LayoutCard[] = [
    card("event:1", ["all", "events", "today"]),
    card("fund", ["all", "projects", "today"], true),
    card("grant", ["all", "today"], true),
  ];

  it("stands matching cards straight, side by side, centered", () => {
    const places = layoutDesk({ cards: [...today, card("project:9", ["projects"])], view: "today", vw: 1440, vh: 900 });
    const row = today.map((c) => places.get(c.id)!);
    for (const p of row) {
      expect(p.r).toBe(0);
      expect(p.opacity).toBe(1);
    }
    const s = deskScale(1440, 900);
    expect(row[0].w).toBeCloseTo(230 * s, 5);
    expect(row[0].h).toBeCloseTo(310 * s, 5);
    expect(row[1].x - (row[0].x + row[0].w)).toBeCloseTo(44 * s, 5);
    expect(row[0].y).toBeCloseTo(230 * s, 5);
    expect(row[0].x).toBeCloseTo(1440 - (row[2].x + row[2].w), 5);
  });

  it("fits floor((vw - 192 + gap) / (w + gap)) cards at full size", () => {
    // At 1440x900 s is 1.184: w 272.3, gap 52.1, so (1440 - 192 + 52.1) / 324.4 = 4.
    expect(rowFit(1440, 900)).toBe(4);
    // At the smallest scale (.62): w 142.6, gap 27.3, so (768 - 192 + 27.3) / 169.9 = 3.55.
    expect(rowFit(768, 600)).toBe(3);
  });

  it("puts a note in the row at note height, centered on the row", () => {
    const places = layoutDesk({ cards: today, view: "today", vw: 1440, vh: 900 });
    const tall = places.get("event:1")!;
    const note = places.get("fund")!;
    expect(note.h).toBeLessThan(tall.h);
    expect(note.y + note.h / 2).toBeCloseTo(tall.y + tall.h / 2, 5);
  });

  it("shrinks Today's cards to fit rather than adding a tail card", () => {
    const places = layoutDesk({ cards: today, view: "today", vw: 768, vh: 600 });
    const placed = today.map((c) => places.get(c.id)!);
    for (const p of placed) expect(p.opacity).toBe(1);
    expect(placed[0].x).toBeGreaterThanOrEqual(0);
    expect(placed[2].x + placed[2].w).toBeLessThanOrEqual(768);
    expect(places.size).toBe(today.length);
  });

  it("keeps its page as tall as the window: Today does not scroll", () => {
    expect(layoutDeskFull({ cards: today, view: "today", vw: 1440, vh: 900 }).height).toBe(900);
    expect(layoutDeskFull({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 }).height).toBe(900);
  });

  it("drops cards that aren't in the view straight down, tilted three times over", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "today", vw: 1440, vh: 900 });
    const home = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    for (const id of ["event:2", "event:3", "project:1", "project:2"]) {
      const p = places.get(id)!;
      expect(p.y).toBe(900 + 80);
      expect(p.opacity).toBe(0);
    }
    const e2 = places.get("event:2")!;
    expect(e2.x).toBe(home.get("event:2")!.x);
    expect(e2.r).toBe(home.get("event:2")!.r * 3);
  });

  it("brings them back to the same spots in 'all'", () => {
    const there = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    const again = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    expect([...again.entries()]).toEqual([...there.entries()]);
  });
});

describe("grid (People, Projects, Events, Favorites)", () => {
  const GRID_VIEWS: DeskView[] = ["people", "projects", "events", "fav"];
  // Cards that belong to every grid view.
  const many = (n: number, views: DeskView[] = GRID_VIEWS): LayoutCard[] =>
    Array.from({ length: n }, (_, i) => card(`person:${i}`, views));

  it("is the layout for browse views and favorites, not for home or Today", () => {
    for (const v of GRID_VIEWS) expect(isGridView(v), v).toBe(true);
    expect(isGridView("all")).toBe(false);
    expect(isGridView("today")).toBe(false);
  });

  it.each([
    [1024, 3],
    [1280, 4],
    [1440, 5],
    [1920, 6],
  ])("holds as many columns as fit at %i wide: %i", (vw, cols) => {
    expect(gridMetrics(vw).cols).toBe(cols);
    const places = layoutDesk({ cards: many(cols * 2), view: "events", vw, vh: 900 });
    // The first row has `cols` cards and the second starts a row lower.
    const xs = new Set([...places.values()].filter((p) => p.y === places.get("person:0")!.y).map((p) => p.x));
    expect(xs.size).toBe(cols);
  });

  it.each([768, 1024, 1280, 1440, 1920, 2560])("keeps card width between 240 and 300 at %i wide", (vw) => {
    const g = gridMetrics(vw);
    expect(g.w).toBeGreaterThanOrEqual(GRID_MIN_W);
    expect(g.w).toBeLessThanOrEqual(GRID_MAX_W);
    // 3:4
    expect(g.h).toBeCloseTo((g.w * 4) / 3, 5);
    expect(g.gap).toBe(GRID_GAP);
  });

  it.each([1024, 1280, 1440, 1920])("starts on the header's 48px edge and fits the window at %i wide", (vw) => {
    const places = layoutDesk({ cards: many(23), view: "people", vw, vh: 900 });
    const all = [...places.values()];
    expect(Math.min(...all.map((p) => p.x))).toBe(GRID_SIDE);
    expect(Math.max(...all.map((p) => p.x + p.w))).toBeLessThanOrEqual(vw - GRID_SIDE + 0.001);
  });

  it.each([
    [1024, 7],
    [1280, 23],
    [1440, 40],
    [1920, 61],
  ])("lets no two cards touch, at %i wide with %i cards", (vw, n) => {
    const cards = many(n);
    const places = layoutDesk({ cards, view: "people", vw, vh: 900 });
    const rects = cards.map((c) => places.get(c.id)!);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlap(rects[i], rects[j]), `${i} over ${j}`).toBe(false);
      }
    }
    // A gap of at least 32px between neighbors, side to side and top to bottom.
    const first = rects[0];
    const second = rects[1];
    expect(second.x - (first.x + first.w)).toBeCloseTo(GRID_GAP, 5);
  });

  it("takes a note for a full cell, the size of any other card", () => {
    const cards = [card("fund", ["projects"], true), card("project:1", ["projects"]), card("project:2", ["projects"])];
    const places = layoutDesk({ cards, view: "projects", vw: 1440, vh: 900 });
    const fund = places.get("fund")!;
    const other = places.get("project:1")!;
    expect(fund.w).toBe(other.w);
    expect(fund.h).toBe(other.h);
    // And comes first.
    expect(fund.x).toBe(GRID_SIDE);
    expect(fund.y).toBe(places.get("project:1")!.y);
  });

  it("starts the first row under the header and puts every card on one layer", () => {
    const places = layoutDesk({ cards: many(8), view: "people", vw: 1440, vh: 900, top: 150 });
    expect(places.get("person:0")!.y).toBe(150 + GRID_BELOW_HEADER);
    const defaulted = layoutDesk({ cards: many(8), view: "people", vw: 1440, vh: 900 });
    expect(defaulted.get("person:0")!.y).toBe(DEFAULT_HEADER_H + GRID_BELOW_HEADER);
    // However long the grid, no card climbs over the dim layer (z 20).
    for (const p of layoutDesk({ cards: many(120), view: "people", vw: 1440, vh: 900 }).values()) {
      expect(p.z).toBeLessThan(Z_DIM - 10);
    }
  });

  it("makes the page tall enough for the last row and 140px under it", () => {
    const n = 23;
    const { places, height, grid } = layoutDeskFull({ cards: many(n), view: "people", vw: 1440, vh: 900, top: 150 });
    expect(grid!.cols).toBe(5);
    const rows = Math.ceil(n / 5);
    const top = 150 + GRID_BELOW_HEADER;
    expect(height).toBeCloseTo(top + rows * grid!.h + (rows - 1) * GRID_GAP + GRID_BOTTOM, 5);
    const lowest = Math.max(...[...places.values()].map((p) => p.y + p.h));
    expect(height - lowest).toBeCloseTo(GRID_BOTTOM, 5);
  });

  it("is never shorter than the window", () => {
    expect(layoutDeskFull({ cards: many(2), view: "people", vw: 1440, vh: 900 }).height).toBe(900);
    expect(layoutDeskFull({ cards: [], view: "people", vw: 1440, vh: 900 }).height).toBe(900);
  });

  it("follows the order it is given when it is told what is on show", () => {
    const cards = [card("a", []), card("b", []), card("c", [])];
    const places = layoutDesk({ cards, view: "people", vw: 1440, vh: 900, shown: ["c", "a"] });
    expect(places.get("c")!.x).toBeLessThan(places.get("a")!.x);
    expect(places.get("c")!.opacity).toBe(1);
    expect(places.get("a")!.opacity).toBe(1);
    expect(places.get("b")!.opacity).toBe(0);
  });

  it("slides cards to new places when the list changes, and drops the rest below the page", () => {
    const cards = many(12, ["people"]);
    const before = layoutDeskFull({ cards, view: "people", vw: 1440, vh: 900, shown: cards.map((c) => c.id) });
    const kept = ["person:7", "person:9"];
    const after = layoutDeskFull({ cards, view: "people", vw: 1440, vh: 900, shown: kept });
    // Same cell size, a new place.
    expect(after.places.get("person:7")!.x).toBe(GRID_SIDE);
    expect(after.places.get("person:7")!.x).not.toBe(before.places.get("person:7")!.x);
    const gone = after.places.get("person:0")!;
    expect(gone.opacity).toBe(0);
    expect(gone.y).toBe(after.height + 80);
  });

  it("has no tail card: every card gets a cell", () => {
    const cards = many(60, ["events"]);
    const places = layoutDesk({ cards, view: "events", vw: 1280, vh: 800 });
    expect(places.size).toBe(60);
    for (const c of cards) expect(places.get(c.id)!.opacity).toBe(1);
  });

  it("sends cards that aren't in the view below the bottom of the page", () => {
    const cards = [...many(30, ["people"]), card("event:1", ["events"])];
    const { places, height } = layoutDeskFull({ cards, view: "people", vw: 1440, vh: 900 });
    const p = places.get("event:1")!;
    expect(p.opacity).toBe(0);
    expect(p.y).toBe(height + 80);
    expect(height).toBeGreaterThan(900);
  });

  it("has nothing on show for an empty view", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "people", vw: 1440, vh: 900 });
    for (const p of places.values()) expect(p.opacity).toBe(0);
  });
});

describe("an open card", () => {
  it("fills the window, inset 24px, straight, above the dim layer", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "all", openId: "event:2", vw: 1440, vh: 900 });
    const open = places.get("event:2")!;
    expect(open).toMatchObject({ x: OPEN_INSET, y: OPEN_INSET, w: 1440 - 48, h: 900 - 48, r: 0, opacity: 1, z: Z_OPEN });
    expect(open.z).toBeGreaterThan(Z_DIM);
    for (const [id, p] of places) if (id !== "event:2") expect(p.z).toBeLessThan(Z_DIM);
  });

  it("opens a card that isn't in the current view", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "events", openId: "fund", vw: 1440, vh: 900 });
    expect(places.get("fund")).toMatchObject({ opacity: 1, r: 0, z: Z_OPEN });
  });

  it("leaves the other cards where they were", () => {
    const base = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    const open = layoutDesk({ cards: FULL_DESK, view: "all", openId: "event:2", vw: 1440, vh: 900 });
    expect(open.get("event:1")).toEqual(base.get("event:1"));
  });

  it("sits in the window, not at the top of the page, once the desk is scrolled", () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`person:${i}`, ["people"]));
    const open = layoutDesk({ cards, view: "people", openId: "person:30", vw: 1440, vh: 900, scrollTop: 1200 }).get("person:30")!;
    expect(open).toMatchObject({ x: OPEN_INSET, y: 1200 + OPEN_INSET, w: 1440 - 48, h: 900 - 48, z: Z_OPEN });
  });

  it("stays inside the page when scrolled to the very bottom", () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`person:${i}`, ["people"]));
    const { height } = layoutDeskFull({ cards, view: "people", vw: 1440, vh: 900 });
    const open = layoutDesk({ cards, view: "people", openId: "person:30", vw: 1440, vh: 900, scrollTop: height - 900 }).get("person:30")!;
    expect(open.y + open.h).toBeLessThanOrEqual(height);
  });

  it("opens a card with no picture as a centered sheet", () => {
    const cards = [{ ...card("person:1", ["people"]), sheet: true }, card("person:2", ["people"])];
    const open = layoutDesk({ cards, view: "people", openId: "person:1", vw: 1440, vh: 900, scrollTop: 300 }).get("person:1")!;
    expect(open.w).toBe(SHEET_W);
    expect(open.h).toBe(SHEET_H);
    expect(open.x).toBeCloseTo((1440 - SHEET_W) / 2, 5);
    expect(open.y).toBeCloseTo(300 + (900 - SHEET_H) / 2, 5);
    expect(open.z).toBe(Z_OPEN);
  });

  it("keeps a sheet inside a small window", () => {
    const cards = [{ ...card("person:1", ["people"]), sheet: true }];
    const open = layoutDesk({ cards, view: "people", openId: "person:1", vw: 700, vh: 600 }).get("person:1")!;
    expect(open.w).toBe(700 - 48);
    expect(open.h).toBe(600 - 48);
    expect(open.x).toBeGreaterThanOrEqual(OPEN_INSET);
  });
});

describe("the picture side of an opened card", () => {
  // The open card at 1440 x 900 is 1392 x 852.
  const W = 1392;
  const H = 852;

  it("follows the picture's shape", () => {
    // 852 * 0.62 / 1392 would be .38, so a tall picture is held at the floor.
    expect(pictureShare(0.62, W, H)).toBe(PIC_MIN);
    // A square picture wants 852 / 1392 = .61.
    expect(pictureShare(1, W, H)).toBeCloseTo(852 / 1392, 5);
  });

  it("stays between 46% and 62%", () => {
    expect(PIC_MIN).toBe(0.46);
    expect(PIC_MAX).toBe(0.62);
    for (const aspect of [0.2, 0.5, 0.75, 1, 1.5, 2.4, 6]) {
      const share = pictureShare(aspect, W, H);
      expect(share).toBeGreaterThanOrEqual(PIC_MIN);
      expect(share).toBeLessThanOrEqual(PIC_MAX);
    }
    expect(pictureShare(2, W, H)).toBe(PIC_MAX);
  });

  it("takes the narrowest share until the picture has been measured", () => {
    expect(pictureShare(0, W, H)).toBe(PIC_MIN);
    expect(pictureShare(NaN, W, H)).toBe(PIC_MIN);
    expect(pictureShare(1.5, 0, H)).toBe(PIC_MIN);
  });
});

describe("the greeting zone", () => {
  it("is the corner the handoff names", () => {
    expect(GREETING_BOX).toMatchObject({ x: 0, y: 0, w: 520, h: 140 });
  });
});
