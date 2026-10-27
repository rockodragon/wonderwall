import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { isBack, SheetExit } from "./SheetExit";

const noop = () => {};
const routes = [{ path: "*", element: <SheetExit onExit={noop} /> }];

describe("SheetExit", () => {
  it("draws nothing, in a plain router (a route test) and in a data router (the app)", () => {
    expect(renderToStaticMarkup(<MemoryRouter><SheetExit onExit={noop} /></MemoryRouter>)).toBe("");
    const router = createMemoryRouter(routes, { initialEntries: ["/projects"] });
    expect(renderToStaticMarkup(<RouterProvider router={router} />)).toBe("");
  });

  it("is a Back that it catches, not a push or a replace", () => {
    expect(isBack({ historyAction: "POP" } as Parameters<typeof isBack>[0])).toBe(true);
    expect(isBack({ historyAction: "PUSH" } as Parameters<typeof isBack>[0])).toBe(false);
    expect(isBack({ historyAction: "REPLACE" } as Parameters<typeof isBack>[0])).toBe(false);
  });

  // The router itself, with the same blocker useBlocker hands it: Back is
  // held (and put back where it was), while the Canvas dropping its
  // ?create= param (a replace) and a new project's page (a push) go through.
  it("holds Back and lets a replace and a push through", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/today?view=projects", "/today?create=project"], initialIndex: 1 });
    router.getBlocker("sheet", isBack);

    await router.navigate(-1);
    expect(router.state.location.search).toBe("?create=project");
    const held = router.state.blockers.get("sheet");
    expect(held?.state).toBe("blocked");
    if (held?.state === "blocked") held.reset();
    expect(router.state.blockers.get("sheet")?.state).toBe("unblocked");

    await router.navigate("/today?view=projects", { replace: true });
    expect(router.state.location.search).toBe("?view=projects");
    expect(router.state.blockers.get("sheet")?.state ?? "unblocked").toBe("unblocked");

    await router.navigate("/projects/p1");
    expect(router.state.location.pathname).toBe("/projects/p1");
  });
});
