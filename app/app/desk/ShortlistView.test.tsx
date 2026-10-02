import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { formatMoney } from "../garden/ui";
import { NOW, event, eventRequest, follow, on, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
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
    // Above the tiles, which name Printmaking Workshop in Events.
    expect(html.split("Projects · 15")[0]).not.toContain("Printmaking Workshop");
    expect(html).toContain("2 more →");
    expect(page(SAMPLE)).toMatch(/aria-expanded="false"[^>]*>2 more →/);
  });

  it("sets three tiles that name what's in them: a small count in the kicker, three lines, 'and N more', a next step", () => {
    const html = text(page(SAMPLE));
    expect(html).toContain(
      "Projects · 15 3 need you Hollow Creek Field Recordings · Invited Psalms Zine, Vol. 3 · Saved Photographer for the Advent Catalog · Leading and 12 more →",
    );
    expect(html).toContain(
      "Events · 10 2 need you Open Studio Night · Going · Tomorrow 7PM Printmaking Workshop · Going · Thu 6PM Zine Workshop · Hosting · Oct 15 6PM and 7 more →",
    );
    expect(html).toContain("People · 14 KM GM ML JA EP Kofi, Grace, Mara and 11 more");
    expect(page(SAMPLE)).toContain('href="/today?view=shortlist&amp;area=projects"');
  });

  it("drops the big numbers and the breakdown lines from the tiles", () => {
    const html = page(SAMPLE);
    expect(html).not.toContain("font-size:56px");
    for (const gone of ["1 invite", "2 leading", "Across 8 interests", "8 paid · 7 passion", "1 hosting"]) expect(text(html)).not.toContain(gone);
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

describe("Needs you says what's wanted, once", () => {
  // Rick's case: a request asked Sep 28 about a Nov 6 event, and an event tonight.
  const rick = ready(
    shortlist({
      events: [
        event("hosting", "Songwriters Circle", on(10, 2, 19), { location: "The Press Room, 22 Elm St", goingCount: 12 }),
        event("hosting", "Winter Open Mic", on(11, 6, 19)),
      ],
      requests: [eventRequest("Sam Ito", "Winter Open Mic", on(11, 6, 19), on(9, 28))],
    }),
  );
  // The rows, before the tiles.
  const needs = text(page(rick)).split("Projects Nothing saved yet")[0];

  it("says what the request is about and what to do, with the date it asks about and when it asked apart", () => {
    expect(needs).toContain("Sam Ito Wants to attend Winter Open Mic · Nov 6 Approve or decline asked Sep 28 Review");
  });

  it("says when to show up as a day word and a time, with the date left to the block and the time said once", () => {
    expect(needs).toContain("OCT 2 Songwriters Circle You're hosting · The Press Room Today · 7PM 12 going");
    expect(needs.match(/7PM/g)).toHaveLength(1);
  });
});

describe("an area", () => {
  it("titles it, with its count and a crumb back to the overview", () => {
    const parts = shortlistHeader(SAMPLE, "projects", null);
    expect(parts).toMatchObject({ title: "Projects", count: "15" });
    const html = page(SAMPLE, "projects");
    expect(html).toContain('href="/today?view=shortlist"');
  });

  it("rings the crumb when it has the keyboard's focus", () => {
    expect(page(SAMPLE, "projects")).toMatch(/<a[^>]*class="[^"]*focus-visible:outline-\[#FFE066\][^"]*"[^>]*href="\/today\?view=shortlist"[^>]*>Shortlist<\/a>/);
  });

  it("gives each group a heading focus can land on", () => {
    const html = page(SAMPLE, "projects");
    for (const key of ["needs", "leading", "team", "waiting", "backing", "saved", "closed"]) {
      expect(html).toMatch(new RegExp(`<p tabindex="-1" data-shortlist-heading="${key}"`));
    }
  });

  it("chips the areas with counts and a dot where something needs you, then Paid and Passion", () => {
    const html = page(SAMPLE, "projects");
    expect(text(html)).toContain("All 39 Projects 15 Events 10 People 14 Paid 8 Passion 7");
    expect(html).toContain('aria-label="Projects, 15, 3 need you"');
    expect(html).toContain('aria-label="Events, 10, 2 need you"');
    expect(html).toContain('aria-label="People, 14"');
    expect(html).toMatch(/aria-current="page"[^>]*>.*Projects/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Paid/);
  });

  it("counts by kind once one is on", () => {
    expect(shortlistHeader(SAMPLE, "projects", "paid").count).toBe("8");
    expect(page(SAMPLE, "projects", "paid")).toMatch(/aria-pressed="true"[^>]*>Paid/);
    const html = text(page(SAMPLE, "projects", "paid"));
    expect(html).toContain("Sound Mixer");
    expect(html).toContain("Copy Editor");
    expect(html).not.toContain("Hymns for the Commons");
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

  it("folds behind one toggle that says whether it's open", () => {
    const html = page(SAMPLE, "events");
    expect(html).toMatch(/<button[^>]*data-fold="past"[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*>Show 3 past events/);
    const controls = html.match(/data-fold="past"[^>]*aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${controls}"`);
  });

  it("offers Remove past events beside Past when a saved event is in it", () => {
    expect(text(page(SAMPLE, "events"))).toContain("Show 3 past events Remove past events");
  });

  it("offers no Remove past events when Past holds only what you went to", () => {
    const went = ready(shortlist({ events: [event("going", "Potluck", on(9, 19)), event("hosting", "Salon", on(9, 2))] }));
    const html = text(page(went, "events"));
    expect(html).toContain("Show 2 past events");
    expect(html).not.toContain("Remove past events");
  });

  it("offers no Remove past events on Projects' Closed", () => {
    expect(text(page(SAMPLE, "projects"))).not.toContain("Remove");
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
    expect(text(html)).toContain("Reply to invite $1,200 Reply");
    expect(text(html)).toContain("Apply by Oct 7 Apply");
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
