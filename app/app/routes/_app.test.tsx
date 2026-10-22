import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { subscribeNow } from "../hooks/useNow";
import { NOW, follow, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import AppLayout from "./_app";

// The shell's nav, from the Shortlist query: the phone's bottom bar and, with
// the palette off, the sidebar's account row. Everything else the shell reads
// answers with nothing, which it handles (no unread counts, no profile).
const scene = vi.hoisted(() => ({
  signedIn: true,
  desk: true,
  data: undefined as unknown,
  asked: [] as unknown[],
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: false }),
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      const name = getFunctionName(fn);
      if (name === "shortlist:getMine") {
        scene.asked.push(args);
        return args === "skip" ? undefined : scene.data;
      }
      return name === "profiles:getMyProfile" ? { _id: "me", name: "Rick Moy", primaryRole: "maker", bio: "Hi", interests: [] } : undefined;
    },
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
vi.mock("../desk/Palette", () => ({ Palette: () => null }));
vi.mock("../lib/featureFlags", async (original) => ({
  ...(await original<typeof import("../lib/featureFlags")>()),
  get FF_DESK() {
    return scene.desk;
  },
}));

let off = () => {};
beforeEach(() => {
  scene.signedIn = true;
  scene.desk = true;
  scene.data = sampleShortlist();
  scene.asked = [];
  vi.useFakeTimers({ now: NOW, toFake: ["setInterval", "clearInterval", "Date"] });
  off = subscribeNow(() => {});
});
afterEach(() => {
  off();
  vi.useRealTimers();
});

async function shell(url = "/today") {
  const handler = createStaticHandler([{ path: "*", Component: AppLayout }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

/** The link to /favorites, as drawn, in the bottom bar (the first one) or the sidebar (the last). */
function shortlistLinks(html: string): string[] {
  return html.match(/<a [^>]*href="\/favorites"[^>]*>.*?<\/a>/g) ?? [];
}

/** The phone's bar, as drawn. */
function bar(html: string): string {
  return html.match(/<nav aria-label="Places"[^>]*>.*?<\/nav>/)![0];
}
/** The links' names, in order. */
const labels = (markup: string) => [...markup.matchAll(/<a [^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe("the phone's bottom bar", () => {
  it("has five places signed in: Today, Projects, Events, People, Profile", async () => {
    expect(labels(bar(await shell()))).toEqual(["Today", "Projects", "Events", "People", "Profile"]);
  });

  it("has no Shortlist or Messages: those sit in Today's corner", async () => {
    const markup = bar(await shell());
    expect(markup).not.toContain('href="/favorites"');
    expect(markup).not.toContain('href="/messages"');
    expect(markup).not.toContain("Following");
  });

  it("marks the place you're on, and only it, with the filled icon", async () => {
    const links = bar(await shell("/events")).match(/<a [^>]*>.*?<\/a>/g)!;
    const on = links.filter((l) => l.includes('aria-current="page"'));
    expect(on).toHaveLength(1);
    expect(on[0]).toContain('aria-label="Events"');
    // The filled icon is a different drawing from the outline.
    const off = links.find((l) => l.includes('aria-label="Projects"'))!;
    expect(on[0].match(/<path d="([^"]+)"/)![1]).not.toBe(off.match(/<path d="([^"]+)"/)![1]);
  });

  it("shows the three public places plus Sign in, signed out, at their public addresses", async () => {
    scene.signedIn = false;
    const markup = bar(await shell("/people"));
    expect(labels(markup)).toEqual(["Projects", "Events", "People", "Sign in"]);
    expect(markup).toContain('href="/opportunities"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/events"');
    expect(markup).not.toContain('href="/today"');
    expect(markup).not.toContain('href="/settings"');
  });

  it("keeps a signed-out visitor on /events and /events/:id, but not on a private page", async () => {
    scene.signedIn = false;
    expect(await shell("/events")).toContain('aria-label="Places"');
    expect(await shell("/events/abc123")).toContain('aria-label="Places"');
    expect(await shell("/today")).toBe("");
  });

  it("keeps a signed-out visitor on a project's page, but not on a deeper path under it", async () => {
    scene.signedIn = false;
    expect(await shell("/projects")).toContain('aria-label="Places"');
    expect(await shell("/projects/abc123")).toContain('aria-label="Places"');
    expect(await shell("/projects/abc123/edit")).toBe("");
  });

  it("never asks for the Shortlist while the palette is on: Today reads its own", async () => {
    await shell();
    expect(scene.asked).toEqual(["skip"]);
  });
});

describe("the sidebar, with the palette off", () => {
  it("keeps the Shortlist link in the account row, with the dot saying how many need you", async () => {
    scene.desk = false;
    const html = await shell();
    const links = shortlistLinks(html);
    expect(links).toHaveLength(1);
    const rail = links[0];
    expect(rail).toContain('aria-label="Shortlist"');
    expect(rail).toContain('title="Shortlist"');
    expect(rail).toContain("h-2.5 w-2.5 rounded-full");
    const describedBy = rail.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toContain(`<span id="${describedBy}" class="sr-only">5 need you</span>`);
    expect(scene.asked).toEqual([{}]);
    expect(html).not.toContain("Following");
  });

  it("says 'needs' for one, and has no dot when nothing needs you", async () => {
    scene.desk = false;
    scene.data = { ...sampleShortlist(), requests: [], projects: [], events: [sampleShortlist().events[0]] };
    expect(await shell()).toContain(">1 needs you</span>");
    scene.data = shortlist({ people: [follow("Mara Lin", [], NOW)] });
    const [rail] = shortlistLinks(await shell());
    expect(rail).not.toContain("aria-describedby");
  });
});
