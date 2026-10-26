// functions/promise.ts: /promise gets its own link-preview tags, on the
// address it was asked from. (The test lives here because any file under
// functions/ becomes a route.)

import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../functions/promise";
import { gardenizeHtml } from "../app/brand/gardenHtml";
import { PROMISE_PAGE } from "../app/constants/promises";

const SHELL = `<html><head><title>shell</title><meta name="description" content="shell"></head><body><div id="root"></div></body></html>`;

async function serve(url: string) {
  const assets = vi.fn(async (_req: Request | URL) => new Response(SHELL, { status: 200 }));
  const res = await onRequestGet({ request: new Request(url), env: { ASSETS: { fetch: assets } } });
  return { res, html: await res.text(), asked: String(assets.mock.calls[0][0]) };
}

describe("promise function", () => {
  it("serves the app shell with the page's title, description and address", async () => {
    const { res, html, asked } = await serve("https://thecreative.exchange/promise?ref=ig");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(asked).toBe("https://thecreative.exchange/__spa-fallback");
    expect(html).toContain("<title>Our promise to creatives — TheCreative.exchange</title>");
    expect(html).toContain(`<meta property="og:title" content="Our promise to creatives — TheCreative.exchange">`);
    expect(html).toContain(`<meta property="og:description" content="${PROMISE_PAGE.description}">`);
    expect(html).toContain(`<meta property="og:url" content="https://thecreative.exchange/promise">`);
    expect(html).toContain(`<meta property="og:image" content="https://thecreative.exchange/og-image.png">`);
    expect(html).not.toContain("shell</title>");
    expect(html).not.toContain('content="shell"');
  });

  it("on a Garden domain, points at that domain and reads The Garden once the edge brands it", async () => {
    const { html } = await serve("https://createthegarden.com/promise");

    expect(html).toContain(`<meta property="og:url" content="https://createthegarden.com/promise">`);
    const branded = gardenizeHtml(html, "https://createthegarden.com");
    expect(branded).toContain("<title>Our promise to creatives — The Garden</title>");
    expect(branded).toContain(`<meta property="og:title" content="Our promise to creatives — The Garden">`);
    expect(branded).not.toContain("TheCreative.exchange");
  });
});
