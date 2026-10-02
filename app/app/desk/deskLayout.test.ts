import { describe, expect, it } from "vitest";
import {
  GREETING_BOX,
  OPEN_INSET,
  TAIL_ID,
  Z_DIM,
  Z_OPEN,
  clearZones,
  deskScale,
  isSmallDesk,
  layoutDesk,
  rectsOverlap,
  rotatedBounds,
  rowCapacity,
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

describe("row (any other view)", () => {
  const events: LayoutCard[] = Array.from({ length: 3 }, (_, i) => card(`event:${i}`, ["all", "events"]));

  it("stands matching cards straight, side by side, centered", () => {
    const places = layoutDesk({ cards: [...events, card("fund", ["all", "projects"], true)], view: "events", vw: 1440, vh: 900 });
    const row = events.map((c) => places.get(c.id)!);
    for (const p of row) {
      expect(p.r).toBe(0);
      expect(p.opacity).toBe(1);
    }
    const s = deskScale(1440, 900);
    expect(row[0].w).toBeCloseTo(230 * s, 5);
    expect(row[0].h).toBeCloseTo(310 * s, 5);
    expect(row[1].x - (row[0].x + row[0].w)).toBeCloseTo(44 * s, 5);
    expect(row[0].y).toBeCloseTo(230 * s, 5);
    const leftMargin = row[0].x;
    const rightMargin = 1440 - (row[2].x + row[2].w);
    expect(leftMargin).toBeCloseTo(rightMargin, 5);
  });

  it("fits floor((vw - 192 + gap) / (w + gap)) cards", () => {
    // At 1440x900 s is 1.184: w 272.3, gap 52.1, so (1440 - 192 + 52.1) / 324.4 = 4.
    expect(rowFit(1440, 900)).toBe(4);
    // At the smallest scale (.62): w 142.6, gap 27.3, so (768 - 192 + 27.3) / 169.9 = 3.55.
    expect(rowFit(768, 600)).toBe(3);
  });

  it("shows no tail card while everything fits", () => {
    const four = Array.from({ length: 4 }, (_, i) => card(`event:${i}`, ["events"]));
    const places = layoutDesk({ cards: four, view: "events", vw: 1440, vh: 900 });
    expect(places.has(TAIL_ID)).toBe(false);
    for (const c of four) expect(places.get(c.id)!.opacity).toBe(1);
  });

  it("shrinks to show up to five before tailing", () => {
    // 1280 holds three at full size; four and five still fit a little smaller.
    expect(rowFit(1280, 800)).toBe(3);
    expect(rowCapacity(1280, 800)).toBe(5);
    expect(rowCapacity(1440, 900)).toBe(5);
    const four = Array.from({ length: 4 }, (_, i) => card(`event:${i}`, ["events"]));
    const places = layoutDesk({ cards: four, view: "events", vw: 1280, vh: 800 });
    expect(places.has(TAIL_ID)).toBe(false);
    const shown = four.map((c) => places.get(c.id)!);
    for (const p of shown) expect(p.opacity).toBe(1);
    expect(shown[0].x).toBeGreaterThanOrEqual(48);
    expect(shown[3].x + shown[3].w).toBeLessThanOrEqual(1280 - 48);
  });

  it("ends in a tail card when there are more matches than fit", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => card(`event:${i}`, ["events"]));
    const places = layoutDesk({ cards: twelve, view: "events", vw: 1440, vh: 900 });
    const fit = rowCapacity(1440, 900);
    const visible = twelve.filter((c) => places.get(c.id)!.opacity === 1);
    expect(visible).toHaveLength(fit - 1);
    const tail = places.get(TAIL_ID)!;
    expect(tail).toBeDefined();
    expect(tail.opacity).toBe(1);
    const last = places.get(visible[visible.length - 1].id)!;
    expect(tail.x).toBeGreaterThan(last.x + last.w);
    // The row, tail included, is still centered.
    const first = places.get(visible[0].id)!;
    expect(first.x).toBeCloseTo(1440 - (tail.x + tail.w), 5);
    // The rest wait below the window.
    const waiting = twelve.filter((c) => places.get(c.id)!.opacity === 0);
    expect(waiting).toHaveLength(twelve.length - (fit - 1));
    for (const c of waiting) expect(places.get(c.id)!.y).toBe(900 + 80);
  });

  it("drops cards that aren't in the view straight down, tilted three times over", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "events", vw: 1440, vh: 900 });
    const home = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    for (const id of ["fund", "grant", "project:1", "project:2"]) {
      const p = places.get(id)!;
      expect(p.y).toBe(900 + 80);
      expect(p.opacity).toBe(0);
    }
    const fund = places.get("fund")!;
    expect(fund.x).toBe(home.get("fund")!.x);
    expect(fund.r).toBe(home.get("fund")!.r * 3);
  });

  it("brings them back to the same spots in 'all'", () => {
    const there = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    const again = layoutDesk({ cards: FULL_DESK, view: "all", vw: 1440, vh: 900 });
    expect([...again.entries()]).toEqual([...there.entries()]);
  });

  it("puts a note in the row at note height, centered on the row", () => {
    const places = layoutDesk({
      cards: [card("event:1", ["projects"]), card("fund", ["projects"], true)],
      view: "projects",
      vw: 1440,
      vh: 900,
    });
    const tall = places.get("event:1")!;
    const note = places.get("fund")!;
    expect(note.h).toBeLessThan(tall.h);
    expect(note.y + note.h / 2).toBeCloseTo(tall.y + tall.h / 2, 5);
  });

  it("shrinks Today's cards to fit rather than adding a tail card", () => {
    const today = [
      card("event:1", ["all", "events", "today"]),
      card("fund", ["all", "projects", "today"], true),
      card("grant", ["all", "today"], true),
    ];
    const places = layoutDesk({ cards: today, view: "today", vw: 768, vh: 600 });
    expect(places.has(TAIL_ID)).toBe(false);
    const placed = today.map((c) => places.get(c.id)!);
    for (const p of placed) expect(p.opacity).toBe(1);
    expect(placed[0].x).toBeGreaterThanOrEqual(0);
    expect(placed[2].x + placed[2].w).toBeLessThanOrEqual(768);
  });

  it("has no places to lay out for an empty view", () => {
    const places = layoutDesk({ cards: FULL_DESK, view: "people", vw: 1440, vh: 900 });
    expect(places.has(TAIL_ID)).toBe(false);
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
});

describe("the greeting zone", () => {
  it("is the corner the handoff names", () => {
    expect(GREETING_BOX).toMatchObject({ x: 0, y: 0, w: 520, h: 140 });
  });
});
