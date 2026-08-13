// Coverage-code redemption (W2, spec §1.2). One church subscription
// (quantity = seats) backs each code; redeeming grants a membership that is
// IDENTICAL to a self-paid seat (plan §2.1 hard rule) — only the payer differs.
//
// Pure core + thin Convex wrapper, same shape as entitlements.ts / the
// Stripe handlers. ctx typed loosely until first codegen.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ——— Pure core ———

export interface CodeRow {
  _id: unknown;
  code: string;
  seats: number;
  status: string; // "active" | "suspended" | "canceled"
  stripeSubscriptionId: string;
  hostOrgId: unknown;
}

export interface RedemptionCheck {
  ok: boolean;
  reason?: string;
  seatsLeft?: number;
}

export function checkRedemption(args: {
  code: CodeRow | null;
  redemptionCount: number;
  alreadyRedeemedByUser: boolean;
  userHasEntitledMembership: boolean;
}): RedemptionCheck {
  const { code } = args;
  if (!code) return { ok: false, reason: "That code isn't one of ours — check the spelling." };
  if (code.status === "canceled")
    return { ok: false, reason: "This sponsorship has ended. Ask your sponsor about a new code." };
  if (code.status === "suspended")
    return {
      ok: false,
      reason:
        "This code is paused while the sponsor sorts out billing. Your sponsor has been notified — check back soon.",
    };
  if (args.alreadyRedeemedByUser)
    return { ok: false, reason: "You've already claimed a seat on this code — you're set." };
  if (args.userHasEntitledMembership)
    return {
      ok: false,
      reason: "You already have a seat. Coverage is for creatives who don't — leave it open for them.",
    };
  const seatsLeft = code.seats - args.redemptionCount;
  if (seatsLeft <= 0)
    return {
      ok: false,
      reason: "Every seat on this code is taken. Ask your sponsor — adding seats takes them a minute.",
    };
  return { ok: true, seatsLeft };
}

// ——— Convex wrappers ———

/** Public: what a creative sees landing on garden.app/c/CODE. */
export const getCodePublic = query({
  args: { code: v.string() },
  handler: async (ctx: any, args: any) => {
    const code = await ctx.db
      .query("coverageCodes")
      .withIndex("by_code", (q: any) => q.eq("code", args.code.toUpperCase()))
      .unique();
    if (!code) return null;
    const redemptions = await ctx.db
      .query("coverageRedemptions")
      .withIndex("by_codeId", (q: any) => q.eq("codeId", code._id))
      .collect();
    const sponsor = await ctx.db.get(code.hostOrgId);
    return {
      code: code.code,
      status: code.status,
      seats: code.seats,
      redeemed: redemptions.length,
      sponsorName: sponsor?.name ?? "A sponsor",
    };
  },
});

export const redeem = mutation({
  args: { code: v.string() },
  handler: async (ctx: any, args: any) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const code = await ctx.db
      .query("coverageCodes")
      .withIndex("by_code", (q: any) => q.eq("code", args.code.toUpperCase()))
      .unique();

    const [redemptions, myRedemptions, myMemberships] = await Promise.all([
      code
        ? ctx.db
            .query("coverageRedemptions")
            .withIndex("by_codeId", (q: any) => q.eq("codeId", code._id))
            .collect()
        : Promise.resolve([]),
      ctx.db
        .query("coverageRedemptions")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("memberships")
        .withIndex("by_userId", (q: any) => q.eq("userId", userId))
        .collect(),
    ]);

    const verdict = checkRedemption({
      code,
      redemptionCount: redemptions.length,
      alreadyRedeemedByUser: code
        ? myRedemptions.some((r: any) => r.codeId === code._id)
        : false,
      userHasEntitledMembership: myMemberships.some(
        (m: any) => m.status === "active" || m.status === "past_due",
      ),
    });
    if (!verdict.ok || !code) {
      throw new ConvexError({ code: "redemption_failed", reason: verdict.reason });
    }

    const now = Date.now();
    // A covered seat is a FULL seat: same membership row shape, same level,
    // backed by the sponsor's subscription instead of the creative's card.
    const membershipId = await ctx.db.insert("memberships", {
      userId,
      level: "seat",
      status: "active",
      hostOrgId: code.hostOrgId,
      stripeSubscriptionId: code.stripeSubscriptionId,
      coveredByCodeId: code._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("coverageRedemptions", {
      codeId: code._id,
      userId,
      membershipId,
      redeemedAt: now,
    });
    return { membershipId, seatsLeft: (verdict.seatsLeft ?? 1) - 1 };
  },
});
