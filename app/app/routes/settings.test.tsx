import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import { getFunctionName } from "convex/server";
import Settings from "./settings";

// The settings page on a phone: a tab row that scrolls without a scrollbar,
// and a Work & Portfolio section with its intro behind an info button.
let answers: Record<string, unknown> = {};
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) =>
    args === "skip" ? undefined : answers[getFunctionName(ref)],
  useMutation: () => async () => {},
  useAction: () => async () => {},
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => null }));
// A note is closed until someone taps it, so show every note's lines here.
vi.mock("../components/InfoTip", () => ({
  InfoTip: ({ label, lines }: { label?: string; lines: React.ReactNode[] }) => (
    <aside data-info={label}>{lines.map((l, i) => <p key={i}>{l}</p>)}</aside>
  ),
}));

beforeEach(() => {
  answers = {
    "profiles:getMyProfile": { _id: "p1", name: "Ada", bio: "I make things.", interests: [], isAdmin: true },
    "artifacts:getMyArtifacts": [],
  };
});

async function settings(url = "/settings") {
  const handler = createStaticHandler([{ path: "/settings", Component: Settings }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error(`redirected to ${context.headers.get("Location")}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe("Settings tabs", () => {
  it("keeps every tab, and Admin for an admin", async () => {
    const html = await settings();
    for (const label of ["Profile", "Network", "Money", "Support you&#x27;ve given", "Account", "Admin"]) {
      expect(html).toContain(`>${label}</`);
    }
  });

  it("scrolls sideways with no scrollbar, and the tabs are 15px", async () => {
    const html = await settings();
    const row = html.match(/<div[^>]*role="tablist"[^>]*>/)?.[0] ?? "";
    expect(row).toContain("no-scrollbar");
    expect(row).toContain("overflow-x-auto");
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) expect(tab).toContain("text-[15px]");
  });

  it("marks the tab from ?tab= as selected", async () => {
    const html = await settings("/settings?tab=support");
    expect(html).toMatch(/aria-selected="true"[^>]*>Support you&#x27;ve given</);
  });
});

describe("Work & Portfolio", () => {
  it("puts the intro behind an info button, with the sizes from the upload caps", async () => {
    const html = await settings();
    const note = html.match(/<aside data-info="About work and portfolio">(.*?)<\/aside>/)?.[1] ?? "";
    expect(note).toContain("12 MB");
    expect(note).toContain("64 MB");
    expect(html).not.toContain("Showcase your work");
  });

  it("says plainly there is nothing yet, without telling a phone to click", async () => {
    const html = await settings();
    expect(html).toContain("No work added yet.");
    expect(html).not.toContain("Click");
  });
});
