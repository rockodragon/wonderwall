import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ProjectCard } from "./projects";
import type { ProjectsLens } from "../lib/browse/projectsFilter";

// The Projects tab draws each project as a feed post (Rick, 2026-11-02: make
// it match Today's Open projects): the maker, the picture, the words, then
// the actions as the post's last row. The pieces are Today's own
// (components/ProjectPost.tsx); these are the cards drawn with `feed`.
// Save is a Convex-backed button, so the hooks are stood in for.
const flags = vi.hoisted(() => ({ backing: true }));
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  get FF_BACKING() {
    return flags.backing;
  },
}));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
afterEach(() => {
  flags.backing = true;
});

type Viewer = { signedIn: boolean; profile: { userId?: string } | null | undefined };
const member: Viewer = { signedIn: true, profile: { userId: "u-me" } };

function feedCard(project: Record<string, unknown>, lens: ProjectsLens = "projects", viewer: Viewer = member) {
  const full = {
    _id: "p1",
    userId: "u-dana",
    kind: "passion",
    status: "active",
    title: "Harbor Mural",
    media: [],
    creator: { _id: "dana", name: "Dana Lee" },
    interests: [],
    openRoles: [],
    ...project,
  };
  // React marks the seams between text pieces; they are not in the page.
  return renderToString(
    <MemoryRouter>
      <ProjectCard project={full} lens={lens} onSupport={() => {}} feed viewer={viewer} />
    </MemoryRouter>,
  ).replace(/<!-- -->/g, "");
}

const at = (html: string, needle: string | RegExp) => {
  const found = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
  expect(found, `${needle} is in the post`).toBeGreaterThan(-1);
  return found;
};
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");

const withPicture = {
  resolvedPhotoUrl: "https://files.example/mural.jpg",
  blurb: "A wall on the harbor, painted by forty neighbors.",
  community: { name: "The Garden", slug: "the-garden" },
  supportCount: 3,
  goal: 1000,
  raisedCents: 32000,
  raising: true,
  interests: ["Painting"],
};
const drummer = { roleId: "r1", title: "Drummer", budgetType: "amount", budget: 200, budgetMax: null };
const stagehand = { roleId: "r2", title: "Stagehand", budgetType: "volunteer", budget: null, budgetMax: null };
const job = { kind: "paid", title: "Logo for a bakery", budgetType: "amount", budget: 400 };
const gig = {
  kind: "paid",
  title: "Friday jazz",
  budgetType: "amount",
  budget: 300,
  gig: { status: "open", venueName: "The Grove", cadence: "Every Friday", timeRange: "8–10pm", schedule: "Every Friday · 8–10pm", nextDateLabel: "Fri, Oct 9", openCount: 3 },
};

describe("a feed card on the Projects tab", () => {
  it("reads top to bottom: the maker, the picture, the title, the words, the actions", () => {
    const html = feedCard(withPicture);
    const order = [
      at(html, ">Dana Lee<"),
      at(html, '<img src="https://files.example/mural.jpg"'),
      at(html, "<h3"),
      at(html, "A wall on the harbor"),
      at(html, 'aria-label="Cheer Harbor Mural"'),
    ];
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(new Set(order).size).toBe(order.length);
    expect(html).not.toContain("See →");
  });

  it("names the maker as a feed post does: the community under the name, linked to their page", () => {
    const header = feedCard(withPicture).match(/<a [^>]*href="\/profile\/dana"[^>]*>.*?<\/a>/)?.[0] ?? "";
    expect(header).toContain("h-9 w-9");
    expect(header).toMatch(/<span class="block text-\[15px\] font-semibold[^"]*"[^>]*>Dana Lee<\/span>/);
    expect(header).toMatch(/<span class="block text-\[13px\][^"]*"[^>]*>in The Garden<\/span>/);
  });

  it("is an organization's logo and page when it was posted as one", () => {
    const html = feedCard({ ...withPicture, creator: undefined, organization: { name: "Harbor Light", slug: "harbor-light", logoUrl: null } });
    expect(html).toContain('href="/orgs/harbor-light"');
    expect(html).toContain(">Harbor Light<");
  });

  it("puts a square picture, cropped to fill, flush to the card's edges on a phone", () => {
    const html = feedCard(withPicture);
    expect(html).toContain("aspect-square");
    expect(html).toContain("object-cover");
    expect(html).not.toContain("aspect-[4/5]");
    expect(html).not.toContain("object-contain");
    expect(html.match(/<div class="[^"]*-mx-4[^"]*sm:mx-0[^"]*"/)).not.toBeNull();
  });

  it("is the abstract cover with the title set large on it when there is no picture, and the title is not said again", () => {
    const html = feedCard({ blurb: "Painted by forty neighbors." });
    expect(html).not.toContain("<img");
    expect(html).toContain('<svg viewBox="0 0 160 100"');
    expect(html.match(/>Harbor Mural</g)).toHaveLength(1);
    const title = classesOf(html.match(/<h3 [^>]*>/)![0]);
    expect(title).toContain("text-[34px]");
    expect(title).toContain("font-bold");
    // It takes the picture's own cell, bottom-left, ahead of the words.
    const block = classesOf(html.match(/<div [^>]*><h3/)![0]);
    expect(block).toEqual(expect.arrayContaining(["col-start-1", "row-start-1", "self-end"]));
    expect(html.indexOf("<h3")).toBeLessThan(html.indexOf("Painted by forty neighbors."));
    // No collapsed strip any more.
    expect(html).not.toContain("h-16");
  });

  it("keeps the picture's title under it, at 17px, when there is a picture", () => {
    const title = classesOf(feedCard(withPicture).match(/<h3 [^>]*>/)![0]);
    expect(title).toEqual(expect.arrayContaining(["text-[17px]", "font-semibold"]));
  });

  it("keeps the kind and the money over the square picture, with a picture or without", () => {
    for (const html of [feedCard({ ...job, resolvedPhotoUrl: "https://files.example/j.jpg" }, "work"), feedCard(job, "work")]) {
      const badges = html.match(/<div class="absolute inset-x-2 top-2[^"]*">.*?<\/div>/)?.[0] ?? "";
      expect(badges).toContain(">Job<");
      expect(badges).toContain(">$400<");
      // Inside the cover's own box, which is the square.
      const cover = html.slice(html.indexOf("aspect-square"));
      expect(cover).toContain("absolute inset-x-2 top-2");
    }
  });

  it("has a link to the maker and a link to the project, and no link or button inside another", () => {
    const html = feedCard(withPicture);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('href="/profile/dana"');
    const link = html.match(/<a [^>]*href="\/projects\/p1"[^>]*>.*?<\/a>/)?.[0] ?? "";
    for (const inside of ['<img src="https://files.example/mural.jpg"', "<h3", "A wall on the harbor", "$320"]) expect(link).toContain(inside);
    // The actions are outside every link.
    expect(link).not.toContain("<button");
    expect(html.slice(html.lastIndexOf("</a>"))).toContain('aria-label="Cheer Harbor Mural"');
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

  it("is an article whose project link stretches over it, with a ring on keyboard focus", () => {
    const html = feedCard(withPicture);
    const article = classesOf(html.match(/<article [^>]*>/)![0]);
    expect(article).toEqual(expect.arrayContaining(["relative", "isolate"]));
    const link = classesOf(html.match(/<a [^>]*href="\/projects\/p1"[^>]*>/)![0]);
    expect(link).toEqual(expect.arrayContaining(["after:absolute", "after:inset-0"]));
    // Anything positioned on the link itself would hold the cover to the link's box.
    expect(link.filter((c) => /^(?:(?!after:|before:)[\w-]+:)*(?:relative|absolute|fixed|sticky)$/.test(c))).toEqual([]);
    expect(link).toEqual(expect.arrayContaining(["focus-visible:after:outline-2", "focus-visible:after:outline-offset-2", "focus-visible:outline-none"]));
    expect(link).toContain("focus-visible:after:outline-[var(--app-accent-ink)]");
    expect(link.filter((c) => /(^|:)contents$/.test(c))).toEqual([]);
  });

  it("lifts the maker, the heart with Back this, and Save above the stretched link so they stay clickable", () => {
    const html = feedCard(withPicture);
    const maker = classesOf(html.match(/<div class="[^"]*"><a [^>]*href="\/profile\/dana"/)![0]);
    expect(maker).toEqual(expect.arrayContaining(["relative", "z-10"]));
    const row = html.slice(html.lastIndexOf("</a>"));
    for (const group of [row.match(/<div class="([^"]*-ml-\[9px\][^"]*)">/), row.match(/<div class="(ml-auto[^"]*)">/)]) {
      expect(group, "a group in the actions row").not.toBeNull();
      expect(group![1].split(" ")).toEqual(expect.arrayContaining(["relative", "z-10"]));
    }
  });

  it("closes the post with the actions: the heart and its count, Back this, Save at the far right, each a 44px target", () => {
    const row = (() => {
      const html = feedCard(withPicture);
      return html.slice(html.lastIndexOf("</a>"));
    })();
    expect(row.indexOf("Cheer Harbor Mural")).toBeLessThan(row.indexOf("Back Harbor Mural"));
    expect(row.indexOf("Back Harbor Mural")).toBeLessThan(row.indexOf("Save Harbor Mural"));
    expect(row).toContain(">3<");
    expect(row).toMatch(/<div class="ml-auto[^"]*"><button/);
    expect(row.match(/<button[^>]*class="[^"]*\bw-11 h-11\b/g)).toHaveLength(2);
    expect(row.match(/<button[^>]*class="[^"]*\bh-11 w-11\b/g)).toHaveLength(1);
  });

  it("offers Back this only while the project is raising, and not while backing is closed", () => {
    expect(feedCard({ ...withPicture, raising: false, goal: undefined })).not.toMatch(/aria-label="Back /);
    expect(feedCard({ ...withPicture, raising: false, goal: undefined })).toContain('aria-label="Cheer Harbor Mural"');
    flags.backing = false;
    expect(feedCard(withPicture)).not.toMatch(/aria-label="Back /);
    expect(feedCard(withPicture)).toContain('aria-label="Cheer Harbor Mural"');
  });

  it("names each button for its project, so a page of posts isn't a row of identical Cheers", () => {
    const html = feedCard(withPicture);
    expect(html).toContain('aria-label="Cheer Harbor Mural" title="Cheer Harbor Mural"');
    expect(html).toContain('aria-label="Back Harbor Mural" title="Back Harbor Mural"');
    expect(html).toContain('aria-label="Save Harbor Mural"');
    expect(html).not.toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
    expect(html).not.toMatch(/aria-label="Save"/);
  });

  it("offers no Save on your own project", () => {
    const html = feedCard({ ...withPicture, userId: "u-me" });
    expect(html).toContain('aria-label="Cheer Harbor Mural"');
    expect(html).not.toContain("Save");
  });

  it("offers Save to a member, and none to a signed-out visitor, nor before the profile has loaded, nor on a hidden project", () => {
    expect(feedCard(withPicture)).toContain('aria-label="Save Harbor Mural"');
    expect(feedCard(withPicture, "projects", { signedIn: false, profile: null })).not.toContain("Save");
    expect(feedCard(withPicture, "projects", { signedIn: true, profile: undefined })).not.toContain("Save");
    expect(feedCard({ ...withPicture, status: "pending" })).not.toContain("Save");
  });

  it("offers no Cheer or Back on a job or a gig, which is paid, not backed, but keeps Save and every detail", () => {
    const html = feedCard(gig, "work");
    expect(html).not.toContain('aria-label="Cheer');
    expect(html).not.toMatch(/aria-label="Back /);
    expect(html).toContain('aria-label="Save Friday jazz"');
    expect(html).toContain(">Recurring gig · Fridays 8–10pm<");
    expect(html).toContain(">$300/date<");
    expect(html).toContain("The Grove");
    expect(html).toContain("3 dates open");
    expect(html).toContain("next Fri, Oct 9");
    expect(html).toContain(">Dana Lee<");
    const jobHtml = feedCard(job, "work");
    expect(jobHtml).toContain(">Job<");
    expect(jobHtml).toContain(">$400<");
    expect(jobHtml).not.toContain('aria-label="Cheer');
  });

  it("closes a job's post with Save alone, on the right, when there is no Cheer", () => {
    const html = feedCard(job, "work");
    const row = html.slice(html.lastIndexOf("</a>"));
    expect(row).toMatch(/<div class="ml-auto[^"]*"><button/);
    expect(row).not.toContain("Cheer");
  });

  it("leads with the paid role under Jobs and gigs and lists the others, without Cheer", () => {
    const html = feedCard({ openRoles: [drummer, stagehand] }, "work");
    expect(html).toContain(">Role on Harbor Mural · Paid<");
    expect(html).toMatch(/<h3[^>]*>Drummer<\/h3>/);
    expect(html).toContain(">$200<");
    expect(html.match(/Drummer/g)).toHaveLength(1);
    expect(html).toContain("Stagehand");
    expect(html).not.toContain('aria-label="Cheer');
    // As a feed post: the maker comes first.
    expect(html.indexOf(">Dana Lee<")).toBeLessThan(html.indexOf("<h3"));
    // Named for the project, not the role it leads with.
    expect(html).toContain('aria-label="Save Harbor Mural"');
  });

  it("drops nothing the card showed: stage, Matches you, the gate, roles, goal, tags, blurb", () => {
    const html = feedCard(
      {
        ...withPicture,
        interests: ["Painting", "Murals", "Public art", "Community"],
        openRoles: [drummer, stagehand],
        viewerGate: { upgradePath: "Join to respond." },
        raiseByDate: Date.now() + 5 * 86400000 - 1000,
        status: "archived",
      },
      "people",
    );
    expect(html).toContain("Planning · 5 days left");
    expect(html).toContain("Archived");
    expect(feedCard(withPicture)).not.toContain("Matches you");
    expect(html).toContain("Members respond. Join to respond.");
    expect(html).toContain("Drummer");
    expect(html).toContain("Stagehand");
    expect(html).toContain("$320");
    expect(html).toContain("of $1,000");
    expect(html).toContain(">Painting<");
    expect(html).toContain(">+1<");
    expect(html).toContain("A wall on the harbor");
    const matched = renderToString(
      <MemoryRouter>
        <ProjectCard project={{ _id: "p1", userId: "u", kind: "passion", status: "active", title: "T", media: [], creator: { _id: "d", name: "D" }, interests: [], openRoles: [] }} lens="projects" onSupport={() => {}} feed matched viewer={member} />
      </MemoryRouter>,
    );
    expect(matched).toContain("Matches you");
  });

  it("draws nothing twice for the two screen sizes", () => {
    const html = feedCard(withPicture);
    expect(html).not.toContain("sm:hidden");
    expect(html).not.toContain("hidden sm:block");
    expect(html.match(/>Harbor Mural</g)).toHaveLength(1);
    expect(html.match(/aria-label="Cheer /g)).toHaveLength(1);
    expect(html.match(/A wall on the harbor/g)).toHaveLength(1);
    expect(html.match(/>Dana Lee</g)).toHaveLength(1);
  });

  it("has no frame on a phone and one from sm up, the maker on top inside it", () => {
    const html = feedCard(withPicture);
    const article = classesOf(html.match(/<article [^>]*>/)![0]);
    expect(article.filter((c) => /^(?:sm:)?(?:bg-|border|rounded)/.test(c)).sort()).toEqual(["sm:bg-[var(--garden-ink-raised)]", "sm:border", "sm:rounded-2xl"].sort());
    // The maker is the first thing in the frame.
    expect(html.indexOf(">Dana Lee<")).toBeLessThan(html.indexOf("<img"));
    expect(html.indexOf("<article")).toBeLessThan(html.indexOf('href="/profile/dana"'));
  });

  it("keeps the actions at the bottom of the card, so a grid row lines up", () => {
    const html = feedCard(withPicture);
    expect(classesOf(html.match(/<article [^>]*>/)![0])).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    // The link takes the card's spare height; the actions follow it.
    expect(classesOf(html.match(/<a [^>]*href="\/projects\/p1"[^>]*>/)![0])).toContain("flex-1");
  });

  it("gives the maker space under it and none of its own above, so the gap between posts is what sets it apart", () => {
    const maker = classesOf(feedCard(withPicture).match(/<div class="[^"]*"><a [^>]*href="\/profile\/dana"/)![0]);
    // 4px under the header (plus the header's own 4px); the space above is the grid's gap.
    expect(maker).toContain("mb-1");
    expect(maker.filter((c) => /^(?:sm:|md:)?mt-/.test(c))).toEqual([]);
  });
});
