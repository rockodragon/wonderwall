// functions/e/[slug].ts: an event's readable address serves the event page
// itself, with its link-preview tags, instead of redirecting to /events/{id}.
// (The test lives here because any file under functions/ becomes a route.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../functions/e/[slug]";

const EVENT_ID = "k57d1c0r9w8x2v3b4n5m6q7p8s9t0abc";
const SHELL = `<html><head><title>TheCreative.exchange</title><meta name="description" content="shell"></head><body><div id="root"></div></body></html>`;

function context(slug: string) {
  const assets = vi.fn(async (_req: Request | URL) => new Response(SHELL, { status: 200 }));
  return {
    assets,
    ctx: {
      request: new Request(`https://createthegarden.com/e/${slug}`),
      params: { slug },
      env: { ASSETS: { fetch: assets }, CONVEX_URL: "https://convex.test" },
    },
  };
}

/** Convex's HTTP query API: the slug lookup, then the event. */
function convex(id: string | null) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { path } = JSON.parse(String(init.body)) as { path: string };
    const value =
      path === "eventSlug:idForSlug"
        ? id
        : { title: "Creative Renaissance", description: "A night of work.", coverImageUrl: "https://thecreative.exchange/media/abc12345" };
    return new Response(JSON.stringify({ status: "success", value }), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("event slug function", () => {
  it("serves the event page at the slug address, with its preview tags", async () => {
    const fetchMock = convex(EVENT_ID);
    vi.stubGlobal("fetch", fetchMock);
    const { ctx } = context("renaissance-nov6");

    const res = await onRequestGet(ctx);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).args).toEqual({ eventId: EVENT_ID });
    expect(html).toContain("<title>Creative Renaissance — TheCreative.exchange</title>");
    expect(html).toContain(`<meta property="og:url" content="https://createthegarden.com/e/renaissance-nov6">`);
    expect(html).toContain(`<meta property="og:image" content="https://thecreative.exchange/media/abc12345">`);
    expect(html).not.toContain(`content="shell"`);
  });

  it("serves the bare shell for an address nobody has", async () => {
    vi.stubGlobal("fetch", convex(null));
    const { ctx, assets } = context("no-such-event");

    const res = await onRequestGet(ctx);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SHELL);
    expect(String(assets.mock.calls[0][0])).toBe("https://createthegarden.com/__spa-fallback");
  });

  it("still serves the shell when Convex can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const { ctx } = context("renaissance-nov6");

    const res = await onRequestGet(ctx);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SHELL);
  });
});
