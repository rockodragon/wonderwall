// The edge's half of The Garden's brand (functions/_middleware.ts runs this
// on every HTML page served on a Garden domain). Link previews and crawlers
// never run the page's JavaScript, so what they read has to be right in the
// HTML itself: the title and site name, the share picture, the icons. The
// browser gets the same, a moment sooner than BRAND_BOOT could.
//
// String edits on the <head> only — the prerendered pages and the SPA shell
// are ours and regular. The body is left alone: React hydrates it.

import { GARDEN, gardenText as swapName } from "./brandConfig";

/** The icon addresses every page links to (root.tsx), and the ones browsers
 *  ask for on their own, answered with The Garden's files on its domains.
 *  The links themselves are never rewritten: React owns them, and a changed
 *  href makes it put the original back beside the new one. */
export const GARDEN_ROOT_FILES: Record<string, string> = {
  "/favicon.ico": "favicon.ico",
  "/favicon.svg": "favicon.svg",
  "/favicon-32x32.png": "favicon-32.png",
  "/favicon-16x16.png": "favicon-16.png",
  "/apple-touch-icon.png": "apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "apple-touch-icon.png",
};

/** The site-wide share picture; an event's own cover is kept. */
const DEFAULT_OG_IMAGE = /(content=")(?:https?:\/\/[^"/]+)?\/og-image\.png(")/g;


export function gardenizeHtml(html: string, origin: string): string {
  const end = html.indexOf("</head>");
  if (end < 0) return html;
  let head = html.slice(0, end);
  const body = html.slice(end);

  head = head.replace(/<html\b(?![^>]*data-brand)/, '<html data-brand="garden"');

  // The tab title, and the names a link preview shows.
  head = head.replace(/<title>([\s\S]*?)<\/title>/, (_, t: string) => `<title>${swapName(t)}</title>`);
  head = head.replace(
    /(<meta\s+(?:property|name)="(?:og:title|og:site_name|og:description|twitter:title|twitter:description|description)"\s+content=")([^"]*)(")/g,
    (_, a: string, c: string, b: string) => a + swapName(c) + b,
  );

  // The icons come from their usual addresses (GARDEN_ROOT_FILES). The
  // manifest, theme color and Jost aren't React's, so they can be added.
  const add: string[] = [];
  if (!/rel="manifest"/.test(head)) add.push(`<link rel="manifest" href="${GARDEN.icons}/site.webmanifest">`);
  if (!/name="theme-color"/.test(head)) add.push(`<meta name="theme-color" content="${GARDEN.themeColor}">`);
  if (!/family=Jost/.test(head)) add.push(`<link rel="stylesheet" href="${GARDEN.jostHref.replace(/&/g, "&amp;")}">`);

  // The share picture: the disc on ink, square, so a summary card.
  const shared = head.replace(DEFAULT_OG_IMAGE, `$1${origin}${GARDEN.icons}/social-avatar-800.png$2`);
  if (shared !== head) {
    head = shared.replace(/(<meta\s+name="twitter:card"\s+content=")summary_large_image(")/, "$1summary$2");
  }

  return head + add.join("") + body;
}
