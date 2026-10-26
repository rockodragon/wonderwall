// Who uploaded a stored file: the one check every mutation runs before it
// attaches a storage id the browser sent.
//
// Why: storage ids aren't secret. They are in /media/<id> links and in what
// the queries return. Before this, any signed-in person could attach someone
// else's file id to a row they control (their avatar, an event cover, a
// gallery, a piece, an offering photo, a project story...) and then replace
// or remove it. That replace/remove path deletes the old file, so the other
// person's file was gone. Nothing recorded who uploaded what:
// generateUploadUrl only checks sign-in, and the upload itself goes straight
// to Convex.
//
// The fix needs no change in the browser. A file is claimed the first time
// it is attached (`uploadClaims`, one row per file). After that only the
// person who claimed it can attach it again. An unclaimed file can be
// claimed only while it is fresh (UPLOAD_CLAIM_WINDOW_MS): every upload flow
// attaches its file straight after uploading it, while a file someone else
// uploaded long ago, and has attached since, is exactly what an attacker
// would point at.
//
// A row that already holds the id doesn't need a claim. Edit forms send the
// whole record back, including a picture the person didn't touch, and they
// already passed the row's own permission check. Rich-text bodies pass the
// ids from the stored body, so only pictures new to the body are claimed.
//
// Deleting goes through here too: deleteStoredFile (a file already gone
// doesn't fail the call) and deleteEventCover (a Table's dates share one
// picture).

import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail } from "./errors";

/** How long after an upload its file can first be attached: 24 hours. The
 * composers upload a picture as soon as it's picked and attach it on Save
 * (an event, a Table, a class, a project story), so the gap is the time
 * someone spends on the form. A day covers a form left open overnight. A
 * file older than that, attached to nothing of the caller's, was uploaded by
 * someone else or uploaded and abandoned; the person picks it again. */
export const UPLOAD_CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Storage ids the row being edited already holds. */
export type HeldIds = readonly (string | null | undefined)[];

/**
 * Lets `userId` attach `storageId` to a row, or refuses with a reason the
 * page shows. Call it after the row's own permission check (requireOwner,
 * requireEventHost, ...) and before writing the id.
 *
 * - Nothing passed: nothing to check.
 * - An id the row already holds (`held`): fine, no claim needed.
 * - Claimed by this person: fine. Claimed by someone else: refused.
 * - Unclaimed: the file has to exist and be fresh; then it's claimed for
 *   this person.
 */
export async function claimUpload(
  ctx: MutationCtx,
  userId: Id<"users">,
  storageId: string | null | undefined,
  held: HeldIds = [],
): Promise<void> {
  if (!storageId || held.includes(storageId)) return;

  // Rich-text bodies carry their ids as plain strings, so check the shape
  // here too; anything that isn't a stored file's id is refused.
  const id = ctx.db.system.normalizeId("_storage", storageId);
  if (!id) fail("not_found", "That file isn't here anymore. Upload it again.");

  const claim = await ctx.db
    .query("uploadClaims")
    .withIndex("by_storageId", (q) => q.eq("storageId", id))
    .first();
  if (claim) {
    if (claim.userId !== userId) fail("forbidden", "That file belongs to someone else.");
    return;
  }

  const file = await ctx.db.system.get(id);
  if (!file) fail("not_found", "That file isn't here anymore. Upload it again.");
  if (Date.now() - file._creationTime > UPLOAD_CLAIM_WINDOW_MS) {
    fail("invalid_upload", "That upload is too old to use. Pick the file again.");
  }
  await ctx.db.insert("uploadClaims", { storageId: id, userId, claimedAt: Date.now() });
}

/** claimUpload for each id, e.g. every picture in a rich-text body (pass the
 * stored body's ids as `held`, so only new pictures are claimed). */
export async function claimUploads(
  ctx: MutationCtx,
  userId: Id<"users">,
  storageIds: Iterable<string>,
  held: HeldIds = [],
): Promise<void> {
  for (const storageId of storageIds) await claimUpload(ctx, userId, storageId, held);
}

/** Deletes a stored file. A file that's already gone doesn't fail the save
 * or delete around it. Every storage delete goes through here (the drift
 * guard checks). */
export async function deleteStoredFile(
  ctx: { storage: { delete(storageId: Id<"_storage">): Promise<void> } },
  storageId: Id<"_storage"> | null | undefined,
): Promise<void> {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch {
    // already gone
  }
}

/** Deletes an event's cover, unless something else still shows the same
 * file. A Table's dates wear the Table's photo (insertTableOccurrence in
 * garden/tables.ts; runTableAgain gives the new Table the same photo), and a
 * date carried over from a class wears the class's photo
 * (garden/tablesMigration.ts). Changing one date's cover must not blank the
 * Table, its other dates or the class. */
export async function deleteEventCover(ctx: MutationCtx, event: Doc<"events">): Promise<void> {
  const cover = event.coverImageStorageId;
  if (!cover) return;
  if (event.tableId) {
    const table = await ctx.db.get(event.tableId);
    if (table?.photoStorageId === cover) return;
    const dates = await ctx.db
      .query("events")
      .withIndex("by_tableId", (q) => q.eq("tableId", event.tableId))
      .collect();
    if (dates.some((d) => d._id !== event._id && d.coverImageStorageId === cover)) return;
  }
  if (event.sourceOfferingId) {
    const offering = await ctx.db.get(event.sourceOfferingId);
    if (offering?.photoStorageId === cover) return;
  }
  await deleteStoredFile(ctx, cover);
}
