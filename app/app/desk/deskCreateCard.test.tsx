import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";

// The desk with convex/react stubbed: queries answer from `answers` by function
// name, as the real ones answer by the signed-in member's data. A skipped query
// stays undefined, as it does for real.
const mock = vi.hoisted(() => ({ answers: {} as Record<string, unknown> }));
vi.mock("convex/react", () => ({
  useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => (args === "skip" ? undefined : mock.answers[getFunctionName(fn)]),
  useMutation: () => async () => ({ ok: true }),
  useAction: () => async () => ({ ok: true }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

import { Desk } from "./Desk";
import { GRID_GAP, GRID_SIDE, gridMetrics } from "./deskLayout";

const DAY = 86_400_000;
const project = (i: number, extra: Record<string, unknown> = {}) => ({
  _id: `p${i}`,
  title: `Project ${i}`,
  kind: "passion",
  status: "active",
  stage: "working",
  media: [],
  creator: { name: "Mara Lin" },
  community: null,
  ...extra,
});
const event = (i: number) => ({
  _id: `e${i}`,
  title: `Event ${i}`,
  datetime: Date.now() + (i + 1) * DAY,
  location: "The Press Room",
  attendeeCount: 3,
  hosts: [{ name: "Mara Lin" }],
  community: null,
  coverImageUrl: null,
});

const FUND = { org: { slug: "abiding-practice", name: "Abiding Practice" }, balanceCents: 250000 };

type World = { projects?: unknown[]; events?: unknown[]; fund?: unknown };

/** The desk at `url`, as the page it renders. */
function desk(url: string, { projects = [], events = [], fund = null }: World = {}) {
  mock.answers = {
    "updates:listMine": [],
    "events:list": events,
    "garden/projects:listProjects": projects,
    "garden/allocations:getFundPage": fund,
    "favorites:getMyFavorites": { events: [], profiles: [] },
    "garden/giving:getMyGiving": { open: [] },
    "profiles:getMyProfile": { _id: "me", name: "Rick Moy", isAdmin: false },
    "profiles:search": [],
    "organizations:list": [],
  };
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <Desk />
    </MemoryRouter>,
  );
}

/** The "+" cards on the page, in page order: a link drawn as a dashed outline. */
function createCards(html: string): { href: string; label: string }[] {
  return [...html.matchAll(/<a [^>]*border-dashed[^>]*href="([^"]*)"[^>]*>.*?<span class="text-\[18px\][^>]*>([^<]*)<\/span><\/a>/g)].map(
    ([, href, label]) => ({ href: href.replace(/&amp;/g, "&"), label }),
  );
}

/** Each cell as the page lays it out, in page order: "create" for the "+" card,
 * else the card's id, with the x it is placed at. A server render has not risen
 * yet (the y is below the window), but the x is the cell's own. */
function cells(html: string): [string, number][] {
  return html
    .split('style="position:absolute;left:0;top:0;width:')
    .slice(1)
    .map((piece) => [
      /data-desk-card="([^"]+)"/.exec(piece)?.[1] ?? (piece.includes("border-dashed") ? "create" : "?"),
      Number(/translate3d\((-?[\d.]+)px/.exec(piece)![1]),
    ]);
}

/** The words on the page, tags gone. */
function words(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

const PROJECTS = [project(1), project(2), project(3)];

describe("the desk's Projects grid", () => {
  it.each([
    ["", "Start a project", "project"],
    ["&show=funding", "Start a project", "project"],
    ["&show=people", "Start a project", "project"],
    ["&show=work", "Hire someone", "hire"],
  ])("under the %s chip: one card, %s, to create=%s", (chip, label, kind) => {
    const html = desk(`/today?view=projects${chip}`, { projects: PROJECTS });
    expect(createCards(html)).toEqual([{ href: `/today?view=projects${chip}&create=${kind}`, label }]);
  });

  it("puts the card first on the page, ahead of the fund's note and the projects (so the keyboard meets it first)", () => {
    const html = desk("/today?view=projects", { projects: PROJECTS, fund: FUND });
    const card = html.indexOf("border-dashed");
    expect(card).toBeGreaterThan(-1);
    expect(card).toBeLessThan(html.indexOf('data-desk-card="fund"'));
    expect(card).toBeLessThan(html.indexOf('data-desk-card="project:p1"'));
    // After the header, whose verb says the same thing.
    expect(html.indexOf("Start a project")).toBeLessThan(card);
  });

  it("takes the grid's first cell, with the fund's note in the second and the projects after", () => {
    const html = desk("/today?view=projects", { projects: PROJECTS, fund: FUND });
    const { w } = gridMetrics(1200);
    expect(cells(html).map(([id]) => id)).toEqual(["create", "fund", "project:p1", "project:p2", "project:p3"]);
    const xs = cells(html).map(([, x]) => x);
    expect(xs[0]).toBe(GRID_SIDE);
    expect(xs[1]).toBeCloseTo(GRID_SIDE + w + GRID_GAP, 5);
    expect(xs[2]).toBeCloseTo(GRID_SIDE + 2 * (w + GRID_GAP), 5);
  });

  it("keeps the first cell with no fund, and under another chip", () => {
    for (const url of ["/today?view=projects", "/today?view=projects&show=funding", "/today?view=projects&show=work"]) {
      const placed = cells(desk(url, { projects: PROJECTS }));
      expect(placed[0], url).toEqual(["create", GRID_SIDE]);
    }
  });

  it("is in the grid whether or not the fund's note is", () => {
    expect(createCards(desk("/today?view=projects", { projects: PROJECTS, fund: FUND }))).toHaveLength(1);
    expect(createCards(desk("/today?view=projects", { projects: PROJECTS }))).toHaveLength(1);
    expect(createCards(desk("/today?view=projects&q=band", { projects: PROJECTS, fund: FUND }))).toHaveLength(1);
  });

  it("keeps the filters in the link", () => {
    const html = desk("/today?view=projects&show=funding&stage=planning&q=hymns", { projects: PROJECTS });
    expect(createCards(html)[0].href).toBe("/today?view=projects&show=funding&stage=planning&q=hymns&create=project");
  });

  it("is not counted among the projects", () => {
    expect(words(desk("/today?view=projects", { projects: PROJECTS }))).toContain("3 projects");
  });

  it("is a link a keyboard reaches, with the desk's focus ring", () => {
    const html = desk("/today?view=projects", { projects: PROJECTS });
    const card = html.slice(html.lastIndexOf("<a ", html.indexOf("border-dashed")), html.indexOf("</a>", html.indexOf("border-dashed")));
    expect(card).toContain("focus-visible:outline-2");
    expect(card).toContain("focus-visible:outline-[#FFE066]");
    expect(card).not.toContain("tabindex");
  });
});

describe("the desk's Events grid", () => {
  const EVENTS = [event(1), event(2)];

  it("starts Upcoming with Host an event, in the first cell", () => {
    const html = desk("/today?view=events", { events: EVENTS });
    expect(createCards(html)).toEqual([{ href: "/today?view=events&create=event", label: "Host an event" }]);
    expect(html.indexOf("border-dashed")).toBeLessThan(html.indexOf('data-desk-card="event:e1"'));
    expect(cells(html).map(([id]) => id)).toEqual(["create", "event:e1", "event:e2"]);
    expect(cells(html)[0][1]).toBe(GRID_SIDE);
  });

  it("is not on Saved or Past", () => {
    for (const tab of ["favorites", "past"]) {
      expect(createCards(desk(`/today?view=events&tab=${tab}`, { events: EVENTS }))).toEqual([]);
    }
  });
});

describe("empty states", () => {
  it("Projects, nothing narrowing it: just the card, and none of the old words", () => {
    const html = desk("/today?view=projects");
    expect(createCards(html)).toEqual([{ href: "/today?view=projects&create=project", label: "Start a project" }]);
    const text = words(html);
    expect(text).not.toContain("match");
    expect(text).not.toContain("Clear filters");
    expect(text).not.toContain("Nothing from");
  });

  it("Events, Upcoming with nothing on: just the card", () => {
    const html = desk("/today?view=events");
    expect(createCards(html)).toEqual([{ href: "/today?view=events&create=event", label: "Host an event" }]);
    expect(words(html)).not.toContain("Nothing from");
    expect(words(html)).not.toContain("match");
  });

  it("Projects, filters on and nothing matching: No projects match, Clear filters, and the card", () => {
    const html = desk("/today?view=projects&show=work", { projects: PROJECTS });
    const text = words(html);
    expect(text).toContain("No projects match.");
    expect(text).toContain("Clear filters");
    expect(createCards(html)).toEqual([{ href: "/today?view=projects&show=work&create=hire", label: "Hire someone" }]);
  });

  it("Projects, a search matching nothing: the same, with Start a project", () => {
    const html = desk("/today?view=projects&q=zzz", { projects: PROJECTS, fund: FUND });
    expect(words(html)).toContain("No projects match.");
    expect(words(html)).toContain("Clear filters");
    expect(createCards(html)).toHaveLength(1);
  });

  it("Events, a search matching nothing: No events match, Clear filters, and the card", () => {
    const html = desk("/today?view=events&q=zzz", { events: [event(1)] });
    expect(words(html)).toContain("No events match.");
    expect(words(html)).toContain("Clear filters");
    // The header's Host an event goes the same way (deskHref), search left behind.
    expect(createCards(html)).toEqual([{ href: "/today?view=events&create=event", label: "Host an event" }]);
  });

  it("Events, an empty Saved list: No events match and Clear filters, with no card", () => {
    const html = desk("/today?view=events&tab=favorites", { events: [event(1)] });
    expect(words(html)).toContain("No events match.");
    expect(words(html)).toContain("Clear filters");
    expect(createCards(html)).toEqual([]);
  });

  it("People, empty: its own words and no card", () => {
    const html = desk("/today?view=people");
    expect(words(html)).toContain("Nothing from People on the desk yet.");
    expect(createCards(html)).toEqual([]);
  });
});

describe("where the card is not", () => {
  const world = { projects: PROJECTS, events: [event(1)], fund: FUND };

  it.each(["/today", "/today?view=today", "/today?view=people", "/today?view=shortlist", "/today?view=shortlist&area=projects"])("%s", (url) => {
    expect(createCards(desk(url, world))).toEqual([]);
  });
});
