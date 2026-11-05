// Keeps smart search's stored meanings (convex/embeddings.ts) fresh. A write
// that changes what a profile or project says about itself calls these after
// the write; the embedding is skipped when the text it would be made of is
// unchanged, so calling them on a save that changed nothing costs a query,
// not an OpenAI call. What counts is listed in searchRules.profileSearchText
// and projectSearchText.

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

type Scheduling = Pick<MutationCtx, "scheduler">;

/** Re-embed a project: its title, blurb, body, topics, place, maker, open
 * roles or pieces changed. */
export async function scheduleProjectEmbedding(ctx: Scheduling, projectId: Id<"projects">) {
  await ctx.scheduler.runAfter(0, internal.embeddings.embedProject, { projectId });
}

/** Re-embed a profile: its name, role, bio, disciplines, place, organization
 * or active wondering changed. */
export async function scheduleProfileEmbedding(ctx: Scheduling, profileId: Id<"profiles">) {
  await ctx.scheduler.runAfter(0, internal.embeddings.embedProfile, { profileId });
}
