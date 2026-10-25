import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import TopLevelSlug from "./slug";

// The one top-level dynamic route, as a visitor with no account and as a
// member: /@ana is Ana's public page, anything else a community's door. The
// queries answer by name; whatever isn't listed is still loading.
const scene = vi.hoisted(() => ({
  signedIn: false,
  hidden: false,
  ana: {
    _id: "ana",
    userId: "u-ana",
    name: "Ana Reyes",
    handle: "ana",
    bio: "Photographer.\nMostly film.",
    imageUrl: "/ana.jpg",
    interests: ["Photography"],
    location: "San Diego, CA",
    artifacts: [],
    organizations: [],
    links: [
      { _id: "l1", label: "Portfolio", url: "anareyes.com", order: 0 },
      { _id: "l2", label: "Instagram", url: "https://instagram.com/ana", order: 1 },
    ],
  },
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: false }),
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(fn)) {
        case "profiles:getProfileByHandle":
          return (args as { handle: string }).handle === "ana" ? { ...scene.ana, hideFromSearch: scene.hidden } : null;
        case "profiles:getMyProfile":
          return scene.signedIn ? { _id: "me", name: "Me", primaryRole: "creative", bio: "Hi", interests: [] } : null;
        case "garden/communityDomains:getCommunityLanding":
          return null;
        default:
          return undefined;
      }
    },
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
vi.mock("../desk/Palette", () => ({ Palette: () => null }));

async function page(url: string) {
  const handler = createStaticHandler([{ path: "/:slug", Component: TopLevelSlug }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe("/@handle, a person's public page", () => {
  it("shows a visitor the page, with Follow and Message going to sign in and back", async () => {
    scene.signedIn = false;
    scene.hidden = false;
    const html = await page("/@ana");
    expect(html).toContain("Ana Reyes");
    expect(html).toContain("@ana");
    expect(html).toContain('src="/ana.jpg"');
    expect(html).toContain("Photographer.");
    // The links saved in Settings, in order, a scheme added where there was none.
    expect(html).toMatch(/<a [^>]*href="https:\/\/anareyes\.com"[^>]*>Portfolio<\/a>/);
    expect(html).toMatch(/<a [^>]*rel="me noopener"[^>]*>Portfolio<\/a>/);
    expect(html).toContain('href="https://instagram.com/ana"');
    expect(html).toMatch(/<a [^>]*href="\/login\?redirect=%2F%40ana"[^>]*>Follow<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/login\?redirect=%2F%40ana"[^>]*>Message<\/a>/);
    // Blocking is for members.
    expect(html).not.toContain('aria-label="More actions"');
  });

  it("tells search engines where the page lives, and to leave it out when asked", async () => {
    scene.signedIn = false;
    scene.hidden = false;
    let html = await page("/@ana");
    expect(html).toContain('<link rel="canonical" href="https://thecreative.exchange/@ana"');
    expect(html).toContain('<meta name="description" content="Photographer."');
    expect(html).not.toContain('name="robots"');
    scene.hidden = true;
    html = await page("/@ana");
    expect(html).toContain('<meta name="robots" content="noindex"');
  });

  it("lets a member act: Follow is the real pill, Message a button", async () => {
    scene.signedIn = true;
    scene.hidden = false;
    const html = await page("/@ana");
    expect(html).not.toContain("/login?redirect=");
    expect(html).toMatch(/<button[^>]*>Follow<\/button>/);
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Message<\/button>/);
  });

  it("is the 404 for an address nobody has, or one that breaks the rules", async () => {
    scene.signedIn = false;
    expect(await page("/@nobody")).toContain("Page Not Found");
    expect(await page("/@a..b")).toContain("Page Not Found");
  });
});

describe("/:slug otherwise", () => {
  it("is a community's door, and the 404 when there is no such community", async () => {
    scene.signedIn = false;
    const html = await page("/sd");
    expect(html).toContain("Page Not Found");
    expect(html).not.toContain("Ana Reyes");
  });
});
