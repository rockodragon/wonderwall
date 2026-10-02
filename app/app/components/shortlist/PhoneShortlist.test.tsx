import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { formatMoney } from "../../garden/ui";
import { NOW, event, follow, on, sampleShortlist, shortlist } from "../../lib/shortlist/fixtures";
import { summary } from "../../lib/shortlist/model";
import { needsYou } from "../../lib/shortlist/needsYou";
import type { ShortlistData, ProjectKind } from "../../lib/shortlist/types";
import type { ShortlistArea } from "../../lib/shortlist/url";
import type { ShortlistState } from "../../lib/shortlist/useShortlist";
import { PhoneNeedsYou } from "./PhoneParts";
import { PhoneShortlist } from "./PhoneShortlist";

type Ready = Extract<ShortlistState, { status: "ready" }>;

function ready(data: ShortlistData): Ready {
  return { status: "ready", data, needs: needsYou(data, NOW), summary: summary(data, NOW), now: NOW };
}

function page(state: Ready, area: ShortlistArea | null = null, kind: ProjectKind | null = null) {
  const search = `/favorites${area ? `?area=${area}${kind ? `&kind=${kind}` : ""}` : ""}`;
  return renderToString(
    <MemoryRouter initialEntries={[search]}>
      <PhoneShortlist state={state} area={area} kind={kind} money={formatMoney} />
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
  it("heads the page 'Shortlist', with how many things in it", () => {
    const html = page(SAMPLE);
    expect(html).toMatch(/<h1[^>]*>Shortlist<span[^>]*>39 things<\/span><\/h1>/);
  });

  it("counts one thing as one thing, and says nothing about none", () => {
    expect(text(page(ready(shortlist({ people: [follow("Mara Lin", [], on(9, 10))] }))))).toContain("Shortlist 1 thing ");
    expect(page(ready(shortlist()))).not.toContain("things");
  });

  it("shows three of Needs you, then the rest behind 'N more'", () => {
    const html = text(page(SAMPLE));
    expect(html).toContain("Needs you · 5");
    expect(html).toContain("Sound Mixer");
    expect(html).toContain("Hana Cho");
    expect(html).toContain("Open Studio Night");
    expect(html).not.toContain("Printmaking Workshop");
    expect(html).toContain("2 more →");
    expect(page(SAMPLE)).toMatch(/aria-expanded="false"[^>]*>2 more →/);
  });

  it("sets three tiles: counts, breakdowns, the paid · passion split and a next step", () => {
    const html = text(page(SAMPLE));
    expect(html).toContain("Projects 3 need you 15 1 invite · 2 leading · 2 on the team · 3 waiting · 2 backing · 5 saved 8 paid · 7 passion Reply to Mara · Sound Mixer");
    expect(html).toContain("Events 2 need you 10");
    expect(html).toContain("People 14 Across 8 interests Latest: Kofi Mensah, Sep 30");
  });

  it("links each tile to its area on the phone's own page", () => {
    const html = page(SAMPLE);
    expect(html).toContain('href="/favorites?area=projects"');
    expect(html).toContain('href="/favorites?area=events"');
    expect(html).toContain('href="/favorites?area=people"');
    expect(html).toContain('aria-label="Projects, 15, 3 need you"');
    expect(html).toContain('aria-label="People, 14"');
    expect(html).not.toContain("/today?view=shortlist");
  });

  it("doesn't list everything under the tiles past eight items", () => {
    expect(text(page(SAMPLE))).not.toContain("Everything on your shortlist");
  });

  it("lists everything under the tiles at eight or fewer, with dashed empty tiles that browse", () => {
    const sparse = ready(shortlist({ people: [follow("Mara Lin", ["Audio", "Filmmaking"], on(9, 10)), follow("Theo Okafor", ["Filmmaking"], on(5, 20))] }));
    const html = text(page(sparse));
    expect(html).toContain("Projects Nothing saved yet Browse projects →");
    expect(html).toContain("Events Nothing saved yet Browse events →");
    expect(html).toContain("Everything on your shortlist · 2");
    expect(html).toContain("Mara Lin People · Audio · Filmmaking");
    expect(html).not.toContain("Needs you");
    expect(page(sparse)).toContain("border-dashed");
    expect(page(sparse)).toContain('href="/projects"');
    expect(page(sparse)).toContain('href="/events"');
  });

  it("greets a brand-new member with one note and three ways in", () => {
    const html = text(page(ready(shortlist())));
    expect(html).toContain("Nothing on your shortlist yet.");
    expect(html).toContain("Save projects, roles and events you want to come back to, and follow people whose work you like.");
    expect(html).toContain("Browse projects → Browse events → Find people →");
    expect(html).not.toContain("Nothing saved yet");
    expect(page(ready(shortlist()))).toContain('href="/people"');
  });

  it("opens no overlay: nothing on the page is a button that opens a card", () => {
    const html = page(SAMPLE);
    expect(html).not.toContain("data-desk-card");
    expect(html).not.toContain('aria-haspopup="dialog"');
  });
});

describe("rows", () => {
  it("are links to the item's page, the whole row", () => {
    const html = page(SAMPLE);
    expect(html).toMatch(/<a [^>]*href="\/projects\/hollow-creek-field-recordings\?tab=team"[^>]*>.*?Sound Mixer/);
    expect(html).toMatch(/<a [^>]*href="\/projects\/hymns-for-the-commons\?tab=team"[^>]*>.*?Hana Cho/);
    expect(html).toMatch(/<a [^>]*href="\/events\/open-studio-night"[^>]*>.*?Open Studio Night/);
  });

  it("carry the Needs you action as a label inside the one link, not a second one", () => {
    const html = page(SAMPLE);
    const sound = html.match(/<a [^>]*href="\/projects\/hollow-creek-field-recordings\?tab=team"[^>]*>(.*?)<\/a>/)![1];
    expect(text(sound)).toContain("Reply");
    expect(sound).not.toContain("<a ");
    expect(sound).not.toContain("<button");
  });

  it("mark a Needs you row with the accent rule and say what it waits on", () => {
    const html = page(SAMPLE, "projects");
    expect(text(html)).toContain("Invited · Sep 30 $1,200 Reply");
    expect(text(html)).toContain("Closes Oct 7 $300 Apply");
    expect(html).toContain("width:3px");
  });

  it("send a person to their profile, a saved event to its page", () => {
    expect(page(SAMPLE, "people")).toContain('href="/profile/kofi-mensah"');
    expect(page(SAMPLE, "events")).toContain('href="/events/makers-market"');
  });

  it("use the app's tokens, not the desk's dark palette", () => {
    const html = page(SAMPLE, "projects");
    expect(html).toContain("var(--app-text)");
    expect(html).toContain("var(--app-hairline)");
    expect(html).not.toMatch(/#F4F4F2|#ACACA4|#FFE066|#151515|#181818/i);
  });
});

describe("an area", () => {
  it("titles it, with its count and a way back to the overview", () => {
    const html = page(SAMPLE, "projects");
    expect(html).toMatch(/<a [^>]*href="\/favorites"[^>]*>← Shortlist<\/a>/);
    expect(html).toMatch(/<h1[^>]*>Projects<span[^>]*>15<\/span><\/h1>/);
  });

  it("chips the areas with counts and a dot where something needs you, then Paid and Passion", () => {
    const html = page(SAMPLE, "projects");
    expect(text(html)).toContain("All 39 Projects 15 Events 10 People 14 Paid 8 Passion 7");
    expect(html).toContain('aria-label="Projects, 15, 3 need you"');
    expect(html).toContain('aria-label="Events, 10, 2 need you"');
    expect(html).toContain('aria-label="People, 14"');
    expect(html).toMatch(/aria-current="page"[^>]*>.*?Projects/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*?Paid/);
  });

  it("goes back to the overview from the open area's chip, and across from another's", () => {
    const html = page(SAMPLE, "projects");
    expect(html).toMatch(/aria-current="page"[^>]*aria-label="Projects[^"]*"|href="\/favorites"[^>]*aria-current="page"/);
    expect(html).toContain('href="/favorites?area=events"');
    expect(html).toContain('href="/favorites?area=people"');
  });

  it("counts by kind once one is on, and lists only that kind", () => {
    const html = page(SAMPLE, "projects", "paid");
    expect(html).toMatch(/<h1[^>]*>Projects<span[^>]*>8<\/span><\/h1>/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Paid/);
    expect(text(html)).toContain("Sound Mixer");
    expect(text(html)).toContain("Copy Editor");
    expect(text(html)).not.toContain("Hymns for the Commons");
  });

  it("has no Paid or Passion outside Projects", () => {
    expect(text(page(SAMPLE, "events"))).not.toContain("Paid");
    expect(text(page(SAMPLE, "people"))).not.toContain("Passion");
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

  it("offers no Remove past events: that stays on the desk", () => {
    expect(text(page(SAMPLE, "events"))).not.toContain("Remove");
  });

  it("splits saved events into months past six", () => {
    const many = ready(shortlist({ events: Array.from({ length: 7 }, (_, i) => event("saved", `Saved ${i}`, on(10 + (i % 3), 10 + i))) }));
    const html = text(page(many, "events"));
    expect(html).toMatch(/OCTOBER · \d|October · \d/i);
  });

  it("groups People by first interest", () => {
    const html = text(page(SAMPLE, "people"));
    expect(html).toContain("Design 2");
    expect(html).toContain("Kofi Mensah");
  });

  it("says so when an area is empty, and where to look", () => {
    const empty = ready(shortlist({ people: [follow("Mara Lin", [], on(9, 10))] }));
    expect(text(page(empty, "events"))).toContain("No events saved yet. Browse events →");
    expect(text(page(empty, "projects"))).toContain("No projects on your shortlist yet. Browse projects →");
    expect(text(page(ready(shortlist()), "people"))).toContain("You're not following anyone yet. Find people →");
  });

  it("says so when a kind has nothing in it", () => {
    const data = sampleShortlist();
    const passionOnly = ready({ ...data, projects: data.projects.filter((p) => p.kind === "passion" && !p.pay), requests: [] });
    expect(text(page(passionOnly, "projects", "paid"))).toContain("No paid projects on your shortlist.");
  });
});

describe("Needs you on Today", () => {
  function today(state: Ready, more: "expand" | "link" = "link") {
    return renderToString(
      <MemoryRouter initialEntries={["/today"]}>
        <PhoneNeedsYou needs={state.needs} money={formatMoney} more={more} />
      </MemoryRouter>,
    );
  }

  it("shows up to three rows, then the rest on the Shortlist", () => {
    const html = today(SAMPLE);
    expect((html.match(/<li/g) ?? []).length).toBe(3);
    expect(text(html)).toContain("Needs you · 5");
    expect(text(html)).toContain("2 more on your Shortlist →");
    expect(html).toMatch(/<a [^>]*href="\/favorites"[^>]*>2 more on your Shortlist →/);
  });

  it("has no link for more when three or fewer need you", () => {
    const data = sampleShortlist();
    const few = ready({ ...data, requests: [], projects: data.projects.filter((p) => p.relation !== "invited") });
    expect(few.needs.length).toBe(3);
    expect(text(today(few))).not.toContain("more");
  });

  it("isn't there at all when nothing needs you", () => {
    expect(today(ready(shortlist({ people: [follow("Mara Lin", [], NOW)] })))).toBe("");
  });
});
