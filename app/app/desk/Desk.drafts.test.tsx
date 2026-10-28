import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { getFunctionName } from "convex/server";

// The Canvas's Drafts card, under the greeting with the Share a project card.
// convex/react is stubbed: queries answer from `answers` by function name; a
// query with no answer is still loading.
const mock = vi.hoisted(() => ({ answers: {} as Record<string, unknown> }));
vi.mock("convex/react", () => ({
  useQuery: (fn: Parameters<typeof getFunctionName>[0], args?: unknown) =>
    args === "skip" ? undefined : mock.answers[getFunctionName(fn)],
  useMutation: () => async () => ({ ok: true }),
  useAction: () => async () => ({ ok: true }),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));

import { Desk } from "./Desk";

const draft = (i: number, extra: Record<string, unknown> = {}) => ({ _id: `d${i}`, title: `Draft ${i}`, updatedAt: 1_000 - i, photoUrl: null, ...extra });
const MINE = { _id: "p-mine", userId: "u-me", kind: "passion", status: "active", stage: "completed", title: "Hymns", media: [], creator: { name: "Me" }, community: null };

/** The Canvas at `url`; `projects` decides whether the member has one up
 *  (none: the Share a project card), `drafts` what listMyDrafts answers. */
function desk(url: string, { projects = [] as unknown[], drafts }: { projects?: unknown[]; drafts?: unknown[] } = {}) {
  mock.answers = {
    "updates:listMine": [],
    "events:list": [],
    "garden/projects:listProjects": projects,
    "garden/allocations:getFundPage": null,
    "favorites:getMyFavorites": { events: [], profiles: [] },
    "garden/giving:getMyGiving": { open: [] },
    "profiles:getMyProfile": { _id: "me", userId: "u-me", name: "Rick Moy", isAdmin: false },
    "organizations:list": [],
    ...(drafts ? { "garden/projects:listMyDrafts": drafts } : {}),
  };
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <Desk />
    </MemoryRouter>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The Drafts card as markup, or "" when it isn't drawn. */
const drafts = (html: string) => {
  const at = html.indexOf('aria-label="Drafts"');
  return at < 0 ? "" : html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at));
};

describe("the Canvas's Drafts card", () => {
  it.each(["/today", "/today?view=all"])("is under the greeting on %s, beside Share a project, with the Canvas's tokens", (url) => {
    const html = desk(url, { drafts: [draft(1, { photoUrl: "/campaign/band.jpg" }), draft(2)] });
    const card = drafts(html);
    expect(card).not.toBe("");
    expect(text(card)).toContain("Drafts Draft 1 Draft Draft 2 Draft");
    expect(card).toContain('href="/projects/d1"');
    expect(card).toContain('src="/campaign/band.jpg"');
    expect(card).not.toContain("var(--app-");
    // Share a project is still there, and the two sit together under the greeting.
    expect(html).toContain('aria-label="Share a project"');
    expect(html.indexOf('aria-label="Share a project"')).toBeLessThan(html.indexOf('aria-label="Drafts"'));
  });

  it("stays when a project of theirs is up and Share a project has gone", () => {
    const html = desk("/today", { projects: [MINE], drafts: [draft(1)] });
    expect(html).not.toContain('aria-label="Share a project"');
    expect(drafts(html)).not.toBe("");
  });

  it("caps at three and says how many more", () => {
    const card = drafts(desk("/today", { drafts: [1, 2, 3, 4, 5].map((i) => draft(i)) }));
    expect(card.match(/<a /g)).toHaveLength(3);
    expect(text(card)).toContain("+2 more");
  });

  it("is not drawn with no drafts or while they load", () => {
    expect(desk("/today", { drafts: [] })).not.toContain('aria-label="Drafts"');
    expect(desk("/today")).not.toContain('aria-label="Drafts"');
  });

  it("is not on the other views, which have no greeting", () => {
    expect(desk("/today?view=projects", { drafts: [draft(1)] })).not.toContain('aria-label="Drafts"');
  });
});
