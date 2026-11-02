import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ProjectCard } from "./projects";
import { coverOf, type PostViewer } from "../lib/projectPick";
import type { ProjectsLens } from "../lib/browse/projectsFilter";

// A project on the Projects tab is a feed post (Rick, 2026-11-02: make it match
// Today's Open projects): the maker, the picture, the words, then the actions
// as the post's last row. The pieces are Today's own (components/
// ProjectPost.tsx). Save is a Convex-backed button, so the hooks are stood in
// for, and what it asked about is kept in `asked`.
const flags = vi.hoisted(() => ({ backing: true }));
const asked = vi.hoisted(() => ({ saves: [] as { targetType: string; targetId: string }[] }));
vi.mock("../lib/featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/featureFlags")>()),
  get FF_BACKING() {
    return flags.backing;
  },
}));
vi.mock("convex/react", async (importOriginal) => {
  const { getFunctionName } = await import("convex/server");
  return {
    ...(await importOriginal<typeof import("convex/react")>()),
    useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: { targetType: string; targetId: string }) => {
      if (getFunctionName(fn) === "favorites:isFavorited" && args) asked.saves.push(args);
      return undefined;
    },
    useMutation: () => async () => {},
    useAction: () => async () => {},
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  };
});
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
beforeEach(() => {
  asked.saves = [];
});
afterEach(() => {
  flags.backing = true;
});

const member: PostViewer = { signedIn: true, profile: { userId: "u-me" } };

function card(project: Record<string, unknown>, lens: ProjectsLens = "projects", viewer: PostViewer = member) {
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
      <ProjectCard project={full} lens={lens} onSupport={() => {}} viewer={viewer} />
    </MemoryRouter>,
  ).replace(/<!-- -->/g, "");
}

const at = (html: string, needle: string | RegExp) => {
  const found = typeof needle === "string" ? html.indexOf(needle) : html.search(needle);
  expect(found, `${needle} is in the post`).toBeGreaterThan(-1);
  return found;
};
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
/** The <div> that opens at `start`, through its matching close. */
function divAt(html: string, start: number) {
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<(\/?)div\b[^>]*>/g)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, start + m.index! + m[0].length);
  }
  throw new Error("an unclosed <div>");
}
/** The cover's own cell: the square picture, and the kind and money over it. */
const coverCell = (html: string) => divAt(html, at(html, '<div class="relative col-start-1 row-start-1'));
const imgSrcs = (html: string) => [...html.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1]);

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

describe("a project card's first line", () => {
  it("says Job for one-off paid work, with its pay beside it", () => {
    const html = card(job, "work");
    expect(html).toContain(">Job<");
    expect(html).toContain(">$400<");
    expect(html).not.toContain(">Paid<");
  });
  it("says Recurring gig with the schedule, and the pay per date", () => {
    const html = card(gig, "work");
    expect(html).toContain(">Recurring gig · Fridays 8–10pm<");
    expect(html).toContain(">$300/date<");
    // The schedule line in the body is still there.
    expect(html).toContain("The Grove");
    expect(html).toContain("3");
  });
  it("says Volunteer for an unpaid posting, with no money pill", () => {
    const html = card({ ...job, budgetType: "volunteer", budget: undefined }, "people");
    expect(html).toContain(">Volunteer<");
    expect(html).not.toContain("$");
    expect(html).not.toContain(">Job<");
  });
  it("says nothing for a plain project, and Seeking funding for one asking for backers", () => {
    const plain = card({}, "projects");
    expect(plain).not.toContain(">Project<");
    expect(plain).not.toMatch(/uppercase[^"]*line-clamp-2/);
    expect(card({ goal: 500, raisedCents: 0 }, "funding")).toContain(">Seeking funding<");
  });
});

describe("a project card under Jobs and gigs", () => {
  const withRole = { openRoles: [drummer, stagehand] };

  it("leads with the paid role and its pay: Role on {project} · Paid", () => {
    const html = card(withRole, "work");
    expect(html).toContain(">Role on Harbor Mural · Paid<");
    expect(html).toMatch(/<h3[^>]*>Drummer<\/h3>/);
    expect(html).toContain(">$200<");
    // As a feed post: the maker comes first.
    expect(html.indexOf(">Dana Lee<")).toBeLessThan(html.indexOf("<h3"));
  });
  it("lists the other open roles, not the one it leads with twice", () => {
    const html = card(withRole, "work");
    // Once in the words (its name is also on its Save button).
    expect(html.match(/>Drummer</g)?.length).toBe(1);
    expect(html).toContain("Stagehand");
    expect(html).toContain(">Volunteer<");
  });
  it("offers no support buttons: this is work, not a project to back", () => {
    const html = card(withRole, "work");
    expect(html).not.toContain('aria-label="Cheer');
    expect(html).not.toContain('aria-label="Back ');
  });
  it("is the project, with a count of people, anywhere else", () => {
    const html = card(withRole, "projects");
    expect(html).not.toContain(">Project<");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).toContain("Looking for 2 people");
    expect(html).toContain('aria-label="Cheer Harbor Mural"');
  });
  it("spells the roles out under Seeking people, with their pay", () => {
    const html = card(withRole, "people");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).toContain("Drummer");
    expect(html).toContain("$200");
    expect(html).toContain("Stagehand");
    expect(html).not.toContain("Looking for 2 people");
  });
  it("does not lead with a role that never said what it pays", () => {
    const html = card({ openRoles: [{ roleId: "r3", title: "Writer", budgetType: null, budget: null, budgetMax: null }] }, "work");
    expect(html).toMatch(/<h3[^>]*>Harbor Mural<\/h3>/);
    expect(html).not.toContain("Role on");
  });
});

describe("a project card's Save", () => {
  it("saves the role when the card leads with one, named for it, and not the project", () => {
    const html = card({ openRoles: [drummer, stagehand] }, "work");
    expect(html).toContain('aria-label="Save Drummer"');
    expect(html).not.toContain("Save Harbor Mural");
    expect(asked.saves).toEqual([{ targetType: "role", targetId: "r1" }]);
  });
  it("saves the project when the card is the project: on Projects, and under Jobs and gigs for a job", () => {
    expect(card({ openRoles: [drummer] }, "projects")).toContain('aria-label="Save Harbor Mural"');
    expect(asked.saves).toEqual([{ targetType: "project", targetId: "p1" }]);
    asked.saves = [];
    expect(card(job, "work")).toContain('aria-label="Save Logo for a bakery"');
    expect(asked.saves).toEqual([{ targetType: "project", targetId: "p1" }]);
  });
  it("is held to the same rule as a project's: not your own, not signed out, not before the profile loads", () => {
    expect(card({ openRoles: [drummer] }, "work")).toContain('aria-label="Save Drummer"');
    asked.saves = [];
    const own = { openRoles: [drummer], userId: "u-me" };
    expect(card(own, "work")).not.toContain("Save");
    expect(card({ openRoles: [drummer] }, "work", { signedIn: false, profile: null })).not.toContain("Save");
    expect(card({ openRoles: [drummer] }, "work", { signedIn: true, profile: undefined })).not.toContain("Save");
    expect(card({ openRoles: [drummer], status: "pending" }, "work")).not.toContain("Save");
    expect(asked.saves).toEqual([]);
  });
});

describe("a project card's support", () => {
  it("is two icons on a funding card: Cheer, then Back this", () => {
    const html = card({ goal: 500, raisedCents: 12_000 }, "funding");
    const cheer = html.indexOf('aria-label="Cheer Harbor Mural"');
    const back = html.indexOf('aria-label="Back Harbor Mural"');
    expect(cheer).toBeGreaterThan(-1);
    expect(back).toBeGreaterThan(cheer);
    expect(html).not.toContain("Cheer them on");
    // The icons are drawings, not words.
    expect(html).toMatch(/aria-label="Cheer Harbor Mural"[^>]*>\s*<svg/);
    expect(html).toMatch(/aria-label="Back Harbor Mural"[^>]*>\s*<svg/);
  });
  it("has Cheer but no Back this on a funding card while backing is closed (FF_BACKING)", () => {
    flags.backing = false;
    const html = card({ goal: 500, raisedCents: 12_000 }, "funding");
    expect(html).toContain('aria-label="Cheer Harbor Mural"');
    expect(html).not.toContain('aria-label="Back ');
    expect(html).not.toContain("Back this");
    // How far it got is information, not a way to pay: it stays.
    expect(html).toContain("$120");
  });
  it("has no Back this on a project that isn't raising", () => {
    const html = card({}, "projects");
    expect(html).toContain('aria-label="Cheer Harbor Mural"');
    expect(html).not.toContain('aria-label="Back ');
  });
  it("says nothing about supporters until there is one", () => {
    const html = card({ supportCount: 0 });
    expect(html).not.toContain("No supporters yet");
    expect(html).not.toContain("supporter");
  });
  it("puts the count beside Cheer once there are supporters", () => {
    const html = card({ supportCount: 3 });
    expect(html).toMatch(/aria-label="Cheer Harbor Mural".*?<\/button><span[^>]*>3<span class="sr-only"> supporters<\/span><\/span>/);
    expect(card({ supportCount: 1 })).toContain('<span class="sr-only"> supporter</span>');
  });
});

// Which picture a post shows is Today's choice too (lib/projectPick.ts
// coverOf): the photo, then a pasted link's still, then the first attached
// picture. An audio or link artifact has no picture to show, so a project
// that has only those is the abstract cover with its title on it.
describe("a project card's picture", () => {
  const still = "https://files.example/still.jpg";
  const photo = "https://files.example/mural.jpg";
  const png = "https://files.example/attached.png";
  const mp3 = "https://files.example/song.mp3";
  const page = "https://files.example/some-page";

  const isAbstract = (html: string) => {
    expect(html).not.toContain("<img");
    expect(html).toContain('<svg viewBox="0 0 160 100"');
    // The title is set on the cover, and not said again under it.
    expect(html.match(/>Harbor Mural</g)).toHaveLength(1);
    expect(classesOf(html.match(/<h3 [^>]*>/)![0])).toContain("text-[34px]");
  };

  it("is the project's photo", () => {
    const html = card({ resolvedPhotoUrl: photo, media: [{ type: "image", resolvedMediaUrl: png }] });
    expect(imgSrcs(html)).toEqual([photo]);
    expect(html).not.toContain("<svg viewBox=\"0 0 160 100\"");
    expect(classesOf(html.match(/<h3 [^>]*>/)![0])).toContain("text-[17px]");
  });
  it("is the pasted link's still, with its play badge, ahead of any attached picture", () => {
    const html = card({
      mediaUrl: "https://www.youtube.com/watch?v=abcdefghijk",
      mediaPreviewUrl: still,
      media: [{ type: "image", resolvedMediaUrl: png }],
    });
    expect(imgSrcs(html)).toEqual([still]);
    expect(html).toContain("bg-red-600");
    expect(coverCell(html)).toContain("aspect-square");
  });
  it("is a link's preview picture when the link isn't a video", () => {
    const html = card({ mediaUrl: "https://example.com/post", mediaPreviewUrl: still });
    expect(imgSrcs(html)).toEqual([still]);
    expect(html).not.toContain("bg-red-600");
  });
  it("is an attached picture", () => {
    expect(imgSrcs(card({ media: [{ type: "image", resolvedMediaUrl: png }] }))).toEqual([png]);
  });
  it("skips an audio artifact for the first attached picture after it", () => {
    expect(imgSrcs(card({ media: [{ type: "audio", resolvedMediaUrl: mp3 }, { type: "image", resolvedMediaUrl: png }] }))).toEqual([png]);
  });
  it("is the abstract cover with the title on it when the only artifact is audio", () => {
    isAbstract(card({ media: [{ type: "audio", resolvedMediaUrl: mp3 }] }));
  });
  it("is the abstract cover with the title on it when the only artifact is a link", () => {
    isAbstract(card({ media: [{ type: "link", resolvedMediaUrl: page }] }));
  });
  it("is the abstract cover with the title on it when there is nothing", () => {
    isAbstract(card({}));
    isAbstract(card({ media: [{ type: "audio" }] }));
  });
  it("is the one Today picks for the same project", () => {
    const projects = [
      { resolvedPhotoUrl: photo, media: [] },
      { media: [{ type: "audio", resolvedMediaUrl: mp3 }, { type: "image", resolvedMediaUrl: png }] },
      { media: [{ type: "link", resolvedMediaUrl: page }] },
      { mediaUrl: "https://example.com/post", mediaPreviewUrl: still, media: [{ type: "audio", resolvedMediaUrl: mp3 }] },
      { media: [] },
    ];
    for (const p of projects) {
      const picked = coverOf(p);
      expect(imgSrcs(card(p)), JSON.stringify(p)).toEqual(picked ? [picked] : []);
    }
  });
  it("loads as it nears the screen, since the list is unbounded", () => {
    expect(card(withPicture)).toMatch(/<img [^>]*loading="lazy"/);
  });
});

describe("a project card as a feed post", () => {
  it("reads top to bottom: the maker, the picture, the title, the words, the actions", () => {
    const html = card(withPicture);
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
    const header = card(withPicture).match(/<a [^>]*href="\/profile\/dana"[^>]*>.*?<\/a>/)?.[0] ?? "";
    expect(header).toContain("h-9 w-9");
    expect(header).toMatch(/<span class="block text-\[15px\] font-semibold[^"]*"[^>]*>Dana Lee<\/span>/);
    expect(header).toMatch(/<span class="block text-\[13px\][^"]*"[^>]*>in The Garden<\/span>/);
  });

  it("is an organization's logo and page when it was posted as one", () => {
    const html = card({ ...withPicture, creator: undefined, organization: { name: "Harbor Light", slug: "harbor-light", logoUrl: null } });
    expect(html).toContain('href="/orgs/harbor-light"');
    expect(html).toContain(">Harbor Light<");
  });

  it("puts a square picture, cropped to fill, flush to the card's edges on a phone", () => {
    const html = card(withPicture);
    expect(html).toContain("aspect-square");
    expect(html).toContain("object-cover");
    expect(html).not.toContain("aspect-[4/5]");
    expect(html).not.toContain("object-contain");
    expect(html.match(/<div class="[^"]*-mx-4[^"]*sm:mx-0[^"]*"/)).not.toBeNull();
  });

  it("is the abstract cover with the title set large on it when there is no picture, and the title is not said again", () => {
    const html = card({ blurb: "Painted by forty neighbors." });
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
    // No collapsed strip.
    expect(html).not.toContain("h-16");
    expect(html).not.toContain("hidden sm:block");
  });

  it("keeps the picture's title under it, at 17px, when there is a picture", () => {
    const title = classesOf(card(withPicture).match(/<h3 [^>]*>/)![0]);
    expect(title).toEqual(expect.arrayContaining(["text-[17px]", "font-semibold"]));
  });

  it("keeps the kind and the money inside the square picture's own box, with a picture or without", () => {
    for (const html of [card({ ...job, resolvedPhotoUrl: "https://files.example/j.jpg" }, "work"), card(job, "work")]) {
      const cell = coverCell(html);
      expect(cell).toContain("aspect-square");
      const badges = divAt(cell, at(cell, '<div class="absolute inset-x-2 top-2'));
      expect(badges).toContain(">Job<");
      expect(badges).toContain(">$400<");
      // The title is not in it: that lies over the bottom, in its own block.
      expect(cell).not.toContain("<h3");
      expect(html.match(/>Job</g)).toHaveLength(1);
    }
  });

  it("has a link to the maker and a link to the project, and no link or button inside another", () => {
    const html = card(withPicture);
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
    const html = card(withPicture);
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
    const html = card(withPicture);
    const maker = classesOf(html.match(/<div class="[^"]*"><a [^>]*href="\/profile\/dana"/)![0]);
    expect(maker).toEqual(expect.arrayContaining(["relative", "z-10"]));
    const row = html.slice(html.lastIndexOf("</a>"));
    for (const group of [row.match(/<div class="([^"]*-ml-\[9px\][^"]*)">/), row.match(/<div class="(ml-auto[^"]*)">/)]) {
      expect(group, "a group in the actions row").not.toBeNull();
      expect(group![1].split(" ")).toEqual(expect.arrayContaining(["relative", "z-10"]));
    }
  });

  it("closes the post with the actions: the heart and its count, Back this, Save at the far right, each a 44px target", () => {
    const html = card(withPicture);
    const row = html.slice(html.lastIndexOf("</a>"));
    expect(row.indexOf("Cheer Harbor Mural")).toBeLessThan(row.indexOf("Back Harbor Mural"));
    expect(row.indexOf("Back Harbor Mural")).toBeLessThan(row.indexOf("Save Harbor Mural"));
    expect(row).toContain(">3<");
    expect(row).toMatch(/<div class="ml-auto[^"]*"><button/);
    expect(row.match(/<button[^>]*class="[^"]*\bw-11 h-11\b/g)).toHaveLength(2);
    expect(row.match(/<button[^>]*class="[^"]*\bh-11 w-11\b/g)).toHaveLength(1);
  });

  it("names each button for its project, so a page of posts isn't a row of identical Cheers", () => {
    const html = card(withPicture);
    expect(html).toContain('aria-label="Cheer Harbor Mural" title="Cheer Harbor Mural"');
    expect(html).toContain('aria-label="Back Harbor Mural" title="Back Harbor Mural"');
    expect(html).toContain('aria-label="Save Harbor Mural"');
    expect(html).not.toContain('aria-label="Cheer"');
    expect(html).not.toContain('aria-label="Back this"');
    expect(html).not.toMatch(/aria-label="Save"/);
  });

  it("offers no Save on your own project", () => {
    const html = card({ ...withPicture, userId: "u-me" });
    expect(html).toContain('aria-label="Cheer Harbor Mural"');
    expect(html).not.toContain("Save");
  });

  it("offers Save to a member, and none to a signed-out visitor, nor before the profile has loaded, nor on a hidden project", () => {
    expect(card(withPicture)).toContain('aria-label="Save Harbor Mural"');
    expect(card(withPicture, "projects", { signedIn: false, profile: null })).not.toContain("Save");
    expect(card(withPicture, "projects", { signedIn: true, profile: undefined })).not.toContain("Save");
    expect(card({ ...withPicture, status: "pending" })).not.toContain("Save");
  });

  it("offers no Cheer or Back on a job or a gig, which is paid, not backed, but keeps Save and every detail", () => {
    const html = card(gig, "work");
    expect(html).not.toContain('aria-label="Cheer');
    expect(html).not.toMatch(/aria-label="Back /);
    expect(html).toContain('aria-label="Save Friday jazz"');
    expect(html).toContain(">Recurring gig · Fridays 8–10pm<");
    expect(html).toContain(">$300/date<");
    expect(html).toContain("The Grove");
    expect(html).toContain("3 dates open");
    expect(html).toContain("next Fri, Oct 9");
    expect(html).toContain(">Dana Lee<");
    const jobHtml = card(job, "work");
    expect(jobHtml).toContain(">Job<");
    expect(jobHtml).toContain(">$400<");
    expect(jobHtml).not.toContain('aria-label="Cheer');
  });

  it("closes a job's post with Save alone, on the right, when there is no Cheer", () => {
    const html = card(job, "work");
    const row = html.slice(html.lastIndexOf("</a>"));
    expect(row).toMatch(/<div class="ml-auto[^"]*"><button/);
    expect(row).not.toContain("Cheer");
  });

  it("drops nothing the card showed: stage, Matches you, the gate, roles, goal, tags, blurb", () => {
    const html = card(
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
    expect(card(withPicture)).not.toContain("Matches you");
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
        <ProjectCard
          project={{ _id: "p1", userId: "u", kind: "passion", status: "active", title: "T", media: [], creator: { _id: "d", name: "D" }, interests: [], openRoles: [] }}
          lens="projects"
          onSupport={() => {}}
          matched
          viewer={member}
        />
      </MemoryRouter>,
    );
    expect(matched).toContain("Matches you");
  });

  it("draws nothing twice for the two screen sizes", () => {
    const html = card(withPicture);
    expect(html).not.toContain("sm:hidden");
    expect(html).not.toContain("hidden sm:block");
    expect(html.match(/>Harbor Mural</g)).toHaveLength(1);
    expect(html.match(/aria-label="Cheer /g)).toHaveLength(1);
    expect(html.match(/A wall on the harbor/g)).toHaveLength(1);
    expect(html.match(/>Dana Lee</g)).toHaveLength(1);
  });

  it("has no frame on a phone and one from sm up, the maker on top inside it", () => {
    const html = card(withPicture);
    const article = classesOf(html.match(/<article [^>]*>/)![0]);
    expect(article.filter((c) => /^(?:sm:)?(?:bg-|border|rounded)/.test(c)).sort()).toEqual(["sm:bg-[var(--garden-ink-raised)]", "sm:border", "sm:rounded-2xl"].sort());
    // The maker is the first thing in the frame.
    expect(html.indexOf(">Dana Lee<")).toBeLessThan(html.indexOf("<img"));
    expect(html.indexOf("<article")).toBeLessThan(html.indexOf('href="/profile/dana"'));
  });

  it("rounds the picture's top corners from sm up when there is no maker above it, and not when there is", () => {
    const noMaker = coverCell(card({ ...withPicture, creator: undefined }));
    const cell = classesOf(noMaker.match(/<div [^>]*>/)![0]);
    expect(cell).toEqual(expect.arrayContaining(["sm:rounded-t-2xl", "sm:overflow-hidden"]));
    // Only from sm up: a phone's picture is edge to edge and square-cornered.
    expect(cell.filter((c) => /^(?:rounded|overflow-hidden)/.test(c))).toEqual([]);
    expect(classesOf(coverCell(card(withPicture)).match(/<div [^>]*>/)![0]).filter((c) => /rounded|overflow/.test(c))).toEqual([]);
  });

  it("keeps the actions at the bottom of the card, so a grid row lines up", () => {
    const html = card(withPicture);
    expect(classesOf(html.match(/<article [^>]*>/)![0])).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    // The link takes the card's spare height; the actions follow it.
    expect(classesOf(html.match(/<a [^>]*href="\/projects\/p1"[^>]*>/)![0])).toContain("flex-1");
  });

  it("gives the maker space under it and none of its own above, so the gap between posts is what sets it apart", () => {
    const maker = classesOf(card(withPicture).match(/<div class="[^"]*"><a [^>]*href="\/profile\/dana"/)![0]);
    // 4px under the header (plus the header's own 4px); the space above is the grid's gap.
    expect(maker).toContain("mb-1");
    expect(maker.filter((c) => /^(?:sm:|md:)?mt-/.test(c))).toEqual([]);
  });
});
