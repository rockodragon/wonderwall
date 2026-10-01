// Stripe Connect state (docs/features/member-directed-giving.md, "How the
// money moves"): the plain-Convex half of Connect. garden/connect.ts ("use
// node", the Stripe SDK) creates accounts, onboarding links and transfers;
// everything it needs to read or write in the database goes through here.
//
// What a creative is owed lives on giftPayments.workCents and
// backingPayments.workCents until a transfer records transferId. A transfer
// also writes a creativePayouts row (reference "stripe:tr_…", no operator),
// so garden/payouts.ts's owed math — earned minus paid — keeps working with
// no special case for Stripe.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { TransferableRow } from "./giving";

async function profileByUser(ctx: MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** Records what Stripe says about a connected account. Unknown account id
 * is a safe no-op. When payouts just became enabled, kicks the transfer
 * sweep for that person so money that was waiting moves now. */
export async function applyConnectAccountStatus(
  ctx: MutationCtx,
  args: { accountId: string; payoutsEnabled: boolean; detailsSubmitted: boolean; chargesEnabled: boolean },
): Promise<void> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_stripeConnectAccountId", (q) => q.eq("stripeConnectAccountId", args.accountId))
    .unique();
  if (!profile) return;
  const wasEnabled = profile.stripeConnectPayoutsEnabled === true;
  await ctx.db.patch(profile._id, {
    stripeConnectPayoutsEnabled: args.payoutsEnabled,
    stripeConnectDetailsSubmitted: args.detailsSubmitted,
    stripeConnectUpdatedAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (args.payoutsEnabled && !wasEnabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.scheduler.runAfter(0, (internal as any).garden.connect.transferOwed, {
      payeeUserId: String(profile.userId),
    });
  }
}

export const getConnectAccountForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!profile) return null;
    const user = await ctx.db.get(args.userId);
    return {
      profileId: profile._id,
      name: profile.name,
      email: (user as { email?: string } | null)?.email ?? null,
      accountId: profile.stripeConnectAccountId ?? null,
      payoutsEnabled: profile.stripeConnectPayoutsEnabled === true,
    };
  },
});

export const saveConnectAccount = internalMutation({
  args: { userId: v.id("users"), accountId: v.string() },
  handler: async (ctx, args) => {
    const profile = await profileByUser(ctx, args.userId);
    if (!profile) throw new Error("No profile to attach a Connect account to");
    if (profile.stripeConnectAccountId && profile.stripeConnectAccountId !== args.accountId) {
      throw new Error("This profile already has a different Connect account");
    }
    await ctx.db.patch(profile._id, {
      stripeConnectAccountId: args.accountId,
      stripeConnectUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const applyAccountStatus = internalMutation({
  args: {
    accountId: v.string(),
    payoutsEnabled: v.boolean(),
    detailsSubmitted: v.boolean(),
    chargesEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await applyConnectAccountStatus(ctx, args);
  },
});

/** Owed rows that can move: not yet transferred, payee has payouts
 * enabled. Scoped to one payee when given. Returns the payee's account id
 * alongside so the action needs no second lookup. */
export const listTransferable = internalQuery({
  args: { payeeUserId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const gifts = args.payeeUserId
      ? await ctx.db
          .query("giftPayments")
          .withIndex("by_payeeUserId", (q) => q.eq("payeeUserId", args.payeeUserId!))
          .collect()
      : await ctx.db.query("giftPayments").collect();
    const backings = args.payeeUserId
      ? await ctx.db
          .query("backingPayments")
          .withIndex("by_payeeUserId", (q) => q.eq("payeeUserId", args.payeeUserId!))
          .collect()
      : await ctx.db.query("backingPayments").collect();

    const rows: TransferableRow[] = [
      ...gifts
        .filter((g) => !g.transferId && g.workCents > 0)
        .map((g) => ({ table: "giftPayments" as const, rowId: String(g._id), payeeUserId: String(g.payeeUserId), workCents: g.workCents })),
      ...backings
        .filter((b) => !b.transferId && b.payeeUserId && b.workCents > 0)
        .map((b) => ({ table: "backingPayments" as const, rowId: String(b._id), payeeUserId: String(b.payeeUserId), workCents: b.workCents })),
    ];

    const payeeIds = [...new Set(rows.map((r) => r.payeeUserId))];
    const accounts = new Map<string, string>();
    for (const id of payeeIds) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", id as Id<"users">))
        .unique();
      if (profile?.stripeConnectAccountId && profile.stripeConnectPayoutsEnabled) {
        accounts.set(id, profile.stripeConnectAccountId);
      }
    }
    return {
      rows: rows.filter((r) => accounts.has(r.payeeUserId)),
      accounts: [...accounts.entries()].map(([payeeUserId, accountId]) => ({ payeeUserId, accountId })),
    };
  },
});

/** One transfer landed: mark the row and write the payout the owed math
 * subtracts. Idempotent on the transfer id. */
export const recordTransfer = internalMutation({
  args: {
    table: v.union(v.literal("giftPayments"), v.literal("backingPayments")),
    rowId: v.string(),
    payeeUserId: v.id("users"),
    transferId: v.string(),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const already = await ctx.db
      .query("creativePayouts")
      .withIndex("by_stripeTransferId", (q) => q.eq("stripeTransferId", args.transferId))
      .unique();
    const now = Date.now();
    if (args.table === "giftPayments") {
      const id = ctx.db.normalizeId("giftPayments", args.rowId);
      if (id) await ctx.db.patch(id, { transferId: args.transferId, transferredAt: now });
    } else {
      const id = ctx.db.normalizeId("backingPayments", args.rowId);
      if (id) await ctx.db.patch(id, { transferId: args.transferId, transferredAt: now });
    }
    if (!already) {
      await ctx.db.insert("creativePayouts", {
        payeeUserId: args.payeeUserId,
        amountCents: args.amountCents,
        reference: `stripe:${args.transferId}`,
        note: "Stripe Connect transfer",
        paidAt: now,
        stripeTransferId: args.transferId,
        createdAt: now,
      });
    }
  },
});
