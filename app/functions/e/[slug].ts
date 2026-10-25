// /e/{slug} — an event's readable address (convex/eventSlug.ts). The page is
// served here, at this address, not redirected: the slug is looked up over
// plain HTTP, as functions/j/[id].ts does, and functions/events/[id].ts
// writes the same link-preview tags it writes for /events/{id}, with this
// address as og:url. routes/event.tsx answers both addresses in the app. An
// address nobody has gets the bare shell, and the page says "Event not
// found".

import { onRequestGet as eventPage } from "../events/[id]";

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
  CONVEX_URL?: string;
}

const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";

async function fetchEventId(convexUrl: string, slug: string): Promise<string | null> {
  const res = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "eventSlug:idForSlug", args: { slug }, format: "json" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: string; value?: unknown };
  return data?.status === "success" && typeof data.value === "string" ? data.value : null;
}

const handle = async (context: {
  request: Request;
  params: { slug: string | string[] };
  env: Env;
}): Promise<Response> => {
  const { request, params, env } = context;
  const raw = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  let id: string | null = null;
  try {
    if (raw) id = await fetchEventId(env.CONVEX_URL ?? CONVEX_URL, raw);
  } catch {
    // Convex unreachable: the shell still loads, and the page looks again.
  }
  if (id) return eventPage({ request, params: { id }, env });
  const shell = await env.ASSETS.fetch(new URL("/__spa-fallback", request.url));
  return new Response(await shell.text(), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, must-revalidate" },
  });
};

export const onRequestGet = handle;
export const onRequestHead = handle;
