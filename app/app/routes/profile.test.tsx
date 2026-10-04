import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import Profile from "./profile";

// A profile page, as its owner and as someone else. The queries answer by
// name; whatever isn't listed is still loading.
const scene = vi.hoisted(() => ({ me: "ana" }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(fn)) {
        case "profiles:getMyProfile":
          return { _id: scene.me, name: "Ana Reyes" };
        case "profiles:getProfile":
          return { _id: "ana", userId: "u-ana", name: "Ana Reyes", imageUrl: "/ana.jpg", interests: ["Photography"], artifacts: [], organizations: [] };
        default:
          return undefined;
      }
    },
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

async function profilePage() {
  const handler = createStaticHandler([{ path: "/profile/:profileId", Component: Profile }]);
  const context = await handler.query(new Request("http://localhost/profile/ana"));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe("a profile page", () => {
  it("gives its owner a clear way to their Shortlist", async () => {
    scene.me = "ana";
    const html = await profilePage();
    expect(html).toMatch(/<a [^>]*href="\/favorites"[^>]*>.*?Your shortlist →<\/a>/);
  });

  it("keeps it off everyone else's", async () => {
    scene.me = "someone-else";
    const html = await profilePage();
    expect(html).not.toContain("Your shortlist");
    expect(html).not.toContain('href="/favorites"');
  });

  it("offers a universal back link on a person profile", async () => {
    scene.me = "someone-else";
    const html = await profilePage();
    expect(html).toMatch(/<a [^>]*href="\/people"[^>]*>.*?Back<\/a>/);
    expect(html).toContain('src="/ana.jpg"');
  });
});
