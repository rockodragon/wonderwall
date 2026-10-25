// /@handle — a person's public page with real link-preview tags, no SSR: the
// pattern of functions/events/[id].ts. Fetch the SPA shell from static
// assets, ask Convex over plain HTTP (profiles:getProfileByHandle), swap the
// head tags — the name, the first line of the bio, the photo — and return
// hydratable HTML the client router takes over (routes/slug.tsx).
//
// Cloudflare Pages matches whole segments, so this file sees every
// single-segment address (/today, /showcase, /sd …). Anything not starting
// with "@" is handed on with next(), which serves it exactly as if this file
// weren't here: a prerendered page, or the SPA shell by the "/* /index.html
// 200" rule — the same path functions/_middleware.ts already takes for every
// page on a Garden domain. The middleware runs first on every host and turns
// AI training crawlers away.
//
// An old address (convex/handles.ts, HANDLE_FORWARD_DAYS) and a founder
// alias (convex/heldHandles.ts HANDLE_ALIASES: /@rick) answer with the
// person's current one, so crawlers and people are sent there. "Hide my
// profile from search engines" adds noindex, in the head and as a header.

import { cleanHandle, handleProblem, profilePath } from "../convex/handleRules";
import { CONVEX_URL, convexQuery } from "../app/lib/convexHttp";
import { canonicalProfileUrl, profileDescription, profileTitle } from "../app/lib/profileHead";
import { injectShareHead } from "../app/lib/shareHead";

interface Env {
  ASSETS: { fetch: (req: Request | URL) => Promise<Response> };
  CONVEX_URL?: string;
}

/** The fields the head needs, of profiles:getProfileByHandle's answer. */
interface SharedProfile {
  name: string;
  handle?: string;
  bio?: string;
  interests?: string[];
  location?: string;
  imageUrl?: string | null;
  hideFromSearch?: boolean;
  /** An active member of The Garden: canonical under createthegarden.com. */
  inGarden?: boolean;
}

/** Throws when Convex can't be asked (lib/convexHttp.ts); the caller then
 * serves the shell alone. */
async function fetchProfile(convexUrl: string, handle: string): Promise<SharedProfile | null> {
  const profile = await convexQuery<SharedProfile>(convexUrl, "profiles:getProfileByHandle", { handle });
  return profile && typeof profile.name === "string" ? profile : null;
}

/** "@Ana" or "%40ana" → "ana"; null when the segment isn't an address at all. */
export function handleFromSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  const at = segment.startsWith("@") ? segment.slice(1) : segment.startsWith("%40") ? segment.slice(3) : null;
  if (at === null) return null;
  try {
    return cleanHandle(decodeURIComponent(at));
  } catch {
    return cleanHandle(at);
  }
}

const NO_CACHE = "no-cache, must-revalidate";
/** public/_headers doesn't reach a Function's response, so "not AI training
 * data" (app/lib/aiCrawlers.ts) is said here too. */
const ROBOTS_TAG = "noai, noimageai";

export const onRequestGet = async (context: {
  request: Request;
  params: { handle: string | string[] };
  env: Env;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const { request, params, env } = context;
  const segment = Array.isArray(params.handle) ? params.handle[0] : params.handle;
  const handle = handleFromSegment(segment);
  if (handle === null) return context.next();

  const url = new URL(request.url);
  // The SPA shell, not "/": that's the prerendered home page, and hydrating
  // it as another page throws React #418 (react-router.config.ts buildEnd).
  const shellRes = await env.ASSETS.fetch(new URL("/__spa-fallback", url));
  const shell = await shellRes.text();

  let profile: SharedProfile | null = null;
  // An address that breaks the rules is nobody's: no need to ask.
  if (!handleProblem(handle)) {
    try {
      profile = await fetchProfile(env.CONVEX_URL ?? CONVEX_URL, handle);
    } catch {
      // Convex unreachable: the shell alone; the client shows the page or the 404.
    }
  }

  if (profile?.handle && profile.handle !== handle) {
    // An old address or a founder alias: the current one. 302, not 301 —
    // the forward lasts HANDLE_FORWARD_DAYS and the person may take the old
    // address back, and an alias follows wherever its person's address goes.
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL(profilePath(profile.handle) + url.search, url).toString(),
        "Cache-Control": NO_CACHE,
      },
    });
  }

  const hidden = !!profile?.hideFromSearch;
  const image = profile?.imageUrl;
  const html = profile
    ? injectShareHead(shell, {
        title: profileTitle(profile.name, profile.handle ?? handle),
        description: profileDescription(profile),
        url: `${url.origin}${profilePath(profile.handle ?? handle)}`,
        image: typeof image === "string" && /^https:\/\//.test(image) ? image : undefined,
        type: "profile",
        canonical: canonicalProfileUrl(profile.handle ?? handle, profile.inGarden),
        noindex: hidden,
      })
    : shell;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": NO_CACHE,
      "X-Robots-Tag": hidden ? `noindex, ${ROBOTS_TAG}` : ROBOTS_TAG,
    },
  });
};
