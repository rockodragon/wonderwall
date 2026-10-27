import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import Profile from "./profile";

// A profile page, as its owner and as someone else. The queries answer by
// name; whatever isn't listed is still loading.
const scene = vi.hoisted(() => ({ me: "ana", leader: false }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
    useMutation: () => async () => {},
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
      if (args === "skip") return undefined;
      switch (getFunctionName(fn)) {
        case "profiles:getMyProfile":
          return { _id: scene.me, name: "Ana Reyes" };
        case "profiles:getProfile":
          return { _id: "ana", userId: "u-ana", name: "Ana Reyes", imageUrl: "/ana.jpg", interests: ["Photography"], artifacts: [], organizations: [], isLeader: scene.leader };
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
    // The wide name sits in a span beside the phone tile's (OwnPageFace).
    expect(html).toMatch(/<a [^>]*href="\/favorites"[^>]*>.*?Your shortlist →<\/span><\/a>/);
  });

  // One set of buttons, worded for the width: tiles in a row on a phone,
  // the pills from `sm` up (components/ownPageButton.ts).
  it("gives its owner Share, code and Shortlist: a row of tiles on a phone, pills from sm up", async () => {
    scene.me = "ana";
    const html = await profilePage();
    expect(html).toContain("grid-cols-3");
    for (const [tile, pill] of [
      ["Share profile", "Share your profile"],
      ["My code", "Show my code"],
      ["Shortlist", "Your shortlist →"],
    ]) {
      expect(html).toContain(`<span class="text-center leading-tight sm:hidden">${tile}</span><span class="hidden sm:inline">${pill}</span>`);
    }
    // Not one share button per width: that would be two share kits.
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(1);
  });

  it("offers Follow on someone else's page, never on your own", async () => {
    scene.me = "ana";
    expect(await profilePage()).not.toContain('title="Follow"');
    scene.me = "someone-else";
    expect(await profilePage()).toContain('title="Follow"');
  });

  // The same rounded square as Settings and the Canvas's people cards.
  it("shows the photo as a rounded square, not a circle, to everyone", async () => {
    for (const me of ["ana", "someone-else"]) {
      scene.me = me;
      const photo = (await profilePage()).match(/<img[^>]*src="\/ana.jpg"[^>]*>/)?.[0] ?? "";
      expect(photo, me).toContain("rounded-2xl");
      expect(photo, me).not.toContain("rounded-full");
    }
  });

  it("keeps it off everyone else's", async () => {
    scene.me = "someone-else";
    const html = await profilePage();
    expect(html).not.toContain("Your shortlist");
    expect(html).not.toContain('href="/favorites"');
    expect(html).not.toContain("My code");
    expect(html).not.toContain("grid-cols-3");
  });

  it("offers a universal back link on a person profile", async () => {
    scene.me = "someone-else";
    const html = await profilePage();
    expect(html).toMatch(/<a [^>]*href="\/people"[^>]*>.*?Back<\/a>/);
    expect(html).toContain('src="/ana.jpg"');
  });
});

// The crimson sprout beside the name of someone who leads a community
// (components/LeaderBadge.tsx): the same header on /@handle, /profile/:id and
// your own page.
describe("a profile page for a community leader", () => {
  afterEach(() => {
    scene.leader = false;
  });
  const name = (html: string) => html.match(/<h1[^>]*>Ana Reyes<\/h1>(.*?)<\/div>/)![1];

  it("puts the badge, in words, right after the name, to its owner and to everyone else", async () => {
    scene.leader = true;
    for (const me of ["ana", "someone-else"]) {
      scene.me = me;
      const html = await profilePage();
      expect(name(html), me).toContain(">community leader<");
      expect(name(html), me).toContain("uppercase");
    }
  });

  it("sits in the line the name wraps in, so a long name sends it to the next line, not off the page", async () => {
    scene.leader = true;
    scene.me = "someone-else";
    const html = await profilePage();
    expect(html).toMatch(/<div class="flex flex-wrap items-center gap-2[^"]*"><h1[^>]*>Ana Reyes<\/h1><span class="inline-flex max-w-full/);
  });

  it("has no badge for anyone who doesn't lead", async () => {
    scene.leader = false;
    for (const me of ["ana", "someone-else"]) {
      scene.me = me;
      expect(await profilePage(), me).not.toContain("community leader");
    }
  });
});
