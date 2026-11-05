// The one picture that stands for a project wherever it is a card, by the
// rule in convex/coverRules.ts (the app's coverOf reads the same rule): its
// own photo, else its pasted link's picture, else the first piece's — a
// fetched or uploaded still, an uploaded image, or a video's thumbnail.
// This was written three times (a profile's project cards, the desk's
// Shortlist, the voting ballot) and the shorter copies stopped at the
// pasted link, so a project whose only picture is a piece showed a black box
// on /admin/voting while its own page showed the piece. One copy now.

import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { linkStill, pieceStill } from "./coverRules";
import { pieceMediaUrl, projectPhotoUrl } from "./images";

export async function projectCoverUrl(ctx: QueryCtx, project: Doc<"projects">): Promise<string | null> {
  const photo = await projectPhotoUrl(ctx, project);
  if (photo) return photo;
  const link = linkStill(project);
  if (link) return link;
  // Pieces are read only when the project itself has no picture, and an
  // image piece's file URL only when it is reached.
  const pieces = await ctx.db
    .query("artifacts")
    .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
    .collect();
  for (const piece of pieces) {
    const still = pieceStill(piece, piece.type === "image" ? await pieceMediaUrl(ctx, piece) : null);
    if (still) return still;
  }
  return null;
}
