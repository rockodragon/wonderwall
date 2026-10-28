import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import Profile from "./profile";

// A profile page, as its owner and as someone else. The queries answer by
// name; whatever isn't listed is still loading.
const scene = vi.hoisted(() => ({
  me: "ana",
  leader: false,
  drafts: undefined as unknown,
  affiliations: undefined as unknown,
}));

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
        // The viewer's own drafts, and the projects the page's person is on.
        case "garden/projects:listMyDrafts":
          return scene.drafts;
        case "garden/projectTeam:listAffiliations":
          return scene.affiliations;
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

// Drafts are the viewer's own, saved and not shared: they are on their own
// page, ahead of what's in progress, and nowhere on anyone else's.
describe("a profile page's Drafts", () => {
  const draft = (i: number, extra: Record<string, unknown> = {}) => ({ _id: `d${i}`, title: `Draft ${i}`, updatedAt: 1_000 - i, photoUrl: null, ...extra });
  const inProgress = { projectId: "p-live", title: "Hymns for the Commons", imageUrl: null, blurb: null, role: "Lead", stage: "working", kind: "passion", completed: false, openRoles: [], gig: null, raising: false };
  afterEach(() => {
    scene.me = "ana";
    scene.drafts = undefined;
    scene.affiliations = undefined;
  });

  it("lists your own, each a link to its page, above In progress", async () => {
    scene.me = "ana";
    scene.drafts = [draft(1, { photoUrl: "/campaign/band.jpg" }), draft(2)];
    scene.affiliations = [inProgress];
    const html = await profilePage();
    const heading = html.indexOf(">Drafts</h2>");
    expect(heading).toBeGreaterThan(-1);
    expect(heading).toBeLessThan(html.indexOf(">In progress</h2>"));
    const section = html.slice(heading, html.indexOf("</section>", heading));
    expect(section).toContain('href="/projects/d1"');
    expect(section).toContain('href="/projects/d2"');
    expect(section).toContain('src="/campaign/band.jpg"');
    expect(section).toContain(">Draft</span>");
  });

  it("lists all of them, not three", async () => {
    scene.me = "ana";
    scene.drafts = [1, 2, 3, 4, 5].map((i) => draft(i));
    const html = await profilePage();
    for (const i of [1, 2, 3, 4, 5]) expect(html).toContain(`href="/projects/d${i}"`);
    expect(html).not.toContain("+2 more");
  });

  it("is not on someone else's page", async () => {
    scene.me = "someone-else";
    scene.drafts = [draft(1)];
    scene.affiliations = [inProgress];
    const html = await profilePage();
    expect(html).not.toContain(">Drafts</h2>");
    expect(html).not.toContain("/projects/d1");
    // What's in progress is still there for everyone.
    expect(html).toContain(">In progress</h2>");
  });

  it("is not on your own page with no drafts, or while they load", async () => {
    scene.me = "ana";
    scene.drafts = [];
    expect(await profilePage()).not.toContain(">Drafts</h2>");
    scene.drafts = undefined;
    expect(await profilePage()).not.toContain(">Drafts</h2>");
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
