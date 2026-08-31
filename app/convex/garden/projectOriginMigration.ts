// Backfill: classify every existing `projects` row's `origin` — "posted" (a
// deliberate project, via createPassionProject/createPaidProject) vs.
// "portfolio" (the companion project artifacts.create inserts as a side
// effect of a quick single-artifact share — see convex/garden/projects.ts /
// convex/artifacts.ts). Confirmed mechanically: only artifacts.create's side
// effect (and the pre-pivot equivalent, garden/artifactsMigration.ts's
// migrateArtifactsToProjects) ever produces a `projects` row with a matching
// `artifacts` row created at essentially the same instant — createPassion/
// PaidProject never touch the `artifacts` table at all. That's the reliable,
// purely mechanical signal this migration uses for rows that predate the
// `origin` field itself.
//
// legacyJobId always wins to "posted" regardless of the artifact check — a
// migrated jobs-board row (garden/jobsMigration.ts) is a real posted paid
// commission, not a portfolio share, and has no reason to ever match an
// artifact anyway.
//
// Idempotent by presence of `origin`: a row that already has it set (set at
// creation time going forward, or set by a prior run of this migration) is
// skipped — same "safe to run more than once" contract as jobsMigration.ts /
// interestsMigration.ts.

import { internalMutation } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

// ——— Pure core ———

// The generated `Doc<"projects">` type reflects the CURRENT schema (origin
// included) — a not-yet-migrated row on disk simply has it undefined, which
// the type already allows since it's optional.
export type LegacyProject = Doc<"projects">;

/** The mechanical signature of artifacts.create's side effect (and its
 * pre-pivot equivalent, artifactsMigration.ts's migrateArtifactsToProjects):
 * an `artifacts` row pointing at this project, created within a few seconds
 * of the project's own `createdAt`. Both real call sites use the exact same
 * timestamp for both rows (0ms apart) — a few seconds of slack just covers
 * clock/ordering noise without risking a false match against an unrelated
 * artifact a user later attaches to a real posted project. */
const SIGNATURE_TOLERANCE_MS = 5000;

export function hasArtifactSignature(
  project: Pick<LegacyProject, "createdAt">,
  candidateArtifacts: Array<{ createdAt: number }>,
): boolean {
  return candidateArtifacts.some(
    (a) => Math.abs(a.createdAt - project.createdAt) <= SIGNATURE_TOLERANCE_MS,
  );
}

/** Classifies a single project's origin from its own fields plus whichever
 * `artifacts` rows point at it (via `artifacts.projectId`) — pass only the
 * artifacts already filtered to that projectId, the by_projectId index in
 * the runner below does that filtering. legacyJobId always wins to "posted"
 * regardless of any artifact match. */
export function classifyOrigin(
  project: Pick<LegacyProject, "createdAt" | "legacyJobId">,
  artifactsForProject: Array<{ createdAt: number }>,
): "posted" | "portfolio" {
  if (project.legacyJobId) return "posted";
  return hasArtifactSignature(project, artifactsForProject) ? "portfolio" : "posted";
}

// ——— Runner (operator-invoked once from the dashboard/CLI, idempotent) ———
// npx convex run garden/projectOriginMigration:migrateProjectOrigin --prod

export const migrateProjectOrigin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();

    let portfolio = 0;
    let posted = 0;
    let skipped = 0;

    for (const project of projects) {
      if (project.origin !== undefined) {
        skipped++;
        continue;
      }

      const artifactsForProject = await ctx.db
        .query("artifacts")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();

      const origin = classifyOrigin(project, artifactsForProject);
      await ctx.db.patch(project._id, { origin });
      if (origin === "portfolio") portfolio++;
      else posted++;
    }

    return {
      total: projects.length,
      skipped, // already had `origin` set — untouched by this run
      classified: { portfolio, posted },
    };
  },
});
