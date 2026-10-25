import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_HEADERS, withSiteHeaders } from "./siteHeaders";

describe("SITE_HEADERS", () => {
  it("is public/_headers' /* rule, header by header", () => {
    const file = readFileSync(join(__dirname, "../../public/_headers"), "utf8");
    const rule = file.split(/\n(?=\S)/).find((block) => /^\/\*\s*$/m.test(block.split("\n")[0])) ?? "";
    const fromFile = Object.fromEntries(
      [...rule.matchAll(/^\s+([A-Za-z-]+):\s*(.+)$/gm)].map((m) => [m[1], m[2].trim()]),
    );
    expect(fromFile).toEqual(SITE_HEADERS);
  });
});

describe("withSiteHeaders", () => {
  it("gives a bare Function response every site header", () => {
    const res = withSiteHeaders(new Response("<html></html>", { headers: { "Content-Type": "text/html" } }));
    for (const [name, value] of Object.entries(SITE_HEADERS)) expect(res.headers.get(name), name).toBe(value);
    expect(res.headers.get("Content-Type")).toBe("text/html");
  });

  it("keeps what the page says and adds the rest of X-Robots-Tag", () => {
    const res = withSiteHeaders(
      new Response("", { headers: { "X-Robots-Tag": "noindex", "X-Frame-Options": "SAMEORIGIN", "tdm-reservation": "0" } }),
    );
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, noai, noimageai");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("tdm-reservation")).toBe("0");
  });

  it("doesn't repeat a token the page already sends", () => {
    const res = withSiteHeaders(new Response("", { headers: { "X-Robots-Tag": "noindex, noai, noimageai" } }));
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, noai, noimageai");
  });

  it("leaves framing alone where the page allows it on purpose (the embed card)", () => {
    const res = withSiteHeaders(
      new Response("", { headers: { "Content-Security-Policy": "default-src 'none'; frame-ancestors *" } }),
    );
    expect(res.headers.get("X-Frame-Options")).toBeNull();
    expect(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("keeps the status, the body and a redirect's Location", async () => {
    const page = withSiteHeaders(new Response("hello", { status: 404, statusText: "Not Found" }));
    expect(page.status).toBe(404);
    expect(page.statusText).toBe("Not Found");
    expect(await page.text()).toBe("hello");

    const moved = withSiteHeaders(Response.redirect("https://thecreative.exchange/@rickmoy", 302));
    expect(moved.status).toBe(302);
    expect(moved.headers.get("Location")).toBe("https://thecreative.exchange/@rickmoy");
    expect(moved.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
