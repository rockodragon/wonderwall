// /e/{slug} — an event's short address (convex/eventSlug.ts). Looks the slug
// up over plain HTTP, as functions/j/[id].ts does, and sends the visitor to
// /events/{id}, whose own function (functions/events/[id].ts) adds the link
// preview tags. An address nobody has goes to the events list.

interface Env {
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
    // Convex unreachable: the events list is still a correct place to land.
  }
  const to = new URL(id ? `/events/${encodeURIComponent(id)}` : "/events", request.url).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: to, "Cache-Control": "no-cache", "Referrer-Policy": "no-referrer" },
  });
};

export const onRequestGet = handle;
export const onRequestHead = handle;
