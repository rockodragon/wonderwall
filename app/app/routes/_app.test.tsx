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

describe("the phone's bottom bar", () => {
  it("calls the link Shortlist, not Following, and still goes to /favorites", async () => {
    const html = await shell();
    const [link] = shortlistLinks(html);
    expect(link).toContain('aria-label="Shortlist"');
    expect(html).not.toContain("Following");
  });

  it("draws the bookmark, not the heart", async () => {
    const [link] = shortlistLinks(await shell());
    expect(link).toContain('viewBox="0 0 256 256"');
    expect(link).not.toContain("M4.318 6.318");
  });

  it("puts a dot on it, described as how many need you, while something does", async () => {
    const html = await shell();
    const [link] = shortlistLinks(html);
    const describedBy = link.match(/aria-describedby="([^"]+)"/)![1];
    expect(html).toMatch(new RegExp(`<span id="${describedBy.replace(/[:]/g, "\\:")}" class="sr-only">5 need you</span>`));
    expect(link).toContain("h-2.5 w-2.5 rounded-full");
  });

  it("says 'needs' for one", async () => {
    scene.data = { ...sampleShortlist(), requests: [], projects: [], events: [sampleShortlist().events[0]] };
    const html = await shell();
    expect(html).toContain(">1 needs you</span>");
  });

  it("has no dot, and nothing to describe, when nothing needs you", async () => {
    scene.data = shortlist({ people: [follow("Mara Lin", [], NOW)] });
    const [link] = shortlistLinks(await shell());
    expect(link).not.toContain("aria-describedby");
    expect(link).not.toContain("rounded-full");
  });

  it("has no dot before the Shortlist arrives", async () => {
    scene.data = undefined;
    const [link] = shortlistLinks(await shell());
    expect(link).not.toContain("aria-describedby");
  });

  it("isn't there for someone signed out, and never asks for their Shortlist", async () => {
    scene.signedIn = false;
    const html = await shell("/people");
    expect(shortlistLinks(html)).toEqual([]);
    expect(scene.asked).toEqual(["skip"]);
  });
});

describe("the sidebar, with the palette off", () => {
  it("has the same Shortlist link in the account row, with the same dot", async () => {
    scene.desk = false;
    const html = await shell();
    const links = shortlistLinks(html);
    expect(links).toHaveLength(2);
    const rail = links[1];
    expect(rail).toContain('aria-label="Shortlist"');
    expect(rail).toContain('title="Shortlist"');
    expect(rail).toContain("h-2.5 w-2.5 rounded-full");
    const describedBy = rail.match(/aria-describedby="([^"]+)"/)![1];
    expect(describedBy).not.toBe(links[0].match(/aria-describedby="([^"]+)"/)![1]);
    expect(html).not.toContain("Following");
  });
});
