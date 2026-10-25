// functions/_middleware.ts: every response leaves with the site's headers
// (app/lib/siteHeaders.ts), including the pages Functions build themselves,
// which public/_headers never reaches. (The test lives here because any file
// under functions/ becomes a route.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/_middleware";

function context(url: string, page: Response, userAgent = "Mozilla/5.0 Chrome/141.0") {
  return {
    request: new Request(url, { headers: { "user-agent": userAgent } }),
    env: { ASSETS: { fetch: async () => new Response("", { status: 404 }) } },
    next: async () => page,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("middleware headers", () => {
  it("adds them to an event page a Function built", async () => {
    const page = new Response("<html><head></head></html>", { headers: { "Content-Type": "text/html" } });
    const res = await onRequest(context("https://thecreative.exchange/events/k57abc", page));
    expect(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
    expect(res.headers.get("tdm-reservation")).toBe("1");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe("<html><head></head></html>");
  });

  it("adds them on a Garden domain too, after the page is branded", async () => {
    // The branding asks Convex for The Garden's description; no network here.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const page = new Response("<html><head><title>x</title></head><body></body></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    const res = await onRequest(context("https://createthegarden.com/e/renaissance-nov6", page));
    expect(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("lets the embed card stay framable", async () => {
    const card = new Response("<!doctype html>", {
      headers: { "Content-Security-Policy": "default-src 'none'; frame-ancestors *", "X-Robots-Tag": "noindex, noai, noimageai" },
    });
    const res = await onRequest(context("https://thecreative.exchange/embed/@rick", card));
    expect(res.headers.get("X-Frame-Options")).toBeNull();
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, noai, noimageai");
  });

  it("still turns a training crawler away, with the headers on", async () => {
    const res = await onRequest(context("https://thecreative.exchange/@rick", new Response("page"), "GPTBot/1.2"));
    expect(res.status).toBe(403);
    expect(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });
});
