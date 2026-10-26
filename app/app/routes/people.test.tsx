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
