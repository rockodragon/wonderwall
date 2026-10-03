import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOVER_GRACE_MS,
  PALETTE,
  activeToolId,
  badgeText,
  createGrace,
  createHoverIntent,
  fanAngles,
  fanOffset,
  fanTransition,
  loginHref,
  withAlpha,
  type ToolId,
} from "./paletteLogic";
import { DESK } from "./tokens";

describe("activeToolId", () => {
  it("on the desk, lights the tool whose view is showing", () => {
    expect(activeToolId("/today", "?view=today")).toBe("today");
    expect(activeToolId("/today", "?view=people")).toBe("people");
    expect(activeToolId("/today", "?view=projects")).toBe("projects");
    expect(activeToolId("/today", "?view=events")).toBe("events");
    expect(activeToolId("/today", "?view=shortlist")).toBe("shortlist");
  });

  it("lights no tool on the desk's home: the main button is the way back", () => {
    expect(activeToolId("/today", "")).toBeNull();
    expect(activeToolId("/today", "?view=all")).toBeNull();
    expect(activeToolId("/today", "?card=fund")).toBeNull();
  });

  it("lights Shortlist on the overview, in an area and under a card opened from it", () => {
    expect(activeToolId("/today", "?view=shortlist&area=projects")).toBe("shortlist");
    expect(activeToolId("/today", "?view=shortlist&area=events&card=event:abc")).toBe("shortlist");
  });

  it("no longer lights Events for the old favorites view", () => {
    expect(activeToolId("/today", "?view=fav")).not.toBe("events");
  });

  it("reads an unknown view as home, and ignores an open card", () => {
    expect(activeToolId("/today", "?view=nonsense")).toBeNull();
    expect(activeToolId("/today", "?view=events&card=event:abc")).toBe("events");
  });

  it("on other pages, lights the tool those pages belong to", () => {
    expect(activeToolId("/people", "")).toBe("people");
    expect(activeToolId("/search", "?q=ana")).toBe("people");
    expect(activeToolId("/profile/abc123", "")).toBe("people");
    expect(activeToolId("/projects", "")).toBe("projects");
    expect(activeToolId("/projects/abc", "")).toBe("projects");
    expect(activeToolId("/events", "?tab=past")).toBe("events");
    expect(activeToolId("/events/abc", "")).toBe("events");
    expect(activeToolId("/tables", "")).toBe("tables");
    expect(activeToolId("/tables/new", "")).toBe("tables");
    expect(activeToolId("/tables/creative-studio", "")).toBe("tables");
    expect(activeToolId("/settings", "?tab=network")).toBe("profile");
    expect(activeToolId("/messages", "")).toBe("profile");
    expect(activeToolId("/messages/xyz", "")).toBe("profile");
  });

  it("lights nothing on pages the palette has no tool for", () => {
    expect(activeToolId("/favorites", "")).toBeNull();
    expect(activeToolId("/give", "")).toBeNull();
    expect(activeToolId("/admin", "")).toBeNull();
    expect(activeToolId("/projectsX", "")).toBeNull();
    expect(activeToolId("/todayish", "")).toBeNull();
  });
});

describe("fan geometry", () => {
  it("places six tools at the handoff's angles", () => {
    expect(fanAngles(6)).toEqual([90, 72, 54, 36, 18, 0]);
  });

  it("spreads fewer tools evenly over the same quarter", () => {
    expect(fanAngles(4)).toEqual([90, 60, 30, 0]);
    expect(fanAngles(1)).toEqual([90]);
    expect(fanAngles(0)).toEqual([]);
  });

  it("puts the first tool straight above the button and the last straight right", () => {
    const top = fanOffset(90);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(PALETTE.radius);
    const right = fanOffset(0);
    expect(right.x).toBeCloseTo(PALETTE.radius);
    expect(right.y).toBeCloseTo(0);
  });

  it("keeps every tool, circle and all, inside the 280px hover zone", () => {
    const centre = PALETTE.inset + PALETTE.button / 2;
    for (const angle of fanAngles(7)) {
      const { x, y } = fanOffset(angle);
      expect(centre + x + PALETTE.tool / 2).toBeLessThanOrEqual(PALETTE.zone);
      expect(centre + y + PALETTE.tool / 2).toBeLessThanOrEqual(PALETTE.zone);
    }
  });
});

describe("badgeText", () => {
  it("counts up to 99 and then stops", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
  });
});

describe("loginHref", () => {
  it("returns the visitor to the page they were on", () => {
    expect(loginHref("/events", "?tab=past")).toBe("/login?redirect=%2Fevents%3Ftab%3Dpast");
  });
});

describe("fanTransition", () => {
  it("staggers transform and opacity by 35ms per tool", () => {
    const t = fanTransition(true, 3, false);
    expect(t).toContain(`transform ${PALETTE.fanMs}ms ${DESK.ease} 105ms`);
    expect(t).toContain(`opacity ${PALETTE.fanMs}ms ${DESK.ease} 105ms`);
  });

  it("shows a tool at once when the fan opens, so the keyboard can focus it", () => {
    // visibility:hidden refuses focus(); the last tool must not wait 175ms.
    for (let i = 0; i < 6; i++) {
      expect(fanTransition(true, i, false)).toContain("visibility 0s linear 0ms");
    }
  });

  it("hides a tool once the fan-in has finished, when it closes", () => {
    expect(fanTransition(false, 3, false)).toContain(
      `visibility 0s linear ${105 + PALETTE.fanMs}ms`,
    );
  });

  it("drops all of it for a visitor who asked for less motion", () => {
    expect(fanTransition(true, 3, true)).toBe("none");
    expect(fanTransition(false, 3, true)).toBe("none");
  });
});

describe("withAlpha", () => {
  it("turns a token into an rgba() string", () => {
    expect(withAlpha(DESK.accent, 0.08)).toBe("rgba(255,224,102,0.08)");
    expect(withAlpha(DESK.panel, 0.92)).toBe("rgba(24,24,24,0.92)");
  });
  it("reads three-digit hex", () => {
    expect(withAlpha("#fff", 0.5)).toBe("rgba(255,255,255,0.5)");
  });
  it("refuses what isn't a hex color", () => {
    expect(() => withAlpha("red", 0.5)).toThrow();
  });
});

describe("hover intent", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A palette to point the mouse at: `stack` is the menu showing. */
  function setup(opts: { keyboardFocus?: boolean } = {}) {
    const state: { stack: ToolId | null; closed: number } = { stack: null, closed: 0 };
    const intent = createHoverIntent({
      current: () => state.stack,
      showStack: (id) => {
        state.stack = id;
      },
      closeAll: () => {
        state.closed += 1;
        state.stack = null;
      },
      keepOpen: () => !!opts.keyboardFocus,
    });
    return { state, intent };
  }
  const just = HOVER_GRACE_MS - 1;

  it("is 300ms, and the bridge is 28px", () => {
    expect(HOVER_GRACE_MS).toBe(300);
    expect(PALETTE.bridge).toBe(28);
  });

  it("opens a menu at once when none is open", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    expect(state.stack).toBe("projects");
  });

  it("switches to a neighbouring tool only after the grace period", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolLeave();
    intent.toolEnter("people");
    vi.advanceTimersByTime(just);
    expect(state.stack).toBe("projects");
    vi.advanceTimersByTime(1);
    expect(state.stack).toBe("people");
  });

  it("crossing a neighbour on the way to the menu changes nothing", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    // Off Projects, over People for a moment, then into Projects' menu (which
    // is inside Projects' own zone, so it enters Projects again).
    intent.toolLeave();
    intent.toolEnter("people");
    vi.advanceTimersByTime(80);
    intent.toolLeave();
    intent.toolEnter("projects");
    vi.advanceTimersByTime(HOVER_GRACE_MS * 3);
    expect(state.stack).toBe("projects");
  });

  it("returning to the open tool drops a switch that was waiting", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolEnter("events");
    vi.advanceTimersByTime(just);
    intent.toolEnter("projects");
    vi.advanceTimersByTime(HOVER_GRACE_MS);
    expect(state.stack).toBe("projects");
  });

  it("closes the menu after the grace period when the pointer leaves", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolLeave();
    vi.advanceTimersByTime(just);
    expect(state.stack).toBe("projects");
    vi.advanceTimersByTime(1);
    expect(state.stack).toBeNull();
  });

  it("coming back before the grace period ends keeps the menu", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolLeave();
    vi.advanceTimersByTime(just);
    intent.toolEnter("projects");
    vi.advanceTimersByTime(HOVER_GRACE_MS * 3);
    expect(state.stack).toBe("projects");
  });

  it("counts the grace period from the last move, not the first", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolEnter("people"); // waits for People
    vi.advanceTimersByTime(200);
    intent.toolLeave(); // off People: now the wait is to close
    vi.advanceTimersByTime(just);
    expect(state.stack).toBe("projects");
    vi.advanceTimersByTime(1);
    expect(state.stack).toBeNull();
  });

  it("leaving a tool when no menu is open starts nothing", () => {
    const { state, intent } = setup();
    intent.toolLeave();
    vi.advanceTimersByTime(HOVER_GRACE_MS * 2);
    expect(state.stack).toBeNull();
    expect(state.closed).toBe(0);
  });

  it("folds the fan away after the grace period when the pointer leaves the zone", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolLeave();
    intent.zoneLeave();
    vi.advanceTimersByTime(just);
    expect(state.closed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(state.closed).toBe(1);
    expect(state.stack).toBeNull();
  });

  it("coming back into the zone drops the close", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolLeave();
    intent.zoneLeave();
    vi.advanceTimersByTime(just);
    intent.zoneEnter();
    vi.advanceTimersByTime(HOVER_GRACE_MS * 3);
    expect(state.closed).toBe(0);
    expect(state.stack).toBe("projects");
  });

  it("does not fold the fan while keyboard focus is inside", () => {
    const { state, intent } = setup({ keyboardFocus: true });
    intent.zoneLeave();
    vi.advanceTimersByTime(HOVER_GRACE_MS * 3);
    expect(state.closed).toBe(0);
  });

  it("cancel() drops whatever is waiting", () => {
    const { state, intent } = setup();
    intent.toolEnter("projects");
    intent.toolEnter("events");
    intent.cancel();
    vi.advanceTimersByTime(HOVER_GRACE_MS * 3);
    expect(state.stack).toBe("projects");
  });
});

describe("createGrace", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs the latest action once, after the delay", () => {
    const grace = createGrace(100);
    const first = vi.fn();
    const second = vi.fn();
    grace.start(first);
    expect(grace.waiting).toBe(true);
    vi.advanceTimersByTime(60);
    grace.start(second);
    vi.advanceTimersByTime(99);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(grace.waiting).toBe(false);
  });

  it("does nothing once cancelled", () => {
    const grace = createGrace(100);
    const fn = vi.fn();
    grace.start(fn);
    grace.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
    expect(grace.waiting).toBe(false);
  });
});


describe("seven-tool palette clearance", () => {
  it("keeps adjacent tools from overlapping with Tables added", () => {
    const points = fanAngles(7).map((angle) => fanOffset(angle));
    for (let i = 1; i < points.length; i++) {
      expect(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)).toBeGreaterThanOrEqual(PALETTE.tool);
    }
  });
});
