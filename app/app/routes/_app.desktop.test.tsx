import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import AppLayout from "./_app";

// On a computer a signed-in member browses on the desk, so the shell sends
// /people, /projects and /events there (desk/deskRedirect.ts says where). A
// stand-in Navigate says where it was told to go: the real one only moves in
// an effect, which a server render never runs.
const scene = vi.hoisted(() => ({ signedIn: true, loading: false, desktop: true }));

vi.mock("../hooks/useMediaQuery", () => ({ useIsDesktop: () => scene.desktop, useReducedMotion: () => false }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: scene.signedIn, isLoading: scene.loading }),
  useMutation: () => async () => {},
  useQuery: () => undefined,
}));
vi.mock("@posthog/react", () => ({ usePostHog: () => undefined }));
vi.mock("../desk/Palette", () => ({ Palette: () => null }));
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => <i data-to={to} data-replace={String(!!replace)} />,
}));

beforeEach(() => {
  scene.signedIn = true;
  scene.loading = false;
  scene.desktop = true;
});

async function shell(url: string) {
  const handler = createStaticHandler([{ path: "*", Component: AppLayout }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

const desk = (to: string) => `<i data-to="${to.replaceAll("&", "&amp;")}" data-replace="true"></i>`;

describe("a signed-in member on a computer", () => {
  it("goes from People to the desk's People, replacing the entry so Back doesn't bounce", async () => {
    expect(await shell("/people")).toBe(desk("/today?view=people"));
    expect(await shell("/search")).toBe(desk("/today?view=people"));
  });

  it("keeps the Organizations tab and the search", async () => {
    expect(await shell("/people?tab=orgs&q=abiding")).toBe(desk("/today?view=people&q=abiding&tab=orgs"));
  });

  it("goes from Projects and Events to the desk's, with the filters the desk reads", async () => {
    expect(await shell("/projects")).toBe(desk("/today?view=projects"));
    expect(await shell("/projects?show=work")).toBe(desk("/today?view=projects&show=work"));
    expect(await shell("/events")).toBe(desk("/today?view=events"));
    expect(await shell("/events?tab=past")).toBe(desk("/today?view=events&tab=past"));
  });

  it("stays on a project's or an event's own page", async () => {
    expect(await shell("/projects/abc123")).not.toContain("data-to=");
    expect(await shell("/events/abc123")).not.toContain("data-to=");
  });

  it("isn't sent anywhere while the sign-in check is still running", async () => {
    scene.loading = true;
    scene.signedIn = false;
    const html = await shell("/people");
    expect(html).not.toContain("data-to=");
    expect(html).not.toContain('aria-label="Places"');
    expect(html).toContain("animate-spin");
  });
});

describe("the phone pages stay", () => {
  it("for a visitor on a computer: People, Projects and Events are public pages", async () => {
    scene.signedIn = false;
    for (const url of ["/people", "/people?tab=orgs", "/projects", "/events"]) {
      const html = await shell(url);
      expect(html).not.toContain("data-to=");
      expect(html).toContain('aria-label="Places"');
    }
  });

  it("for a signed-in member on a phone", async () => {
    scene.desktop = false;
    for (const url of ["/people", "/people?tab=orgs&q=abiding", "/projects", "/events"]) {
      const html = await shell(url);
      expect(html).not.toContain("data-to=");
      expect(html).toContain('aria-label="Places"');
    }
  });
});
