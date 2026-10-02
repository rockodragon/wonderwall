import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { formatMoney } from "../garden/ui";
import { NOW, follow, on, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import { summary } from "../lib/shortlist/model";
import { needsYou } from "../lib/shortlist/needsYou";
import type { ShortlistState } from "../lib/shortlist/useShortlist";
import type { ShortlistData } from "../lib/shortlist/types";
import type { ShortlistArea } from "./deskState";
import { ShortlistBody, TodayNeedsYou, shortlistHeader } from "./ShortlistView";

const noop = () => {};

function ready(data: ShortlistData): ShortlistState {
  return { status: "ready", data, needs: needsYou(data, NOW), summary: summary(data, NOW), now: NOW };
}

function page(state: ShortlistState, area: ShortlistArea | null = null, kind: "paid" | "passion" | null = null) {
  const search = `?view=shortlist${area ? `&area=${area}` : ""}${kind ? `&kind=${kind}` : ""}`;
  const parts = shortlistHeader(state, area, kind);
  return renderToString(
    <MemoryRouter initialEntries={[`/today${search}`]}>
      <div>
        {parts.crumb}
        <h1>
          {parts.title} {parts.count}
        </h1>
        {parts.row}
        <ShortlistBody state={state} area={area} kind={kind} money={formatMoney} onOpen={noop} inert={false} />
      </div>
    </MemoryRouter>,
  );
}

/** The text of the page, tags gone, so assertions read like the screen. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const SAMPLE = ready(sampleShortlist());

describe("the overview", () => {
  it("counts the live items in the header", () => {
    expect(shortlistHeader(SAMPLE, null, null)).toEqual({ count: "39 things" });
  });

  it("shows three of Needs you, then the rest behind 'N more'", () => {
    const html = text(page(SAMPLE));
    expect(html).toContain("Needs you · 5");
    expect(html).toContain("Sound Mixer");
    expect(html).toContain("Hana Cho");
    expect(html).toContain("Open Studio Night");
    expect(html).not.toContain("Printmaking Workshop");
    expect(html).toContain("2 more →");
  });

  it("sets three tiles: counts, breakdowns, the paid · passion split and a next step", () => {
    const html = text(page(SAMPLE));
    expect(html).toContain("Projects 3 need you 15 1 invite · 2 leading · 2 on the team · 3 waiting · 2 backing · 5 saved 7 paid · 8 passion Reply to Mara · Sound Mixer");
    expect(html).toContain("Events 2 need you 10");
    expect(html).toContain("People KM GM ML JA EP 14 Across 8 interests Latest: Kofi Mensah, Sep 30");
    expect(page(SAMPLE)).toContain('href="/today?view=shortlist&amp;area=projects"');
  });

  it("doesn't list everything under the tiles past eight items", () => {
    expect(text(page(SAMPLE))).not.toContain("Everything on your shortlist");
  });

  it("lists everything under the tiles at eight or fewer, with dashed empty tiles that browse", () => {
    const sparse = ready(shortlist({ people: [follow("Mara Lin", ["Audio", "Filmmaking"], on(9, 10)), follow("Theo Okafor", ["Filmmaking"], on(5, 20))] }));
    const html = text(page(sparse));
    expect(shortlistHeader(sparse, null, null).count).toBe("2 things");
    expect(html).toContain("Projects Nothing saved yet Browse projects →");
    expect(html).toContain("Events Nothing saved yet Browse events →");
    expect(html).toContain("Everything on your shortlist · 2");
    expect(html).toContain("Mara Lin People · Audio · Filmmaking");
    expect(html).not.toContain("Needs you");
    expect(page(sparse)).toContain("1px dashed");
  });

  it("greets a brand-new member with one note and three ways in", () => {
    const empty = ready(shortlist());
    expect(shortlistHeader(empty, null, null).count).toBeNull();
    const html = text(page(empty));
    expect(html).toContain("Nothing on your shortlist yet.");
    expect(html).toContain("Browse projects → Browse events → Find people →");
    expect(html).not.toContain("Nothing saved yet");
  });

  it("shows nothing while the Shortlist loads", () => {
    expect(text(page({ status: "loading" })).trim()).toBe("");
    expect(shortlistHeader({ status: "loading" }, "projects", null)).toMatchObject({ title: "Projects", count: null, row: null });
  });
});

describe("an area", () => {
  it("titles it, with its count and a crumb back to the overview", () => {
    const parts = shortlistHeader(SAMPLE, "projects", null);
    expect(parts).toMatchObject({ title: "Projects", count: "15" });
    const html = page(SAMPLE, "projects");
    expect(html).toContain('href="/today?view=shortlist"');
  });

  it("chips the areas with counts and a dot where something needs you, then Paid and Passion", () => {
    const html = page(SAMPLE, "projects");
    expect(text(html)).toContain("All 39 Projects 15 Events 10 People 14 Paid 7 Passion 8");
    expect(html).toContain('aria-label="Projects, 15, 3 need you"');
    expect(html).toContain('aria-label="Events, 10, 2 need you"');
    expect(html).toContain('aria-label="People, 14"');
    expect(html).toMatch(/aria-current="page"[^>]*>.*Projects/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Paid/);
  });

  it("counts by kind once one is on", () => {
    expect(shortlistHeader(SAMPLE, "projects", "paid").count).toBe("7");
    expect(page(SAMPLE, "projects", "paid")).toMatch(/aria-pressed="true"[^>]*>Paid/);
    const html = text(page(SAMPLE, "projects", "paid"));
    expect(html).toContain("Sound Mixer");
    expect(html).not.toContain("Copy Editor");
  });

  it("has no Paid or Passion outside Projects", () => {
    expect(text(page(SAMPLE, "events"))).not.toContain("Paid");
  });

  it("groups Projects by relationship, Closed folded", () => {
    const html = text(page(SAMPLE, "projects"));
    const order = ["Needs you 3", "Leading 2", "On the team 2", "Waiting to hear 3", "Backing 2", "Saved 4", "Closed 3"].map((h) => html.indexOf(h));
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]))).toBe(true);
    expect(html).toContain("Show 3 closed");
    expect(html).not.toContain("Wedding Videographer");
  });

  it("groups Events, This week first and Past folded", () => {
    const html = text(page(SAMPLE, "events"));
    expect(html).toContain("This week 2");
    expect(html).toContain("Show 3 past events");
    expect(html).not.toContain("Late Summer Potluck");
  });

  it("groups People by first interest", () => {
    const html = text(page(SAMPLE, "people"));
    expect(html).toContain("Design 2");
    expect(html).toContain("Kofi Mensah");
  });

  it("says so when an area is empty, and where to look", () => {
    const html = text(page(ready(shortlist()), "events"));
    expect(html).toContain("No events saved yet. Browse events →");
  });

  it("marks Needs you rows with the rule and their action", () => {
    const html = page(SAMPLE, "projects");
    expect(html).toContain('data-desk-card="role:sound-mixer"');
    expect(text(html)).toContain("Invited · Sep 30 Reply");
    expect(text(html)).toContain("Closes Oct 7 Apply");
  });
});

describe("Needs you on Today", () => {
  function today(state: ShortlistState) {
    return renderToString(
      <MemoryRouter initialEntries={["/today?view=today"]}>
        <TodayNeedsYou state={state} money={formatMoney} onOpen={noop} />
      </MemoryRouter>,
    );
  }

  it("shows up to three rows, then the rest on the Shortlist", () => {
    const html = today(SAMPLE);
    expect((html.match(/data-desk-card=/g) ?? []).length).toBe(3);
    expect(text(html)).toContain("2 more on your Shortlist →");
    expect(html).toContain('href="/today?view=shortlist"');
  });

  it("has no link for more when three or fewer need you", () => {
    const data = sampleShortlist();
    const few = ready({ ...data, requests: [], projects: data.projects.filter((p) => p.relation !== "invited") });
    expect(few.status === "ready" && few.needs.length).toBe(3);
    expect(text(today(few))).not.toContain("more on your Shortlist");
  });

  it("isn't there at all when nothing needs you, or before the Shortlist loads", () => {
    expect(today(ready(shortlist({ people: [follow("Mara Lin", [], NOW)] })))).toBe("");
    expect(today({ status: "loading" })).toBe("");
  });
});
