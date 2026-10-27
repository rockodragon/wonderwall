import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import AdminDuplicates from "./admin.duplicates";

// /admin/duplicates as the server's findDuplicates answers it: each group's
// copies side by side with what they hold, a "Keep this one" on each and
// "Not duplicates" for the group. Admins only.
let isAdmin: boolean | undefined = true;
let found: unknown;
vi.mock("../lib/useIsAdmin", () => ({ useIsAdmin: () => isAdmin }));
vi.mock("convex/react", () => ({ useQuery: () => found, useMutation: () => vi.fn() }));

const counts = { projects: 0, pieces: 0, eventsHosted: 0, followers: 0, following: 0, organizations: 0, messages: 0, tickets: 0, rsvps: 0, memberships: 0 };
const person = (over: Record<string, unknown>) => ({
  userId: "users:a",
  profileId: "profiles:a",
  name: "Sarah Shreves",
  unfinished: false,
  handle: null,
  imageUrl: null,
  bio: null,
  bioCut: false,
  interests: [],
  location: null,
  createdAt: Date.UTC(2025, 0, 5),
  lastActiveAt: null,
  isAdmin: false,
  isYou: false,
  signIns: [],
  organizations: [],
  hasBilling: false,
  counts,
  ...over,
});

beforeEach(() => {
  isAdmin = true;
  found = {
    checked: { people: 120, organizations: 30 },
    people: [
      {
        key: "users:a+users:b",
        reasons: ["Same name"],
        members: [
          person({
            handle: "sarahpaints",
            bio: "Painter in San Diego.",
            email: "sarah@old.example",
            signIns: ["Google", "Password"],
            organizations: ["The Grove Center for"],
            counts: { ...counts, projects: 3, followers: 12 },
          }),
          person({ userId: "users:b", profileId: "profiles:b", name: "New User", unfinished: true, phone: "+16195550100" }),
        ],
      },
    ],
    organizations: [
      {
        key: "organizations:a+organizations:b",
        reasons: ["One name starts the other"],
        members: [
          { organizationId: "organizations:a", name: "The Grove Center for", slug: "the-grove-center-for", category: null, tagline: null, about: null, location: null, websiteUrl: null, logoUrl: null, createdAt: 1, createdByName: "Sarah Shreves", members: [{ name: "Sarah Shreves", isAdmin: true, current: true, title: null }], counts: { projects: 0, events: 0 } },
          { organizationId: "organizations:b", name: "The Grove Center for the Arts & Media", slug: "the-grove", category: "Nonprofit", tagline: null, about: null, location: "San Diego, CA", websiteUrl: null, logoUrl: null, createdAt: 2, createdByName: "Dee", members: [], counts: { projects: 2, events: 1 } },
        ],
      },
    ],
  };
});

async function page() {
  const handler = createStaticHandler([{ path: "/admin/duplicates", Component: AdminDuplicates }]);
  const context = await handler.query(new Request("http://localhost/admin/duplicates"));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("/admin/duplicates", () => {
  it("shows each group's copies side by side, with what each holds", async () => {
    const raw = await page();
    const html = text(raw);
    expect(html).toContain("Checked 120 people and 30 organizations.");
    expect(html).toContain("Sarah Shreves · 2 copies");
    expect(html).toContain("Same name");
    expect(html).toContain("@sarahpaints");
    expect(html).toContain("Painter in San Diego.");
    expect(html).toContain("sarah@old.example");
    expect(html).toContain("Signs in with Google, Password");
    expect(html).toContain("Part of The Grove Center for");
    expect(html).toContain("Unfinished signup");
    expect(html).toContain("(619) 555-0100");
    expect(html).toContain("No photo");
    expect(html).toMatch(/Projects 3/);
    expect(html).toMatch(/Followers 12/);
    expect(html).toContain("For support: users:b · profiles:b");

    expect(html).toContain("The Grove Center for the Arts & Media · 2 copies");
    expect(raw).toContain('href="/orgs/the-grove-center-for"');
    expect(raw).toContain('href="/profile/profiles:a"');
    expect(html).toContain("Sarah Shreves · admin");
    expect(html).toContain("Added");
    expect(html.match(/Keep this one/g)).toHaveLength(4);
    // Each copy can be left out of a merge; every one starts in it.
    expect(raw.match(/<input type="checkbox" checked=""/g)).toHaveLength(4);
    expect(html.match(/Same one: include in the merge/g)).toHaveLength(4);
    expect(html).toContain("Untick any copy that isn't the same one.");
    expect(html.match(/Not duplicates/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("says so when nothing looks entered twice", async () => {
    found = { checked: { people: 5, organizations: 2 }, people: [], organizations: [] };
    const html = text(await page());
    expect(html).toContain("No people look entered twice.");
    expect(html).toContain("No organizations look entered twice.");
  });

  it("is for admins only", async () => {
    isAdmin = false;
    const html = text(await page());
    expect(html).toContain("Access Denied");
    expect(html).not.toContain("Keep this one");
  });
});
