import { BookmarkSimple } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { needYouText } from "../components/shortlist/copy";
import { NOW, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import { summary } from "../lib/shortlist/model";
import { needsYou } from "../lib/shortlist/needsYou";
import type { ShortlistData } from "../lib/shortlist/types";
import { shortlistHref } from "./deskState";
import {
  buildSignedInTools,
  buildSignedOutTools,
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

  it("has no switch to The Exchange while there's one community, and About goes to The Garden's page", () => {
    const profile = tool(buildSignedInTools(deps()), "profile");
    const items = profile.items ?? [];
    expect(items.map((i) => i.id)).not.toContain("switch");
    expect(items.find((i) => i.id === "about")).toMatchObject({
      label: "About The Garden",
      to: "/communities/the-garden",
    });
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

describe("the palette's Projects menu", () => {
  const projects = tool(buildSignedInTools(deps()), "projects");

  it("browses, starts a project, hires someone, then the Grant Fund", () => {
    expect(projects.items.map((i) => i.label)).toEqual(["Browse projects", "Start a project", "Hire someone", "Grant Fund"]);
  });
  it("opens each create flow as a card on the desk", () => {
    const byLabel = Object.fromEntries(projects.items.map((i) => [i.label, i.to]));
    expect(byLabel["Start a project"]).toBe("/today?view=projects&create=project");
    expect(byLabel["Hire someone"]).toBe("/today?view=projects&create=hire");
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

  it("says how many need you, in the accent, and lights the dot with the same words", () => {
    const s = loaded(sampleShortlist());
    expect(s.needs).toBeGreaterThan(0);
    const t = shortlistTool({ shortlist: s });
    expect(t.items[0].trailing).toBe(needYouText(s.needs));
    expect(t.items[0].trailingAccent).toBe(true);
    expect(t.dot).toBe(needYouText(s.needs));
  });

  it("says nothing and shows no dot when nothing needs you", () => {
    const t = shortlistTool({ shortlist: loaded(shortlist()) });
    expect(t.items[0].trailing).toBeUndefined();
    expect(t.dot).toBeUndefined();
    // An empty area still reads 0: the rows are there to browse.
    expect(t.items.slice(1).map((i) => i.trailing)).toEqual(["0", "0", "0"]);
  });

  it("shows the rows but no counts and no dot while the Shortlist loads", () => {
    const t = shortlistTool({ shortlist: null });
    expect(t.items).toHaveLength(4);
    expect(t.items.map((i) => i.trailing)).toEqual([undefined, undefined, undefined, undefined]);
    expect(t.dot).toBeUndefined();
  });
});

describe("buildSignedOutTools", () => {
  it("has no Shortlist: it needs an account", () => {
    const tools = buildSignedOutTools({ active: null, loginTo: "/login" });
    expect(tools.map((t) => t.id)).toEqual(["people", "projects", "events", "signin"]);
  });
});
