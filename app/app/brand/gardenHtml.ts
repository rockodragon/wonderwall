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

/** A link preview for a page with none of its own: the address it's for and
 *  the words, which come from host tools (shareDescription). */
export interface GardenShare {
  url: string;
  description?: string;
}

/** The SPA shell ("/" on a Garden domain, and every page that isn't
 *  prerendered) has no title or preview tags. Prerendered pages and event
 *  pages bring their own, and those are only renamed. */
export function needsShareTags(html: string): boolean {
  const end = html.indexOf("</head>");
  return end >= 0 && !/property="og:title"/.test(html.slice(0, end));
}

/** The words under The Garden's name in a link preview: the first paragraph
 *  of its host-tools description, else its tagline. */
export function shareDescription(
  community: { description?: string | null; tagline?: string | null } | null,
): string | undefined {
  const first = community?.description?.trim().split(/\n\s*\n/)[0]?.trim();
  const words = first || community?.tagline?.trim();
  if (!words) return undefined;
  return words.length > 200 ? `${words.slice(0, 199).trimEnd()}…` : words;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function gardenizeHtml(html: string, origin: string, share?: GardenShare): string {
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
  // manifest and theme color aren't React's, so they can be added. (Jost
  // loads on every page, root.tsx: the signed-in desk shows the lockup on
  // any address.)
  const add: string[] = [];
  if (!/rel="manifest"/.test(head)) add.push(`<link rel="manifest" href="${GARDEN.icons}/site.webmanifest">`);
  if (!/name="theme-color"/.test(head)) add.push(`<meta name="theme-color" content="${GARDEN.themeColor}">`);

  // The share picture: the disc on ink, square, so a summary card.
  const shared = head.replace(DEFAULT_OG_IMAGE, `$1${origin}${GARDEN.icons}/social-avatar-800.png$2`);
  if (shared !== head) {
    head = shared.replace(/(<meta\s+name="twitter:card"\s+content=")summary_large_image(")/, "$1summary$2");
  }

  // A page with no preview of its own gets The Garden's, so a shared link
  // shows the name, the disc and the host-tools words instead of a bare URL.
  if (share && !/property="og:title"/.test(head)) {
    const name = esc(GARDEN.name);
    if (!/<title>/.test(head)) add.push(`<title>${name}</title>`);
    add.push(
      `<meta property="og:title" content="${name}">`,
      `<meta property="og:site_name" content="${name}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:url" content="${esc(share.url)}">`,
      `<meta property="og:image" content="${origin}${GARDEN.icons}/social-avatar-800.png">`,
      `<meta name="twitter:card" content="summary">`,
    );
    if (share.description) {
      const d = esc(share.description);
      add.push(`<meta property="og:description" content="${d}">`);
      if (!/name="description"/.test(head)) add.push(`<meta name="description" content="${d}">`);
    }
  }

  return head + add.join("") + body;
}
