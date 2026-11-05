// The one picture that stands for a project wherever it is a card: its own
// photo, else its pasted link's still, else the first attached piece's — an
// uploaded image, a fetched/uploaded cover, or a video provider's
// thumbnail. This was written three times (a profile's project cards, the
// desk's Shortlist, the voting ballot) and the shorter copies stopped at the
// pasted link, so a project whose only picture is a piece showed a black box
// on /admin/voting while its own page showed the piece. One copy now.

import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { pieceMediaUrl, projectPhotoUrl } from "./images";
import { toEmbedUrl } from "./videoEmbed";

export async function projectCoverUrl(ctx: QueryCtx, project: Doc<"projects">): Promise<string | null> {
  const photo = await projectPhotoUrl(ctx, project);
  if (photo) return photo;
  if (project.mediaPreviewUrl) return project.mediaPreviewUrl;
  // Pieces are read only when the project itself has no picture.
  const pieces = await ctx.db
    .query("artifacts")
    .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
    .collect();
  for (const piece of pieces) {
    if (piece.ogImageUrl) return piece.ogImageUrl;
    if (piece.type === "image") {
      const media = await pieceMediaUrl(ctx, piece);
      if (media) return media;
    }
    const embed = toEmbedUrl(piece.mediaUrl);
    if (embed?.thumbnailUrl) return embed.thumbnailUrl;
  }
  return null;
}
