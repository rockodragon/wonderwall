// The edge's half of /@handle (functions/[handle].ts): what a link unfurler
// or crawler gets without running the page. Lives here, not in functions/,
// because every file there deploys as a route.

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleFromSegment, onRequestGet } from "../functions/[handle]";

const SHELL =
  '<!doctype html><html><head><title>TheCreative.exchange</title>' +
  '<meta name="description" content="Create better together."><meta property="og:title" content="TheCreative.exchange">' +
  "</head><body><div id=\"root\"></div></body></html>";

const ANA = {
  name: "Ana Reyes",
  handle: "ana",
  bio: "Photographer.\nSan Diego, mostly film.",
  interests: ["Photography"],
  imageUrl: "https://files.convex.cloud/ana.jpg",
};

/** A request for `path`, Convex answering `value` (or throwing). */
function scene(path: string, value: unknown, { convexDown = false, host = "thecreative.exchange" } = {}) {
  const convex = vi.fn(async () => {
    if (convexDown) throw new Error("down");
    return new Response(JSON.stringify({ status: "success", value }), { status: 200 });
  });
  vi.stubGlobal("fetch", convex);
  const next = vi.fn(async () => new Response("passed through", { status: 200 }));
  const context = {
    request: new Request(`https://${host}${path}`),
    params: { handle: path.slice(1) },
    env: { ASSETS: { fetch: async () => new Response(SHELL) } },
    next,
  };
  return { context, convex, next };
}

afterEach(() => vi.unstubAllGlobals());

describe("handleFromSegment", () => {
  it("reads an address, encoded or not, cleaned", () => {
    expect(handleFromSegment("@Ana")).toBe("ana");
    expect(handleFromSegment("%40ana.reyes")).toBe("ana.reyes");
    expect(handleFromSegment("@%41na")).toBe("ana");
  });

  it("is null for anything else", () => {
    expect(handleFromSegment("today")).toBe(null);
    expect(handleFromSegment("sd")).toBe(null);
    expect(handleFromSegment(undefined)).toBe(null);
  });
});

describe("/@handle at the edge", () => {
  it("hands every other single-segment address on untouched", async () => {
    for (const path of ["/today", "/showcase", "/sd", "/the-garden"]) {
      const { context, convex, next } = scene(path, ANA);
      const res = await onRequestGet(context);
      expect(await res.text(), path).toBe("passed through");
      expect(next, path).toHaveBeenCalledTimes(1);
      expect(convex, path).not.toHaveBeenCalled();
    }
  });

  it("writes the name, the first line of the bio and the photo into the shell", async () => {
    const { context, convex } = scene("/@ana", ANA);
    const res = await onRequestGet(context);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toBe("noai, noimageai");
    const body = JSON.parse((convex.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ path: "profiles:getProfileByHandle", args: { handle: "ana" } });
    const html = await res.text();
    expect(html).toContain("<title>Ana Reyes (@ana) — TheCreative.exchange</title>");
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:description" content="Photographer.">');
    expect(html).toContain('<meta property="og:image" content="https://files.convex.cloud/ana.jpg">');
    expect(html).toContain('<meta property="og:type" content="profile">');
    expect(html).toContain('<meta property="og:url" content="https://thecreative.exchange/@ana">');
    expect(html).toContain('<link rel="canonical" href="https://thecreative.exchange/@ana">');
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('<div id="root"></div>');
  });

  it("puts a Garden member's address under createthegarden.com, whichever host", async () => {
    const { context } = scene("/@ana", { ...ANA, inGarden: true });
    const html = await (await onRequestGet(context)).text();
    expect(html).toContain('<link rel="canonical" href="https://createthegarden.com/@ana">');
    // The preview's address is the same one, so shares count toward it.
    expect(html).toContain('<meta property="og:url" content="https://createthegarden.com/@ana">');
  });

  it("keeps everyone else's under thecreative.exchange, even reached on a Garden domain", async () => {
    const { context } = scene("/@ana", ANA, { host: "createthegarden.com" });
    const html = await (await onRequestGet(context)).text();
    expect(html).toContain('<link rel="canonical" href="https://thecreative.exchange/@ana">');
    expect(html).toContain('<meta property="og:url" content="https://thecreative.exchange/@ana">');
  });

  it("says noindex when the person hid their profile from search engines", async () => {
    const { context } = scene("/@ana", { ...ANA, hideFromSearch: true });
    const res = await onRequestGet(context);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, noai, noimageai");
    expect(await res.text()).toContain('<meta name="robots" content="noindex">');
  });

  it("sends an old address on to the current one", async () => {
    const { context } = scene("/@old?x=1", ANA);
    const res = await onRequestGet({ ...context, params: { handle: "@old" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://thecreative.exchange/@ana?x=1");
  });

  it("sends the founder alias on to the founder's page, and serves the shell (the 404) while that's unclaimed", async () => {
    const rick = { ...ANA, name: "Rick Moy", handle: "rickmoy" };
    const claimed = scene("/@rick", rick);
    const res = await onRequestGet(claimed.context);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://thecreative.exchange/@rickmoy");
    const body = JSON.parse((claimed.convex.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ path: "profiles:getProfileByHandle", args: { handle: "rick" } });

    const unclaimed = scene("/@rick", null);
    expect(await (await onRequestGet(unclaimed.context)).text()).toBe(SHELL);
  });

  it("keeps a picture that isn't https off the card", async () => {
    const { context } = scene("/@ana", { ...ANA, imageUrl: "http://plain.example/ana.jpg" });
    expect(await (await onRequestGet(context)).text()).not.toContain("og:image");
  });

  it("serves the plain shell for an address nobody has, one that breaks the rules, or when Convex is down", async () => {
    const nobody = scene("/@nobody", null);
    expect(await (await onRequestGet(nobody.context)).text()).toBe(SHELL);

    const broken = scene("/@a..b", ANA);
    expect(await (await onRequestGet(broken.context)).text()).toBe(SHELL);
    expect(broken.convex).not.toHaveBeenCalled();

    const down = scene("/@ana", ANA, { convexDown: true });
    const res = await onRequestGet(down.context);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SHELL);
  });
});
