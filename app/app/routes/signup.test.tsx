import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import Signup from "./signup";

// An invite link, as the person it was sent to sees it: who invited them, to
// what (in the community's own words), that it's free, and the form, with
// Sign in as a line under it. No one else who joined with the link is named.
let answers: Record<string, unknown> = {};
const site = vi.hoisted(() => ({ brand: "garden" as "garden" | "exchange" }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) =>
    args === "skip" ? undefined : answers[getFunctionName(ref)],
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => null }));
vi.mock("../brand/brands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../brand/brands")>()),
  useBrand: () => site.brand,
}));

const name = (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref);

const SOL = {
  name: "Sol Reyes",
  imageUrl: null,
  interests: ["Photography", "other:zines", "Film", "Music", "Writing"],
  usageCount: 3,
};
const GARDEN = {
  name: "The Garden",
  slug: "the-garden",
  tagline: "To love our neighbor through our craft",
  description: "A community of creatives growing our crafts.\n\nWe support work that builds bridges.",
};

async function page(url: string) {
  const handler = createStaticHandler([
    { path: "/signup", Component: Signup },
    { path: "/signup/:inviteSlug", Component: Signup },
  ]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirected to ${context.headers.get("Location")}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  // React marks where joined text meets with <!-- -->; the words read without them.
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />).replace(/<!-- -->/g, "");
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  site.brand = "garden";
  answers = {
    [name(api.invites.getInviterInfo)]: SOL,
    [name(api.garden.defaultCommunity.getSignupCommunity)]: { id: "c1", name: "The Garden", inviteOnly: false, agreements: [] },
    [name(api.garden.communityDomains.getCommunityLanding)]: GARDEN,
  };
});

describe("an invite link on The Garden", () => {
  it("says who invited them, to what in The Garden's own words, and that it's free", async () => {
    const html = await page("/signup/sol");
    expect(html).toMatch(/<h1[^>]*>Sol Reyes invited you to The Garden<\/h1>/);
    // A few interests, not their whole list; "other:" tags aren't shown.
    expect(text(html)).toContain("Photography · Film · Music");
    expect(text(html)).not.toContain("Writing");
    expect(text(html)).toContain("To love our neighbor through our craft");
    // The description's first paragraph only.
    expect(text(html)).toContain("A community of creatives growing our crafts.");
    expect(text(html)).not.toContain("builds bridges");
    expect(text(html)).toContain("Joining is free.");
    // The form's own heading steps down.
    expect(html).toMatch(/<h2[^>]*>Create your account<\/h2>/);
  });

  it("asks for their name up front, and puts Sign in under the form instead of a tab", async () => {
    const html = await page("/signup/sol");
    expect(html).toContain('id="name"');
    expect(html).toContain('id="phone"');
    expect(html).not.toContain('role="tablist"');
    expect(text(html)).toContain("Already a member? Sign in . Your TheCreative.exchange account works here too.");
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in<\/a>/);
    expect(text(html)).not.toContain("same account as");
  });

  it("names no one else who joined with the link", async () => {
    expect(text(await page("/signup/sol"))).not.toMatch(/Also connected here|Be one of the first/);
  });
});

describe("the sign-up page without an invite", () => {
  it("keeps the Sign in / Sign up toggle, has no invite at the top, and still names The Garden", async () => {
    answers[name(api.invites.getInviterInfo)] = undefined;
    const html = await page("/signup");
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/<h1[^>]*>Create your account<\/h1>/);
    expect(text(html)).not.toContain("invited you");
    expect(text(html)).toContain("The Garden · same account as TheCreative.exchange");
  });

  it("falls back to the plain page when the invite link doesn't work", async () => {
    answers[name(api.invites.getInviterInfo)] = null;
    const html = await page("/signup/nobody");
    expect(text(html)).toContain("That invite link didn't work. You can still sign up.");
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/<h1[^>]*>Create your account<\/h1>/);
  });

  it("keeps the plain page for a ticket's link, with no invite lookup", async () => {
    answers[name(api.invites.getInviterInfo)] = SOL; // never asked for
    answers[name(api.garden.eventRsvps.ticketSessionOpensSignup)] = true;
    const html = await page("/signup/cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6");
    expect(text(html)).toContain("Your ticket is saved.");
    expect(html).toContain('role="tablist"');
    expect(text(html)).not.toContain("invited you");
  });
});

describe("an invite link while its lookup loads", () => {
  it("is already laid out as an invite: no Sign in tab, the form's heading an h2, the invite's room held", async () => {
    answers[name(api.invites.getInviterInfo)] = undefined;
    const html = await page("/signup/sol");
    expect(html).not.toContain('role="tablist"');
    expect(html).toMatch(/<h2[^>]*>Create your account<\/h2>/);
    expect(html).toMatch(/<div aria-hidden="true" class="h-72 /);
  });
});

describe("an invite link on TheCreative.exchange", () => {
  it("names TheCreative.exchange, without The Garden's words", async () => {
    site.brand = "exchange";
    const html = await page("/signup/sol");
    expect(html).toMatch(/<h1[^>]*>Sol Reyes invited you to TheCreative.exchange<\/h1>/);
    expect(text(html)).not.toContain("To love our neighbor");
    expect(text(html)).toContain("Joining is free.");
    expect(text(html)).toContain("Already a member? Sign in");
    expect(text(html)).not.toContain("works here too");
  });
});
