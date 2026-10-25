// /embed/@handle against the real build and Pages Functions (wrangler pages
// dev): what another site's frame gets. Reads live Convex, so it uses an
// address nobody can have. Unit tests (test-support/embedFunction.test.ts)
// can't see the headers the server actually sends, or whether a browser
// lets the card into a frame.

import { expect, test } from "@playwright/test";

test.describe("/embed/@handle", () => {
  test("an address nobody can have shows the Not found card, with no scripts", async ({ page }) => {
    const res = await page.goto("/embed/@a..b");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Not found")).toBeVisible();
    await expect(page.getByText("There's no profile at this address.")).toBeVisible();
    expect(await page.locator("script").count()).toBe(0);
  });

  test("may be framed anywhere, and isn't for search engines", async ({ request }) => {
    const res = await request.get("/embed/@a..b");
    const headers = res.headers();
    expect(headers["x-frame-options"] ?? "").not.toMatch(/deny/i);
    expect(headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-robots-tag"]).toContain("noai");
  });

  test("a page on another origin shows it in a frame, and not the rest of the site", async ({ page, baseURL }) => {
    // Another origin that is still this machine: 127.0.0.1 instead of
    // localhost. (Chromium won't let a page it counts as public, such as one
    // made up with page.route, frame localhost at all.)
    const elsewhere = baseURL!.replace("localhost", "127.0.0.1");
    const refused: string[] = [];
    page.on("console", (m) => {
      if (/Refused to display/.test(m.text())) refused.push(m.text());
    });
    await page.goto(`${elsewhere}/robots.txt`);
    const frameIn = (src: string) =>
      page.evaluate((url) => {
        const frame = document.createElement("iframe");
        frame.src = url;
        document.body.replaceChildren(frame);
      }, src);

    await frameIn(`${baseURL}/embed/@a..b`);
    await expect(page.frameLocator("iframe").getByText("Not found")).toBeVisible();
    expect(refused).toEqual([]);

    await frameIn(`${baseURL}/`);
    await expect.poll(() => refused.length).toBeGreaterThan(0);
    expect(refused[0]).toContain("X-Frame-Options");
  });

  test("the rest of the site still refuses to be framed", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    // Below the card's one segment is the app shell, not the card.
    const deeper = await request.get("/embed/a/b");
    expect(deeper.headers()["x-frame-options"]).toBe("DENY");
  });

  test("the badges are there for other sites to show", async ({ request }) => {
    for (const tone of ["dark", "light"]) {
      const res = await request.get(`/badge/${tone}.svg`);
      expect(res.status(), tone).toBe(200);
      expect(res.headers()["content-type"], tone).toContain("image/svg+xml");
    }
  });
});
