// W2 SPIKE — public event pages with real OG tags, no SSR (spec §5).
// Pattern: CF Pages Function fetches the prerendered SPA shell from static
// assets (env.ASSETS), queries Convex over plain HTTP (no WebSocket — this is
// the whole point; sidesteps the Workers incompatibility), swaps the head
// tags, returns hydratable HTML. Client router takes over on load.
//
// PROMOTED to functions/ (2026-08-13) — deploys with the site. Local test:
//   cp -R functions-spike functions && npx wrangler pages dev ./build/client
// Promotion to production = rename to functions/ in a reviewed commit (W2),
// with the signup-deep-link regression test alongside (the SPA-fallback
// lesson: anything near routing gets verified live immediately).

import { injectShareHead } from "../../app/lib/shareHead";

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
  CONVEX_URL?: string;
}

const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";

async function fetchEvent(convexUrl: string, eventId: string) {
  const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "events:get", args: { eventId }, format: "json" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; value?: any };
  return data?.value ?? null;
}

// The head tags themselves are app/lib/shareHead.ts (injectShareHead), shared
// with functions/[handle].ts.

export const onRequestGet = async (context: {
  request: Request;
  params: { id: string };
  env: Env;
}): Promise<Response> => {
  const { request, params, env } = context;

  // Statically prerendered event pages (e.g. first-table) pass through untouched.
  const passThrough = await env.ASSETS.fetch(request);
  if (passThrough.status === 200 && !params.id.match(/^[a-z0-9]{25,40}$/)) {
    return passThrough;
  }

  // The SPA shell, not "/": that's the prerendered home page, and hydrating
  // it as an event page throws React #418 (react-router.config.ts buildEnd).
  const shellRes = await env.ASSETS.fetch(new URL("/__spa-fallback", request.url));
  const shell = await shellRes.text();

  let event: any = null;
  try {
    event = await fetchEvent(env.CONVEX_URL ?? CONVEX_URL, params.id);
  } catch {
    // Convex unreachable or invalid id — serve the shell; client router handles it.
  }

  // The uploaded cover, else the still of a pasted reel/TikTok (both Convex
  // storage URLs from events:get), is the link's picture: the cover wins on
  // every card and page, so it wins here too.
  const image = event?.coverImageUrl ?? event?.mediaPreviewUrl;
  const html = event
    ? injectShareHead(shell, {
        title: `${event.title} — TheCreative.exchange`,
        description: (event.description ?? "").slice(0, 200) || "A community event.",
        url: request.url,
        image: typeof image === "string" && /^https:\/\//.test(image) ? image : undefined,
      })
    : shell;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
};
