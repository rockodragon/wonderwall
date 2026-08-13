// W2 SPIKE — public event pages with real OG tags, no SSR (spec §5).
// Pattern: CF Pages Function fetches the prerendered SPA shell from static
// assets (env.ASSETS), queries Convex over plain HTTP (no WebSocket — this is
// the whole point; sidesteps the Workers incompatibility), swaps the head
// tags, returns hydratable HTML. Client router takes over on load.
//
// LIVES IN functions-spike/ so it does NOT auto-deploy. To activate locally:
//   cp -R functions-spike functions && npx wrangler pages dev ./build/client
// Promotion to production = rename to functions/ in a reviewed commit (W2),
// with the signup-deep-link regression test alongside (the SPA-fallback
// lesson: anything near routing gets verified live immediately).

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
  CONVEX_URL?: string;
}

const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

function injectHead(html: string, tags: { title: string; description: string; url: string }) {
  const t = esc(tags.title);
  const d = esc(tags.description);
  const block = [
    `<title>${t}</title>`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${esc(tags.url)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="description" content="${d}">`,
  ].join("\n");
  // Strip the shell's own title/OG/description tags, then inject ours.
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta (?:property="og:[^"]*"|name="twitter:[^"]*"|name="description")[^>]*>/g, "");
  return stripped.replace("</head>", `${block}\n</head>`);
}

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

  const shellRes = await env.ASSETS.fetch(new URL("/", request.url));
  const shell = await shellRes.text();

  let event: any = null;
  try {
    event = await fetchEvent(env.CONVEX_URL ?? CONVEX_URL, params.id);
  } catch {
    // Convex unreachable or invalid id — serve the shell; client router handles it.
  }

  const html = event
    ? injectHead(shell, {
        title: `${event.title} — TheCrossBoard`,
        description: (event.description ?? "").slice(0, 200) || "A community event.",
        url: request.url,
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
