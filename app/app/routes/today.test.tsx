import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { subscribeNow } from "../hooks/useNow";
import { NOW, follow, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import Today from "./today";

// Today on a phone (a server render has no window, so it isn't desktop). The
// Shortlist query answers with `scene.data`; everything else Today reads is
// still loading, which it draws as skeletons.
const scene = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => (getFunctionName(fn) === "shortlist:getMine" ? scene.data : undefined),
    useMutation: () => async () => {},
  };
});

let off = () => {};
beforeEach(() => {
  scene.data = sampleShortlist();
  vi.useFakeTimers({ now: NOW, toFake: ["setInterval", "clearInterval", "Date"] });
  off = subscribeNow(() => {});
});
afterEach(() => {
  off();
  vi.useRealTimers();
});

async function today() {
  const handler = createStaticHandler([{ path: "/today", Component: Today }]);
  const context = await handler.query(new Request("http://localhost/today"));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Today on a phone", () => {
  it("leads with up to three Needs you rows, above the Updates", async () => {
    const html = await today();
    const needs = html.indexOf('aria-label="Needs you"');
    expect(needs).toBeGreaterThan(html.indexOf("Today in The Garden"));
    expect(needs).toBeGreaterThan(-1);
    // The Updates stack draws nothing while it loads, so the next thing under
    // Needs you is Today's own first section.
    expect(needs).toBeLessThan(html.indexOf("Featured project"));
    const section = html.slice(needs, html.indexOf("</section>", needs));
    expect((section.match(/<li/g) ?? []).length).toBe(3);
    expect(text(section)).toContain("Needs you · 5");
    expect(text(section)).toContain("Sound Mixer");
    expect(text(section)).not.toContain("Printmaking Workshop");
  });

  it("says how many more are on the Shortlist, and links there", async () => {
    const html = await today();
    expect(html).toMatch(/<a [^>]*href="\/favorites"[^>]*>2 more on your Shortlist →<\/a>/);
  });

  it("links each row to the item's page", async () => {
    const html = await today();
    expect(html).toContain('href="/projects/hollow-creek-field-recordings?tab=team"');
    expect(html).toContain('href="/events/open-studio-night"');
  });

  it("has no link for more when three or fewer need you", async () => {
    const data = sampleShortlist();
    scene.data = { ...data, requests: [], projects: data.projects.filter((p) => p.relation !== "invited") };
    const html = text(await today());
    expect(html).toContain("Needs you · 3");
    expect(html).not.toContain("more on your Shortlist");
  });

  it("is hidden when nothing needs you", async () => {
    scene.data = shortlist({ people: [follow("Mara Lin", [], NOW)] });
    const html = await today();
    expect(html).not.toContain('aria-label="Needs you"');
    expect(html).not.toContain("Needs you");
    // The Garden's lockup heads the page; "Today" is the heading for screen readers.
    expect(text(html)).toContain("The Garden");
    expect(html).toContain('<h1 class="sr-only">Today</h1>');
  });

  it("is hidden while the Shortlist loads", async () => {
    scene.data = undefined;
    expect(await today()).not.toContain("Needs you");
  });
});
