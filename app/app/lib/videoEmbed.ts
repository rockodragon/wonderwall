// Turning an organizer-pasted watch link into a frameable player URL.
//
// This is display-side only. It never fetches, never widens who can see a
// URL, and it is only ever handed a URL that api.eventVideo.get already
// decided this viewer is allowed to have (docs/gated-event-video-prd.md,
// "Gating rule"). Feeding it a URL a viewer shouldn't hold would be a bug
// at the call site, not here.
//
// Only YouTube and Vimeo embed. Zoom and Google Meet send
// X-Frame-Options/frame-ancestors headers that make an <iframe> render an
// empty box with a console error and no visible failure, so they must keep
// the link-out button. Anything unrecognised gets the same treatment —
// unknown hosts fail closed to "open in a new tab", which always works.

export type EmbedKind = "youtube" | "vimeo";

export interface VideoEmbed {
  kind: EmbedKind;
  embedUrl: string;
}

// The id is interpolated into a URL, so it is matched against an allowlist of
// characters rather than merely "does not look dangerous". YouTube ids are
// conventionally 11 chars of [A-Za-z0-9_-]; the length bound is loose (they
// have changed before) but the character class is not, so nothing that could
// close the path, open a query, or start a new attribute ever gets through.
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,24}$/;
const VIMEO_ID = /^[0-9]{6,15}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "player.vimeo.com"]);

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

function youtubeId(url: URL): string | null {
  const host = normalizeHost(url.hostname);
  const parts = segments(url.pathname);

  // youtu.be/ID — the id is the whole path.
  if (host === "youtu.be") return parts[0] ?? null;

  // youtube.com/watch?v=ID (extra params like &t=90s are simply ignored).
  if (parts[0] === "watch") return url.searchParams.get("v");

  // youtube.com/live/ID and youtube.com/embed/ID (already an embed URL —
  // normalizing it is still worth doing, it may be a nocookie or m. host).
  if ((parts[0] === "live" || parts[0] === "embed") && parts.length >= 2) {
    return parts[1];
  }

  return null;
}

function vimeoId(url: URL): string | null {
  const parts = segments(url.pathname);
  // player.vimeo.com/video/ID — already an embed URL.
  if (parts[0] === "video" && parts.length >= 2) return parts[1];
  // vimeo.com/ID. Anything else on the host (/channels/…, /user123/…, a
  // vanity slug) is not a plain video URL and is left alone.
  if (parts.length === 1) return parts[0];
  return null;
}

/**
 * The embeddable form of a watch URL, or null if it isn't one.
 *
 * Returning null is the normal, expected answer for Zoom, Meet, Daily and
 * every other link — the caller renders its link-out button. It is never an
 * error condition.
 */
export function toEmbedUrl(rawUrl: string | undefined): VideoEmbed | null {
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

  const host = normalizeHost(url.hostname);

  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(url);
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(url);
    if (!id || !VIMEO_ID.test(id)) return null;
    return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  return null;
}
