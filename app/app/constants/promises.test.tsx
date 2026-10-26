// Keeps /promise honest (constants/promises.ts): the promises stay plain and
// free of money, the one that isn't true yet stays off the list, and each
// promise is pinned to what keeps it, so changing the code, or the Terms,
// under a promise fails here instead of quietly making the page untrue.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BANNED_PHRASES } from "./claims";
import {
  PROMISE_HEADLINE,
  PROMISE_NEXT,
  PROMISE_PAGE,
  PROMISE_PATH,
  PROMISE_TERMS_LINK,
  PROMISE_TERMS_NOTE,
  TERMS_PROMISES_ANCHOR,
  TERMS_PROMISES_HREF,
  TERMS_PROMISE_LINK,
  creativePromises,
  promiseLede,
  type PromiseId,
} from "./promises";
import Terms from "../routes/legal.terms";
import { FF_BACKING } from "../lib/featureFlags";
import { AI_TRAINING_CRAWLERS, isAiTrainingCrawler } from "../lib/aiCrawlers";
import { uploadToStorage } from "../lib/uploadFile";
import { setHideFromSearch } from "../../convex/handles";
import { concat, gpsFieldCount, jpeg, text, tiff } from "../../test-support/photoFixtures";

const APP_DIR = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(APP_DIR, path), "utf8");

const EXCHANGE = { name: "TheCreative.exchange", domain: "thecreative.exchange" };
const GARDEN = { name: "The Garden", domain: "createthegarden.com" };

const byId = (id: PromiseId, backing?: boolean) => creativePromises(EXCHANGE, backing).find((p) => p.id === id)!;

/** Every sentence the page shows, for both sites. */
function everyLine(): string[] {
  return [EXCHANGE, GARDEN].flatMap((site) => [
    PROMISE_HEADLINE,
    promiseLede(site),
    PROMISE_NEXT,
    PROMISE_TERMS_NOTE,
    PROMISE_TERMS_LINK,
    TERMS_PROMISE_LINK,
    PROMISE_PAGE.title,
    PROMISE_PAGE.description,
    ...creativePromises(site).flatMap((p) => [p.title, p.body]),
  ]);
}

// React marks the seams between text pieces and escapes quotes; neither is
// in the words a reader sees.
const plain = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("the promises themselves", () => {
  it("are the eight that are true today, in order", () => {
    expect(creativePromises(EXCHANGE).map((p) => p.id)).toEqual([
      "photoLocation",
      "personDecides",
      "youOwnIt",
      "noAiNoSale",
      "cantChange",
      "findable",
      "getPaid",
      "followers",
    ]);
  });

  it("don't promise leaving with everything: that's 'coming next', not a promise", () => {
    for (const p of creativePromises(EXCHANGE, true)) {
      expect(`${p.title} ${p.body}`).not.toMatch(/leave with everything|download|export/i);
    }
    expect(PROMISE_NEXT).toBe("Coming next: download everything you've posted, any time.");
  });

  it("carry no money amounts and no phrase we dropped", () => {
    for (const line of everyLine()) {
      expect(line, line).not.toMatch(/\$|\d\s*%|percent|dollars?|\bcents?\b/i);
      for (const banned of BANNED_PHRASES) expect(banned.test(line), `${line} matches ${banned}`).toBe(false);
    }
  });

  it("name the site they're read on", () => {
    const garden = creativePromises(GARDEN);
    expect(garden.find((p) => p.id === "cantChange")!.body).toContain("If another company ever buys us, it has to keep them.");
    expect(garden.find((p) => p.id === "findable")!.body).toContain("Your profile at createthegarden.com/@yourname");
    expect(byId("cantChange").body).toContain("If another company ever buys us, it has to keep them.");
    expect(byId("findable").body).toContain("Your profile at thecreative.exchange/@yourname");
    expect(promiseLede(GARDEN)).toContain("The Garden");
  });

  it("is the title line, word for word", () => {
    expect(PROMISE_HEADLINE).toBe("Show your work. Keep it yours. Get paid for it.");
  });
});

describe("each promise, pinned to what keeps it", () => {
  const terms = plain(
    renderToString(
      <MemoryRouter>
        <Terms />
      </MemoryRouter>,
    ),
  );

  afterEach(() => vi.unstubAllGlobals());

  it("photo location: every upload loses where it was taken, and keeps the credit", async () => {
    expect(byId("photoLocation").body).toContain("before it uploads, and keep your name and copyright");
    const xmp =
      'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:GPSLatitude="34,3.2N" ' +
      "exif:GPSLongitude='118,14.5W' dc:creator=\"Ana Ruiz\" dc:rights=\"(c) Ana Ruiz\"/></x:xmpmeta>";
    const photo = new Blob([jpeg(concat(text("Exif\0\0"), tiff()), text(xmp))], { type: "image/jpeg" });
    let sent: Blob | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = init.body as Blob;
        return new Response(JSON.stringify({ storageId: "s1" }), { status: 200 });
      }),
    );

    await uploadToStorage(async () => "https://upload.test", photo);

    const bytes = new Uint8Array(await sent!.arrayBuffer());
    const after = String.fromCharCode(...bytes);
    expect(gpsFieldCount(bytes, 12)).toBe(0);
    expect(after).not.toMatch(/34,3\.2N|118,14\.5W/);
    expect(after).toContain('dc:creator="Ana Ruiz"');
    expect(after).toContain('dc:rights="(c) Ana Ruiz"');
  });

  it("a person decides: the Terms say a person decides, says why, and reviews what the law forced", () => {
    expect(terms).toContain(
      "a person on our team decides before we remove Your Content or end your account, and tells you why",
    );
    expect(terms).toContain("A person makes those decisions, as set out in Our promises to creatives.");
    expect(terms).toContain("Where the law requires us to act at once");
    expect(terms).toContain("a person will review it promptly after");
  });

  it("you own it: the Terms leave ownership with you and license only showing and promoting the site", () => {
    expect(terms).toContain("You retain all ownership rights in Your Content.");
    expect(terms).toContain("show it within the Service and in reasonable promotion of the Service");
  });

  it("no AI training, no sale: the Terms say both, and that no one else may use it", () => {
    expect(terms).toContain("we do NOT use Your Content to train artificial intelligence or machine learning models");
    expect(terms).toContain("We do not sell Your Content, and we do not license it to anyone else.");
    expect(terms).toContain("we will not pass it on to a third party");
  });

  it("can't be changed on you: the Terms need your agreement, and bind whoever buys the company", () => {
    expect(terms).toContain("We will not change these promises for you unless you agree.");
    expect(terms).toContain("This does not apply to Our promises to creatives, which we will not change for you unless you agree.");
    expect(terms).toContain("whoever receives them is bound by Our promises to creatives");
  });

  it("findable: search and AI search tools may read profiles; training bots may not", () => {
    const robots = read("public/robots.txt");
    const groups = robots.split(/\n\s*\n/);
    const everyone = groups.find((g) => /^User-agent: \*$/m.test(g))!;
    expect(everyone).toMatch(/^Content-Signal: search=yes, ai-input=yes, ai-train=no$/m);
    expect(everyone).toMatch(/^Allow: \/$/m);
    expect(everyone).not.toMatch(/^Disallow: \/@/m);

    const training = groups.find((g) => g.includes("User-agent: GPTBot"))!;
    for (const bot of ["GPTBot", "ClaudeBot", "CCBot"]) {
      expect(training).toContain(`User-agent: ${bot}`);
      expect(AI_TRAINING_CRAWLERS).toContain(bot);
    }
    expect(training).toMatch(/^Disallow: \/$/m);

    // "Either way": a training bot that ignores robots.txt is turned away at
    // the edge (functions/_middleware.ts); ChatGPT search's crawler is not.
    expect(isAiTrainingCrawler("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe(true);
    expect(isAiTrainingCrawler("Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)")).toBe(false);
  });

  it("findable: you can turn it off (Settings, 'Hide my profile from search engines')", () => {
    expect(byId("findable").body).toContain("You can turn that off.");
    expect(setHideFromSearch).toBeDefined();
    expect(read("app/routes/settings.tsx")).toContain("api.handles.setHideFromSearch");
    expect(read("functions/[handle].ts")).toMatch(/noindex/);
  });

  it("get paid: no backing while FF_BACKING is off, and backing once it's on", () => {
    expect(byId("getPaid").body).toBe(
      FF_BACKING
        ? byId("getPaid", true).body
        : "People can buy tickets to your events, sign up for your classes and hire you, right from your profile.",
    );
    expect(byId("getPaid", false).body).not.toMatch(/\bback/i);
    expect(byId("getPaid", true).body).toContain("back your projects");
  });

  it("followers: a new project or event notifies the people who follow you", () => {
    expect(read("convex/garden/projects.ts")).toMatch(/notifyFollowers\(/);
    expect(read("convex/events.ts")).toMatch(/notifyFollowers\(/);
  });
});

describe("the Terms and the page point at each other", () => {
  const html = renderToString(
    <MemoryRouter>
      <Terms />
    </MemoryRouter>,
  );

  it("the Terms' promises section has the anchor the page links to", () => {
    expect(TERMS_PROMISES_HREF).toBe(`/legal/terms#${TERMS_PROMISES_ANCHOR}`);
    const section = html.match(new RegExp(`<section id="${TERMS_PROMISES_ANCHOR}"[^>]*>.*?</section>`))![0];
    expect(plain(section)).toContain("Our promises to creatives");
  });

  it("and links back to /promise", () => {
    const section = html.match(new RegExp(`<section id="${TERMS_PROMISES_ANCHOR}"[^>]*>.*?</section>`))![0];
    expect(section).toContain(`href="${PROMISE_PATH}"`);
    expect(plain(section)).toContain(TERMS_PROMISE_LINK);
  });
});
