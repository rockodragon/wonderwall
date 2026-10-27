import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { getFunctionName } from "convex/server";

// /people (routes/search.tsx), with convex/react stubbed: each query answers
// from `answers` by name, and `asked` keeps what it was last asked. The
// directory's paging rules are the server's (convex/directory.test.ts); this
// is what the page asks for and how it ends the list.
const mock = vi.hoisted(() => ({
  answers: {} as Record<string, unknown>,
  asked: {} as Record<string, unknown>,
  signedIn: true,
}));
vi.mock("convex/react", () => ({
  useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) => {
    if (args === "skip") return undefined;
    mock.asked[getFunctionName(fn)] = args;
    return mock.answers[getFunctionName(fn)];
  },
  useMutation: () => async () => ({ ok: true }),
  useAction: () => async () => ({ ok: true }),
  useConvexAuth: () => ({ isAuthenticated: mock.signedIn, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

import Search from "./search";

async function people(url: string) {
  const handler = createStaticHandler([{ path: "/people", Component: Search }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirected to ${context.headers.get("Location")}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ _id: `p${i}`, name: `Person ${i}`, imageUrl: null, interests: ["Music"] }));

beforeEach(() => {
  mock.answers = {};
  mock.asked = {};
  mock.signedIn = true;
});

describe("/people, a page at a time", () => {
  it("asks the server for one page, with the Discipline filter in the query (not cut from the page after)", async () => {
    await people("/people?interests=Film");
    expect(mock.asked["profiles:directory"]).toEqual({ interests: ["Film"], limit: 24 });
  });

  it("shows the page as it came, ending in Load more while a member has more to see", async () => {
    mock.answers["profiles:directory"] = { people: rows(24), total: 40, visitor: false };
    const html = await people("/people");
    expect(text(html)).toContain("Person 0");
    expect(text(html)).toContain("Person 23");
    expect(html).toMatch(/<button[^>]*>Load more<\/button>/);
    expect(text(html)).not.toContain("Join free");
  });

  it("ends a visitor's page with how many more there are and the way to join, coming back here", async () => {
    mock.signedIn = false;
    mock.answers["profiles:directory"] = { people: rows(24), total: 40, visitor: true };
    const html = await people("/people?interests=Film");
    expect(text(html)).toContain("16 more creatives here. Join free to see everyone.");
    expect(html).toContain(`href="/signup?redirect=${encodeURIComponent("/people?interests=Film")}"`);
    expect(html).not.toContain(">Load more<");
  });

  it("ends with nothing once everyone who matches is on show", async () => {
    mock.answers["profiles:directory"] = { people: rows(3), total: 3, visitor: true };
    const html = await people("/people");
    expect(html).not.toContain(">Load more<");
    expect(text(html)).not.toContain("more creatives here");
  });

  it("shows how far away each person is when the server measured it", async () => {
    mock.answers["profiles:directory"] = { people: [{ ...rows(1)[0], _distance: 4.2 }], total: 1, visitor: false };
    expect(text(await people("/people"))).toContain("4 mi");
  });

  it("the Organizations tab doesn't ask for people", async () => {
    await people("/people?tab=orgs");
    expect(mock.asked["profiles:directory"]).toBeUndefined();
  });
});

/** The card that links to `href`, as drawn. */
const card = (html: string, href: string) => html.match(new RegExp(`<a [^>]*href="${href}"[^>]*>.*?</a>`))![0];
/** The classes of the first `tag` in `markup` whose class list holds `having`. */
const classOf = (markup: string, tag: string, having = "") =>
  markup
    .replace(/&amp;/g, "&")
    .match(new RegExp(`<${tag} [^>]*class="([^"]*${having.replace(/[[\]]/g, "\\$&")}[^"]*)"`))![1]
    .split(" ");

// A row of cards on a computer is only even if every card is the same height:
// each line stays one line, however long what it says.
describe("a person card", () => {
  const person = {
    _id: "p1",
    name: "Ezekiel Pugal / ezthetics and friends",
    imageUrl: null,
    orgName: "Abiding Practice Collective of San Diego",
    interests: ["Illustration", "Art", "Music"],
  };

  it("is one fixed height, its photo running to the card's left edge, top to bottom", async () => {
    mock.answers["profiles:directory"] = { people: [person], total: 1, visitor: true };
    const markup = card(await people("/people"), "/profile/p1");
    const link = classOf(markup, "a");
    expect(link).toEqual(expect.arrayContaining(["min-h-[5.625rem]", "items-stretch", "overflow-hidden", "rounded-xl"]));
    // No padding on the card itself: only the words are inset.
    expect(link.some((c) => /^p-|^px-|^py-/.test(c))).toBe(false);
    expect(classOf(markup, "div", "w-[5.625rem]")).toContain("shrink-0");
  });

  it("fills that strip with the photo, the card's corners rounding it", async () => {
    mock.answers["profiles:directory"] = { people: [person], total: 1, visitor: true };
    const face = classOf(card(await people("/people"), "/profile/p1"), "span", "shrink-0");
    expect(face).toEqual(expect.arrayContaining(["h-full", "w-full"]));
    expect(face.some((c) => c.startsWith("rounded"))).toBe(false);
  });

  it("keeps the name, the organization and the disciplines to a line each, the full name in the tooltip", async () => {
    mock.answers["profiles:directory"] = { people: [person], total: 1, visitor: true };
    const markup = card(await people("/people"), "/profile/p1");
    expect(classOf(markup, "h3")).toContain("truncate");
    expect(markup).toContain(`title="${person.name}"`);
    const lines = [...markup.matchAll(/<p [^>]*class="([^"]*)"/g)].map((m) => m[1].split(" "));
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toContain("truncate");
    expect(text(markup)).toContain("Illustration · Art");
    expect(text(markup)).not.toContain("Music");
  });
});

describe("an organization card", () => {
  const org = (slug: string, names: string[]) => ({
    _id: `organizations:${slug}`,
    name: "BetLynArt and DunhamMusicGroup Jazmae Music Publishing SESAC",
    slug,
    category: "Nonprofit",
    tagline: null,
    location: "Fallbrook",
    logoUrl: null,
    peopleCount: names.length,
    faces: names.map((name) => ({ name, imageUrl: null })),
  });

  it("puts the logo beside the name, and keeps the name to two lines", async () => {
    mock.signedIn = false;
    mock.answers["organizations:list"] = [org("betlynart", ["Betty Lynn Bass"])];
    const markup = card(await people("/people?tab=orgs"), "/orgs/betlynart");
    const link = classOf(markup, "a");
    expect(link).toEqual(expect.arrayContaining(["min-h-[5.625rem]", "items-stretch", "overflow-hidden"]));
    expect(classOf(markup, "h3")).toContain("line-clamp-2");
    expect(markup).toContain('title="BetLynArt and DunhamMusicGroup Jazmae Music Publishing SESAC"');
    expect(classOf(markup, "p")).toContain("truncate");
  });

  // The logo is as big as a person's photo; one quiet line under the name
  // says how many people, and how many of them you follow, with no faces.
  it("shows the logo the way a person card shows a photo, and one line of who's there", async () => {
    mock.signedIn = false;
    mock.answers["organizations:list"] = [{ ...org("uncommon", ["A", "B", "C", "D"]), followingCount: 2 }];
    const markup = card(await people("/people?tab=orgs"), "/orgs/uncommon");
    // The logo runs to the card's left edge, top to bottom, like a person's photo.
    expect(classOf(markup, "div", "w-[5.625rem]")).toContain("shrink-0");
    const logo = classOf(markup, "div", "overflow-hidden flex");
    expect(logo).toEqual(expect.arrayContaining(["w-full", "h-full"]));
    expect(logo.some((c) => c.startsWith("rounded") || c === "border")).toBe(false);
    expect(text(markup)).toContain("2 you follow · 4 people");
    expect(markup).not.toContain("<ul");
  });

  it("says only how many when you follow none of them", async () => {
    mock.signedIn = false;
    mock.answers["organizations:list"] = [{ ...org("solo", ["Betty Lynn Bass"]), followingCount: 0 }];
    expect(text(card(await people("/people?tab=orgs"), "/orgs/solo"))).toContain("1 person");
    expect(text(card(await people("/people?tab=orgs"), "/orgs/solo"))).not.toContain("you follow");
  });
});
