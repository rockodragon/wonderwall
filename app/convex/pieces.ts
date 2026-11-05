// A piece of work (an `artifacts` row): the one way one is saved, whoever
// saves it.
//
// A piece always belongs to a project. Sharing work from a profile makes a
// project around it (artifacts.create); starting a project can bring its
// first piece (garden/projects.ts createPassionProject); a project's owner
// adds more on its page (artifacts.addToProject). All three used to write
// the row their own way, and the forms behind them had drifted apart: the
// profile took uploads and a voice note, the project took one video link
// (Rick, 2026-11-04: "we don't have different results for users because
// they're basically stored as the same thing"). The rule lives here once:
// the args a piece takes, how they're checked, and what is fetched after.

import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { fail } from "./errors";
import { canonicalMediaUrl, schedulePreviewFetch, wantsPreviewFetch } from "./linkPreview";
import { isBandcampPageLink, toMusicEmbed } from "./musicEmbed";
import { toEmbedUrl } from "./videoEmbed";
import { storedFileUrl } from "./images";
import { cleanDescription } from "./pieceNote";
import { claimUpload, deleteStoredFile } from "./uploads";

/** The kinds of piece there are. The form picks one from what was given:
 *  an uploaded file's kind, "video" for a pasted video, "audio" for music,
 *  "link" for any other page, "text" for words alone. */
export const PIECE_TYPES = ["text", "image", "video", "audio", "link"] as const;

/** What a piece is made of, as every mutation that saves one takes it. */
export const pieceFields = {
  type: v.string(),
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  mediaUrl: v.optional(v.string()),
  mediaStorageId: v.optional(v.id("_storage")),
  // A picture the maker chose for a piece that isn't one: a video, a song, a
  // link (docs/features/creator-media-cross-post.md). Stored as `ogImageUrl`
  // too, so every card reads it like any other still.
  coverStorageId: v.optional(v.id("_storage")),
  // What the maker says about it, and a note they recorded
  // (schema.ts `description`, `audioNoteStorageId`).
  description: v.optional(v.string()),
  audioNoteStorageId: v.optional(v.id("_storage")),
};
export const pieceValidator = v.object(pieceFields);
export type PieceInput = Infer<typeof pieceValidator>;

/** A piece checked and ready to store. */
export type ReadyPiece = Omit<PieceInput, "mediaUrl" | "description"> & {
  mediaUrl: string | undefined;
  description: string | undefined;
};

/** Refuses a kind of piece there isn't. */
export function assertPieceType(type: string) {
  if (!(PIECE_TYPES as readonly string[]).includes(type)) {
    fail("invalid_input", "That isn't a type of work we can show.");
  }
}

/** Checks a piece and claims its files for the person before anything is
 *  written, so a refusal leaves no half of it behind (artifacts.create makes
 *  its project after this). A link is stored in its canonical form, and
 *  anything that isn't http(s) is refused (convex/linkPreview.ts); a file
 *  someone else uploaded is refused (convex/uploads.ts). */
export async function readyPiece(ctx: MutationCtx, userId: Id<"users">, piece: PieceInput): Promise<ReadyPiece> {
  assertPieceType(piece.type);
  const description = cleanDescription(piece.description);
  const mediaUrl = canonicalMediaUrl(piece.mediaUrl);
  const hasWork = piece.type === "text" ? !!piece.content?.trim() : !!mediaUrl || !!piece.mediaStorageId;
  if (!hasWork) {
    fail("invalid_input", piece.type === "text" ? "Write something to share." : "Upload a file or paste a link.");
  }
  await claimUpload(ctx, userId, piece.mediaStorageId);
  await claimUpload(ctx, userId, piece.coverStorageId);
  await claimUpload(ctx, userId, piece.audioNoteStorageId);
  return { ...piece, mediaUrl, description };
}

/** Stores a piece readyPiece checked on a project, as the person's own
 *  work, and schedules what it needs: its search text, and a still for its
 *  card. */
export async function insertPiece(
  ctx: MutationCtx,
  { profileId, projectId, piece }: {
    profileId: Id<"profiles">;
    projectId: Id<"projects">;
    piece: ReadyPiece;
  },
): Promise<Id<"artifacts">> {
  // Last in the person's own order: their profile lists pieces that way.
  const existing = await ctx.db
    .query("artifacts")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .collect();
  const maxOrder = existing.length > 0 ? Math.max(...existing.map((a) => a.order)) : -1;
  const coverUrl = piece.coverStorageId ? await storedFileUrl(ctx, piece.coverStorageId) : null;

  const artifactId = await ctx.db.insert("artifacts", {
    profileId,
    projectId,
    type: piece.type,
    title: piece.title,
    content: piece.content,
    mediaUrl: piece.mediaUrl,
    mediaStorageId: piece.mediaStorageId,
    ogImageUrl: coverUrl ?? undefined,
    coverStorageId: piece.coverStorageId,
    description: piece.description,
    audioNoteStorageId: piece.audioNoteStorageId,
    order: maxOrder + 1,
    createdAt: Date.now(),
  });

  if (piece.title || piece.content) {
    await ctx.scheduler.runAfter(0, internal.embeddings.embedArtifact, { artifactId });
  }
  // A still for the card, unless the maker chose a cover: a fetched still
  // would delete it and take its place. The owner's explicit Refresh Preview
  // (refetchOgImage) may still do that. A Bandcamp page is fetched anyway,
  // for its player; its still never replaces a cover.
  if (!piece.coverStorageId || isBandcampPageLink(piece.mediaUrl)) {
    await schedulePiecePreview(ctx, artifactId, piece.mediaUrl, piece.type);
  }
  return artifactId;
}

/** What a piece's link needs fetched so its card has a still
 *  (docs/features/creator-media-cross-post.md). Called on save and by the
 *  owner's Refresh Preview. Scheduled, never awaited: the save lands first. */
export async function schedulePiecePreview(
  ctx: MutationCtx,
  artifactId: Id<"artifacts">,
  url: string | undefined,
  type: string,
) {
  if (!url) return;
  // A Bandcamp page, whatever the piece's type: the server reads the
  // player's number off it (convex/musicEmbed.ts), so it plays here. Once it
  // is a player link there is nothing left to fetch.
  if (isBandcampPageLink(url)) return schedulePreviewFetch(ctx, "artifact", artifactId, url);
  // Spotify and SoundCloud describe their own links (convex/linkPreview.ts),
  // whatever the piece's type.
  const music = toMusicEmbed(url);
  if (music) {
    if (wantsPreviewFetch(url)) await schedulePreviewFetch(ctx, "artifact", artifactId, url);
    return;
  }
  if (type !== "link" && type !== "video") return;
  // Instagram, TikTok and Vimeo stills come through convex/linkPreview.ts
  // (which knows how to ask each provider); YouTube's comes from the
  // resolver (img.youtube.com). Anything else gets the plain og:image
  // scrape.
  if (wantsPreviewFetch(url)) {
    await schedulePreviewFetch(ctx, "artifact", artifactId, url);
    return;
  }
  if (toEmbedUrl(url)) return;
  await ctx.scheduler.runAfter(0, api.artifacts.fetchOgImage, { artifactId, url });
}

/** A new voice note in place of the piece's old one: the old file is
 *  deleted, no storageId removes it. The patch to write, or null when
 *  nothing changed. */
export async function swapAudioNote(
  ctx: MutationCtx,
  userId: Id<"users">,
  artifact: Doc<"artifacts">,
  storageId: Id<"_storage"> | undefined,
): Promise<Pick<Doc<"artifacts">, "audioNoteStorageId"> | null> {
  if (storageId === artifact.audioNoteStorageId) return null;
  await claimUpload(ctx, userId, storageId);
  await deleteStoredFile(ctx, artifact.audioNoteStorageId);
  return { audioNoteStorageId: storageId };
}
