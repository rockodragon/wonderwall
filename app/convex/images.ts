// The one place a picture's address is worked out. A picture is either a
// file we stored (a *StorageId) or a link someone pasted; every query used to
// pick between them in its own way, and the copies drifted: uploaded avatars
// were skipped where only the raw `imageUrl` was returned, a project photo
// that no longer resolved came back blank instead of using its pasted link,
// and the event page ignored the gallery image the event cards fall back to.
//
// Each helper returns a URL string or null — never undefined. A caller whose
// own shape says `undefined` for "none" adds `?? undefined` at the call.
// Pure reads: they take a query or mutation ctx and only call storage.getUrl.

import type { Id } from "./_generated/dataModel";

/** The slice of a Convex ctx these helpers read. QueryCtx and MutationCtx
 * both fit it, and so does a test's stub. */
type StorageCtx = {
  storage: { getUrl(storageId: Id<"_storage">): Promise<string | null> };
};

// Convex's own address for a stored file; the last segment is the file's key.
const CONVEX_FILE_URL = /^https:\/\/[^/]+\.convex\.cloud\/api\/storage\/([A-Za-z0-9-]+)$/;

/**
 * Where a stored file is served from. With MEDIA_BASE_URL set (production:
 * "https://thecreative.exchange/media/"), Convex's address is swapped for
 * ours, so the file comes through our Cloudflare edge: cached, refused to AI
 * training crawlers, and sent with the same "not training data" headers as
 * our pages (functions/media/[id].ts). Unset, Convex's address is returned
 * as is, so turning it on or off is one environment variable. richText.ts
 * re-exports into the browser bundle, hence the `process` guard.
 */
export function servedFileUrl(convexUrl: string): string {
  const base = typeof process === "undefined" ? undefined : process.env.MEDIA_BASE_URL;
  if (!base) return convexUrl;
  const key = CONVEX_FILE_URL.exec(convexUrl)?.[1];
  return key ? `${base}${key}` : convexUrl;
}

/** A stored file's address (servedFileUrl), or null when it doesn't resolve:
 *  a deleted file, or a lookup that throws. */
export async function storedFileUrl(ctx: StorageCtx, storageId: Id<"_storage">): Promise<string | null> {
  try {
    const url = await ctx.storage.getUrl(storageId);
    return url ? servedFileUrl(url) : null;
  } catch {
    return null;
  }
}

/**
 * The stored file's URL when it resolves, else the pasted link, else null.
 * A file that was deleted, or a lookup that throws, falls back to the link
 * instead of blanking the picture (or failing the whole query). An empty
 * link counts as none.
 */
export async function storedOrExternalUrl(
  ctx: StorageCtx,
  storageId: Id<"_storage"> | undefined | null,
  externalUrl: string | undefined | null,
): Promise<string | null> {
  const stored = storageId ? await storedFileUrl(ctx, storageId) : null;
  return stored || externalUrl || null;
}

/**
 * A person's picture: the uploaded photo (imageStorageId) first, then the
 * older pasted link (imageUrl). Uploading a photo clears imageUrl
 * (files.ts), so returning `profile.imageUrl` alone shows nothing for
 * anyone who uploaded. No profile is no picture.
 */
export async function profileImageUrl(
  ctx: StorageCtx,
  profile: { imageStorageId?: Id<"_storage">; imageUrl?: string } | null | undefined,
): Promise<string | null> {
  if (!profile) return null;
  return await storedOrExternalUrl(ctx, profile.imageStorageId, profile.imageUrl);
}

/**
 * The picture for a project, a class (offering) or a Table: the uploaded
 * file (photoStorageId) first, then the pasted link (photoUrl). All three
 * rows carry these two fields.
 */
export async function projectPhotoUrl(
  ctx: StorageCtx,
  row: { photoStorageId?: Id<"_storage">; photoUrl?: string },
): Promise<string | null> {
  return await storedOrExternalUrl(ctx, row.photoStorageId, row.photoUrl);
}

/**
 * An event's cover for its card and its page: the cover image, else the first
 * gallery image. A cover that no longer resolves falls through to the
 * gallery too. (A pasted reel's still is the caller's last resort, where it
 * wants one — shortlist.ts adds it.)
 */
export async function eventCoverUrl(
  ctx: StorageCtx,
  event: { coverImageStorageId?: Id<"_storage">; imageStorageIds?: Id<"_storage">[] },
): Promise<string | null> {
  const cover = await storedOrExternalUrl(ctx, event.coverImageStorageId, null);
  if (cover) return cover;
  return await storedOrExternalUrl(ctx, event.imageStorageIds?.[0], null);
}

/**
 * A piece's media (artifacts, gig clips): its uploaded file when it has one,
 * else its link. Unlike a project photo, a missing upload does NOT fall back
 * to the link: a piece can carry both a file and a web-page link (the work
 * composer saves both), and pages treat "has a file" as "show an image", so
 * the link would land in an <img>. Review 2026-10-10.
 */
export async function pieceMediaUrl(
  ctx: StorageCtx,
  piece: { mediaStorageId?: Id<"_storage">; mediaUrl?: string },
): Promise<string | null> {
  if (piece.mediaStorageId) return await storedOrExternalUrl(ctx, piece.mediaStorageId, null);
  return piece.mediaUrl || null;
}

/** An organization's logo, or null when it has none. */
export async function orgLogoUrl(
  ctx: StorageCtx,
  org: { logoStorageId?: Id<"_storage"> },
): Promise<string | null> {
  return await storedOrExternalUrl(ctx, org.logoStorageId, null);
}
