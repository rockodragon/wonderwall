// Turning a pasted watch link into something a page can show.
//
// This is the ONE place the app decides "is this a video link, and how do I
// show it?" — the composer's auto-detect, the work page, the works grid, the
// profile grid, the project page, the rich-content video block and the
// server's preview scheduling all call toEmbedUrl. Adding a provider is one
// branch here, not a regex in six files. It lives on the server side so
// convex/artifacts.ts can use it too, and reaches the client through the
// app/app/lib/videoEmbed.ts re-export shim (same convention as richText.ts).
//
// It is display-side only. It never fetches, never widens who can see a
// URL, and it is only ever handed a URL the caller already decided this
// viewer is allowed to have (docs/gated-event-video-prd.md, "Gating rule").
//
// YouTube, Vimeo, Instagram and TikTok embed. A reel or a TikTok plays in the
// platform's own player, inside our page, with our Follow/Back/story around
// it (docs/features/creator-media-cross-post.md) — the viewer never leaves.
// Zoom and Google Meet send X-Frame-Options/frame-ancestors headers that make
// an <iframe> render an empty box with a console error and no visible
// failure, so they must keep the link-out button. Anything unrecognised gets
// the same treatment — unknown hosts fail closed to "open in a new tab",
// which always works.

export type EmbedKind = "youtube" | "vimeo" | "instagram" | "tiktok";

/** Reels, TikToks and Shorts are portrait; everything else is landscape. */
export type EmbedAspect = "16/9" | "9/16";

export interface VideoEmbed {
  kind: EmbedKind;
  embedUrl: string;
  aspect: EmbedAspect;
  /** The same video with share tokens (`?stkn=`, `?igsh=`, `&t=90s`),
      tracking params and mobile hosts stripped — what gets stored, so two
      people pasting the same reel store the same string. */
  canonicalUrl: string;
  /** A still for a card when the provider serves one without a key
      (YouTube). Undefined otherwise; callers fall back to the artifact's
      `ogImageUrl`, which the server fills for TikTok. */
  thumbnailUrl?: string;
}

/** What a card or a tile calls the provider. */
export const EMBED_PROVIDER_LABEL: Record<EmbedKind, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  instagram: "Instagram",
  tiktok: "TikTok",
};

// Every id is interpolated into a URL, so each is matched against an
// allowlist of characters rather than merely "does not look dangerous".
// YouTube ids are conventionally 11 chars of [A-Za-z0-9_-]; the length bound
// is loose (they have changed before) but the character class is not, so
// nothing that could close the path, open a query, or start a new attribute
// ever gets through. The same discipline applies to the other three.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,24}$/;
const VIMEO_ID = /^[0-9]{6,15}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,20}$/;
const TIKTOK_ID = /^[0-9]{15,22}$/;
const TIKTOK_USER = /^@[A-Za-z0-9_.]{1,30}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "player.vimeo.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "m.instagram.com"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "m.tiktok.com"]);
// TikTok's in-app "Copy link" on Android hands out vm.tiktok.com/XXXX, a
// redirect the browser can't follow cross-origin. The server can (see
// convex/linkPreview.ts), so these are recognised as "TikTok, not yet
// resolved" rather than treated as an unknown host.
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/** Path split with empty segments dropped, so a trailing slash or a doubled
 * slash doesn't shift the position of the id. */
function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Exact host match after dropping a single leading `www.`. Substring or
 * endsWith matching here would accept `youtube.com.evil.example`. */
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function parseHttpUrl(rawUrl: string | undefined): URL | null {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // `javascript:`, `data:` and friends parse as perfectly valid URLs — the
  // scheme check is what keeps them out, not the parse.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url;
}

// ————— YouTube —————

function youtube(url: URL): VideoEmbed | null {
  const host = normalizeHost(url.hostname);
  const parts = segments(url.pathname);
  let id: string | null = null;
  let short = false;

  if (host === "youtu.be") {
    // youtu.be/ID — the id is the whole path.
    id = parts[0] ?? null;
  } else if (parts[0] === "watch") {
    // youtube.com/watch?v=ID (extra params like &t=90s are simply ignored).
    id = url.searchParams.get("v");
  } else if (
    (parts[0] === "live" || parts[0] === "embed" || parts[0] === "shorts") &&
    parts.length >= 2
  ) {
    // youtube.com/live/ID, youtube.com/shorts/ID and youtube.com/embed/ID
    // (already an embed URL — normalizing it is still worth doing, it may be
    // a nocookie or m. host). A Short is the same player, portrait.
    id = parts[1];
    short = parts[0] === "shorts";
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    kind: "youtube",
    embedUrl: `https://www.youtube.com/embed/${id}`,
    aspect: short ? "9/16" : "16/9",
    canonicalUrl: short
      ? `https://www.youtube.com/shorts/${id}`
      : `https://www.youtube.com/watch?v=${id}`,
    // mqdefault (320x180) — 16:9 without letterbox bars for a normal video.
    thumbnailUrl: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
  };
}

// ————— Vimeo —————

function vimeo(url: URL): VideoEmbed | null {
  const parts = segments(url.pathname);
  let id: string | null = null;
  // player.vimeo.com/video/ID — already an embed URL.
  if (parts[0] === "video" && parts.length >= 2) id = parts[1];
  // vimeo.com/ID. Anything else on the host (/channels/…, /user123/…, a
  // vanity slug) is not a plain video URL and is left alone.
  else if (parts.length === 1) id = parts[0];

  if (!id || !VIMEO_ID.test(id)) return null;
  return {
    kind: "vimeo",
    embedUrl: `https://player.vimeo.com/video/${id}`,
    aspect: "16/9",
    canonicalUrl: `https://vimeo.com/${id}`,
  };
}

// ————— Instagram —————

// /reel/, /p/ and /tv/ are the three permalink shapes; /reels/ shows up in
// some copied links and means the same as /reel/.
const INSTAGRAM_KINDS: Record<string, "reel" | "p" | "tv"> = {
  reel: "reel",
  reels: "reel",
  p: "p",
  tv: "tv",
};

function instagram(url: URL): VideoEmbed | null {
  const parts = segments(url.pathname);
  let kind: "reel" | "p" | "tv" | undefined;
  let code: string | undefined;

  if (parts.length >= 2 && INSTAGRAM_KINDS[parts[0]]) {
    // instagram.com/reel/CODE — the form the web "Copy link" gives.
    kind = INSTAGRAM_KINDS[parts[0]];
    code = parts[1];
  } else if (parts.length >= 3 && INSTAGRAM_KINDS[parts[1]]) {
    // instagram.com/USERNAME/reel/CODE — the form the app's Share sheet
    // hands out. The username is dropped: the code alone identifies it.
    kind = INSTAGRAM_KINDS[parts[1]];
    code = parts[2];
  }

  if (!kind || !code || !INSTAGRAM_CODE.test(code)) return null;
  const canonicalUrl = `https://www.instagram.com/${kind}/${code}/`;
  return {
    kind: "instagram",
    // The captioned variant carries the creative's own caption, so nobody
    // retypes it. The `?stkn=`/`?igsh=` share tokens never reach here.
    embedUrl: `${canonicalUrl}embed/captioned/`,
    aspect: "9/16",
    canonicalUrl,
  };
}

// ————— TikTok —————

function tiktok(url: URL): VideoEmbed | null {
  const parts = segments(url.pathname);
  let id: string | undefined;
  let user: string | undefined;

  if (parts.length >= 3 && parts[0].startsWith("@") && parts[1] === "video") {
    // tiktok.com/@user/video/ID — the permalink. (/@user/photo/ID is a
    // photo carousel, not a video, and is left alone.)
    user = parts[0];
    id = parts[2];
  } else if (
    parts.length >= 3 &&
    ((parts[0] === "embed" && parts[1] === "v2") ||
      (parts[0] === "player" && parts[1] === "v1"))
  ) {
    // Already an embed URL.
    id = parts[2];
  }

  if (!id || !TIKTOK_ID.test(id)) return null;
  const embedUrl = `https://www.tiktok.com/player/v1/${id}`;
  return {
    kind: "tiktok",
    embedUrl,
    aspect: "9/16",
    // A username that fails the character class is dropped rather than
    // stored; the player URL identifies the video on its own.
    canonicalUrl:
      user && TIKTOK_USER.test(user)
        ? `https://www.tiktok.com/${user}/video/${id}`
        : embedUrl,
  };
}

// ————— the resolver —————

/**
 * The embeddable form of a watch URL, or null if it isn't one.
 *
 * Returning null is the normal, expected answer for Zoom, Meet, Daily and
 * every other link — the caller renders its link-out button. It is never an
 * error condition.
 */
export function toEmbedUrl(rawUrl: string | undefined): VideoEmbed | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;
  const host = normalizeHost(url.hostname);

  if (YOUTUBE_HOSTS.has(host)) return youtube(url);
  if (VIMEO_HOSTS.has(host)) return vimeo(url);
  if (INSTAGRAM_HOSTS.has(host)) return instagram(url);
  if (TIKTOK_HOSTS.has(host)) return tiktok(url);
  return null;
}

/**
 * True for a TikTok short link (vm.tiktok.com/…, tiktok.com/t/…) that has to
 * be followed server-side before toEmbedUrl can read it. Display code treats
 * these as an ordinary link until convex/linkPreview.ts has swapped in the
 * permalink.
 */
export function isTikTokShortLink(rawUrl: string | undefined): boolean {
  const url = parseHttpUrl(rawUrl);
  if (!url) return false;
  const host = normalizeHost(url.hostname);
  if (TIKTOK_SHORT_HOSTS.has(host)) return true;
  if (TIKTOK_HOSTS.has(host)) {
    const parts = segments(url.pathname);
    return parts.length >= 2 && parts[0] === "t";
  }
  return false;
}
