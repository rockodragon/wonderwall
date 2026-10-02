import { describe, expect, it } from "vitest";
import {
  DESK_CREATE_KINDS,
  DESK_VIEWS,
  DESK_VIEW_LABEL,
  SHORTLIST_AREAS,
  SHORTLIST_VIEW,
  deskCreateHref,
  deskHref,
  parseDeskCreate,
  parseDeskView,
  parseShortlistArea,
  parseShortlistKind,
  shortlistHref,
} from "./deskState";

describe("parseDeskView", () => {
  it("reads every view by its own name", () => {
    for (const view of DESK_VIEWS) expect(parseDeskView(view)).toBe(view);
  });

  it("answers the old Favorites link with the Shortlist", () => {
    expect(parseDeskView("fav")).toBe("shortlist");
    expect(parseDeskView("fav")).toBe(SHORTLIST_VIEW);
  });

  it("falls back to everything for no view, or one it doesn't know", () => {
    expect(parseDeskView(null)).toBe("all");
    expect(parseDeskView(undefined)).toBe("all");
    expect(parseDeskView("")).toBe("all");
    expect(parseDeskView("favorites")).toBe("all");
    expect(parseDeskView("FAV")).toBe("all");
    // Not a key of some object behind the scenes.
    expect(parseDeskView("toString")).toBe("all");
    expect(parseDeskView("constructor")).toBe("all");
  });

  it("names the Shortlist view Shortlist, and no view Favorites", () => {
    expect(DESK_VIEW_LABEL.shortlist).toBe("Shortlist");
    expect(Object.values(DESK_VIEW_LABEL)).not.toContain("Favorites");
    expect(DESK_VIEWS as readonly string[]).not.toContain("fav");
  });
});

describe("desk create kinds", () => {
  it("are start a project, hire someone and host an event", () => {
    expect([...DESK_CREATE_KINDS]).toEqual(["project", "hire", "event"]);
  });
  it("parse the three, and nothing else", () => {
    expect(parseDeskCreate("project")).toBe("project");
    expect(parseDeskCreate("hire")).toBe("hire");
    expect(parseDeskCreate("event")).toBe("event");
    expect(parseDeskCreate("job")).toBeNull();
    expect(parseDeskCreate("")).toBeNull();
    expect(parseDeskCreate(null)).toBeNull();
    expect(parseDeskCreate(undefined)).toBeNull();
  });
});

describe("deskHref", () => {
  it("leaves the view out for everything, and carries the card and create flow", () => {
    expect(deskHref()).toBe("/today");
    expect(deskHref("all")).toBe("/today");
    expect(deskHref("shortlist")).toBe("/today?view=shortlist");
    expect(deskHref("today", "request:abc")).toBe("/today?view=today&card=request%3Aabc");
    expect(deskHref("events", null, "event")).toBe("/today?view=events&create=event");
  });
  it("opens a create flow on a view", () => {
    expect(deskHref("projects", null, "hire")).toBe("/today?view=projects&create=hire");
    expect(deskHref("projects", null, "project")).toBe("/today?view=projects&create=project");
    expect(deskHref("events", null, "event")).toBe("/today?view=events&create=event");
  });
  it("is the bare desk with nothing asked", () => {
    expect(deskHref()).toBe("/today");
  });
});

describe("deskCreateHref", () => {
  it("opens the flow over the list as it is, filters and all", () => {
    const now = new URLSearchParams("view=projects&show=work&q=band");
    expect(deskCreateHref(now, "hire")).toBe("/today?view=projects&show=work&q=band&create=hire");
  });
  it("swaps a flow that is open, and closes an open card", () => {
    const now = new URLSearchParams("view=projects&card=project:x&create=project");
    expect(deskCreateHref(now, "hire")).toBe("/today?view=projects&create=hire");
  });
  it("does not touch the params it was given", () => {
    const now = new URLSearchParams("view=projects");
    deskCreateHref(now, "project");
    expect(now.toString()).toBe("view=projects");
  });
});

describe("shortlistHref", () => {
  it("goes to the overview with no area", () => {
    expect(shortlistHref()).toBe("/today?view=shortlist");
    expect(shortlistHref(undefined)).toBe("/today?view=shortlist");
  });

  it("goes to each area", () => {
    expect(shortlistHref("projects")).toBe("/today?view=shortlist&area=projects");
    expect(shortlistHref("events")).toBe("/today?view=shortlist&area=events");
    expect(shortlistHref("people")).toBe("/today?view=shortlist&area=people");
  });

  it("reads back as the view and area it names", () => {
    for (const area of [undefined, ...SHORTLIST_AREAS]) {
      const params = new URL(shortlistHref(area), "https://x.test").searchParams;
      expect(parseDeskView(params.get("view"))).toBe("shortlist");
      expect(parseShortlistArea(params.get("area"))).toBe(area ?? null);
    }
  });
});

describe("the Shortlist's params", () => {
  it("reads the three areas, in their fixed order, and nothing else", () => {
    expect(SHORTLIST_AREAS).toEqual(["projects", "events", "people"]);
    for (const area of SHORTLIST_AREAS) expect(parseShortlistArea(area)).toBe(area);
    expect(parseShortlistArea(null)).toBeNull();
    expect(parseShortlistArea("")).toBeNull();
    expect(parseShortlistArea("work")).toBeNull();
    expect(parseShortlistArea("Projects")).toBeNull();
  });

  it("reads Paid and Passion on Projects", () => {
    expect(parseShortlistKind("paid", "projects")).toBe("paid");
    expect(parseShortlistKind("passion", "projects")).toBe("passion");
    expect(parseShortlistKind(null, "projects")).toBeNull();
    expect(parseShortlistKind("volunteer", "projects")).toBeNull();
  });

  it("ignores a kind anywhere but Projects", () => {
    expect(parseShortlistKind("paid", "events")).toBeNull();
    expect(parseShortlistKind("paid", "people")).toBeNull();
    expect(parseShortlistKind("paid", null)).toBeNull();
  });
});
