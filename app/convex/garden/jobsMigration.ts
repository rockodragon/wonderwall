// W2: freeze legacy jobs, copy into projects (spec §5, architect plan).
// Idempotent by legacyJobId — safe to run repeatedly; a job already migrated
// is skipped. Legacy jobs keep working until the 301s flip (route layer, W2).
//
// Budget note: legacy compensationRange is free text ("$500-$1000", "DOE") —
// we parse a number when one is unambiguous, else leave budget unset and
// carry the original text into the blurb. NEW paid projects require numeric
// budget (projects.ts); migrated ones are exempt by construction.

import { v } from "convex/values";
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

/** Free text → a declared budget, ONLY when the text is actually about money.
 *
 * "$1,200" → 1200 · "$500-$1000" → 500 (the declared floor) · "DOE" → undefined
 * "1.5 Burritos/day" → undefined (a real prod row: the old parser turned this
 * into a $1.50 budget on a public page — parse conservatively or not at all).
 *
 * Rules: a bare number only counts when it's a plausible project budget
 * (>= MIN_PLAUSIBLE_BUDGET); anything with a non-monetary unit word attached
 * is left unparsed and carried into the blurb verbatim instead. */
const MIN_PLAUSIBLE_BUDGET = 50;
const NON_MONETARY = /[a-z]{3,}/i;

export function parseBudget(range?: string): number | undefined {
  if (!range) return undefined;
  const cleaned = range.replace(/,/g, "");
  const match = cleaned.match(/\$\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const hadDollarSign = Boolean(match[1]);
  const n = Number(match[1] ?? match[2]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Strip the number we matched, then look for stray words ("Burritos/day",
  // "per hour" — units we can't honestly convert into a project budget).
  const remainder = cleaned.replace(match[0], "");
  const currencyWords = /^(usd|dollars?|flat|total|budget|per\s*project)?$/i;
  const leftover = remainder.trim();
  if (leftover && NON_MONETARY.test(leftover) && !currencyWords.test(leftover)) {
    return undefined;
  }
  if (!hadDollarSign && n < MIN_PLAUSIBLE_BUDGET) return undefined;
  return n;
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

/** One-off repair for rows migrated before parseBudget got conservative:
 * re-derives budget from the source job and, optionally, archives a project
 * by id (used for obvious test rows that shouldn't sit on a public page).
 * Idempotent. Run:
 *   npx convex run garden/jobsMigration:repairMigratedProjects --prod
 *   npx convex run garden/jobsMigration:archiveProject '{"projectId":"..."}' --prod
 */
export const repairMigratedProjects = internalMutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    let repaired = 0;
    for (const project of projects) {
      if (!project.legacyJobId) continue;
      const job = await ctx.db.get(project.legacyJobId);
      if (!job) continue;
      const mapped = mapJobToProject(job);
      if (mapped.budget !== project.budget || mapped.blurb !== project.blurb) {
        await ctx.db.patch(project._id, {
          budget: mapped.budget,
          blurb: mapped.blurb,
          updatedAt: Date.now(),
        });
        repaired++;
      }
    }
    return { repaired, total: projects.length };
  },
});

export const archiveProject = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { ok: false, reason: "No such project." };
    await ctx.db.patch(args.projectId, { status: "archived", updatedAt: Date.now() });
    return { ok: true, title: project.title };
  },
});
