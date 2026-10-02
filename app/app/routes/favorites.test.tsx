import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { subscribeNow } from "../hooks/useNow";
import { NOW, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import Favorites from "./favorites";

// The phone's /favorites, end to end from the query: the Shortlist query
// answers with whatever `answer` holds, the clock is the shared one.
let answer: ReturnType<typeof sampleShortlist> | undefined = sampleShortlist();
vi.mock("convex/react", () => ({ useQuery: () => answer }));

let off = () => {};
beforeEach(() => {
  answer = sampleShortlist();
  vi.useFakeTimers({ now: NOW, toFake: ["setInterval", "clearInterval", "Date"] });
  off = subscribeNow(() => {});
});
afterEach(() => {
  off();
  vi.useRealTimers();
});

// A route module's default export is wrapped by the framework and reads its
// loader data, so it renders inside a data router.
async function phone(url: string) {
  const handler = createStaticHandler([{ path: "/favorites", Component: Favorites }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirected to ${context.headers.get("Location")}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("/favorites on a phone", () => {
  it("is the Shortlist: its name, its count, Needs you and the three areas", async () => {
    const html = text(await phone("/favorites"));
    expect(html).toContain("Shortlist 39 things");
    expect(html).toContain("Needs you · 5");
    expect(html).toContain("Projects · 15 3 need you");
    expect(html).toContain("Events · 10 2 need you");
    expect(html).toContain("People · 14");
    expect(html).not.toContain("Following");
  });

  it("opens the area ?area= names, and Paid or Passion on Projects from ?kind=", async () => {
    const area = text(await phone("/favorites?area=projects"));
    expect(area).toContain("← Shortlist Projects 15");
    expect(area).toContain("Hymns for the Commons");
    const paid = text(await phone("/favorites?area=projects&kind=paid"));
    expect(paid).toContain("Projects 8");
    expect(paid).not.toContain("Hymns for the Commons");
    expect(await phone("/favorites?area=projects&kind=paid")).toMatch(/aria-pressed="true"[^>]*>.*?Paid/);
  });

  it("shows the overview for an area it doesn't know, and ignores ?kind= outside Projects", async () => {
    expect(text(await phone("/favorites?area=nonsense"))).toContain("Shortlist 39 things");
    const events = await phone("/favorites?area=events&kind=paid");
    expect(text(events)).toContain("← Shortlist Events 10");
    expect(events).not.toContain("Kind of work");
  });

  it("waits quietly for the Shortlist: no content until it arrives, no old Following page", async () => {
    answer = undefined;
    const html = await phone("/favorites");
    expect(text(html)).not.toContain("Shortlist");
    expect(html).toContain("animate-spin");
  });

  it("greets a member with nothing on it", async () => {
    answer = shortlist();
    expect(text(await phone("/favorites"))).toContain("Nothing on your shortlist yet.");
  });

  it("links every row to its page", async () => {
    const html = await phone("/favorites?area=projects");
    expect(html).toContain('href="/projects/hollow-creek-field-recordings?tab=team"');
    expect(html).toContain('href="/projects/hymns-for-the-commons?tab=team"');
    expect(html).not.toContain("data-desk-card");
  });
});
