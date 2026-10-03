import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getTableParticipation, normalizeTable } from "./tablePolicy";
import { transitionMembership } from "./tables";
import { requireAdmin } from "../helpers";
import { isPayableClassPayment } from "./payouts";
import {
  backingProcessingFeeCents,
  MAX_CLASS_PRICE_CENTS,
  MIN_CLASS_PRICE_CENTS,
  splitClassSale,
  type StripeCheckoutSessionLike,
} from "./stripeHandlers";

export const TABLE_CHECKOUT_HOLD_MS = 31 * 60 * 1000;

export const resolveOfferingTable = internalQuery({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args): Promise<Id<"gardenTables"> | null> => {
    const table = await ctx.db
      .query("gardenTables")
      .withIndex("by_sourceOfferingId", (q) =>
        q.eq("sourceOfferingId", args.offeringId),
      )
      .unique();
    return table?._id ?? null;
  },
});

/** A retry reuses the original terms and the same Stripe idempotency key. */
export const start = internalMutation({
  args: { tableId: v.id("gardenTables"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError("That Table is no longer available.");
    if (table.externalPaymentLinkUrl)
      throw new ConvexError(
        "This Table uses an external enrollment page. Follow the host's signup link.",
      );
    const now = Date.now();
    const holds = await ctx.db
      .query("tableCheckoutHolds")
      .withIndex("by_tableId_userId", (q) =>
        q.eq("tableId", args.tableId).eq("userId", args.userId),
      )
      .collect();
    const current = holds.find(
      (hold) => hold.status === "pending" && hold.expiresAt > now,
    );
    if (current) {
      // Revalidate membership and moderation even while reusing a hold.
      const participation = await getTableParticipation(
        ctx,
        table,
        args.userId,
        { excludeHoldId: current._id },
      );
      if (participation.action !== "checkout")
        throw new ConvexError(
          participation.reason ?? "This Table is not accepting payment.",
        );
      return checkoutSnapshot(current);
    }
    for (const hold of holds) {
      if (hold.status === "pending" && hold.expiresAt <= now)
        await ctx.db.patch(hold._id, { status: "expired" });
    }
    const participation = await getTableParticipation(ctx, table, args.userId);
    if (participation.action !== "checkout")
      throw new ConvexError(
        participation.reason ?? "This Table is not accepting payment.",
      );
    if (
      !Number.isSafeInteger(table.priceCents) ||
      !table.priceCents ||
      table.priceCents < MIN_CLASS_PRICE_CENTS ||
      table.priceCents > MAX_CLASS_PRICE_CENTS
    ) {
      throw new ConvexError("This Table's price cannot be paid here.");
    }
    const currency = table.currency ?? "usd";
    if (currency !== "usd")
      throw new ConvexError("Tables currently accept USD payments.");
    const holdId = await ctx.db.insert("tableCheckoutHolds", {
      tableId: args.tableId,
      userId: args.userId,
      status: "pending",
      title: table.name,
      slug: table.slug,
      payeeUserId: table.hostUserId,
      priceCents: table.priceCents,
      currency,
      expiresAt: now + TABLE_CHECKOUT_HOLD_MS,
      createdAt: now,
    });
    const hold = await ctx.db.get(holdId);
    if (!hold) throw new Error("Checkout hold was not saved.");
    return checkoutSnapshot(hold);
  },
});

function checkoutSnapshot(hold: Doc<"tableCheckoutHolds">) {
  return {
    holdId: hold._id,
    title: hold.title,
    slug: hold.slug,
    priceCents: hold.priceCents,
    currency: hold.currency,
    expiresAt: hold.expiresAt,
    stripeCheckoutSessionId: hold.stripeCheckoutSessionId,
  };
}

export const attach = internalMutation({
  args: {
    holdId: v.id("tableCheckoutHolds"),
    userId: v.id("users"),
    stripeCheckoutSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || hold.userId !== args.userId)
      throw new ConvexError("Checkout hold is unavailable.");
    if (
      hold.stripeCheckoutSessionId &&
      hold.stripeCheckoutSessionId !== args.stripeCheckoutSessionId
    ) {
      throw new ConvexError(
        "Checkout hold is already attached to another payment.",
      );
    }
    await ctx.db.patch(hold._id, {
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
    });
  },
});

/** A Stripe validation failure can happen when an uncreated session is
 * retried too late to satisfy Stripe's minimum 30-minute lifetime. Network
 * errors never use this path: their session may already exist. */
export const releaseUncreated = internalMutation({
  args: { holdId: v.id("tableCheckoutHolds"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.holdId);
    if (!hold || hold.userId !== args.userId)
      throw new ConvexError("Checkout hold is unavailable.");
    if (hold.status === "pending" && !hold.stripeCheckoutSessionId)
      await ctx.db.patch(hold._id, { status: "failed" });
  },
});

function paymentIntentId(
  session: StripeCheckoutSessionLike,
): string | undefined {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
}

async function matchingHold(
  ctx: MutationCtx,
  session: StripeCheckoutSessionLike,
) {
  const metadata = session.metadata ?? {};
  const holdId = metadata.holdId
    ? ctx.db.normalizeId("tableCheckoutHolds", metadata.holdId)
    : null;
  const hold = holdId ? await ctx.db.get(holdId) : null;
  if (
    !hold ||
    String(hold.tableId) !== metadata.tableId ||
    String(hold.userId) !== metadata.userId ||
    String(hold.priceCents) !== metadata.amountCents ||
    hold.currency !== metadata.currency ||
    (hold.stripeCheckoutSessionId &&
      hold.stripeCheckoutSessionId !== session.id)
  ) {
    throw new Error(
      "[stripe] Table checkout does not match its reserved terms.",
    );
  }
  return hold;
}

/** Runs inside the webhook mutation, so ledger + hold + enrollment commit
 * together. A replay cannot duplicate earnings or reactivate a left seat. */
export async function confirmTableCheckout(
  ctx: MutationCtx,
  session: StripeCheckoutSessionLike,
): Promise<void> {
  if (session.mode !== "payment" || session.payment_status !== "paid") return;
  const hold = await matchingHold(ctx, session);
  const existingPayment = await ctx.db
    .query("classPayments")
    .withIndex("by_stripeRef", (q) => q.eq("stripeRef", session.id))
    .unique();
  if (existingPayment) return;
  if (
    session.currency !== hold.currency ||
    session.amount_total !==
      hold.priceCents + backingProcessingFeeCents(hold.priceCents)
  ) {
    throw new Error(
      "[stripe] Table checkout paid amount or currency differs from reserved terms.",
    );
  }
  const now = Date.now();
  const table = await ctx.db.get(hold.tableId);
  const participation = table
    ? await getTableParticipation(ctx, table, hold.userId, {
        excludeHoldId: hold._id,
      })
    : null;
  const canActivate =
    ["pending", "failed"].includes(hold.status) &&
    hold.expiresAt > now &&
    participation?.action === "checkout";
  const { platformCents, teacherCents } = splitClassSale(hold.priceCents);
  const classPaymentId = await ctx.db.insert("classPayments", {
    tableId: hold.tableId,
    offeringId: table?.sourceOfferingId,
    payeeUserId: hold.payeeUserId,
    buyerUserId: hold.userId,
    grossCents: hold.priceCents,
    platformCents,
    teacherCents,
    stripeRef: session.id,
    status: canActivate ? "paid" : "refund_required",
    paymentIntentId: paymentIntentId(session),
    period: new Date((session.created ?? Math.floor(now / 1000)) * 1000)
      .toISOString()
      .slice(0, 7),
    createdAt: now,
  });
  await ctx.db.patch(hold._id, {
    status: canActivate ? "paid" : "refund_required",
    stripeCheckoutSessionId: session.id,
    paymentIntentId: paymentIntentId(session),
    classPaymentId,
  });
  if (!canActivate) return; // money remains on ledger for operator refund/reconciliation
  await transitionMembership(ctx, hold.tableId, hold.userId, {
    status: "active",
    role: "participant",
    paymentStatus: "confirmed",
    paidCents: hold.priceCents,
    currency: hold.currency,
    stripeCheckoutSessionId: session.id,
    leftAt: undefined,
  });
  if (table?.sourceOfferingId) {
    const signup = await ctx.db
      .query("offeringSignups")
      .withIndex("by_offeringId_userId", (q) =>
        q.eq("offeringId", table.sourceOfferingId!).eq("userId", hold.userId),
      )
      .unique();
    if (signup && signup.status !== "confirmed")
      await ctx.db.patch(signup._id, { status: "confirmed" });
  }
}

/** Already-issued legacy Stripe sessions keep kind=class/offeringId. A
 * confirmed legacy payment converges its migrated enrollment as well. */
export async function reconcileLegacyOfferingEnrollment(
  ctx: MutationCtx,
  offeringId: Id<"offerings">,
  userId: Id<"users">,
): Promise<void> {
  const table = await ctx.db
    .query("gardenTables")
    .withIndex("by_sourceOfferingId", (q) =>
      q.eq("sourceOfferingId", offeringId),
    )
    .unique();
  if (!table) return;
  const payments = await ctx.db
    .query("classPayments")
    .withIndex("by_offeringId", (q) => q.eq("offeringId", offeringId))
    .collect();
  const payment = payments.find(
    (row) => row.buyerUserId === userId && isPayableClassPayment(row),
  );
  if (!payment) return;
  const participation = await getTableParticipation(ctx, table, userId);
  if (["left", "removed"].includes(participation.membership?.status ?? ""))
    return;
  if (participation.membership?.paymentStatus === "confirmed") return;
  const canActivate =
    normalizeTable(table).access === "open" &&
    ["join", "checkout"].includes(participation.action);
  await transitionMembership(ctx, table._id, userId, {
    status: canActivate ? "active" : "pending",
    role: "participant",
    paymentStatus: "confirmed",
    paidCents: payment.grossCents,
    currency: "usd",
    stripeCheckoutSessionId: payment.stripeRef,
  });
}

/** Expiration/failure arriving after a paid event must never revoke access. */
export async function releaseTableCheckout(
  ctx: MutationCtx,
  session: StripeCheckoutSessionLike,
): Promise<void> {
  const hold = await matchingHold(ctx, session);
  if (hold.status !== "pending") return;
  await ctx.db.patch(hold._id, {
    status: session.status === "expired" ? "expired" : "failed",
    stripeCheckoutSessionId: session.id,
  });
}

export const expireHolds = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 100)));
    const rows = await ctx.db
      .query("tableCheckoutHolds")
      .withIndex("by_status_expiresAt", (q) =>
        q.eq("status", "pending").lte("expiresAt", Date.now()),
      )
      .take(limit);
    for (const row of rows) await ctx.db.patch(row._id, { status: "expired" });
    return { expired: rows.length, hasMore: rows.length === limit };
  },
});

export const getRefundTerms = internalQuery({
  args: { paymentId: v.id("classPayments"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.userId);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment?.tableId)
      throw new ConvexError("This payment is not a Table enrollment.");
    if (payment.status === "refunded")
      return {
        alreadyRefunded: true as const,
        refundId: payment.stripeRefundId,
      };
    if (payment.status !== "refund_required" || !payment.paymentIntentId) {
      throw new ConvexError(
        "Only Table payments requiring a refund can be refunded here.",
      );
    }
    return {
      alreadyRefunded: false as const,
      paymentIntentId: payment.paymentIntentId,
    };
  },
});

export const recordRefund = internalMutation({
  args: {
    paymentId: v.id("classPayments"),
    userId: v.id("users"),
    refundId: v.string(),
    paymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.userId);
    const payment = await ctx.db.get(args.paymentId);
    if (!payment?.tableId || payment.paymentIntentId !== args.paymentIntentId)
      throw new ConvexError("Refund does not match this Table payment.");
    if (payment.status === "refunded") return;
    if (payment.status !== "refund_required")
      throw new ConvexError("This payment is not awaiting a refund.");
    await ctx.db.patch(payment._id, {
      status: "refunded",
      stripeRefundId: args.refundId,
    });
    const hold = await ctx.db
      .query("tableCheckoutHolds")
      .withIndex("by_stripeCheckoutSessionId", (q) =>
        q.eq("stripeCheckoutSessionId", payment.stripeRef),
      )
      .unique();
    if (hold?.classPaymentId === payment._id)
      await ctx.db.patch(hold._id, { status: "refunded" });
  },
});
