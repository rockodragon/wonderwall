// A pasted music link, played on the piece's page.
//
// Bandcamp, Spotify and SoundCloud.
//
// Bandcamp's player needs the album's or track's number, which a page link
// (artist.bandcamp.com/album/name) doesn't carry. The page does, so
// convex/linkPreview.ts reads it off the page and stores the player's own
// link (bandcamp.com/EmbeddedPlayer/album=123/) in place of the page link.
// This module recognises both: the page link, so the server knows to fetch
// it, and the player link, so a page can play it.
//
// Spotify and SoundCloud play from the link someone copies out of the app
// (open.spotify.com/track/ID, soundcloud.com/artist/track), so the link is
// stored in its plain form and the player is built from it here. Their
// short links (spotify.link, on.soundcloud.com) can't be read without a
// fetch; they stay a plain link.
//
// Kept apart from videoEmbed.ts on purpose: toEmbedUrl means "a video", and
// eight surfaces (grids' play badges, the rich-text video block, the event
// and project link fields) act on that. A music player belongs only where a
// piece plays.
//
// Like videoEmbed.ts it is display-side and pure: it never fetches. It lives
// on the server side so linkPreview.ts can use it, and reaches the client
// through app/app/lib/musicEmbed.ts.

export type MusicKind = "bandcamp" | "spotify" | "soundcloud";

/** The provider's name, for a player's title and the hint under a link. */
export const MUSIC_PROVIDER_LABEL: Record<MusicKind, string> = {
  bandcamp: "Bandcamp",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
};

export interface MusicEmbed {
  kind: MusicKind;
  /** The iframe's src. */
  embedUrl: string;
  /** The player's height in px. */
  height: number;
  /** The widest it draws, in px; past that its page shows white. */
  maxWidth: number;
  /** What gets stored: Bandcamp's player link without our styling, or the
      plain Spotify or SoundCloud link with its share tokens stripped. */
  canonicalUrl: string;
  /** What the link is, for the hint under it: "album", "track", "playlist". */
  item: string;
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
 * The player for a music link, or null for anything else: a stored Bandcamp
 * player link (a page link the server hasn't read yet is null), or a
 * Spotify or SoundCloud link. Our own styling is applied here rather than
 * stored, so it can change without touching rows.
 */
export function toMusicEmbed(rawUrl: string | undefined): MusicEmbed | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (host === "bandcamp.com") return bandcampEmbed(url);
  if (host === "open.spotify.com") return spotifyEmbed(url);
  if (host === "soundcloud.com" || host === "www.soundcloud.com" || host === "m.soundcloud.com") {
    return soundcloudEmbed(url);
  }
  return null;
}

/** Bandcamp's dark player, slim, artwork on the left, no track list. */
function bandcampEmbed(url: URL): MusicEmbed | null {
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
      item: m[1],
    };
  }
  return null;
}

// Spotify's ids are 22 characters of base62. The kinds its player draws, and
// the height it is drawn for: the compact card for one track or episode,
// the list for the rest.
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_ITEMS: Record<string, number> = {
  track: 152,
  episode: 152,
  album: 352,
  playlist: 352,
  artist: 352,
  show: 352,
};

/** open.spotify.com/track/ID (also with /intl-xx/ in front, ?si= on the
 *  end, or an older /user/<name>/playlist/ID): the player is
 *  open.spotify.com/embed/track/ID. */
function spotifyEmbed(url: URL): MusicEmbed | null {
  let parts = segments(url.pathname);
  if (parts[0]?.startsWith("intl-")) parts = parts.slice(1);
  if (parts[0] === "embed") parts = parts.slice(1);
  // An older playlist link names its owner: /user/<name>/playlist/<id>.
  if (parts[0] === "user" && parts[2] === "playlist") parts = parts.slice(2);
  const [item, id] = parts;
  // Its own keys only: `in` would also take "constructor" or "__proto__".
  if (!item || !Object.prototype.hasOwnProperty.call(SPOTIFY_ITEMS, item) || !id || !SPOTIFY_ID.test(id) || parts.length > 2) return null;
  return {
    kind: "spotify",
    embedUrl: `https://open.spotify.com/embed/${item}/${id}?theme=0`,
    height: SPOTIFY_ITEMS[item],
    maxWidth: 700,
    canonicalUrl: `https://open.spotify.com/${item}/${id}`,
    item,
  };
}

// A SoundCloud name or a track's name in its link. Interpolated into the
// player's address (encoded), so matched against a plain slug only.
const SOUNDCLOUD_SLUG = /^[A-Za-z0-9_-]{1,100}$/;
// A private track's link ends in its secret token.
const SOUNDCLOUD_SECRET = /^s-[A-Za-z0-9]{1,40}$/;
// Pages under an artist that aren't a track.
const SOUNDCLOUD_NOT_TRACK = new Set([
  "sets", "likes", "reposts", "tracks", "albums", "popular-tracks", "followers", "following",
  "comments", "spotlight", "playlists", "toptracks",
]);
// soundcloud.com/<this>/… is the site's own page, not an artist.
const SOUNDCLOUD_NOT_ARTIST = new Set([
  "discover", "search", "stream", "you", "upload", "pages", "charts", "messages", "settings",
  "terms-of-use", "pro", "mobile", "people", "jobs", "imprint", "notifications", "feed", "home",
]);

/** soundcloud.com/artist/track (or …/sets/name, either with a private
 *  track's s-token): the player is w.soundcloud.com/player/?url=…. */
function soundcloudEmbed(url: URL): MusicEmbed | null {
  const parts = segments(url.pathname);
  const [artist, second, third, fourth] = parts;
  if (!artist || !SOUNDCLOUD_SLUG.test(artist) || SOUNDCLOUD_NOT_ARTIST.has(artist.toLowerCase())) return null;
  let path: string[];
  let item: "track" | "playlist";
  if (second === "sets") {
    if (!third || !SOUNDCLOUD_SLUG.test(third)) return null;
    if (fourth !== undefined && !SOUNDCLOUD_SECRET.test(fourth)) return null;
    if (parts.length > 4) return null;
    path = parts;
    item = "playlist";
  } else {
    if (!second || !SOUNDCLOUD_SLUG.test(second) || SOUNDCLOUD_NOT_TRACK.has(second.toLowerCase())) return null;
    if (third !== undefined && !SOUNDCLOUD_SECRET.test(third)) return null;
    if (parts.length > 3) return null;
    path = parts;
    item = "track";
  }
  const canonicalUrl = `https://soundcloud.com/${path.join("/")}`;
  const options = "color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false";
  return {
    kind: "soundcloud",
    embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(canonicalUrl)}&${options}`,
    height: item === "track" ? 166 : 352,
    maxWidth: 700,
    canonicalUrl,
    item,
  };
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
