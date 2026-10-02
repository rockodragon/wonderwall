import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import Favorites from "./favorites";

// On desktop /favorites hands over to the desk's Shortlist (behind FF_DESK,
// which is on). A stand-in Navigate says where it was told to go: the real one
// only moves in an effect, which a server render never runs.
vi.mock("../hooks/useMediaQuery", () => ({ useIsDesktop: () => true }));
vi.mock("convex/react", () => ({ useQuery: () => undefined }));
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()),
  Navigate: ({ to, replace }: { to: string; replace?: boolean }) => <i data-to={to} data-replace={String(!!replace)} />,
}));

async function desktop(url: string) {
  const handler = createStaticHandler([{ path: "/favorites", Component: Favorites }]);
  const context = await handler.query(new Request(`http://localhost${url}`));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe("/favorites on desktop", () => {
  it("goes to the desk's Shortlist, replacing the entry so Back doesn't bounce", async () => {
    expect(await desktop("/favorites")).toBe('<i data-to="/today?view=shortlist" data-replace="true"></i>');
  });

  it("passes ?area through", async () => {
    expect(await desktop("/favorites?area=events")).toContain('data-to="/today?view=shortlist&amp;area=events"');
  });

  it("passes ?kind through on Projects", async () => {
    expect(await desktop("/favorites?area=projects&kind=paid")).toContain('data-to="/today?view=shortlist&amp;area=projects&amp;kind=paid"');
  });

  it("drops what the desk wouldn't read: a kind outside Projects, an area it doesn't know", async () => {
    expect(await desktop("/favorites?area=events&kind=paid")).toContain('data-to="/today?view=shortlist&amp;area=events"');
    expect(await desktop("/favorites?area=nonsense&kind=paid")).toContain('data-to="/today?view=shortlist"');
  });
});
