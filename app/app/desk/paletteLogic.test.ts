import { describe, expect, it } from "vitest";
import {
  PALETTE,
  activeToolId,
  badgeText,
  fanAngles,
  fanOffset,
  fanTransition,
  loginHref,
  withAlpha,
} from "./paletteLogic";
import { DESK } from "./tokens";

describe("activeToolId", () => {
  it("on the desk, lights the tool whose view is showing", () => {
    expect(activeToolId("/today", "")).toBe("desk");
    expect(activeToolId("/today", "?view=today")).toBe("today");
    expect(activeToolId("/today", "?view=people")).toBe("people");
    expect(activeToolId("/today", "?view=projects")).toBe("projects");
    expect(activeToolId("/today", "?view=events")).toBe("events");
  });

  it("lights Events for favorites", () => {
    expect(activeToolId("/today", "?view=fav")).toBe("events");
  });

  it("reads an unknown view as the whole desk, and ignores an open card", () => {
    expect(activeToolId("/today", "?view=nonsense")).toBe("desk");
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
    for (const angle of fanAngles(6)) {
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
