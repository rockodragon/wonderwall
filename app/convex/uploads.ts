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
// doesn't fail the call), and deleteEventCover and deleteClassPhoto (a
// Table's dates share one picture, and a class shares its photo with the
// Table and date migrated from it; storageStillUsed checks both).

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail } from "./errors";
import { tableOfClass } from "./garden/tablePolicy";
import { isStoredFileAddress } from "./images";

/** How long after an upload its file can first be attached: 24 hours. The
 * composers upload a picture as soon as it's picked and attach it on Save
 * (an event, a Table, a class, a project story), so the gap is the time
 * someone spends on the form. A day covers a form left open overnight. A
 * file older than that, attached to nothing of the caller's, was uploaded by
 * someone else or uploaded and abandoned; the person picks it again. */
export const UPLOAD_CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Storage ids the row being edited already holds. */
export type HeldIds = readonly (string | null | undefined)[];

/** Who claimed a stored file, or null when nobody has yet. */
export async function uploadClaimOf(
  ctx: { db: QueryCtx["db"] },
  storageId: Id<"_storage">,
): Promise<Doc<"uploadClaims"> | null> {
  return await ctx.db
    .query("uploadClaims")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
}

/** Records `userId` as the one who uploaded `storageId`. Callers check
 * first that nobody has claimed it (uploadClaimOf). */
export async function recordUploadClaim(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  userId: Id<"users">,
): Promise<void> {
  await ctx.db.insert("uploadClaims", { storageId, userId, claimedAt: Date.now() });
}

/** Claims a file for `userId` unless someone already has. For a file the
 * server stored on someone's behalf (a link preview's still): claim it in
 * the mutation that attaches it, or anyone who reads the id could claim it
 * first and then delete it by replacing it. True when it recorded a claim. */
export async function claimFor(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  userId: Id<"users">,
): Promise<boolean> {
  if (await uploadClaimOf(ctx, storageId)) return false;
  await recordUploadClaim(ctx, storageId, userId);
  return true;
}

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

  const claim = await uploadClaimOf(ctx, id);
  if (claim) {
    if (claim.userId !== userId) fail("forbidden", "That file belongs to someone else.");
    return;
  }

  const file = await ctx.db.system.get(id);
  if (!file) fail("not_found", "That file isn't here anymore. Upload it again.");
  if (Date.now() - file._creationTime > UPLOAD_CLAIM_WINDOW_MS) {
    fail("invalid_upload", "That upload is too old to use. Pick the file again.");
  }
  await recordUploadClaim(ctx, id, userId);
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

/** Deletes every file a portfolio piece holds: the work, its cover, and the
 * maker's voice note. For a piece that is going away (artifacts.remove, and a
 * project deleted with its pieces, moderation.ts eraseProject). */
export async function deletePieceFiles(
  ctx: { storage: { delete(storageId: Id<"_storage">): Promise<void> } },
  piece: Pick<Doc<"artifacts">, "mediaStorageId" | "coverStorageId" | "audioNoteStorageId">,
): Promise<void> {
  await deleteStoredFile(ctx, piece.mediaStorageId);
  await deleteStoredFile(ctx, piece.coverStorageId);
  await deleteStoredFile(ctx, piece.audioNoteStorageId);
}

/** The rows that may share a picture with the one being changed: its Table,
 * its class. `except` is that row itself. */
export type SharedWith = {
  tableId?: Id<"gardenTables">;
  offeringId?: Id<"offerings">;
  except: Id<"events"> | Id<"offerings">;
};

/**
 * Whether a picture is still shown somewhere it is shared on purpose, other
 * than `except`:
 * - a Table's dates wear the Table's photo (insertTableOccurrence in
 *   garden/tables.ts; runTableAgain gives the new Table the same photo);
 * - a date migrated from a class wears the class's photo as its cover, and
 *   the Table migrated from the class keeps the photo's address as its
 *   photoUrl (garden/tablesMigration.ts).
 * Looks at the Table (its photo and dates) and the class (its photo, the
 * dates migrated from it, and its Table with that Table's dates).
 */
export async function storageStillUsed(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  { tableId, offeringId, except }: SharedWith,
): Promise<boolean> {
  const tables: Doc<"gardenTables">[] = [];
  const table = tableId ? await ctx.db.get(tableId) : null;
  if (table) tables.push(table);
  if (offeringId) {
    const offering = await ctx.db.get(offeringId);
    if (offering && offering._id !== except && offering.photoStorageId === storageId) return true;
    const moved = await ctx.db
      .query("events")
      .withIndex("by_sourceOfferingId", (q) => q.eq("sourceOfferingId", offeringId))
      .collect();
    if (moved.some((e) => e._id !== except && e.coverImageStorageId === storageId)) return true;
    const classTable = await tableOfClass(ctx, offeringId);
    if (classTable && classTable._id !== table?._id) tables.push(classTable);
  }
  for (const t of tables) {
    if (t.photoStorageId === storageId || (await isStoredFileAddress(ctx, t.photoUrl, storageId))) return true;
    const dates = await ctx.db
      .query("events")
      .withIndex("by_tableId", (q) => q.eq("tableId", t._id))
      .collect();
    if (dates.some((d) => d._id !== except && d.coverImageStorageId === storageId)) return true;
  }
  return false;
}

/** Deletes an event's cover, unless its Table, the Table's other dates or
 * the class it was migrated from still show the same file
 * (storageStillUsed). Changing one date's cover must not blank them. */
export async function deleteEventCover(ctx: MutationCtx, event: Doc<"events">): Promise<void> {
  const cover = event.coverImageStorageId;
  if (!cover) return;
  const shared = { tableId: event.tableId, offeringId: event.sourceOfferingId, except: event._id };
  if (await storageStillUsed(ctx, cover, shared)) return;
  await deleteStoredFile(ctx, cover);
}

/** Deletes a class's photo, unless the date or Table migrated from the class
 * still shows it (storageStillUsed). Replacing or removing the photo, or
 * deleting the class, must not blank them. A photo someone other than the
 * teacher claimed is left too: before claims existed anyone could attach
 * another person's file to their own class, and deleting it there would
 * delete it for its owner. */
export async function deleteClassPhoto(ctx: MutationCtx, offering: Doc<"offerings">): Promise<void> {
  const photo = offering.photoStorageId;
  if (!photo) return;
  const claim = await uploadClaimOf(ctx, photo);
  if (claim && claim.userId !== offering.userId) return;
  if (await storageStillUsed(ctx, photo, { offeringId: offering._id, except: offering._id })) return;
  await deleteStoredFile(ctx, photo);
}
