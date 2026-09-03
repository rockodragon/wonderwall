// Operator ledger — the platform-wide money/membership report behind
// /admin/garden's reporting page. Read-only; nothing here writes. Reuses
// the pool math from garden/allocations.ts (computePoolInflows/
// computePoolBalance) and the host-earnings split from garden/products.ts
// (computeHostEarnings) rather than re-deriving them, so this report can
// never disagree with the fund/earnings pages those already power.
//
// House style, same as operator.ts: pure core (all the arithmetic and
// shaping) at the top — unit-tested without Convex in reports.test.ts —
// thin ctx.db wrappers below that collect the small operator-scale tables
// directly (no pagination, same call as operator.ts's listOperatorData)
// and denormalize names via Maps so the client never joins.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import { isAdminProfile } from "../helpers";
import {
  computePoolBalance,
  computePoolInflows,
  type AllocationLike,
  type ContributionLike,
} from "./allocations";
import { computeHostEarnings, type EarningsLike } from "./products";
import { assertCanManageCommunity, normalizeCommunity, COMMUNITY_KIND } from "./communities";

// ——————————————————————————————————————————————————————————————
// Pure core — no ctx. Unit-tested in reports.test.ts.
// ——————————————————————————————————————————————————————————————

/** "YYYY-MM" in UTC — the same period convention every Garden money table
 * already writes by hand (allocations.period, grantContributions.period,
 * productPurchases.period). Used only for rows that don't carry their own
 * period field (ticketPurchases). */
export function periodOf(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** The distinct months with any activity, newest first, capped at 12 — the
 * report's top-level `periods` list scopes every by-period chart. */
export function computePeriods(periods: string[], max = 12): string[] {
  const uniq = [...new Set(periods)];
  uniq.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return uniq.slice(0, max);
}

// ——— Fees ———

export type FeeSourceKey = "dues" | "pool_contributions" | "host_sales" | "event_tickets";

const FEE_SOURCE_ORDER: { source: FeeSourceKey; label: string; splitRecorded: boolean }[] = [
  { source: "dues", label: "Member dues", splitRecorded: true },
  { source: "pool_contributions", label: "Pool contributions", splitRecorded: true },
  { source: "host_sales", label: "Host sales", splitRecorded: true },
  // ticketPurchases carries no split fields (no platformCents column) —
  // the report says so rather than implying a real 0% split was recorded.
  { source: "event_tickets", label: "Event tickets", splitRecorded: false },
];

/** A single money-in row, shaped for fee rollup. `pool_other` is the other
 * four grantContributions types (topup_in/sponsor_in/entry_fee_in/
 * adjustment): their platformCents count toward the total and byPeriod, but
 * they get no bySource row of their own — the contract's fixed four. */
export interface FeeEvent {
  source: FeeSourceKey | "pool_other";
  period: string;
  grossCents: number;
  platformCents: number;
}

export interface FeeBySource {
  source: FeeSourceKey;
  label: string;
  grossCents: number;
  platformCents: number;
  count: number;
  splitRecorded: boolean;
}

export interface FeeByPeriod {
  period: string;
  grossCents: number;
  platformCents: number;
}

export interface FeeSummary {
  totalPlatformCents: number;
  bySource: FeeBySource[];
  byPeriod: FeeByPeriod[];
}

/** Fee totals by source (fixed order) and by period (newest first). Empty
 * input yields the zeroed fixed-order shape, same empty-state care as
 * allocations.ts's computeFundTotals — the page must render pre-launch. */
export function computeFeeSummary(events: FeeEvent[]): FeeSummary {
  let totalPlatformCents = 0;
  const bySourceMap = new Map<FeeSourceKey, { grossCents: number; platformCents: number; count: number }>();
  const byPeriodMap = new Map<string, { grossCents: number; platformCents: number }>();

  for (const e of events) {
    totalPlatformCents += e.platformCents;

    const p = byPeriodMap.get(e.period) ?? { grossCents: 0, platformCents: 0 };
    p.grossCents += e.grossCents;
    p.platformCents += e.platformCents;
    byPeriodMap.set(e.period, p);

    if (e.source === "pool_other") continue;
    const s = bySourceMap.get(e.source) ?? { grossCents: 0, platformCents: 0, count: 0 };
    s.grossCents += e.grossCents;
    s.platformCents += e.platformCents;
    s.count += 1;
    bySourceMap.set(e.source, s);
  }

  const bySource = FEE_SOURCE_ORDER.map(({ source, label, splitRecorded }) => {
    const s = bySourceMap.get(source) ?? { grossCents: 0, platformCents: 0, count: 0 };
    return { source, label, splitRecorded, ...s };
  });

  const byPeriod = [...byPeriodMap.entries()]
    .map(([period, v]) => ({ period, ...v }))
    .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));

  return { totalPlatformCents, bySource, byPeriod };
}

// ——— Pools ———

export interface PoolOrgLike {
  hostOrgId: string;
  name: string;
  slug: string;
  kind: string;
}

export interface PoolRow extends PoolOrgLike {
  inflowPoolCents: number;
  inflowGrossCents: number;
  inflowPlatformCents: number;
  outflowCents: number;
  balanceCents: number;
  byType: { type: string; poolCents: number; count: number }[];
}

/** One pool's picture — thin reshaping on top of computePoolInflows/
 * computePoolBalance (allocations.ts) so this never disagrees with the
 * per-fund page those already power. */
export function buildPoolRow(
  org: PoolOrgLike,
  contributions: ContributionLike[],
  allocations: AllocationLike[],
): PoolRow {
  const inflows = computePoolInflows(contributions);
  const outflowCents = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  return {
    ...org,
    inflowPoolCents: inflows.poolCents,
    inflowGrossCents: inflows.grossCents,
    inflowPlatformCents: inflows.platformCents,
    outflowCents,
    balanceCents: computePoolBalance(contributions, allocations),
    byType: inflows.byType,
  };
}

/** Platform pool first, then the rest alphabetically by name. */
export function sortPools<T extends { kind: string; name: string }>(pools: T[]): T[] {
  return [...pools].sort((a, b) => {
    const aPlatform = a.kind === "platform" ? 0 : 1;
    const bPlatform = b.kind === "platform" ? 0 : 1;
    if (aPlatform !== bPlatform) return aPlatform - bPlatform;
    return a.name.localeCompare(b.name);
  });
}

// ——— Host earnings ———

export interface HostEarningsRow {
  hostOrgId: string;
  name: string;
  slug: string;
  salesCount: number;
  grossCents: number;
  platformCents: number;
  hostCents: number;
  paidOutCents: number;
  owedCents: number;
  activeProducts: number;
}

export function buildHostEarningsRow(
  org: { hostOrgId: string; name: string; slug: string },
  purchases: EarningsLike[],
  payouts: { amountCents: number }[],
  activeProducts: number,
): HostEarningsRow {
  return { ...org, ...computeHostEarnings(purchases, payouts), activeProducts };
}

// ——— Membership levels ———

export type Level = "free" | "seat" | "five" | "host";
const LEVEL_RANK: Record<string, number> = { seat: 1, five: 2, host: 3 };
/** Same grace rule as entitlements.ts's deriveGardenUser: past_due keeps
 * the level (billing hiccups don't silently strip a seat). */
const ENTITLED_STATUSES = new Set(["active", "past_due"]);

export interface MembershipLevelRow {
  level: string;
  status: string;
  coveredByCodeId?: unknown;
}

/** The level rule (entitlements.ts's deriveGardenUser, restated here so the
 * report never needs a ProfileRow): highest entitled level wins; the
 * coveredByCodeId that comes back is the WINNING row's, not just any row's
 * — a user holding both a covered seat and a paid five reads as an
 * uncovered five (five outranks seat), matching what deriveGardenUser would
 * derive for the same person. No entitled row = "free". */
export function winningMembership(rows: MembershipLevelRow[]): { level: Level; coveredByCodeId?: unknown } {
  let level: Level = "free";
  let best = 0;
  let coveredByCodeId: unknown;
  for (const m of rows) {
    if (!ENTITLED_STATUSES.has(m.status)) continue;
    const rank = LEVEL_RANK[m.level] ?? 0;
    if (rank > best) {
      best = rank;
      level = m.level as Level;
      coveredByCodeId = m.coveredByCodeId;
    }
  }
  return { level, coveredByCodeId };
}

export interface CommunityMemberForSummary {
  role: string;
  status: string; // "active" | "pending" (removed rows should be filtered out before calling)
  isHome?: boolean;
  memberships: MembershipLevelRow[]; // this user's PLATFORM membership rows
}

export interface CommunityMembersSummary {
  total: number;
  pending: number;
  hosts: number;
  byLevel: { free: number; seat: number; five: number; host: number };
  covered: number;
  home: number;
}

/** One community's members.{total,pending,hosts,byLevel,covered,home} —
 * shared by getPlatformReport's communities[] and the standalone
 * getCommunityMembersByLevel so the two can never disagree. */
export function summarizeCommunityMembers(members: CommunityMemberForSummary[]): CommunityMembersSummary {
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending").length;
  const hosts = active.filter((m) => m.role === "host").length;
  const byLevel = { free: 0, seat: 0, five: 0, host: 0 };
  let covered = 0;
  let home = 0;
  for (const m of active) {
    const w = winningMembership(m.memberships);
    byLevel[w.level] += 1;
    if (w.coveredByCodeId) covered += 1;
    if (m.isHome) home += 1;
  }
  return { total: active.length, pending, hosts, byLevel, covered, home };
}

export interface PlatformMembershipRow {
  userId: string;
  level: string;
  status: string;
  coveredByCodeId?: unknown;
}

export interface PlatformMembershipsSummary {
  active: number;
  pastDue: number;
  canceled: number;
  byLevel: { seat: number; five: number; host: number };
  covered: number;
}

/** Platform-wide seats, independent of communities. active/pastDue/canceled
 * are raw row counts (a person can hold more than one membership row across
 * their history); byLevel/covered dedupe to one winning row per user among
 * currently-entitled rows, same rule as summarizeCommunityMembers. */
export function summarizePlatformMemberships(rows: PlatformMembershipRow[]): PlatformMembershipsSummary {
  const active = rows.filter((r) => r.status === "active").length;
  const pastDue = rows.filter((r) => r.status === "past_due").length;
  const canceled = rows.filter((r) => r.status === "canceled").length;

  const byUser = new Map<string, MembershipLevelRow[]>();
  for (const r of rows) {
    if (!ENTITLED_STATUSES.has(r.status)) continue;
    const arr = byUser.get(r.userId) ?? [];
    arr.push(r);
    byUser.set(r.userId, arr);
  }
  const byLevel = { seat: 0, five: 0, host: 0 };
  let covered = 0;
  for (const memberships of byUser.values()) {
    const w = winningMembership(memberships);
    if (w.level !== "free") byLevel[w.level] += 1;
    if (w.coveredByCodeId) covered += 1;
  }
  return { active, pastDue, canceled, byLevel, covered };
}

// ——— Recent activity ———

export type RecentSource =
  | "dues"
  | "pool_contribution"
  | "pool_other"
  | "allocation"
  | "host_sale"
  | "event_ticket"
  | "host_payout";

export interface RecentItem {
  at: number;
  source: RecentSource;
  description: string;
  hostOrgName?: string;
  grossCents: number; // signed — allocations and payouts are negative (money out)
  platformCents: number;
  ref?: string;
}

/** Newest-first, capped at 60 — the report's activity feed across every
 * money table. Pure sort/slice; callers build the RecentItem[] up front. */
export function buildRecent(events: RecentItem[], cap = 60): RecentItem[] {
  return [...events].sort((a, b) => b.at - a.at).slice(0, cap);
}

export function duesDescription(level?: string): string {
  return level ? `Dues share · ${level}` : "Dues share";
}

const CONTRIBUTION_LABEL: Record<string, string> = {
  contribution_in: "Pool contribution",
  topup_in: "Top-up",
  sponsor_in: "Sponsor contribution",
  entry_fee_in: "Entry fee",
  adjustment: "Adjustment",
};

export function contributionDescription(type: string): string {
  return CONTRIBUTION_LABEL[type] ?? "Contribution";
}

export function allocationDescription(recipientName: string): string {
  return `Allocation — ${recipientName}`;
}

export function hostSaleDescription(productName: string, hostOrgName: string): string {
  return `${productName} — ${hostOrgName}`;
}

export function eventTicketDescription(tierName: string): string {
  return `Event ticket · ${tierName}`;
}

export function payoutDescription(hostOrgName: string): string {
  return `Payout to ${hostOrgName}`;
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

/** Same gate as operator.ts's requireOperator — every export in this file
 * is an operator-only read. */
async function requireOperator(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated" });

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!isAdminProfile(profile)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "This is an operator tool — this account doesn't have that access.",
    });
  }
  return userId;
}

export const getPlatformReport = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);

    const [
      hostOrgs,
      communityMembers,
      memberships,
      coverageCodes,
      coverageRedemptions,
      grantContributions,
      allocations,
      communityProducts,
      productPurchases,
      hostPayouts,
      ticketPurchases,
      events,
    ] = await Promise.all([
      ctx.db.query("hostOrgs").collect(),
      ctx.db.query("communityMembers").collect(),
      ctx.db.query("memberships").collect(),
      ctx.db.query("coverageCodes").collect(),
      ctx.db.query("coverageRedemptions").collect(),
      ctx.db.query("grantContributions").collect(),
      ctx.db.query("allocations").collect(),
      ctx.db.query("communityProducts").collect(),
      ctx.db.query("productPurchases").collect(),
      ctx.db.query("hostPayouts").collect(),
      ctx.db.query("ticketPurchases").collect(),
      ctx.db.query("events").collect(),
    ]);

    const hostOrgById = new Map(hostOrgs.map((o) => [String(o._id), o]));
    const hostOrgName = (id: unknown) => hostOrgById.get(String(id))?.name;
    const eventById = new Map(events.map((e) => [String(e._id), e]));
    const membershipById = new Map(memberships.map((m) => [String(m._id), m]));
    const productById = new Map(communityProducts.map((p) => [String(p._id), p]));
    const membershipsByUser = new Map<string, MembershipLevelRow[]>();
    for (const m of memberships) {
      const key = String(m.userId);
      const arr = membershipsByUser.get(key) ?? [];
      arr.push(m);
      membershipsByUser.set(key, arr);
    }

    // ——— Fees + periods ———
    const nonRefundedPurchases = productPurchases.filter((p) => p.status !== "refunded");
    const paidTickets = ticketPurchases.filter((t) => t.status === "paid");

    const feeEvents: FeeEvent[] = [
      ...grantContributions.map((c) => ({
        source: (c.type === "dues_share"
          ? "dues"
          : c.type === "contribution_in"
            ? "pool_contributions"
            : "pool_other") as FeeEvent["source"],
        period: c.period,
        grossCents: c.grossCents,
        platformCents: c.platformCents,
      })),
      ...nonRefundedPurchases.map((p) => ({
        source: "host_sales" as const,
        period: p.period,
        grossCents: p.grossCents,
        platformCents: p.platformCents,
      })),
      ...paidTickets.map((t) => ({
        source: "event_tickets" as const,
        period: periodOf(t.createdAt),
        grossCents: t.amountCents,
        platformCents: 0,
      })),
    ];
    const fees = computeFeeSummary(feeEvents);

    const periods = computePeriods([
      ...grantContributions.map((c) => c.period),
      ...allocations.map((a) => a.period),
      ...nonRefundedPurchases.map((p) => p.period),
      ...paidTickets.map((t) => periodOf(t.createdAt)),
    ]);

    // ——— Pools: one per hostOrg with any grantContributions/allocations ———
    const contributionsByOrg = new Map<string, ContributionLike[]>();
    for (const c of grantContributions) {
      const key = String(c.hostOrgId);
      const arr = contributionsByOrg.get(key) ?? [];
      arr.push(c);
      contributionsByOrg.set(key, arr);
    }
    const allocationsByOrg = new Map<string, AllocationLike[]>();
    for (const a of allocations) {
      const key = String(a.hostOrgId);
      const arr = allocationsByOrg.get(key) ?? [];
      arr.push(a);
      allocationsByOrg.set(key, arr);
    }
    const poolOrgIds = new Set([...contributionsByOrg.keys(), ...allocationsByOrg.keys()]);
    const pools = sortPools(
      [...poolOrgIds].flatMap((key) => {
        const org = hostOrgById.get(key);
        if (!org) return [];
        return [
          buildPoolRow(
            { hostOrgId: key, name: org.name, slug: org.slug, kind: org.kind },
            contributionsByOrg.get(key) ?? [],
            allocationsByOrg.get(key) ?? [],
          ),
        ];
      }),
    );

    // ——— Host earnings: one per community, any status ———
    const communityOrgs = hostOrgs.filter((o) => o.kind === COMMUNITY_KIND);
    const purchasesByOrg = new Map<string, typeof productPurchases>();
    for (const p of productPurchases) {
      const key = String(p.hostOrgId);
      const arr = purchasesByOrg.get(key) ?? [];
      arr.push(p);
      purchasesByOrg.set(key, arr);
    }
    const payoutsByOrg = new Map<string, typeof hostPayouts>();
    for (const p of hostPayouts) {
      const key = String(p.hostOrgId);
      const arr = payoutsByOrg.get(key) ?? [];
      arr.push(p);
      payoutsByOrg.set(key, arr);
    }
    const productsByOrg = new Map<string, typeof communityProducts>();
    for (const p of communityProducts) {
      const key = String(p.hostOrgId);
      const arr = productsByOrg.get(key) ?? [];
      arr.push(p);
      productsByOrg.set(key, arr);
    }

    const hostEarnings = communityOrgs.map((org) => {
      const key = String(org._id);
      const activeProducts = (productsByOrg.get(key) ?? []).filter((p) => p.status === "active").length;
      return buildHostEarningsRow(
        { hostOrgId: key, name: org.name, slug: org.slug },
        purchasesByOrg.get(key) ?? [],
        payoutsByOrg.get(key) ?? [],
        activeProducts,
      );
    });

    // ——— Communities: membership breakdown per community ———
    const membersByOrg = new Map<string, typeof communityMembers>();
    for (const m of communityMembers) {
      if (m.status === "removed") continue;
      const key = String(m.hostOrgId);
      const arr = membersByOrg.get(key) ?? [];
      arr.push(m);
      membersByOrg.set(key, arr);
    }

    const communities = communityOrgs
      .map((org) => {
        const key = String(org._id);
        const members = (membersByOrg.get(key) ?? []).map((m) => ({
          role: m.role,
          status: m.status,
          isHome: m.isHome,
          memberships: membershipsByUser.get(String(m.userId)) ?? [],
        }));
        const activeProducts = (productsByOrg.get(key) ?? []).filter((p) => p.status === "active").length;
        const purchases = (purchasesByOrg.get(key) ?? []).filter((p) => p.status !== "refunded").length;
        return {
          hostOrgId: key,
          name: org.name,
          slug: org.slug,
          status: normalizeCommunity(org).status,
          members: summarizeCommunityMembers(members),
          products: activeProducts,
          purchases,
        };
      })
      .sort((a, b) => {
        const aPending = a.status === "pending" ? 0 : 1;
        const bPending = b.status === "pending" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return a.name.localeCompare(b.name);
      });

    // ——— Platform-wide memberships ———
    const membershipsSummary = summarizePlatformMemberships(
      memberships.map((m) => ({
        userId: String(m.userId),
        level: m.level,
        status: m.status,
        coveredByCodeId: m.coveredByCodeId,
      })),
    );
    const redemptionsByCode = new Map<string, number>();
    for (const r of coverageRedemptions) {
      const key = String(r.codeId);
      redemptionsByCode.set(key, (redemptionsByCode.get(key) ?? 0) + 1);
    }
    const coverageCodesOut = coverageCodes.map((c) => ({
      code: c.code,
      sponsorName: hostOrgName(c.hostOrgId) ?? "Unknown sponsor",
      seats: c.seats,
      redeemed: redemptionsByCode.get(String(c._id)) ?? 0,
      status: c.status,
    }));

    // ——— Recent: last 60 money events across tables ———
    const recentEvents: RecentItem[] = [
      ...grantContributions.map((c): RecentItem => {
        if (c.type === "dues_share") {
          const level = c.membershipId ? membershipById.get(String(c.membershipId))?.level : undefined;
          return {
            at: c.createdAt,
            source: "dues",
            description: duesDescription(level),
            hostOrgName: hostOrgName(c.hostOrgId),
            grossCents: c.grossCents,
            platformCents: c.platformCents,
            ref: c.stripeRef,
          };
        }
        if (c.type === "contribution_in") {
          return {
            at: c.createdAt,
            source: "pool_contribution",
            description: contributionDescription(c.type),
            hostOrgName: hostOrgName(c.hostOrgId),
            grossCents: c.grossCents,
            platformCents: c.platformCents,
            ref: c.stripeRef,
          };
        }
        return {
          at: c.createdAt,
          source: "pool_other",
          description: contributionDescription(c.type),
          hostOrgName: hostOrgName(c.hostOrgId),
          grossCents: c.grossCents,
          platformCents: c.platformCents,
          ref: c.stripeRef,
        };
      }),
      ...allocations.map(
        (a): RecentItem => ({
          at: a.createdAt,
          source: "allocation",
          description: allocationDescription(a.recipientName),
          hostOrgName: hostOrgName(a.hostOrgId),
          grossCents: -a.amountCents,
          platformCents: 0,
          ref: a.projectId ? String(a.projectId) : undefined,
        }),
      ),
      ...nonRefundedPurchases.map((p): RecentItem => {
        const product = productById.get(String(p.productId));
        const org = hostOrgName(p.hostOrgId) ?? "Unknown host";
        return {
          at: p.createdAt,
          source: "host_sale",
          description: hostSaleDescription(product?.name ?? "Product", org),
          hostOrgName: org,
          grossCents: p.grossCents,
          platformCents: p.platformCents,
          ref: p.stripeRef,
        };
      }),
      ...paidTickets.map((t): RecentItem => {
        const event = eventById.get(String(t.eventId));
        const orgName = event?.hostOrgId ? hostOrgName(event.hostOrgId) : undefined;
        return {
          at: t.createdAt,
          source: "event_ticket",
          description: eventTicketDescription(t.tierName),
          hostOrgName: orgName,
          grossCents: t.amountCents,
          platformCents: 0,
          ref: t.stripeSessionId,
        };
      }),
      ...hostPayouts.map(
        (p): RecentItem => ({
          at: p.paidAt,
          source: "host_payout",
          description: payoutDescription(hostOrgName(p.hostOrgId) ?? "host"),
          hostOrgName: hostOrgName(p.hostOrgId),
          grossCents: -p.amountCents,
          platformCents: 0,
          ref: p.reference,
        }),
      ),
    ];
    const recent = buildRecent(recentEvents, 60);

    return {
      generatedAt: Date.now(),
      periods,
      fees,
      pools,
      hostEarnings,
      communities,
      memberships: { ...membershipsSummary, coverageCodes: coverageCodesOut },
      recent,
    };
  },
});

/** The host's own view of the same members.{total,pending,byLevel,covered,
 * home} rule — powers a community's dashboard. Manager-or-operator gated by
 * assertCanManageCommunity (communities.ts); left to throw on denial, same
 * as every other host-facing read there. */
export const getCommunityMembersByLevel = query({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    await assertCanManageCommunity(ctx, args.hostOrgId, userId);

    const members = (
      await ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
        .collect()
    ).filter((m) => m.status !== "removed");

    const membershipLists = await Promise.all(
      members.map((m) =>
        ctx.db
          .query("memberships")
          .withIndex("by_userId", (q) => q.eq("userId", m.userId))
          .collect(),
      ),
    );

    const forSummary: CommunityMemberForSummary[] = members.map((m, i) => ({
      role: m.role,
      status: m.status,
      isHome: m.isHome,
      memberships: membershipLists[i],
    }));

    const { total, pending, byLevel, covered, home } = summarizeCommunityMembers(forSummary);
    return { total, pending, byLevel, covered, home };
  },
});
