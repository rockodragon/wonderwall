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

import { brandForHost, GARDEN } from "../app/brand/brandConfig";
import { GARDEN_ROOT_FILES, gardenizeHtml } from "../app/brand/gardenHtml";

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}) => {
  const url = new URL(context.request.url);
  if (brandForHost(url.hostname) !== "garden") return context.next();

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
    const headers = new Headers(res.headers);
    headers.delete("content-length");
    return new Response(gardenizeHtml(html, url.origin), { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
