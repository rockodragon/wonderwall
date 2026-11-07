// Pictures at the size they're shown, not the size they were taken (Rick,
// 2026-11-06). Photos we store are served from /media/<key> at full size: one
// project cover was a 7008×4672, 11.6 MB camera file, which a 276px card
// downscales into grain and loads for seconds. Cloudflare's image
// transformations are on for createthegarden.com ("This zone only"), and
// /media/ answers there too (functions/media/[id].ts), so a photo's resized
// copy is fetched from that zone, whichever site the page is on.
//
// One width for every surface (a card, a feed, a page, Theater), so each
// photo is one transformation a month on Cloudflare's free tier, not several.
// `onerror=redirect` sends the browser to the original if a resize ever fails
// (over quota, an unreadable file), so a picture never goes blank.
//
// Pure, no imports beyond constants: the server's picture helpers
// (images.ts) and the browser (lib/projectPick.ts coverOf, RichContent) both
// call it. Anything that isn't our own /media/ address (Convex's address in
// dev, a YouTube still, a pasted link, an already-sized address) is returned
// as is.

import { GARDEN_ORIGIN } from "./garden/brandHosts";

/** Wide enough for a full-screen picture on most screens, and crisp on a
 *  2x card; a 33 MP photo comes back around 100 KB. */
export const PHOTO_WIDTH = 1600;

const OUR_MEDIA = /^https:\/\/(?:thecreative\.exchange|createthegarden\.com|garden\.thecreative\.exchange|thegarden\.thecreative\.exchange)\/media\/([A-Za-z0-9-]{8,100})$/;

/** Our stored photo's address, resized to `width` (never enlarged); any
 *  other address unchanged. Only for pictures: a video or a song at
 *  /media/ must not go through here. */
export function sizedPhotoUrl(url: string, width?: number): string;
export function sizedPhotoUrl(url: string | null, width?: number): string | null;
export function sizedPhotoUrl(url: string | undefined, width?: number): string | undefined;
export function sizedPhotoUrl(url: string | null | undefined, width: number = PHOTO_WIDTH): string | null | undefined {
  if (!url) return url;
  const key = OUR_MEDIA.exec(url)?.[1];
  if (!key) return url;
  return `${GARDEN_ORIGIN}/cdn-cgi/image/width=${width},fit=scale-down,quality=82,format=auto,onerror=redirect/media/${key}`;
}
