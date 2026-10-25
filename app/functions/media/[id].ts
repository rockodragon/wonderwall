// Stored files, served from our own domain (convex/images.ts servedFileUrl).
// Pictures used to load straight from Convex's domain, where none of our
// protections reach: AI training crawlers could fetch them freely and our
// headers never applied. Through here every file passes the crawler check in
// functions/_middleware.ts, carries the same "not training data" headers as
// our pages (public/_headers doesn't apply to a function's response, so they
// are set here), and is cached at Cloudflare's edge, so a popular picture
// costs Convex bandwidth about once a day instead of once a view.
//
// Cached for a day: a file someone deletes stops resolving at Convex at once
// and drops out of every cache within a day.

interface Env {
  CONVEX_URL?: string;
}

const CONVEX_URL = "https://courteous-rabbit-750.convex.cloud";
// The key in Convex's file address (/api/storage/<key>).
const FILE_KEY = /^[A-Za-z0-9-]{8,100}$/;
const DAY_SECONDS = 60 * 60 * 24;
const PASSED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

function served(origin: Response, cacheable: boolean): Response {
  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = origin.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", cacheable ? `public, max-age=${DAY_SECONDS}` : "no-store");
  headers.set("X-Robots-Tag", "noai, noimageai");
  headers.set("tdm-reservation", "1");
  headers.set("X-Content-Type-Options", "nosniff");
  // Same as Convex's own file responses, so a page on another of our domains
  // (The Garden's) can draw them on a canvas.
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(origin.body, { status: origin.status, headers });
}

function edgeCache(): Cache | undefined {
  return typeof caches === "undefined" ? undefined : (caches as unknown as { default: Cache }).default;
}

export const onRequest = async (context: {
  request: Request;
  env: Env;
  params: { id?: string | string[] };
  waitUntil: (promise: Promise<unknown>) => void;
}) => {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const key = context.params.id;
  if (typeof key !== "string" || !FILE_KEY.test(key)) return new Response("Not found", { status: 404 });
  const origin = `${context.env.CONVEX_URL ?? CONVEX_URL}/api/storage/${key}`;

  // Video and audio seek with Range requests. The cache can't hold a partial
  // reply, so those go straight through.
  const range = request.headers.get("range");
  if (range) {
    const res = await fetch(origin, { headers: { range } });
    return res.ok ? served(res, false) : new Response("Not found", { status: res.status === 404 ? 404 : 502 });
  }

  const cache = edgeCache();
  const cacheKey = new Request(new URL(`/media/${key}`, request.url).toString());
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

  const res = await fetch(origin);
  if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
  const out = served(res, true);
  if (cache) context.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
};
