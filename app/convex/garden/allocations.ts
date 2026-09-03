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

// ——————————————————————————————————————————————————————————————
// Pool inflows (grantContributions — money IN, the mirror of allocations'
// money OUT). Same pure/wrapper split as the rest of this file.
// ——————————————————————————————————————————————————————————————

export interface ContributionLike {
  type: string;
  grossCents: number;
  platformCents: number;
  poolCents: number; // may be negative on an adjustment (refund/chargeback clawback)
  period: string;
}

export interface InflowByType {
  type: string;
  poolCents: number;
  count: number;
}

export interface InflowByPeriod {
  period: string;
  poolCents: number;
}

export interface PoolInflows {
  poolCents: number;
  grossCents: number;
  platformCents: number;
  byType: InflowByType[];
  byPeriod: InflowByPeriod[];
}

/**
 * All-time totals plus grouping by type and by period — the fund page's
 * "Money in" section. Empty input yields the zeroed shape (same empty-state
 * care as computeFundTotals) rather than an absent field. byPeriod sorts
 * newest-first, same lexical-descending convention as computeFundTotals.
 */
export function computePoolInflows(contributions: ContributionLike[]): PoolInflows {
  let poolCents = 0;
  let grossCents = 0;
  let platformCents = 0;
  const byTypeMap = new Map<string, { poolCents: number; count: number }>();
  const byPeriodMap = new Map<string, number>();

  for (const c of contributions) {
    poolCents += c.poolCents;
    grossCents += c.grossCents;
    platformCents += c.platformCents;

    const t = byTypeMap.get(c.type) ?? { poolCents: 0, count: 0 };
    t.poolCents += c.poolCents;
    t.count += 1;
    byTypeMap.set(c.type, t);

    byPeriodMap.set(c.period, (byPeriodMap.get(c.period) ?? 0) + c.poolCents);
  }

  const byType = [...byTypeMap.entries()].map(([type, v]) => ({ type, ...v }));
  const byPeriod = [...byPeriodMap.entries()]
    .map(([period, cents]) => ({ period, poolCents: cents }))
    .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));

  return { poolCents, grossCents, platformCents, byType, byPeriod };
}

/**
 * The pool's running balance: everything that's ever locked into the pool
 * (contributions' poolCents — negative entries, i.e. adjustments/clawbacks,
 * net out naturally) minus everything awarded out of it (allocations'
 * amountCents). Awards out are 0% (community-grant-pools.md §2), so no fee
 * math belongs here — this is pure subtraction.
 */
export function computePoolBalance(
  contributions: ContributionLike[],
  allocations: AllocationLike[],
): number {
  const inflowPoolCents = contributions.reduce((sum, c) => sum + c.poolCents, 0);
  const outflowCents = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  return inflowPoolCents - outflowCents;
}

/** Same integer/positive rule as isValidAmountCents, for the three inflow
 * types recordContribution takes a gross amount for (adjustment is signed
 * and validated separately in the mutation itself). */
export const isValidContributionGrossCents = isValidAmountCents;

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

/** Operator-only (same isAdminProfile gate as recordAllocation) — records
 * the three direct pool inflows the Stripe webhook never sees (topup_in,
 * sponsor_in, entry_fee_in) plus adjustment (a refund/chargeback clawback,
 * or any other manual correction).
 *
 * For the three inflows, `grossCents` is what the operator is entering as
 * having actually come in — 10% platform, same "one bite per dollar" split
 * as a Stripe pool_contribution (community-grant-pools.md §2). For
 * "adjustment", `grossCents` is instead read as the SIGNED pool-cents delta
 * directly (negative for a clawback) — no fee applies to an adjustment,
 * platformCents is always 0. */
export const recordContribution = mutation({
  args: {
    hostOrgSlug: v.string(),
    type: v.union(
      v.literal("topup_in"),
      v.literal("sponsor_in"),
      v.literal("entry_fee_in"),
      v.literal("adjustment"),
    ),
    grossCents: v.number(),
    note: v.optional(v.string()),
    payerName: v.optional(v.string()),
    period: v.string(),
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
          "The pool ledger is entered by operators — this account doesn't have that access.",
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

    let grossCents: number;
    let platformCents: number;
    let poolCents: number;

    if (args.type === "adjustment") {
      if (!Number.isInteger(args.grossCents) || args.grossCents === 0) {
        throw new ConvexError({
          code: "invalid_amount",
          reason: "Give the adjustment a non-zero whole number of cents (negative for a clawback).",
        });
      }
      // Signed pool-cents delta, straight through — no fee on an adjustment.
      grossCents = args.grossCents;
      platformCents = 0;
      poolCents = args.grossCents;
    } else {
      if (!isValidContributionGrossCents(args.grossCents)) {
        throw new ConvexError({
          code: "invalid_amount",
          reason: "Give the contribution a positive whole number of cents.",
        });
      }
      grossCents = args.grossCents;
      platformCents = Math.round(grossCents * 0.1);
      poolCents = grossCents - platformCents;
    }

    const id = await ctx.db.insert("grantContributions", {
      hostOrgId: hostOrg._id,
      type: args.type,
      grossCents,
      platformCents,
      poolCents,
      payerName: args.payerName,
      period: args.period,
      note: args.note,
      createdAt: Date.now(),
    });
    return { contributionId: id };
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

    const contributions = await ctx.db
      .query("grantContributions")
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
      org: {
        name: hostOrg.name,
        kind: hostOrg.kind,
        slug: hostOrg.slug,
        givingUrl: hostOrg.givingUrl,
        paymentLinkUrl: hostOrg.paymentLinkUrl,
      },
      totals: computeFundTotals(allocations),
      ledger: shapeLedger(allocations, projectsById),
      // Money in (grantContributions), and the pool's running balance —
      // only meaningful for "platform"/"community" hostOrgs, but computed
      // for every kind so the shape never depends on a branch (empty-state
      // care, same as totals/ledger above: a "church"/"org" fund with no
      // contributions still gets zeroed inflows, not an absent field).
      inflows: computePoolInflows(contributions),
      balanceCents: computePoolBalance(contributions, allocations),
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
