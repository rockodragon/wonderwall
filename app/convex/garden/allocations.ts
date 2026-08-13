// AP Fund allocations — operator-entered public ledger (W5, spec §1.4). We
// process zero payments on this lane (D3): AP decides allocations off-
// platform, an operator records them here, and the resulting fund page is
// "the trust engine of the church pitch" (spec) — a treasurer with no
// account must be able to see exactly where fund money went. It must also
// render gracefully before AP has entered a single allocation (founder ask:
// empty-state care), so every read path returns a full, zeroed shape rather
// than an absent field.
//
// Pure core (totals/grouping math + ledger/credit shaping) is unit-tested
// without Convex in allocations.test.ts; the query/mutation wrappers below
// are thin, matching garden/coverage.ts and garden/stripeHandlers.ts's split
// between a pure core and a ctx.db-touching wrapper.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import { isAdminProfile } from "../helpers";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export interface AllocationLike {
  amountCents: number;
  period: string;
}

export interface PeriodTotal {
  period: string;
  cents: number;
}

export interface FundTotals {
  allTimeCents: number;
  byPeriod: PeriodTotal[];
}

/**
 * All-time + per-period sums. byPeriod is newest-first: periods are
 * "YYYY-MM" or "YYYY-MM · monthly", both of which sort correctly on lexical
 * descending order over the YYYY-MM prefix, so no date parsing is needed.
 * Empty input yields the zeroed shape the fund page needs pre-launch — the
 * page must render, not branch on a missing field.
 */
export function computeFundTotals(allocations: AllocationLike[]): FundTotals {
  let allTimeCents = 0;
  const byPeriodMap = new Map<string, number>();
  for (const a of allocations) {
    allTimeCents += a.amountCents;
    byPeriodMap.set(a.period, (byPeriodMap.get(a.period) ?? 0) + a.amountCents);
  }
  const byPeriod = [...byPeriodMap.entries()]
    .map(([period, cents]) => ({ period, cents }))
    .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
  return { allTimeCents, byPeriod };
}

export interface LedgerRow {
  recipientName: string;
  amountCents: number;
  period: string;
  note?: string;
  projectId?: unknown;
  createdAt: number;
}

export interface ProjectLookup {
  title: string;
  slug?: string;
}

export interface LedgerEntry {
  period: string;
  amount: number; // dollars — the ledger is a display surface, not a ledger of cents
  recipientName: string;
  projectTitle?: string;
  projectSlug?: string;
  note?: string;
}

/**
 * Newest-first ledger shaping — the public fund page's core render data,
 * e.g. "$500 · Aug 2026 · Shua — Psalms for the 2AM" (voice: factual, no
 * editorializing). projectsById is keyed by String(projectId) so callers
 * can batch-fetch projects once regardless of how ids are typed.
 */
export function shapeLedger(
  allocations: LedgerRow[],
  projectsById: Map<string, ProjectLookup>,
): LedgerEntry[] {
  return [...allocations]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => {
      const project = a.projectId ? projectsById.get(String(a.projectId)) : undefined;
      return {
        period: a.period,
        amount: a.amountCents / 100,
        recipientName: a.recipientName,
        projectTitle: project?.title,
        projectSlug: project?.slug,
        note: a.note,
      };
    });
}

export interface CreditRow {
  hostOrgId: unknown;
  period: string;
  amountCents: number;
  createdAt: number;
}

export interface CreditEntry {
  orgName: string;
  period: string;
  amount: number;
}

/**
 * "Funded by the {org} Fund" credit block data — reused by getProjectCredits
 * below AND by stories.ts's getStoryPage (credits.allocations), so the two
 * public pages never disagree on how a credit line is shaped. Newest first,
 * same convention as the ledger.
 */
export function shapeCredits(
  allocations: CreditRow[],
  orgNameById: Map<string, string>,
): CreditEntry[] {
  return [...allocations]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((a) => ({
      orgName: orgNameById.get(String(a.hostOrgId)) ?? "A sponsor",
      period: a.period,
      amount: a.amountCents / 100,
    }));
}

/** Allocations are entered in cents; must be a positive whole number. */
export function isValidAmountCents(amountCents: number): boolean {
  return Number.isInteger(amountCents) && amountCents > 0;
}

/**
 * When projectId is given and recipientName is omitted, the mutation
 * denormalizes from the project owner's profile name (so the ledger
 * survives project edits/deletes — schema comment). Returns null when
 * neither an explicit name nor a resolvable owner name is available; the
 * mutation turns that into the warm "who is this for?" error.
 */
export function resolveRecipientName(args: {
  recipientNameArg?: string;
  ownerProfileName?: string;
}): string | null {
  const explicit = args.recipientNameArg?.trim();
  if (explicit) return explicit;
  const owner = args.ownerProfileName?.trim();
  return owner || null;
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

/** Operator-only (admin surface — spec §1.4: "AP decides them off-platform"). */
export const recordAllocation = mutation({
  args: {
    hostOrgSlug: v.string(),
    projectId: v.optional(v.id("projects")),
    recipientName: v.optional(v.string()),
    amountCents: v.number(),
    period: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!isAdminProfile(profile)) {
      throw new ConvexError({
        code: "forbidden",
        reason:
          "The allocations ledger is entered by operators — this account doesn't have that access.",
      });
    }

    if (!isValidAmountCents(args.amountCents)) {
      throw new ConvexError({
        code: "invalid_amount",
        reason: "Give the allocation a positive whole number of cents.",
      });
    }

    const hostOrg = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.hostOrgSlug))
      .unique();
    if (!hostOrg) {
      throw new ConvexError({
        code: "unknown_fund",
        reason: `No fund found for "${args.hostOrgSlug}" — check the slug.`,
      });
    }

    let ownerProfileName: string | undefined;
    if (args.projectId && !args.recipientName) {
      const project = await ctx.db.get(args.projectId);
      if (project) {
        const ownerProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", project.userId))
          .unique();
        ownerProfileName = ownerProfile?.name;
      }
    }

    const recipientName = resolveRecipientName({
      recipientNameArg: args.recipientName,
      ownerProfileName,
    });
    if (!recipientName) {
      throw new ConvexError({
        code: "missing_recipient",
        reason: "Who is this allocation for? Give a recipient name, or a project to pull one from.",
      });
    }

    const id = await ctx.db.insert("allocations", {
      hostOrgId: hostOrg._id,
      projectId: args.projectId,
      recipientName,
      amountCents: args.amountCents,
      period: args.period,
      note: args.note,
      createdAt: Date.now(),
    });
    return { allocationId: id };
  },
});

/** Public, unauthenticated — the church-treasurer page (spec §1.4 accepts). */
export const getFundPage = query({
  args: { hostOrgSlug: v.string() },
  handler: async (ctx, args) => {
    const hostOrg = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.hostOrgSlug))
      .unique();
    if (!hostOrg) return null; // unknown slug — distinct from a real, empty fund

    const allocations = await ctx.db
      .query("allocations")
      .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", hostOrg._id))
      .collect();

    const projectIds = [
      ...new Set(
        allocations
          .map((a) => a.projectId)
          .filter((id): id is Id<"projects"> => id !== undefined),
      ),
    ];
    const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
    const projectsById = new Map<string, ProjectLookup>();
    for (const p of projects) {
      if (p) projectsById.set(String(p._id), { title: p.title, slug: p.storySlug });
    }

    return {
      org: { name: hostOrg.name, givingUrl: hostOrg.givingUrl },
      totals: computeFundTotals(allocations),
      ledger: shapeLedger(allocations, projectsById),
    };
  },
});

/** Public, unauthenticated — powers "Funded by the {org} Fund" on project pages. */
export const getProjectCredits = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const allocations = await ctx.db
      .query("allocations")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    if (allocations.length === 0) return [];

    const hostOrgIds = [...new Set(allocations.map((a) => a.hostOrgId))];
    const hostOrgs = await Promise.all(hostOrgIds.map((id) => ctx.db.get(id)));
    const orgNameById = new Map<string, string>();
    for (const org of hostOrgs) {
      if (org) orgNameById.set(String(org._id), org.name);
    }

    return shapeCredits(allocations, orgNameById);
  },
});
