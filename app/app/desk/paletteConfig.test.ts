import { BookmarkSimple } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { NOW, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import { summary } from "../lib/shortlist/model";
import { needsYou } from "../lib/shortlist/needsYou";
import type { ShortlistData } from "../lib/shortlist/types";
import { shortlistHref } from "./deskState";
import {
  buildSignedInTools,
  buildSignedOutTools,
  needYouText,
  type PaletteShortlist,
  type PaletteTool,
  type SignedInDeps,
} from "./paletteConfig";
import { fanAngles } from "./paletteLogic";

function deps(over: Partial<SignedInDeps> = {}): SignedInDeps {
  return {
    initials: "RM",
    isAdmin: false,
    badgeCount: 0,
    community: "garden",
    active: null,
    shortlist: null,
    invite: { label: "Invite someone", onSelect: () => {} },
    onSwitchCommunity: () => {},
    onSignOut: () => {},
    ...over,
  };
}

/** What Palette.tsx hands the config once useShortlist is ready. */
function loaded(data: ShortlistData): PaletteShortlist {
  return { needs: needsYou(data, NOW).length, summary: summary(data, NOW) };
}

function tool(tools: PaletteTool[], id: string): PaletteTool {
  const found = tools.find((t) => t.id === id);
  if (!found) throw new Error(`no ${id} tool`);
  return found;
}

const shortlistTool = (over: Partial<SignedInDeps> = {}) => tool(buildSignedInTools(deps(over)), "shortlist");

describe("buildSignedInTools", () => {
  it("fans six tools, with Shortlist in the Desk tool's old slot", () => {
    const tools = buildSignedInTools(deps());
    expect(tools.map((t) => t.id)).toEqual(["today", "people", "projects", "events", "shortlist", "profile"]);
    expect(tools).toHaveLength(fanAngles(6).length);
  });

  it("gives Shortlist the bookmark, and sends its click to the Shortlist", () => {
    const t = shortlistTool();
    expect(t.label).toBe("Shortlist");
    expect(t.header).toBe("Shortlist");
    expect((t.icon as ReactElement).type).toBe(BookmarkSimple);
    expect(t.to).toBe(shortlistHref());
  });

  it("lights Shortlist only when the Shortlist is showing", () => {
    expect(shortlistTool({ active: "shortlist" }).active).toBe(true);
    expect(shortlistTool({ active: "events" }).active).toBe(false);
    expect(shortlistTool({ active: null }).active).toBe(false);
  });

  it("drops See my favorites from Events", () => {
    const events = tool(buildSignedInTools(deps()), "events");
    expect(events.items.map((i) => i.label)).toEqual(["Browse events", "Host an event"]);
  });

  it("keeps the count chip for messages: on Profile, never on Shortlist", () => {
    const tools = buildSignedInTools(deps({ badgeCount: 3, shortlist: loaded(sampleShortlist()) }));
    expect(tool(tools, "profile").badge).toBe(3);
    expect(tool(tools, "shortlist").badge).toBeUndefined();
  });
});

describe("the Shortlist stack", () => {
  it("links the overview, then each area, in the Shortlist's order", () => {
    const items = shortlistTool().items;
    expect(items.map((i) => i.label)).toEqual(["See my shortlist", "Projects", "Events", "People I follow"]);
    expect(items.map((i) => i.to)).toEqual([
      shortlistHref(),
      shortlistHref("projects"),
      shortlistHref("events"),
      shortlistHref("people"),
    ]);
  });

  it("counts each area's live items, as the summary does", () => {
    const s = loaded(sampleShortlist());
    const [, projects, events, people] = shortlistTool({ shortlist: s }).items;
    expect(projects.trailing).toBe(String(s.summary.projects.count));
    expect(events.trailing).toBe(String(s.summary.events.count));
    expect(people.trailing).toBe(String(s.summary.people.count));
  });

  it("says how many need you, in the accent, and lights the dot", () => {
    const s = loaded(sampleShortlist());
    expect(s.needs).toBeGreaterThan(0);
    const t = shortlistTool({ shortlist: s });
    expect(t.items[0].trailing).toBe(needYouText(s.needs));
    expect(t.items[0].trailingAccent).toBe(true);
    expect(t.dot).toBe(true);
  });

  it("says nothing and shows no dot when nothing needs you", () => {
    const t = shortlistTool({ shortlist: loaded(shortlist()) });
    expect(t.items[0].trailing).toBeUndefined();
    expect(t.dot).toBe(false);
    // An empty area still reads 0: the rows are there to browse.
    expect(t.items.slice(1).map((i) => i.trailing)).toEqual(["0", "0", "0"]);
  });

  it("shows the rows but no counts and no dot while the Shortlist loads", () => {
    const t = shortlistTool({ shortlist: null });
    expect(t.items).toHaveLength(4);
    expect(t.items.map((i) => i.trailing)).toEqual([undefined, undefined, undefined, undefined]);
    expect(t.dot).toBe(false);
  });
});

describe("needYouText", () => {
  it("agrees with the number", () => {
    expect(needYouText(1)).toBe("1 needs you");
    expect(needYouText(4)).toBe("4 need you");
  });
});

describe("buildSignedOutTools", () => {
  it("has no Shortlist: it needs an account", () => {
    const tools = buildSignedOutTools({ active: null, loginTo: "/login" });
    expect(tools.map((t) => t.id)).toEqual(["people", "projects", "events", "signin"]);
  });
});
