// The headers every page on the site carries: public/_headers' /* rule.
// Cloudflare applies that file to static files only, never to a Pages
// Function's own response (/@handle, /events/:id, /e/:slug, /embed/…), so
// functions/_middleware.ts adds whichever of these a response is missing.
// siteHeaders.test.ts keeps this list and public/_headers in step.

/** public/_headers' /* rule, header by header. */
export const SITE_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // "Not AI training data" (lib/aiCrawlers.ts): noai/noimageai for dataset
  // tools, tdm-reservation for the EU text-and-data-mining opt-out.
  "X-Robots-Tag": "noai, noimageai",
  "tdm-reservation": "1",
};

/** The response with every site header it lacks. What it already says wins:
 *  a page that asks for noindex keeps it and gains noai; a page that allows
 *  framing on purpose (a CSP frame-ancestors, as the embed card sends) gets
 *  no X-Frame-Options. The body is passed through, not read. */
export function withSiteHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [name, value] of Object.entries(SITE_HEADERS)) {
    const current = headers.get(name);
    if (name === "X-Robots-Tag") {
      headers.set(name, mergeTokens(current, value));
    } else if (name === "X-Frame-Options") {
      if (!current && !/frame-ancestors/i.test(headers.get("Content-Security-Policy") ?? "")) headers.set(name, value);
    } else if (!current) {
      headers.set(name, value);
    }
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** "noindex" + "noai, noimageai" → "noindex, noai, noimageai": each token once. */
function mergeTokens(current: string | null, add: string): string {
  const tokens = (current ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  for (const t of add.split(",").map((s) => s.trim())) {
    if (!tokens.some((have) => have.toLowerCase() === t.toLowerCase())) tokens.push(t);
  }
  return tokens.join(", ");
}
