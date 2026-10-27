// /promise as a visitor reads it, on each domain: the brand's own name and
// address, the eight promises and not the ninth, the "coming next" line and
// the link into the Terms.

import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import PromisePage, { meta } from "./promise";
import { PROMISE_PAGE, creativePromises } from "../constants/promises";
import { FF_BACKING } from "../lib/featureFlags";

const site = vi.hoisted(() => ({ brand: "exchange" as "garden" | "exchange" }));
vi.mock("../brand/brands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../brand/brands")>()),
  useBrand: () => site.brand,
}));

afterEach(() => {
  site.brand = "exchange";
});

const plain = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

function page(brand: "garden" | "exchange") {
  site.brand = brand;
  return plain(
    renderToString(
      <MemoryRouter initialEntries={["/promise"]}>
        <PromisePage />
      </MemoryRouter>,
    ),
  );
}

/** The promises' headings, in order. */
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);

describe("/promise", () => {
  it("on TheCreative.exchange: its name and address, never The Garden's", () => {
    const html = page("exchange");
    expect(html).toContain("If another company ever buys us, it has to keep them.");
    expect(html).toContain("Your profile at thecreative.exchange/@yourname can be found by Google");
    expect(html).not.toContain("The Garden");
    expect(html).not.toContain("createthegarden.com");
  });

  it("on The Garden: its name and address, never the Exchange's", () => {
    const html = page("garden");
    expect(html).toContain("If another company ever buys us, it has to keep them.");
    expect(html).toContain("Your profile at createthegarden.com/@yourname can be found by Google");
    expect(html).not.toContain("TheCreative.exchange");
    expect(html).not.toContain("thecreative.exchange");
  });

  it("leads with the title line", () => {
    const h1 = page("exchange").match(/<h1[^>]*>(.*?)<\/h1>/)![1].replace(/<[^>]+>/g, "");
    expect(h1).toBe("Show your work. Keep it yours. Get paid for it.");
  });

  it("lists the eight promises, in order, and not the ninth", () => {
    for (const brand of ["exchange", "garden"] as const) {
      const html = page(brand);
      const ol = html.match(/<ol[^>]*>.*?<\/ol>/)![0];
      expect(ol.match(/<li /g)).toHaveLength(8);
      expect(headings(html)).toEqual(creativePromises({ name: "", domain: "" }).map((p) => p.title));
      expect(html).not.toMatch(/leave with everything/i);
    }
  });

  it("says what's coming next, under the list", () => {
    const html = page("exchange");
    const next = html.indexOf("Coming next: download everything you've posted, any time.");
    expect(next).toBeGreaterThan(html.indexOf("</ol>"));
  });

  it("says the promises are part of the Terms, and links to that section", () => {
    const html = page("exchange");
    expect(html).toContain("These promises are part of our Terms.");
    expect(html).toContain('href="/legal/terms#promises"');
  });

  it("offers backing only once FF_BACKING opens it", () => {
    // FF_BACKING stays false in lib/featureFlags.ts until payouts are ready.
    if (FF_BACKING) expect(page("exchange")).toContain("back your projects");
    else expect(page("exchange")).not.toMatch(/back your projects|backing/i);
  });

  it("has its own title and description", () => {
    expect(meta()).toEqual(
      expect.arrayContaining([
        { title: PROMISE_PAGE.title },
        { name: "description", content: PROMISE_PAGE.description },
        { property: "og:title", content: PROMISE_PAGE.title },
      ]),
    );
    expect(PROMISE_PAGE.title).toBe("Our promise to creatives — TheCreative.exchange");
  });
});
