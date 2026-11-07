"use node";

// Stripe Connect actions (docs/features/member-directed-giving.md, "How the
// money moves"): separate charges and transfers. Charges stay on the
// platform account, the way every checkout already works; what a creative
// is owed (giftPayments / backingPayments workCents) is transferred to
// their Express account by transferOwed, one Stripe transfer per row with
// the row id as the idempotency key, so a retry never pays twice. State
// reads and writes go through garden/connectState.ts (plain Convex); this
// file only talks to Stripe.
//
// Accounts are created with Stripe's Accounts v2 API; Stripe refuses v1
// account creation for new Connect platforms. Everything else here (status,
// dashboard link, transfers) is v1 and takes v2 account ids as they are.
// The platform pays Stripe's $2 active-account month and the payout fee,
// which is why the $50 minimum (MIN_TRANSFER_CENTS) exists.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import Stripe from "stripe";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireUserId } from "../helpers";
import { MIN_TRANSFER_CENTS, planTransfers } from "./giving";

const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ConvexError({ reason: "Stripe is not configured (STRIPE_SECRET_KEY missing)." });
  }
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

function siteUrl(): string {
  return process.env.SITE_URL || "https://www.thegarden.app";
}

/** "Get paid" in Settings › Money: creates the creative's Express account
 * the first time, then returns a fresh Stripe onboarding link (they expire
 * in minutes, so one is made per click). */
export const createConnectOnboardingLink = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await requireUserId(ctx);

    const me = await ctx.runQuery((internal as any).garden.connectState.getConnectAccountForUser, {
      userId: String(userId),
    });
    if (!me) throw new ConvexError({ reason: "Finish your profile first." });

    const stripe = getStripeClient();
    let accountId: string | null = me.accountId;
    if (!accountId) {
      // A recipient (takes transfers, never charges cards) on the Express
      // dashboard. fees/losses "application" = the platform, not Stripe,
      // answers for this account's fees and negative balance: the v2 form
      // of v1 Express under "platform handles pricing". Stripe still
      // collects the identity details (dashboard isn't "none").
      const account = await stripe.v2.core.accounts.create({
        contact_email: me.email ?? undefined,
        dashboard: "express",
        identity: { country: "us", entity_type: "individual" },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        defaults: {
          currency: "usd",
          responsibilities: { fees_collector: "application", losses_collector: "application" },
          profile: { product_description: "Creative work backed by members of TheCreative.exchange" },
        },
        metadata: { userId: String(userId) },
      });
      accountId = account.id;
      await ctx.runMutation((internal as any).garden.connectState.saveConnectAccount, {
        userId: String(userId),
        accountId,
      });
    }

    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: `${siteUrl()}/settings?tab=money&connect=refresh`,
          return_url: `${siteUrl()}/settings?tab=money&connect=return`,
        },
      },
    });
    return { url: link.url };
  },
});

/** Called when the creative comes back from Stripe (and by the nightly
 * sweep): asks Stripe what it now says about the account and records it.
 * Enabling payouts kicks the transfer sweep (connectState.ts). */
export const refreshConnectStatus = action({
  args: {},
  handler: async (ctx): Promise<{ payoutsEnabled: boolean; detailsSubmitted: boolean }> => {
    const userId = await requireUserId(ctx);
    const me = await ctx.runQuery((internal as any).garden.connectState.getConnectAccountForUser, {
      userId: String(userId),
    });
    if (!me?.accountId) return { payoutsEnabled: false, detailsSubmitted: false };

    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(me.accountId);
    const status = {
      accountId: account.id,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
      chargesEnabled: account.charges_enabled === true,
    };
    await ctx.runMutation((internal as any).garden.connectState.applyAccountStatus, status);
    return { payoutsEnabled: status.payoutsEnabled, detailsSubmitted: status.detailsSubmitted };
  },
});

/** The Stripe-hosted dashboard where a creative sees what reached them. */
export const createConnectDashboardLink = action({
  args: {},
  handler: async (ctx): Promise<{ url: string }> => {
    const userId = await requireUserId(ctx);
    const me = await ctx.runQuery((internal as any).garden.connectState.getConnectAccountForUser, {
      userId: String(userId),
    });
    if (!me?.accountId) throw new ConvexError({ reason: "Connect your bank first." });
    const stripe = getStripeClient();
    const link = await stripe.accounts.createLoginLink(me.accountId);
    return { url: link.url };
  },
});

/** Moves owed rows to connected creatives. One payee (from a gift landing
 * or onboarding finishing) or everyone (nightly). `ignoreMinimum` is the
 * operator's "pay everything now" for someone leaving or asking. Errors on
 * one transfer (an insufficient platform balance, say) are logged and the
 * rest continue; the next sweep retries, and the idempotency key keeps a
 * retried transfer from paying twice. */
export const transferOwed = internalAction({
  args: { payeeUserId: v.optional(v.string()), ignoreMinimum: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ transferred: number; cents: number; failed: number; skipped?: boolean }> => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.warn("[connect] transfer sweep skipped — STRIPE_SECRET_KEY not set");
      return { transferred: 0, cents: 0, failed: 0, skipped: true };
    }
    const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });

    const { rows, accounts } = await ctx.runQuery((internal as any).garden.connectState.listTransferable, {
      ...(args.payeeUserId ? { payeeUserId: args.payeeUserId } : {}),
    });
    const accountFor = new Map<string, string>(accounts.map((a: { payeeUserId: string; accountId: string }) => [a.payeeUserId, a.accountId]));
    const plans = planTransfers(rows, { minCents: MIN_TRANSFER_CENTS, ignoreMinimum: args.ignoreMinimum === true });

    let transferred = 0;
    let cents = 0;
    let failed = 0;
    for (const plan of plans) {
      const destination = accountFor.get(plan.payeeUserId);
      if (!destination) continue;
      for (const row of plan.rows) {
        try {
          const transfer = await stripe.transfers.create(
            {
              amount: row.workCents,
              currency: "usd",
              destination,
              transfer_group: `payee:${plan.payeeUserId}`,
              metadata: { table: row.table, rowId: row.rowId, payeeUserId: plan.payeeUserId },
            },
            { idempotencyKey: `transfer:${row.table}:${row.rowId}` },
          );
          await ctx.runMutation((internal as any).garden.connectState.recordTransfer, {
            table: row.table,
            rowId: row.rowId,
            payeeUserId: plan.payeeUserId,
            transferId: transfer.id,
            amountCents: row.workCents,
          });
          transferred++;
          cents += row.workCents;
        } catch (err) {
          failed++;
          console.error("[connect] transfer failed", row.table, row.rowId, err);
        }
      }
    }
    console.log(`[connect] transfer sweep — ${transferred} transfers, $${(cents / 100).toFixed(2)}, ${failed} failed`);
    return { transferred, cents, failed };
  },
});
