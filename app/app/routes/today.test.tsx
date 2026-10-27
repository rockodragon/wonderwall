import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter, StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { subscribeNow } from "../hooks/useNow";
import { NOW, follow, sampleShortlist, shortlist } from "../lib/shortlist/fixtures";
import Today, { ProjectRow } from "./today";

// Today on a phone (a server render has no window, so it isn't desktop). The
// Shortlist query answers with `scene.data`, any other query named in
// `scene.answers` with that; everything else Today reads is still loading,
// which it draws as skeletons.
const scene = vi.hoisted(() => ({ data: undefined as unknown, answers: {} as Record<string, unknown>, signedIn: true }));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (fn: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(fn);
      return name === "shortlist:getMine" ? scene.data : scene.answers[name];
    },
    useMutation: () => async () => {},
    useAction: () => async () => {},
    useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: false }),
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

// Backing is off by default (FF_BACKING). Today is drawn with it open, so the
// Back this button on a raising project stays covered.
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  FF_BACKING: true,
}));

let off = () => {};
beforeEach(() => {
  scene.data = sampleShortlist();
  scene.answers = {};
  scene.signedIn = true;
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

// An open project on Today is a feed post (docs: Rick, 2026-10-27). On a
// phone, top to bottom: who made it, the picture edge to edge, the title, a
// line or two, the status line, and the actions as its last row. No card, no
// border; space alone sets posts apart. Wide, the same pieces sit on a grid
// with the picture beside the words.
describe("an open project on Today", () => {
  const me = { _id: "me", userId: "u-me", name: "Me", bio: "", imageUrl: null };
  const project = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    _id: id,
    userId: `u-${id}`,
    kind: "passion",
    status: "active",
    title,
    media: [],
    createdAt: NOW,
    creator: { _id: `profile-${id}`, name: "MG Smith", imageUrl: null },
    ...extra,
  });
  // The first project with a goal and a picture is the Featured one (lib/
  // projectPick.ts), so this one is it; the posts are the rest.
  const featured = project("a", "Featured one", { goal: 500, resolvedPhotoUrl: "/cover-a.jpg" });

  /** Today with these as the open projects, and the post for `id`. */
  async function post(id: string, projects: Record<string, unknown>[], answers: Record<string, unknown> = {}) {
    scene.answers = { "profiles:getMyProfile": me, "garden/projects:listProjects": [featured, ...projects], ...answers };
    const html = await today();
    const chunk = html.split("<article").find((c) => c.includes(`href="/projects/${id}"`) && !c.includes('href="/projects/a"'));
    if (!chunk) throw new Error(`no post for ${id}`);
    return "<article" + chunk.slice(0, chunk.indexOf("</article>") + "</article>".length);
  }
  const at = (html: string, needle: string | RegExp) => {
    const found = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
    expect(found, `${needle} is in the post`).toBeGreaterThan(-1);
    return found;
  };

  const full = project("b", "Songs of Safety", {
    blurb: "Twelve new hymns, recorded live with a room full of neighbors.",
    resolvedPhotoUrl: "/cover-b.jpg",
    community: { name: "The Garden", slug: "the-garden" },
    goal: 1000,
    raisedCents: 32000,
    raiseByDate: NOW + 5 * 86400000 - 1000,
    supportCount: 3,
    raising: true,
  });

  it("reads top to bottom: the maker, the picture, the title, the blurb, the status line, the actions", async () => {
    const html = await post("b", [full]);
    const order = [
      at(html, ">MG Smith<"),
      at(html, '<img src="/cover-b.jpg"'),
      at(html, "<h3"),
      at(html, "Twelve new hymns"),
      at(html, "$320 of $1,000"),
      at(html, 'aria-label="Cheer Songs of Safety"'),
    ];
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(new Set(order).size).toBe(order.length);
    expect(html).not.toContain("See →");
  });

  it("names the maker in a 36px square, with the community under the name, and links to their page", async () => {
    const html = await post("b", [full]);
    const header = html.match(/<a [^>]*href="\/profile\/profile-b"[^>]*>.*?<\/a>/)?.[0] ?? "";
    expect(header).toContain("h-9 w-9");
    expect(header).toContain("rounded-xl");
    expect(header).toMatch(/<span class="block text-\[15px\] font-semibold[^"]*"[^>]*>MG Smith<\/span>/);
    expect(header).toMatch(/<span class="block text-\[13px\][^"]*"[^>]*>in The Garden<\/span>/);
  });

  it("is an organization's logo and page when it was posted as one, and says nothing of a community it hasn't", async () => {
    const org = project("c", "Harbor Light show", { creator: undefined, organization: { name: "Harbor Light", slug: "harbor-light", logoUrl: null } });
    const html = await post("c", [org]);
    expect(html).toContain('href="/orgs/harbor-light"');
    expect(html).toContain(">Harbor Light<");
    expect(html).not.toContain(" in ");
  });

  it("has two links, the maker and the picture with the words, and no link or button inside another", async () => {
    const html = await post("b", [full]);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('href="/profile/profile-b"');
    const link = html.match(/<a [^>]*href="\/projects\/b"[^>]*>.*?<\/a>/)?.[0] ?? "";
    for (const inside of ['<img src="/cover-b.jpg"', "<h3", "Twelve new hymns", "$320 of $1,000"]) expect(link).toContain(inside);
    // The actions are outside every link.
    expect(link).not.toContain("<button");
    expect(html.slice(html.lastIndexOf("</a>"))).toContain('aria-label="Cheer Songs of Safety"');
    // Scanned tag by tag: nothing opens inside an open link or button.
    let open: string | null = null;
    for (const [tag] of html.matchAll(/<\/?(?:a|button)\b/g)) {
      const name = tag.replace(/[</]/g, "");
      if (tag.startsWith("</")) open = null;
      else {
        expect(open, `<${name}> opened inside <${open}>`).toBeNull();
        open = name;
      }
    }
  });

  it("puts a square picture edge to edge, with no card or border around the post", async () => {
    const html = await post("b", [full]);
    expect(html).toContain("aspect-square");
    expect(html).not.toContain("aspect-[4/5]");
    expect(html.match(/<div class="[^"]*-mx-4[^"]*sm:mx-0[^"]*"/)).not.toBeNull();
    const article = html.match(/<article class="([^"]*)"/)![1].split(" ");
    expect(article.filter((c) => /^(?:md:)?(?:bg-|border|rounded|p[xytbrl]?-\d)/.test(c))).toEqual([]);
  });

  it("sets the posts apart by 24px of space and nothing else", async () => {
    scene.answers = { "profiles:getMyProfile": me, "garden/projects:listProjects": [featured, full, project("d", "Third")] };
    const html = await today();
    expect(html).toMatch(/<div class="space-y-6 md:space-y-20"><article/);
  });

  it("shows the blurb on a phone, two lines of it", async () => {
    const html = await post("b", [full]);
    const blurb = html.match(/<p class="([^"]*)"[^>]*>Twelve new hymns/)![1].split(" ");
    expect(blurb).toContain("line-clamp-2");
    expect(blurb).not.toContain("hidden");
    expect(blurb).not.toContain("md:block");
  });

  it("shows the status line at 13px, then the days left", async () => {
    const html = await post("b", [full]);
    expect(html).toMatch(/<p class="[^"]*text-\[13px\][^"]*"[^>]*>[^<]*· \$320 of \$1,000 · 5 days left<\/p>/);
  });

  it("draws nothing twice for the two screen sizes", async () => {
    const html = await post("b", [full]);
    expect(html).not.toContain("md:hidden");
    expect(html.match(/>Songs of Safety</g)).toHaveLength(1);
    expect(html.match(/aria-label="Cheer /g)).toHaveLength(1);
    expect(html.match(/Twelve new hymns/g)).toHaveLength(1);
  });

  it("sets the title on the abstract cover when there's no picture, and not again below", async () => {
    const bare = project("e", "Songs of Safety", { blurb: "Twelve new hymns." });
    const html = await post("e", [bare]);
    expect(html).not.toContain("<img");
    expect(html).toContain('<svg viewBox="0 0 160 100"');
    expect(html.match(/>Songs of Safety</g)).toHaveLength(1);
    const title = html.match(/<h3 class="([^"]*)"/)![1].split(" ");
    expect(title).toContain("text-[34px]");
    expect(title).toContain("font-bold");
    // On the cover: it takes the picture's own grid cell, bottom-left, ahead of the blurb.
    const block = html.match(/<div class="([^"]*)"[^>]*><h3/)![1].split(" ");
    expect(block).toEqual(expect.arrayContaining(["col-start-1", "row-start-1", "self-end"]));
    expect(html.indexOf("<h3")).toBeLessThan(html.indexOf("Twelve new hymns"));
  });

  it("puts the title under the picture, at 17px, when there is one", async () => {
    const html = await post("b", [full]);
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<h3"));
    const title = html.match(/<h3 class="([^"]*)"/)![1].split(" ");
    expect(title).toEqual(expect.arrayContaining(["text-[17px]", "font-semibold"]));
  });

  it("closes the post with the actions: the heart and its count, Back this, Save at the far right", async () => {
    scene.answers = {};
    const html = await post("b", [full]);
    const row = html.slice(html.lastIndexOf("</a>"));
    expect(row).toMatch(/aria-label="Cheer Songs of Safety"[^>]*>/);
    expect(row).toContain(">3<");
    expect(row).toContain('aria-label="Back Songs of Safety"');
    expect(row).toContain('aria-label="Save Songs of Safety"');
    expect(row.indexOf("Cheer")).toBeLessThan(row.indexOf("Back Songs of Safety"));
    expect(row.indexOf("Back Songs of Safety")).toBeLessThan(row.indexOf("Save Songs of Safety"));
    expect(row).toMatch(/<div class="ml-auto[^"]*"><button/);
    // Every one a 44px target.
    expect(row.match(/<button[^>]*class="[^"]*\bw-11 h-11\b/g)).toHaveLength(2);
    expect(row.match(/<button[^>]*class="[^"]*\bh-11 w-11\b/g)).toHaveLength(1);
  });

  it("offers Back this only while the project is raising", async () => {
    const calm = project("f", "No ask here", { resolvedPhotoUrl: "/cover-f.jpg", raising: false });
    const html = await post("f", [calm]);
    expect(html).toContain('aria-label="Cheer No ask here"');
    expect(html).not.toMatch(/aria-label="Back /);
  });

  it("offers no Save on your own project", async () => {
    const mine = project("g", "Mine", { userId: "u-me" });
    const html = await post("g", [mine]);
    expect(html).toContain('aria-label="Cheer Mine"');
    expect(html).not.toContain("Save");
  });

  it("offers no Save to a signed-out visitor, nor before the profile has loaded", async () => {
    scene.signedIn = false;
    expect(await post("b", [full])).not.toContain("Save");
    scene.signedIn = true;
    expect(await post("b", [full], { "profiles:getMyProfile": undefined })).not.toContain("Save");
  });

  it("offers Cheer on a passion project only, and Save beside it", () => {
    const row = (p: Record<string, unknown>) =>
      renderToString(
        <MemoryRouter>
          <ProjectRow project={p as never} flip={false} viewer={{ signedIn: true, profile: me }} onSupport={() => {}} />
        </MemoryRouter>,
      );
    expect(row(full)).toContain('aria-label="Cheer Songs of Safety"');
    const paid = row({ ...full, kind: "paid", gig: null, budgetType: "amount", budget: 300 });
    expect(paid).not.toContain('aria-label="Cheer');
    expect(paid).not.toMatch(/aria-label="Back /);
    expect(paid).toContain('aria-label="Save Songs of Safety"');
  });

  it("names each post's Cheer and Back buttons for its project, so a page of posts isn't a row of identical Cheers", async () => {
    const zine = project("h", "Zine Press", { resolvedPhotoUrl: "/cover-h.jpg", goal: 200, raising: true });
    scene.answers = { "profiles:getMyProfile": me, "garden/projects:listProjects": [featured, full, zine] };
    const html = await today();
    for (const title of ["Songs of Safety", "Zine Press"]) {
      expect(html).toContain(`aria-label="Cheer ${title}" title="Cheer ${title}"`);
      expect(html).toContain(`aria-label="Back ${title}" title="Back ${title}"`);
    }
    expect(html).not.toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
  });

  // The picture-and-words link must keep a box of its own at every width: a
  // `display: contents` anchor can't take focus in Chrome, and older Safari
  // drops it from the accessibility tree, so from md up a keyboard user could
  // not reach the project. It is a stretched link instead: its ::after covers
  // the post, and the maker and the buttons sit above that.
  describe("the link to the project", () => {
    const draw = (flip: boolean, p: Record<string, unknown> = full) =>
      renderToString(
        <MemoryRouter>
          <ProjectRow project={p as never} flip={flip} viewer={{ signedIn: true, profile: me }} onSupport={() => {}} />
        </MemoryRouter>,
      );
    const classesOf = (html: string) => [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(" "));
    const linkOf = (html: string) => html.match(/<a [^>]*href="\/projects\/b"[^>]*>/)![0].match(/class="([^"]*)"/)![1].split(" ");

    it("is never display: contents, at any breakpoint, with a picture or without", () => {
      for (const flip of [false, true]) {
        for (const p of [full, project("e", "Songs of Safety", { blurb: "Twelve new hymns." })]) {
          const html = draw(flip, p);
          const link = html.match(/<a [^>]*href="\/projects\/[be]"[^>]*>/)![0].match(/class="([^"]*)"/)![1].split(" ");
          expect(link.filter((c) => /(^|:)contents$/.test(c))).toEqual([]);
          // Nor is anything else in the post.
          expect(classesOf(html).flat().filter((c) => /(^|:)contents$/.test(c))).toEqual([]);
        }
      }
    });

    it("stretches over the post: its own box stays put and its ::after covers the article", () => {
      const html = draw(false);
      const link = linkOf(html);
      expect(link).toEqual(expect.arrayContaining(["after:absolute", "after:inset-0"]));
      // Anything positioned on the link itself would hold the cover to the link's box.
      expect(link.filter((c) => /^(?:(?!after:|before:)[\w-]+:)*(?:relative|absolute|fixed|sticky)$/.test(c))).toEqual([]);
      const article = html.match(/<article class="([^"]*)"/)![1].split(" ");
      expect(article).toEqual(expect.arrayContaining(["relative", "isolate"]));
    });

    it("lifts the maker and the heart, Back this and Save above the cover so they stay clickable", () => {
      const html = draw(false);
      const header = html.match(/<div class="([^"]*)"><a [^>]*href="\/profile\/profile-b"/)![1].split(" ");
      expect(header).toEqual(expect.arrayContaining(["relative", "z-10"]));
      // The two groups in the actions row: the heart and Back this, and Save.
      const row = html.slice(html.lastIndexOf("</a>"));
      const groups = [row.match(/<div class="([^"]*-ml-\[9px\][^"]*)">/), row.match(/<div class="(ml-auto[^"]*)">/)];
      for (const m of groups) {
        expect(m, "the actions row's group").not.toBeNull();
        expect(m![1].split(" ")).toEqual(expect.arrayContaining(["relative", "z-10"]));
      }
    });

    it("shows a focus ring on the stretched cover when the link is focused by keyboard", () => {
      const link = linkOf(draw(false));
      expect(link).toEqual(
        expect.arrayContaining(["focus-visible:after:outline-2", "focus-visible:after:outline-offset-2"]),
      );
      expect(link).toContain("focus-visible:after:outline-[var(--app-accent-ink)]");
      // One ring, not two: the link's own default outline gives way to it.
      expect(link).toContain("focus-visible:outline-none");
    });

    it.each([false, true])("keeps the md grid placing the picture and the words side by side (flip: %s)", (flip) => {
      const html = draw(flip);
      const link = linkOf(html);
      // The link spans every column and row of the article's grid and hands
      // its tracks to what is inside it.
      expect(link).toEqual(
        expect.arrayContaining(["md:col-span-full", "md:row-span-full", "md:grid-cols-subgrid", "md:grid-rows-subgrid"]),
      );
      const article = html.match(/<article class="([^"]*)"/)![1];
      expect(article).toContain(flip ? "md:grid-cols-[minmax(0,1fr)_320px]" : "md:grid-cols-[320px_minmax(0,1fr)]");
      const picture = flip ? "md:col-start-2" : "md:col-start-1";
      const words = flip ? "md:col-start-1" : "md:col-start-2";
      const all = classesOf(html);
      const pictures = all.filter((c) => c.includes("md:row-span-8"));
      expect(pictures).toHaveLength(1);
      expect(pictures[0]).toContain(picture);
      // The maker, badges, title, blurb, status line and actions: one row each, in the words' column.
      const placed = all.filter((c) => c.some((t) => /^md:row-start-\d$/.test(t)));
      expect(placed.map((c) => c.find((t) => /^md:row-start-\d$/.test(t)))).toEqual(
        [2, 3, 4, 5, 6, 7].map((n) => `md:row-start-${n}`),
      );
      for (const c of placed) expect(c).toContain(words);
    });
  });

  it("keeps the wide layout: a 320px picture beside the words, the sides swapping, the maker and actions in the words' column", async () => {
    const wide = (flip: boolean) =>
      renderToString(
        <MemoryRouter>
          <ProjectRow project={full as never} flip={flip} viewer={{ signedIn: true, profile: me }} onSupport={() => {}} />
        </MemoryRouter>,
      );
    const plain = wide(false);
    expect(plain.match(/<article class="([^"]*)"/)![1]).toContain("md:grid-cols-[320px_minmax(0,1fr)]");
    const flipped = wide(true);
    expect(flipped.match(/<article class="([^"]*)"/)![1]).toContain("md:grid-cols-[minmax(0,1fr)_320px]");
    // The words (maker, badges, title, blurb, status, actions) sit in the
    // second column, then the first when flipped; the picture takes the other.
    expect(plain.match(/md:col-start-2/g)!.length).toBe(6);
    expect(plain.match(/md:col-start-1/g)).toHaveLength(1);
    expect(flipped.match(/md:col-start-1/g)!.length).toBe(6);
    expect(flipped.match(/md:col-start-2/g)).toHaveLength(1);
    // The badges and the 30px title are still there, once.
    expect(plain).toContain(">Passion<");
    expect(plain).toContain("md:text-[30px]");
    expect(plain.match(/>Songs of Safety</g)).toHaveLength(1);
  });
});
