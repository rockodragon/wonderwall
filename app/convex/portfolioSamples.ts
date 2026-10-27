// Existing portfolio pieces selected as evidence for an application. Gigs
// and project recruitment share ownership, limits and the media projection.
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { fail } from "./errors";
import { pieceMediaUrl } from "./images";
import { MAX_WORK_SAMPLES } from "./portfolioSampleRules";

type Ctx = QueryCtx | MutationCtx;

export async function validatePortfolioSampleIds(
  ctx: Ctx,
  profileId: Id<"profiles">,
  sampleIds: Id<"artifacts">[],
): Promise<Id<"artifacts">[]> {
  const unique = [...new Set(sampleIds)];
  if (unique.length > MAX_WORK_SAMPLES) {
    fail("too_many_clips", `Attach up to ${MAX_WORK_SAMPLES} work samples.`);
  }
  for (const id of unique) {
    const artifact = await ctx.db.get(id);
    if (!artifact || artifact.profileId !== profileId) {
      fail("bad_clip", "Work samples have to be pieces from your own portfolio.");
    }
  }
  return unique;
}

export async function portfolioSamples(ctx: Ctx, sampleIds: readonly Id<"artifacts">[]) {
  const samples = [];
  for (const id of sampleIds) {
    const artifact = await ctx.db.get(id);
    if (!artifact) continue;
    samples.push({
      artifactId: artifact._id,
      type: artifact.type,
      title: artifact.title ?? null,
      mediaUrl: await pieceMediaUrl(ctx, artifact),
      linkUrl: artifact.mediaUrl ?? null,
      ogImageUrl: artifact.ogImageUrl ?? null,
      content: artifact.content ?? null,
    });
  }
  return samples;
}

export type PortfolioSample = Awaited<ReturnType<typeof portfolioSamples>>[number];
