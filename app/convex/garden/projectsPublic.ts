// Public Projects browse + detail (spec §5) — the missing "how do I even see
// creative work" surface: /projects and /projects/:id. `projects` holds two
// kinds — kind "passion" (goal/raisedCents/storySlug, keep-what-you-raise)
// and kind "paid" (budget) — a legacy `jobs` migration lands both as "paid"
// rows shortly, so listProjects/getProject must read cleanly whether the
// table has zero rows or is fully populated.
//
// Pure core (card shaping + the money-line resolver) is unit-tested without
// Convex in projectsPublic.test.ts; wrappers below are thin, same
// pure-core/ctx.db split as allocations.ts and stories.ts. Credits reuse
// allocations.ts's shapeCredits directly rather than duplicating the
// "Funded by the {org} Fund" derivation.

import { v } from "convex/values";
import { query } from "../_generated/server";
import { shapeCredits, type CreditEntry } from "./allocations";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export type ProjectKind = "passion" | "paid";

export interface ProjectLike {
  _id: unknown;
  kind: string;
  title: string;
  blurb?: string;
  photoUrl?: string;
  budget?: number;
  goal?: number;
  raisedCents?: number;
  storySlug?: string;
  status?: string;
  origin?: string;
}

export interface ProjectCard {
  id: string;
  kind: ProjectKind;
  title: string;
  blurb?: string;
  byName: string;
  photoUrl?: string;
  budget?: number;
  goal?: number;
  raisedCents?: number;
  storySlug?: string;
  moneyLine: string;
  status?: string;
}

/** Dollar formatting for this file's own money lines — a display-only
 * analog of ui.tsx's formatMoney (which is cents-in), kept local since
 * Convex functions don't import from app/. Whole dollars print bare;
 * fractional amounts (raisedCents/100 can land on odd cents) keep 2dp. */
function formatDollars(amount: number): string {
  const isWhole = Number.isInteger(amount);
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * The money line for a project card/detail: paid → declared budget; passion
 * with a real (>0) goal → "$340 of $500"; passion with no goal set → "Seeking
 * support" rather than a bare/undefined line. raisedCents defaults to 0 so a
 * fresh passion project with a goal still renders "$0 of $500", not a blank.
 */
export function resolveMoneyLine(project: {
  kind: string;
  budget?: number;
  goal?: number;
  raisedCents?: number;
}): string {
  if (project.kind === "paid") {
    return project.budget !== undefined
      ? `Budget ${formatDollars(project.budget)}`
      : "Budget not set";
  }
  if (project.goal !== undefined && project.goal > 0) {
    const raised = (project.raisedCents ?? 0) / 100;
    return `${formatDollars(raised)} of ${formatDollars(project.goal)}`;
  }
  return "Seeking support";
}

/**
 * Shapes a raw project row + its resolved owner name into the plain-JSON
 * card both listProjects and getProject return — one mapper, so the browse
 * grid and the detail page never disagree on a project's display shape.
 * kind falls back to "passion" only in the pathological case of a row whose
 * kind isn't literally "paid" (schema stores kind as a bare string).
 */
export function shapeProjectCard(project: ProjectLike, ownerName: string): ProjectCard {
  const kind: ProjectKind = project.kind === "paid" ? "paid" : "passion";
  return {
    id: String(project._id),
    kind,
    title: project.title,
    blurb: project.blurb,
    byName: ownerName,
    photoUrl: project.photoUrl,
    budget: project.budget,
    goal: project.goal,
    raisedCents: project.raisedCents,
    storySlug: project.storySlug,
    status: project.status,
    moneyLine: resolveMoneyLine({ kind, budget: project.budget, goal: project.goal, raisedCents: project.raisedCents }),
  };
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

const FALLBACK_OWNER_NAME = "A Garden creative";

// Statuses a browsing user should ever see. "pending" isn't used yet;
// "archived" is a deliberate hide — a creator/operator took it out of the
// default browse view on purpose. Kept in sync with garden/projects.ts's
// VISIBLE_STATUSES (two listProjects implementations, see file header).
const VISIBLE_STATUSES = new Set(["active", "in_progress", "completed"]);

// Portfolio-origin rows (artifacts.create's companion-project side effect —
// a quick single-artifact share, not a deliberate post) don't belong on the
// browse grid; they already have a home at /works. Only an EXPLICIT
// "portfolio" excludes — a row with no origin at all (predates the field,
// migration hasn't run) reads as "posted" so real projects never vanish
// defensively. Kept in sync with garden/projects.ts's listProjects.
function isPosted(p: { origin?: string }): boolean {
  return p.origin !== "portfolio";
}

/** Public, unauthenticated — the /projects browse grid. Visible (non-hidden)
 * projects, newest first, capped at 50. `kind` queries a single indexed
 * range by kind only, then filters status in JS (status is no longer a
 * single fixed value, so the index range can't do this alone); omitting
 * `kind` merges both kind buckets so "All" still reads off by_kind_status
 * rather than a table scan. */
export const listProjects = query({
  args: {
    kind: v.optional(v.union(v.literal("passion"), v.literal("paid"))),
  },
  handler: async (ctx, args) => {
    const rows = args.kind
      ? await ctx.db
          .query("projects")
          .withIndex("by_kind_status", (q) => q.eq("kind", args.kind!))
          .collect()
      : (
          await Promise.all(
            (["passion", "paid"] as const).map((kind) =>
              ctx.db
                .query("projects")
                .withIndex("by_kind_status", (q) => q.eq("kind", kind))
                .collect(),
            ),
          )
        ).flat();

    const visible = rows.filter((p) => VISIBLE_STATUSES.has(p.status) && isPosted(p));
    const newestFirst = [...visible].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
    if (newestFirst.length === 0) return [];

    const userIds = [...new Set(newestFirst.map((p) => p.userId))];
    const profiles = await Promise.all(
      userIds.map((userId) =>
        ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", userId)).unique(),
      ),
    );
    const nameByUserId = new Map<string, string>();
    for (const p of profiles) if (p) nameByUserId.set(String(p.userId), p.name);

    return newestFirst.map((p) =>
      shapeProjectCard(p, nameByUserId.get(String(p.userId)) ?? FALLBACK_OWNER_NAME),
    );
  },
});

/** Public, unauthenticated — a single project's detail page. Takes the raw
 * route-param string (not v.id) and normalizes it, so an unknown or
 * malformed id reads the same as "not found" (null) instead of throwing a
 * validation error at the client. */
export const getProject = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("projects", args.projectId);
    if (!id) return null;

    const project = await ctx.db.get(id);
    if (!project) return null;

    const [ownerProfile, allocationRows] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_userId", (q) => q.eq("userId", project.userId)).unique(),
      ctx.db.query("allocations").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).collect(),
    ]);

    let credits: CreditEntry[] = [];
    if (allocationRows.length > 0) {
      const hostOrgIds = [...new Set(allocationRows.map((a) => a.hostOrgId))];
      const hostOrgs = await Promise.all(hostOrgIds.map((orgId) => ctx.db.get(orgId)));
      const orgNameById = new Map<string, string>();
      for (const org of hostOrgs) if (org) orgNameById.set(String(org._id), org.name);
      credits = shapeCredits(allocationRows, orgNameById);
    }

    return {
      ...shapeProjectCard(project, ownerProfile?.name ?? FALLBACK_OWNER_NAME),
      credits,
    };
  },
});
