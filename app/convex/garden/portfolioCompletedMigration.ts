// "Projects, not Portfolios" (V1 PRD §7, docs/features/project-ia.md): a
// piece shared through "Add work" is a project, and a finished one belongs
// in the profile's Portfolio — which is simply the person's COMPLETED
// projects. The companion projects artifacts.create made before this change
// were never given a stage, so they read as "Planning" and sat in the
// profile's Projects list next to real work in progress. This marks them
// completed.
//
// Only rows whose stage was never set are touched: a stage someone chose on
// purpose is left alone. Idempotent — a second run finds nothing to do.
// Patches directly rather than going through setStage, so followers are not
// notified about a relabel of old work.
//
// Run after deploying: `npx convex run --prod
// garden/portfolioCompletedMigration:completePortfolioProjects '{"dryRun": true}'`
// then again with `"dryRun": false`.

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** A portfolio-origin project nobody has staged yet. */
export function isUnstagedPortfolioProject(project: Pick<Doc<"projects">, "origin" | "stage">): boolean {
  return project.origin === "portfolio" && !project.stage;
}

export const completePortfolioProjects = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const all = await ctx.db.query("projects").collect();
    const targets = all.filter(isUnstagedPortfolioProject);
    if (!dryRun) {
      const now = Date.now();
      for (const project of targets) {
        await ctx.db.patch(project._id, { stage: "completed", stageChangedAt: now, updatedAt: now });
      }
    }
    return { dryRun, count: targets.length };
  },
});

/** One person's cleanup: mark every non-archived project they own completed,
 * except the ones named in `keep`. Dry run by default — it lists what it
 * would change so the ids to keep can be picked from the output. Same
 * direct patch as above: no follower notifications. */
export const completeProjectsForProfile = internalMutation({
  args: {
    profileId: v.id("profiles"),
    keep: v.optional(v.array(v.id("projects"))),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("No such profile");
    const keep = new Set<Id<"projects">>(args.keep ?? []);
    const owned = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
      .collect();
    const rows = owned.filter((p) => p.status !== "archived");
    const now = Date.now();
    const out = [];
    for (const project of rows) {
      const change = !keep.has(project._id) && project.stage !== "completed";
      if (change && !dryRun) {
        await ctx.db.patch(project._id, { stage: "completed", stageChangedAt: now, updatedAt: now });
      }
      out.push({
        projectId: project._id,
        title: project.title,
        stage: project.stage ?? null,
        origin: project.origin ?? null,
        action: keep.has(project._id) ? "keep" : change ? "complete" : "already completed",
      });
    }
    return { dryRun, projects: out };
  },
});
