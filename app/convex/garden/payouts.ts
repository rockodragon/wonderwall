// Payout rail, step 1 (bead wonderwall-7avu; docs/features/entitlements-
// live-status.md § Payout rail; docs/phase-1b/spec.md §5 "never cut the
// payout ledger").
//
// Money IN on a backing already worked. Money OUT had no record at all: the
// creative's 90% sat on the platform's Stripe balance with nothing saying
// who was owed what. This is the creative-side twin of hostPayouts/
// recordHostPayout (garden/products.ts):
//
//   backingPayments  — one row per payment received on a backing, written by
//                      the Stripe webhook (stripeHandlers.ts's
//                      recordBackingPayment), with the 90/10 split.
//   creativePayouts  — one row per manual transfer an operator makes.
//
// What a creative is owed = sum(workCents) − sum(their creativePayouts).
// Transfers stay manual until Stripe Connect (step 2, Phase 3).
//
// Class money rides the same ledger: a paid class's teacher share
// (classPayments.teacherCents, written by the same webhook) counts toward the
// teacher's balance exactly as workCents does, so a creative owed for
// backings AND classes has one balance and one payout reduces both — see
// classPaymentToEarningsPayment below.
//
// The split itself is NOT decided yet (2026-09-18) — see splitBacking in
// stripeHandlers.ts, the one place the rate lives. Don't run the backfill
// against production until it is: it writes rows at whatever rate is set.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internalMutation, mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdminProfile } from "../helpers";
import { splitBacking } from "./stripeHandlers";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export interface BackingPaymentLike {
  grossCents: number;
  platformCents: number;
  workCents: number;
}

export interface CreativeEarnings {
  paymentsCount: number;
  grossCents: number;
  platformCents: number;
  workCents: number;
  paidOutCents: number;
  owedCents: number;
}

/** One creative's money picture — same shape and arithmetic as
 * computeHostEarnings (products.ts), over backing payments instead of
 * product sales. */
export function computeCreativeEarnings(
  payments: BackingPaymentLike[],
  payouts: { amountCents: number }[],
): CreativeEarnings {
  const grossCents = payments.reduce((s, p) => s + p.grossCents, 0);
  const platformCents = payments.reduce((s, p) => s + p.platformCents, 0);
  const workCents = payments.reduce((s, p) => s + p.workCents, 0);
  const paidOutCents = payouts.reduce((s, p) => s + p.amountCents, 0);
  return {
    paymentsCount: payments.length,
    grossCents,
    platformCents,
    workCents,
    paidOutCents,
    owedCents: workCents - paidOutCents,
  };
}

/** The key payments with no payee group under — money for a project that was
 * gone when it arrived. Shown as its own row so an operator resolves it,
 * never folded into someone's balance or dropped. */
export const UNASSIGNED = "unassigned";

export interface ClassPaymentLike {
  offeringId: string;
  payeeUserId?: string;
  grossCents: number;
  platformCents: number;
  teacherCents: number;
}

/** A class payment as a line on the creative ledger. The teacher's share is
 * what a creative is owed, exactly as a backing's workCents is, so it maps
 * onto the same payment shape and lands on the same per-payee row. `title`
 * names the class for the operator — without it buildCreativeEarningsRows
 * would look the offering id up as a project. A payment whose class was
 * deleted keeps a row (payee absent → UNASSIGNED) rather than dropping. */
export function classPaymentToEarningsPayment(
  p: ClassPaymentLike,
  offeringTitle: string | undefined,
): BackingPaymentLike & { payeeUserId?: string; projectId: string; title: string } {
  return {
    payeeUserId: p.payeeUserId,
    projectId: p.offeringId,
    title: offeringTitle ?? "A deleted class",
    grossCents: p.grossCents,
    platformCents: p.platformCents,
    workCents: p.teacherCents,
  };
}

export interface CreativeEarningsRow extends CreativeEarnings {
  payeeUserId: string; // or UNASSIGNED
  name: string;
  profileId: string | null;
  projects: string[]; // titles (projects and classes), for the operator to recognise the work
}

/**
 * Groups payments and payouts by payee and totals each. Rows are ordered by
 * what's owed, largest first — the order an operator works through them.
 * A payee with payouts but no payments still gets a row (their balance is
 * negative, which an operator needs to see).
 */
export function buildCreativeEarningsRows(
  payments: (BackingPaymentLike & { payeeUserId?: string; projectId: string; title?: string })[],
  payouts: { payeeUserId: string; amountCents: number }[],
  lookup: {
    name: (payeeUserId: string) => string | undefined;
    profileId: (payeeUserId: string) => string | undefined;
    projectTitle: (projectId: string) => string | undefined;
  },
): CreativeEarningsRow[] {
  const paymentsBy = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = p.payeeUserId ?? UNASSIGNED;
    const arr = paymentsBy.get(key) ?? [];
    arr.push(p);
    paymentsBy.set(key, arr);
  }
  const payoutsBy = new Map<string, typeof payouts>();
  for (const p of payouts) {
    const arr = payoutsBy.get(p.payeeUserId) ?? [];
    arr.push(p);
    payoutsBy.set(p.payeeUserId, arr);
  }

  const keys = new Set([...paymentsBy.keys(), ...payoutsBy.keys()]);
  const rows: CreativeEarningsRow[] = [];
  for (const key of keys) {
    const mine = paymentsBy.get(key) ?? [];
    const titles = [
      ...new Set(mine.map((p) => p.title ?? lookup.projectTitle(p.projectId) ?? "A deleted project")),
    ];
    rows.push({
      payeeUserId: key,
      name: key === UNASSIGNED ? "No payee — project deleted" : (lookup.name(key) ?? "Unknown person"),
      profileId: key === UNASSIGNED ? null : (lookup.profileId(key) ?? null),
      projects: titles,
      ...computeCreativeEarnings(mine, payoutsBy.get(key) ?? []),
    });
  }
  return rows.sort((a, b) => b.owedCents - a.owedCents);
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

/** Operator-only: record a manual transfer of a creative's owed share.
 * Mirrors recordHostPayout (products.ts) field for field, plus who recorded
 * it — this is money leaving the platform, so the ledger says by whose hand. */
export const recordCreativePayout = mutation({
  args: {
    payeeUserId: v.id("users"),
    amountCents: v.number(),
    reference: v.optional(v.string()),
    note: v.optional(v.string()),
    paidAtISO: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!isAdminProfile(profile)) {
      throw new ConvexError({ code: "forbidden", reason: "This is an operator tool." });
    }
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
      throw new ConvexError({ code: "invalid_amount", reason: "Amount must be a positive whole number of cents." });
    }
    const payee = await ctx.db.get(args.payeeUserId);
    if (!payee) throw new ConvexError({ code: "not_found", reason: "That person isn't there." });
    const paidAt = args.paidAtISO ? new Date(args.paidAtISO).getTime() : Date.now();
    if (!Number.isFinite(paidAt)) {
      throw new ConvexError({ code: "invalid_date", reason: "That date didn't parse." });
    }
    const id = await ctx.db.insert("creativePayouts", {
      payeeUserId: args.payeeUserId,
      amountCents: args.amountCents,
      reference: args.reference?.trim() || undefined,
      note: args.note?.trim() || undefined,
      paidAt,
      recordedByUserId: userId,
      createdAt: Date.now(),
    });
    return { payoutId: id };
  },
});

const FINANCIAL_TYPES = new Set(["financial_one_time", "financial_recurring", "financial_annual"]);

/** "YYYY-MM" (UTC) from a ms timestamp — same period convention as the
 * webhook's rows. */
function periodFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * One-off: writes the owed row for every confirmed money backing collected
 * before backingPayments existed. Run once per deployment after deploy:
 *
 *   npx convex run garden/payouts:backfillBackingPayments          (dev)
 *   npx convex run garden/payouts:backfillBackingPayments --prod   (prod)
 *
 * Idempotent: a support row that already has ANY payment row is skipped, and
 * the webhook never records an already-confirmed row on replay (see
 * handleBackingCheckoutCompleted), so the two can't double-count.
 *
 * What it cannot see: renewal charges on a monthly backing that were
 * collected before this shipped. Those never reached Convex at all — only
 * the first charge confirmed a projectSupport row. The count it returns for
 * recurring backings is the list to reconcile against Stripe by hand.
 */
export const backfillBackingPayments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const supportRows = await ctx.db.query("projectSupport").collect();
    let written = 0;
    let alreadyRecorded = 0;
    let recurringToReconcile = 0;

    for (const row of supportRows) {
      if (row.status !== "confirmed") continue;
      if (!FINANCIAL_TYPES.has(row.type)) continue;
      const grossCents = row.amountCents ?? 0;
      if (grossCents <= 0) continue;

      const existing = await ctx.db
        .query("backingPayments")
        .withIndex("by_supportId", (q) => q.eq("supportId", row._id))
        .first();
      if (existing) {
        alreadyRecorded++;
        continue;
      }

      const project = await ctx.db.get(row.projectId);
      const { platformCents, workCents } = splitBacking(grossCents);
      await ctx.db.insert("backingPayments", {
        projectId: row.projectId,
        supportId: row._id,
        payeeUserId: project ? project.userId : undefined,
        backerUserId: row.supporterUserId,
        grossCents,
        platformCents,
        workCents,
        billing: "backfill",
        stripeRef: `backfill:${row._id}`,
        period: periodFromMs(row.createdAt),
        createdAt: Date.now(),
      });
      written++;
      if (row.type !== "financial_one_time") recurringToReconcile++;
    }

    return { written, alreadyRecorded, recurringToReconcile };
  },
});

