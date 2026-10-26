// What we promise creatives — the words /promise shows (routes/promise.tsx),
// and the one place they are written.
//
// Same rules as claims.ts: every line is something the site does today,
// said in plain words (8th–10th grade), with no money amounts and nothing we
// can't point to in the code. promises.test.ts pins each promise to what
// backs it (the Terms' wording, robots.txt and the crawler list, the photo
// location stripper, FF_BACKING, the follower notice), so the code and the
// page can't drift apart without a test failing.
//
// Held back until it is true: "You can leave with everything." There is no
// download button yet, and deleting an account only archives some things, so
// it is PROMISE_NEXT ("Coming next") rather than a promise. promises.test.ts
// keeps it off the list.
//
// The same page serves both domains: the brand name and address come in as
// PromiseSite (routes/promise.tsx reads them from shareSite).

import { profilePath } from "../../convex/handleRules";
import { PLATFORM_NAME } from "../../convex/garden/brandHosts";
import { FF_BACKING } from "../lib/featureFlags";

/** The page's address. */
export const PROMISE_PATH = "/promise";

/** The Terms' "Our promises to creatives" section, as a link target:
 *  routes/legal.terms.tsx gives that section this id. */
export const TERMS_PROMISES_ANCHOR = "promises";
export const TERMS_PROMISES_HREF = `/legal/terms#${TERMS_PROMISES_ANCHOR}`;

/** The site the page is read on: "TheCreative.exchange" and
 *  "thecreative.exchange", or "The Garden" and "createthegarden.com". */
export interface PromiseSite {
  name: string;
  domain: string;
}

export type PromiseId =
  | "photoLocation"
  | "personDecides"
  | "youOwnIt"
  | "noAiNoSale"
  | "cantChange"
  | "findable"
  | "getPaid"
  | "followers";

export interface CreativePromise {
  id: PromiseId;
  /** The promise itself, one short sentence. */
  title: string;
  /** What it means, in a sentence or three. */
  body: string;
}

/** The title line, a sentence at a time: the page sets each on its own line
 *  and lights the last. */
export const PROMISE_HEADLINE_PARTS = ["Show your work.", "Keep it yours.", "Get paid for it."] as const;
export const PROMISE_HEADLINE = PROMISE_HEADLINE_PARTS.join(" ");

/** Under the headline. */
export function promiseLede(site: PromiseSite): string {
  return `What ${site.name} promises every creative here. Each one is true today.`;
}

/** The one line under the list: what isn't true yet, so it isn't promised. */
export const PROMISE_NEXT = "Coming next: download everything you've posted, any time.";

/** The note that these are binding, and the link to where the Terms say so. */
export const PROMISE_TERMS_NOTE = "These promises are part of our Terms.";
export const PROMISE_TERMS_LINK = "Read them in the Terms";

/** The Terms' link back here, at the end of its promises section. */
export const TERMS_PROMISE_LINK = "Read our promise to creatives";

/** The places people can pay a creative from their profile today. Backing a
 *  project joins them only once FF_BACKING opens it (payouts first). */
function waysToGetPaid(backing: boolean): string {
  return backing
    ? "People can buy tickets to your events, sign up for your classes, hire you and back your projects, right from your profile."
    : "People can buy tickets to your events, sign up for your classes and hire you, right from your profile.";
}

/** The promises, in the order the page lists them. */
export function creativePromises(site: PromiseSite, backing: boolean = FF_BACKING): CreativePromise[] {
  return [
    {
      id: "photoLocation",
      title: "We remove your photo's location.",
      body: "Phones hide where a photo was taken inside the file. We delete that before it uploads, and keep your name and copyright.",
    },
    {
      id: "personDecides",
      title: "A person decides any removal.",
      body: "If we ever take down your work or close your account, a person on our team makes that call, not a computer, and tells you why. If the law forces us to act at once, a person reviews it right after.",
    },
    {
      id: "youOwnIt",
      title: "You own your work.",
      body: "We only use it to show it on this site and to promote this site.",
    },
    {
      id: "noAiNoSale",
      title: "We don't train AI on your work, and we don't sell it.",
      body: "We don't let anyone else use it either.",
    },
    {
      id: "cantChange",
      title: "These promises can't be changed on you.",
      body: `We can't change them unless you agree. If another company buys ${site.name}, it has to keep them.`,
    },
    {
      id: "findable",
      title: "People can find you.",
      body: `Your profile at ${site.domain}${profilePath("yourname")} can be found by Google and by AI search tools like ChatGPT search. You can turn that off. AI training bots are blocked either way.`,
    },
    {
      id: "getPaid",
      title: "You can get paid here.",
      body: waysToGetPaid(backing),
    },
    {
      id: "followers",
      title: "Your followers hear from you.",
      body: "When you post a project or an event, the people who follow you get a notice. No algorithm picks who sees it.",
    },
  ];
}

/** The tab title and link-preview words (routes/promise.tsx meta and
 *  functions/promise.ts). Written with TheCreative.exchange's name; on a
 *  Garden domain the name is swapped (brand/BrandTitle.tsx in the tab,
 *  brand/gardenHtml.ts at the edge). */
export const PROMISE_PAGE = {
  title: `Our promise to creatives — ${PLATFORM_NAME}`,
  description:
    "Show your work. Keep it yours. Get paid for it. You own your work, we don't train AI on it or sell it, and a person decides any removal.",
} as const;
