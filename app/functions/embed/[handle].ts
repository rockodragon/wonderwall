// /embed/@handle — a small card of a creative's profile, for a frame on
// their own website (the share kit's "Card", components/ProfileShareKit.tsx).
// Static HTML from the edge: no app, no JavaScript, the styles in the page,
// so it stays light on someone else's site. Read the way /@handle is
// (functions/[handle].ts): profiles:getProfileByHandle over Convex's HTTP
// query API, then the projects the profile page shows
// (garden/projectTeam:listAffiliations, public and signed out).
//
// Headers: public/_headers doesn't reach a Function's response, so this sets
// its own. Any site may frame it (frame-ancestors *, no X-Frame-Options); the
// rest of the site still says DENY. noindex, because the card repeats the
// profile, which is the page to find, on top of "not AI training data"
// (app/lib/aiCrawlers.ts). functions/_middleware.ts runs first and turns AI
// training crawlers away here too.
//
// Everything a person wrote is escaped (escapeHtml), and pictures are the
// /media addresses Convex gives (lib/profileShare.ts shownImageUrl).

import { handleProblem } from "../../convex/handleRules";
import { CONVEX_URL, convexQuery } from "../../app/lib/convexHttp";
import { SITE_ORIGIN } from "../../app/lib/eventCalendar";
import { initialsOf } from "../../app/lib/initials";
import { profileLink, recentWorks, shownImageUrl, type PieceRow, type ProjectRow, type Work } from "../../app/lib/profileShare";
import { escapeHtml } from "../../app/lib/shareHead";
import { handleFromSegment } from "../[handle]";

interface Env {
  CONVEX_URL?: string;
}

/** The fields the card needs, of profiles:getProfileByHandle's answer. */
interface EmbedProfile {
  _id: string;
  name: string;
  handle?: string;
  interests?: string[];
  location?: string;
  imageUrl?: string | null;
  artifacts?: PieceRow[];
}

/** Two rows of three. */
export const EMBED_WORKS = 6;

/** The page loads pictures and nothing else: no scripts, no fonts, no forms. */
export const EMBED_CSP =
  "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *";

/** A few minutes: a new piece shows up soon, and a busy page doesn't ask
 *  Convex on every view. */
const FOUND_CACHE = "public, max-age=300";
const NOT_FOUND_CACHE = "public, max-age=60";

function headers(cacheControl: string): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": cacheControl,
    "Content-Security-Policy": EMBED_CSP,
    "X-Robots-Tag": "noindex, noai, noimageai",
    "tdm-reservation": "1",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

// Colors are public/tokens.css: paper and ink, the light theme's hairline and
// dim text, citron for the one action. Light unless the page around the frame
// is dark (prefers-color-scheme follows the embedding page in a frame).
const CSS = `
*{box-sizing:border-box;margin:0}
html,body{background:transparent}
body{font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%}
.card{--bg:#f7f7f4;--line:#e2e2d8;--text:#121212;--dim:#6b6b62;--tile:#e3e3d6;max-width:480px;margin:0 auto;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--text)}
@media (prefers-color-scheme:dark){.card{--bg:#121212;--line:#2a2a28;--text:#f7f7f4;--dim:#94948c;--tile:#1c1c19}}
.who{display:flex;align-items:center;gap:12px}
.face{flex:none;width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--tile)}
.initials{display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--dim)}
.id{min-width:0}
.name{font-size:17px;font-weight:700;line-height:1.25}
.name,.meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meta{font-size:13px;color:var(--dim)}
.works{list-style:none;margin-top:14px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.works a{display:block;aspect-ratio:1;overflow:hidden;border-radius:8px;background:var(--tile)}
.works img{display:block;width:100%;height:100%;object-fit:cover}
.foot{margin-top:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.cta{display:inline-block;padding:9px 14px;border-radius:10px;background:#fee268;color:#121212;font-size:14px;font-weight:600;text-decoration:none}
.cta:hover{background:#ffea94}
a:focus-visible{outline:2px solid var(--text);outline-offset:2px}
.site{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dim)}
.site svg{width:16px;height:16px}
`;

/** The Exchange mark (public/favicon.svg), in the card's text color. */
const MARK =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="20" y="3" width="8" height="42" rx="4" fill="currentColor" transform="rotate(-18 24 24)"/>' +
  '<rect x="20" y="3" width="8" height="42" rx="4" fill="#fee268" transform="rotate(18 24 24)"/></svg>';

const SITE = `<span class="site">${MARK}TheCreative.exchange</span>`;

/** color-scheme "light dark": a browser paints a frame whose scheme differs
 *  from the page around it on an opaque backdrop. Declaring both lets the
 *  frame take the embedding page's scheme and stay see-through around the
 *  card's rounded corners. */
function page(title: string, body: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>` +
    `<style>${CSS}</style></head><body>${body}</body></html>`
  );
}

/** A card with a line or two and no person: nobody has the address, or
 *  Convex couldn't be asked. */
function noticeCard(heading: string, line: string): string {
  return page(
    `${heading} — TheCreative.exchange`,
    `<main class="card"><p class="name">${escapeHtml(heading)}</p><p class="meta">${escapeHtml(line)}</p>` +
      `<div class="foot">${SITE}</div></main>`,
  );
}

const link = (href: string, inner: string, cls = "") =>
  `<a${cls ? ` class="${cls}"` : ""} href="${escapeHtml(href)}" target="_blank" rel="noopener">${inner}</a>`;

/** The card: photo, name, what they do and where, recent works, and the way
 *  to the whole portfolio. */
export function renderEmbedCard(profile: EmbedProfile, handle: string, works: readonly Work[]): string {
  const name = profile.name.trim() || `@${handle}`;
  const photo = shownImageUrl(profile.imageUrl);
  const face = photo
    ? `<img class="face" src="${escapeHtml(photo)}" alt="" width="56" height="56">`
    : `<span class="face initials" aria-hidden="true">${escapeHtml(initialsOf(name))}</span>`;
  const disciplines = (profile.interests ?? []).slice(0, 3).join(" · ");
  const lines = [disciplines, profile.location?.trim()]
    .filter((l): l is string => !!l)
    .map((l) => `<p class="meta">${escapeHtml(l)}</p>`)
    .join("");

  const portfolio = profileLink(handle, "embed");
  const tiles = works
    .slice(0, EMBED_WORKS)
    .map((w) => {
      const href = w.projectId ? `${SITE_ORIGIN}/projects/${encodeURIComponent(w.projectId)}?ref=embed` : portfolio;
      const alt = w.title ?? `Work by ${name}`;
      const img = `<img src="${escapeHtml(w.imageUrl)}" alt="${escapeHtml(alt)}" width="150" height="150" loading="lazy" decoding="async">`;
      return `<li>${link(href, img)}</li>`;
    })
    .join("");

  return page(
    `${name} on TheCreative.exchange`,
    `<main class="card"><div class="who">${face}<div class="id"><h1 class="name">${escapeHtml(name)}</h1>${lines}</div></div>` +
      (tiles ? `<ul class="works">${tiles}</ul>` : "") +
      `<div class="foot">${link(portfolio, "See my portfolio", "cta")}${SITE}</div></main>`,
  );
}

type Context = {
  request: Request;
  params: { handle?: string | string[] };
  env: Env;
};

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { params, env } = context;
  const segment = Array.isArray(params.handle) ? params.handle[0] : params.handle;
  const handle = handleFromSegment(segment);
  const notFound = () =>
    new Response(noticeCard("Not found", "There's no profile at this address."), {
      status: 404,
      headers: headers(NOT_FOUND_CACHE),
    });
  // An address that breaks the rules is nobody's: no need to ask.
  if (handle === null || handleProblem(handle)) return notFound();

  const convexUrl = env.CONVEX_URL ?? CONVEX_URL;
  let profile: EmbedProfile | null;
  try {
    profile = await convexQuery<EmbedProfile>(convexUrl, "profiles:getProfileByHandle", { handle });
  } catch {
    return new Response(noticeCard("Can't show this right now", "Try again in a few minutes."), {
      status: 503,
      headers: headers("no-store"),
    });
  }
  if (!profile || typeof profile.name !== "string") return notFound();

  // The works the profile page shows; without them the card still shows the
  // person and the way to their page.
  let projects: ProjectRow[] | null = null;
  try {
    projects = await convexQuery<ProjectRow[]>(convexUrl, "garden/projectTeam:listAffiliations", {
      profileId: profile._id,
    });
  } catch {
    projects = null;
  }

  // An old address answers with the person's current one (handles.ts).
  const current = profile.handle ?? handle;
  const works = recentWorks(projects, profile.artifacts, EMBED_WORKS);
  return new Response(renderEmbedCard(profile, current, works), { status: 200, headers: headers(FOUND_CACHE) });
};

export const onRequestHead = async (context: Context): Promise<Response> => {
  const res = await onRequestGet(context);
  return new Response(null, { status: res.status, headers: res.headers });
};
