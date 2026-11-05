// Which picture stands for a project on a card, as one pure rule that the
// server (convex/projectCover.ts: the voting ballot, profile cards, the
// Shortlist) and the app (app/lib/projectPick.ts coverOf: Today, Projects,
// the Canvas) both read. The app's copy only looked at image pieces, so a
// project whose picture was a YouTube video or a fetched still showed no
// picture on Today and Projects (Rick, 2026-11-04: "youtube video embeds
// also dont seem to grab and show the thumbnails"). No Convex imports.
//
// In order: the project's own photo (each caller reads it its own way), then
// the pasted link's picture (linkStill), then the first piece that has one
// (pieceStill).

import { toEmbedUrl } from "./videoEmbed";

/** A pasted link's picture: the still the server fetched (Instagram, TikTok,
 * Vimeo; convex/linkPreview.ts), else the one the URL itself gives
 * (YouTube). */
export function linkStill(row: { mediaPreviewUrl?: string | null; mediaUrl?: string | null }): string | null {
  return row.mediaPreviewUrl ?? toEmbedUrl(row.mediaUrl ?? undefined)?.thumbnailUrl ?? null;
}

/** A piece's picture: its still (fetched or uploaded: `ogImageUrl`), the
 * picture itself for an image piece (`imageUrl`, its file's URL), else its
 * video's (YouTube). */
export function pieceStill(
  piece: { ogImageUrl?: string | null; type?: string; mediaUrl?: string | null },
  imageUrl: string | null | undefined,
): string | null {
  if (piece.ogImageUrl) return piece.ogImageUrl;
  if (piece.type === "image" && imageUrl) return imageUrl;
  return toEmbedUrl(piece.mediaUrl ?? undefined)?.thumbnailUrl ?? null;
}
