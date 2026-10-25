// Link-preview tags written into the SPA shell's <head> at the edge
// (functions/events/[id].ts, functions/[handle].ts). A crawler or unfurler
// runs no JavaScript, so what it reads has to be in the HTML itself. The
// shell's own title, OG and description tags go; these take their place.
// Pure string edits on the head, as app/brand/gardenHtml.ts does.

export interface ShareTags {
  title: string;
  description: string;
  url: string;
  /** An https picture, or nothing: a card with no picture beats a broken one. */
  image?: string;
  /** OpenGraph's kind of thing: an event is a "website", a person a "profile". */
  type?: "website" | "profile";
  /** The one address for this page, when it answers at several. */
  canonical?: string;
  /** The page asks search engines to leave it out ("Hide my profile from
   * search engines"). */
  noindex?: boolean;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function injectShareHead(html: string, tags: ShareTags): string {
  const t = escapeHtml(tags.title);
  const d = escapeHtml(tags.description);
  const block = [
    `<title>${t}</title>`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:type" content="${tags.type ?? "website"}">`,
    `<meta property="og:url" content="${escapeHtml(tags.url)}">`,
    ...(tags.image ? [`<meta property="og:image" content="${escapeHtml(tags.image)}">`] : []),
    // The small card: the picture as a thumbnail beside the title. Event
    // covers are 4:5 portraits (docs/features/cover-4x5.md), and the large
    // card crops them to a wide strip through the middle, often through the
    // poster's own type. Small is fine (Rick, 2026-10-03); a face is square.
    `<meta name="twitter:card" content="summary">`,
    `<meta name="description" content="${d}">`,
    ...(tags.canonical ? [`<link rel="canonical" href="${escapeHtml(tags.canonical)}">`] : []),
    ...(tags.noindex ? [`<meta name="robots" content="noindex">`] : []),
  ].join("\n");
  // Strip the shell's own title/OG/description tags, then inject ours.
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta (?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>/g, "");
  return stripped.replace("</head>", `${block}\n</head>`);
}
