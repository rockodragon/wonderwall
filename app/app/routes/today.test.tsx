import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { subscribeNow } from "../hooks/useNow";
import { NOW, follow, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import Today from "./today";

// Today on a phone (a server render has no window, so it isn't desktop). The
// Shortlist query answers with `scene.data`, any other query named in
// `scene.answers` with that; everything else Today reads is still loading,
// which it draws as skeletons.
const scene = vi.hoisted(() => ({ data: undefined as unknown, answers: {} as Record<string, unknown> }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(fn);
      return name === "shortlist:getMine" ? scene.data : scene.answers[name];
    },
    useMutation: () => async () => {},
  };
});

let off = () => {};
beforeEach(() => {
  scene.data = sampleShortlist();
  scene.answers = {};
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

  it("keeps the Shortlist and Messages in its top corner, the dot saying how many need you", async () => {
    const html = await today();
    const corner = html.match(/<a [^>]*aria-label="Shortlist"[^>]*>.*?<\/a>/)![0];
    expect(corner).toContain('href="/favorites"');
    const describedBy = corner.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`<span id="${describedBy}" class="sr-only">5 need you</span>`);
    expect(html).toMatch(/<a [^>]*aria-label="Messages"[^>]*href="\/messages"/);
  });

  it("is hidden when nothing needs you", async () => {
    scene.data = shortlist({ people: [follow("Mara Lin", [], NOW)] });
    const html = await today();
    expect(html).not.toContain('aria-label="Needs you"');
    expect(html).not.toContain("Needs you");
    // The corner keeps the bookmark, without the dot.
    const corner = html.match(/<a [^>]*aria-label="Shortlist"[^>]*>/)![0];
    expect(corner).not.toContain("aria-describedby");
    // The Garden's lockup heads the page; "Today" is the heading for screen readers.
    expect(text(html)).toContain("The Garden");
    expect(html).toContain('<h1 class="sr-only">Today</h1>');
  });

  it("is hidden while the Shortlist loads", async () => {
    scene.data = undefined;
    expect(await today()).not.toContain("Needs you");
  });
});

describe("Share a project on a phone's Today", () => {
  const me = { _id: "me", userId: "u-me", name: "Me", bio: "", imageUrl: null };
  const mine = {
    _id: "p-mine",
    userId: "u-me",
    kind: "passion",
    status: "active",
    stage: "completed",
    title: "Hymns for the Commons",
    media: [],
    createdAt: NOW,
  };

  it("asks for a project, two ways in, until the member has one up, and holds the empty-profile card", async () => {
    scene.answers = { "profiles:getMyProfile": me, "garden/projects:listProjects": [] };
    const html = await today();
    expect(html).toContain('aria-label="Share a project"');
    expect(html).toContain('href="/projects?new=project"');
    expect(html).toContain('href="/projects?new=project&amp;stage=completed"');
    expect(html).not.toContain('aria-label="Start a project"');
    expect(html).not.toContain("Your profile is empty");
  });

  it("shows the start call and the empty-profile card once a project of theirs is up, finished or not", async () => {
    scene.answers = { "profiles:getMyProfile": me, "garden/projects:listProjects": [mine] };
    const html = await today();
    expect(html).not.toContain('aria-label="Share a project"');
    expect(html).toContain('aria-label="Start a project"');
    expect(html).toContain("Your profile is empty");
  });

  it("shows neither while the list or the profile is still loading", async () => {
    scene.answers = { "profiles:getMyProfile": me };
    const html = await today();
    expect(html).not.toContain('aria-label="Share a project"');
    expect(html).not.toContain('aria-label="Start a project"');
  });
});
