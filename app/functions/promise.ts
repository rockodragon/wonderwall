// /promise — Our promise to creatives (app/routes/promise.tsx). The page lives
// in the app shell, which isn't prerendered, so a link preview would read the
// bare shell: no title, no words. This serves the same shell with the page's
// own title and description written into its head (app/lib/shareHead.ts), as
// functions/events/[id].ts does for an event. The words are
// app/constants/promises.ts PROMISE_PAGE. On a Garden domain the middleware
// then swaps in The Garden's name and picture (app/brand/gardenHtml.ts).

import { PROMISE_PAGE, PROMISE_PATH } from "../app/constants/promises";
import { injectShareHead } from "../app/lib/shareHead";

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
}

const handle = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const origin = new URL(request.url).origin;
  // The SPA shell, not "/": that's the prerendered home page, and hydrating
  // it as another page throws React #418 (react-router.config.ts buildEnd).
  const shell = await (await env.ASSETS.fetch(new URL("/__spa-fallback", request.url))).text();
  const html = injectShareHead(shell, {
    title: PROMISE_PAGE.title,
    description: PROMISE_PAGE.description,
    url: `${origin}${PROMISE_PATH}`,
    image: `${origin}/og-image.png`,
  });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
};

export const onRequestGet = handle;
export const onRequestHead = handle;
