// W2: freeze legacy jobs, copy into projects (spec §5, architect plan).
// Idempotent by legacyJobId — safe to run repeatedly; a job already migrated
// is skipped. Legacy jobs keep working until the 301s flip (route layer, W2).
//
// Budget note: legacy compensationRange is free text ("$500-$1000", "DOE") —
// we parse a number when one is unambiguous, else leave budget unset and
// carry the original text into the blurb. NEW paid projects require numeric
// budget (projects.ts); migrated ones are exempt by construction.

import { internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ——— Pure core ———

export interface LegacyJob {
  _id: Id<"jobs">;
  posterId: Id<"users">;
  title: string;
  description: string;
  compensationRange?: string;
  status?: string; // "Open" | "Closed"
  createdAt?: number;
  _creationTime: number;
}

/** "$1,200" → 1200 · "$500-$1000" → 500 (the declared floor) · "DOE" → undefined */
export function parseBudget(range?: string): number | undefined {
  if (!range) return undefined;
  const match = range.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function mapJobToProject(job: LegacyJob) {
  const budget = parseBudget(job.compensationRange);
  const compNote =
    job.compensationRange && budget === undefined
      ? `\n\nCompensation: ${job.compensationRange}`
      : "";
  return {
    userId: job.posterId,
    kind: "paid" as const,
    title: job.title,
    blurb: `${job.description}${compNote}`,
    budget,
    status: job.status === "Closed" ? "archived" : "active",
    legacyJobId: job._id,
    createdAt: job.createdAt ?? job._creationTime,
    updatedAt: Date.now(),
  };
}

// ——— Runner (operator-invoked once from the dashboard/CLI, idempotent) ———

export const migrateJobsToProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").collect();
    let migrated = 0;
    let skipped = 0;
    for (const job of jobs) {
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_legacyJobId", (q) => q.eq("legacyJobId", job._id))
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("projects", mapJobToProject(job));
      migrated++;
    }
    return { migrated, skipped, total: jobs.length };
  },
});
