// A pasted music link, played on the piece's page.
//
// Bandcamp only, for now. Its player needs the album's or track's number,
// which a page link (artist.bandcamp.com/album/name) doesn't carry. The page
// does, so convex/linkPreview.ts reads it off the page and stores the
// player's own link (bandcamp.com/EmbeddedPlayer/album=123/) in place of the
// page link. This module recognises both: the page link, so the server knows
// to fetch it, and the player link, so a page can play it.
//
// Kept apart from videoEmbed.ts on purpose: toEmbedUrl means "a video", and
// eight surfaces (grids' play badges, the rich-text video block, the event
// and project link fields) act on that. A music player belongs only where a
// piece plays.
//
// Like videoEmbed.ts it is display-side and pure: it never fetches. It lives
// on the server side so linkPreview.ts can use it, and reaches the client
// through app/app/lib/musicEmbed.ts.

export interface MusicEmbed {
  kind: "bandcamp";
  /** The iframe's src. */
  embedUrl: string;
  /** The player's height in px. */
  height: number;
  /** The widest it draws, in px; past that its page shows white. */
  maxWidth: number;
  /** What gets stored: the player link without our styling. */
  canonicalUrl: string;
}

type BandcampItem = "album" | "track";

// The number is interpolated into a URL, so it is matched against digits
// only, never "doesn't look dangerous".
const BANDCAMP_ITEM_ID = /^[0-9]{1,15}$/;
// An artist's subdomain. Exact host matching, not endsWith, so
// bandcamp.com.evil.example never passes.
const BANDCAMP_SUBDOMAIN = /^[a-z0-9-]+\.bandcamp\.com$/;

function parseHttpUrl(rawUrl: string | undefined): URL | null {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url;
}

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** The player link we store for an album or a track. */
export function bandcampPlayerLink(item: BandcampItem, id: string): string | null {
  if (!BANDCAMP_ITEM_ID.test(id)) return null;
  return `https://bandcamp.com/EmbeddedPlayer/${item}=${id}/`;
}

/** True for an album or track page on an artist's Bandcamp
 *  (artist.bandcamp.com/album/name, …/track/name): one the server has to
 *  fetch before it can play here. Custom domains aren't recognised; they stay
 *  a plain link. */
export function isBandcampPageLink(rawUrl: string | undefined): boolean {
  const url = parseHttpUrl(rawUrl);
  if (!url || !BANDCAMP_SUBDOMAIN.test(url.hostname.toLowerCase())) return false;
  const parts = segments(url.pathname);
  return parts.length >= 2 && (parts[0] === "album" || parts[0] === "track");
}

/**
 * The player for a stored Bandcamp player link, or null for anything else
 * (a page link the server hasn't read yet included). Our own styling is
 * applied here rather than stored, so it can change without touching rows:
 * Bandcamp's dark player, slim, artwork on the left, no track list.
 */
export function toMusicEmbed(rawUrl: string | undefined): MusicEmbed | null {
  const url = parseHttpUrl(rawUrl);
  if (!url || url.hostname.toLowerCase() !== "bandcamp.com") return null;
  const parts = segments(url.pathname);
  if (parts[0] !== "EmbeddedPlayer") return null;
  for (const part of parts.slice(1)) {
    const m = part.match(/^(album|track)=(.+)$/);
    if (!m) continue;
    const canonicalUrl = bandcampPlayerLink(m[1] as BandcampItem, m[2]);
    if (!canonicalUrl) return null;
    return {
      kind: "bandcamp",
      embedUrl: `${canonicalUrl}size=large/bgcol=333333/linkcol=ffffff/tracklist=false/artwork=small/transparent=true/`,
      height: 120,
      maxWidth: 700,
      canonicalUrl,
    };
  }
  return null;
}

/**
 * True when a link is an audio file a browser's <audio> can play, judged by
 * its extension. A music page (Spotify, SoundCloud, a Bandcamp page) is not,
 * and an <audio> pointed at one is a dead player — it gets a link instead.
 */
export function isAudioFileLink(rawUrl: string | undefined): boolean {
  const url = parseHttpUrl(rawUrl);
  if (!url) return false;
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|aiff?|weba)$/i.test(url.pathname);
}
