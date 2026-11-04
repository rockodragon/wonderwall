import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StaticRouterProvider, createStaticHandler, createStaticRouter } from "react-router";
import Privacy from "./legal.privacy";

async function page() {
  const handler = createStaticHandler([{ path: "/legal/privacy", Component: Privacy }]);
  const context = await handler.query(new Request("http://localhost/legal/privacy"));
  if (context instanceof Response) throw new Error("redirected");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe("Privacy Policy: text messages", () => {
  it("has the Text messages section, the no-sharing sentence, Telnyx and the new date", async () => {
    const html = await page();
    expect(html).toContain("Text messages");
    expect(html).toContain("No mobile information will be sold or shared with third parties for promotional or marketing purposes.");
    expect(html).toContain("If you turn on texts, in Settings or when we ask on your Canvas, we text you when someone messages you, up to three a day.");
    expect(html).toContain("We keep a record of when you agreed, the words you saw and the number, and of any STOP reply, so we can honor it.");
    expect(html).toContain("Telnyx — sending text messages: sign-in codes and the message alerts you turn on.");
    expect(html).toContain("November 4, 2026");
  });
});
