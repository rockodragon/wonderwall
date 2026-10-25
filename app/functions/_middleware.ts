// The Garden's brand at the edge (docs/features/garden-brand-domains.md).
// On a Garden domain every HTML page gets The Garden's title, icons and share
// picture before it leaves (app/brand/gardenHtml.ts), so link previews and
// crawlers see The Garden too, and the root icon paths browsers ask for on
// their own serve The Garden's files. "/" there is The Garden's page. Every other host passes straight
// through, untouched and unbuffered. public/_routes.json keeps static files
// from running this at all.
//
// It wraps everything, events/[id].ts and j/[id].ts included. Any failure
// here sends the page as it was: a branding slip must never take a page down.
//
// On every host, every response leaves with the site's headers
// (app/lib/siteHeaders.ts): public/_headers never reaches a Function's own
// response, so a page built here (/@handle, /events/:id, /e/:slug) would
// otherwise go out without nosniff, frame protection or "not AI training
// data".

import { brandForHost, GARDEN } from "../app/brand/brandConfig";
import { GARDEN_ROOT_FILES, gardenizeHtml, needsShareTags, shareDescription } from "../app/brand/gardenHtml";
import { isAiTrainingCrawler } from "../app/lib/aiCrawlers";
import { withSiteHeaders } from "../app/lib/siteHeaders";

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
  CONVEX_URL?: string;
}

const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";

/** The Garden's host-tools words for a link preview, over plain HTTP as
 *  events/[id].ts does. Nothing if Convex is slow or down: the preview then
 *  has the name and the disc only. */
async function gardenDescription(env: Env): Promise<string | undefined> {
  try {
    const res = await fetch(`${env.CONVEX_URL ?? CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "garden/communityDomains:getCommunityLanding",
        args: { slug: GARDEN.communitySlug },
        format: "json",
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { value?: { description?: string | null; tagline?: string | null } | null };
    return shareDescription(data?.value ?? null);
  } catch {
    return undefined;
  }
}

type Context = {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
};

export const onRequest = async (context: Context) => withSiteHeaders(await handle(context));

const handle = async (context: Context): Promise<Response> => {
  // An AI training crawler that ignores robots.txt but names itself is
  // turned away on every host (app/lib/aiCrawlers.ts).
  if (isAiTrainingCrawler(context.request.headers.get("user-agent"))) {
    return new Response("Members' work here is not AI training data.\n", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const url = new URL(context.request.url);
  if (brandForHost(url.hostname) !== "garden") return context.next();
  // The embed card brands itself by host (functions/embed/[handle].ts) and
  // lives in someone else's page: no head to rewrite, no Convex lookup for a
  // link preview on every view.
  if (url.pathname.startsWith("/embed/")) return context.next();

  const rootFile = GARDEN_ROOT_FILES[url.pathname];
  if (rootFile) {
    const file = await context.env.ASSETS.fetch(new URL(`${GARDEN.icons}/${rootFile}`, url));
    if (file.ok) return file;
  }

  // The front door there is The Garden's page (routes/home.tsx), so "/"
  // gets the plain app shell, not the Exchange home prerendered into it.
  const res =
    url.pathname === "/"
      ? await context.env.ASSETS.fetch(new URL("/__spa-fallback", url))
      : await context.next();
  if (!(res.headers.get("content-type") ?? "").includes("text/html")) return res;
  try {
    const html = await res.clone().text();
    const share = needsShareTags(html)
      ? { url: url.origin + url.pathname, description: await gardenDescription(context.env) }
      : undefined;
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(gardenizeHtml(html, url.origin, share), { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
