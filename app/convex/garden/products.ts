// Community products — line items a community sells (community-groups.md
// §7): a premium tier, a resource bundle, a cohort. One-time or monthly,
// each with gated resources (private links) that only buyers ever receive.
//
// Money: anything a host sells splits host 90% / platform 10% including
// processing (the published Aug 31 model). The host share accrues as OWED
// on productPurchases until an operator records a payout (hostPayouts) —
// manual transfers until Stripe Connect. Checkout + webhook live in
// garden/stripe.ts and garden/stripeHandlers.ts; this file is the product
// CRUD, the access check, and the host/operator reads.
//
// House style: pure core on top (validation, the split, the access rule —
// unit-tested in products.test.ts), thin ctx.db wrappers below.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdminProfile } from "../helpers";
import { assertCanManageCommunity, canManageCommunity, getCommunityMember } from "./communities";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export type ProductBilling = "one_time" | "monthly";

/** The platform's share of anything a host sells, INCLUDING processing. */
export const HOST_SALE_PLATFORM_RATE = 0.1;

export const MIN_PRODUCT_PRICE_CENTS = 100;
export const MAX_PRODUCT_PRICE_CENTS = 500_000;

/** host 90 / platform 10, rounded so the two always sum to gross. */
export function splitHostSale(grossCents: number): { platformCents: number; hostCents: number } {
  const platformCents = Math.round(grossCents * HOST_SALE_PLATFORM_RATE);
  return { platformCents, hostCents: grossCents - platformCents };
}

export interface ProductInput {
  name: string;
  description?: string;
  benefits?: string;
  priceCents: number;
  billing: string;
  resources?: { label: string; url: string }[];
}

export function validateProduct(input: ProductInput): { code: string; reason: string } | null {
  if (!input.name.trim()) return { code: "invalid_name", reason: "Give it a name." };
  if (input.name.trim().length > 80) return { code: "invalid_name", reason: "Keep the name under 80 characters." };
  if (!Number.isInteger(input.priceCents) || input.priceCents < MIN_PRODUCT_PRICE_CENTS) {
    return { code: "invalid_price", reason: "Price needs to be at least $1, in whole cents." };
  }
  if (input.priceCents > MAX_PRODUCT_PRICE_CENTS) {
    return { code: "invalid_price", reason: "Keep the price under $5,000 — talk to us for bigger deals." };
  }
  if (input.billing !== "one_time" && input.billing !== "monthly") {
    return { code: "invalid_billing", reason: 'Billing is "one_time" or "monthly".' };
  }
  for (const r of input.resources ?? []) {
    if (!r.label.trim()) return { code: "invalid_resource", reason: "Every resource needs a label." };
    try {
      const url = new URL(r.url.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
    } catch {
      return { code: "invalid_resource", reason: `"${r.label}" needs a real http(s) link.` };
    }
  }
  if ((input.resources?.length ?? 0) > 25) {
    return { code: "invalid_resource", reason: "Up to 25 resources per product." };
  }
  return null;
}

export interface PurchaseLike {
  billing: string;
  status: string;
  currentPeriodEnd?: number;
}

/** Statuses that still confer access. past_due keeps access during grace,
 * mirroring memberships (never strip a buyer mid billing hiccup). */
const ENTITLED_STATUSES = new Set(["paid", "active", "past_due"]);
/** Grace after a subscription period ends before access lapses (7 days). */
const PERIOD_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Does this set of purchase rows grant access right now? One-time "paid"
 * rows are forever; subscription rows need an entitled status and, when a
 * period end is known, to be inside it (plus grace). */
export function hasProductAccess(purchases: PurchaseLike[], now: number): boolean {
  return purchases.some((p) => {
    if (!ENTITLED_STATUSES.has(p.status)) return false;
    if (p.billing === "one_time") return true;
    if (p.currentPeriodEnd === undefined) return true; // status is the only signal we have
    return p.currentPeriodEnd + PERIOD_GRACE_MS > now;
  });
}

export interface EarningsLike {
  grossCents: number;
  platformCents: number;
  hostCents: number;
  status: string;
}

/** A host's money picture: gross sold, platform take, host share, paid
 * out, still owed. Refunded rows are excluded from every sum. */
export function computeHostEarnings(
  purchases: EarningsLike[],
  payouts: { amountCents: number }[],
): { salesCount: number; grossCents: number; platformCents: number; hostCents: number; paidOutCents: number; owedCents: number } {
  const counted = purchases.filter((p) => p.status !== "refunded");
  const grossCents = counted.reduce((s, p) => s + p.grossCents, 0);
  const platformCents = counted.reduce((s, p) => s + p.platformCents, 0);
  const hostCents = counted.reduce((s, p) => s + p.hostCents, 0);
  const paidOutCents = payouts.reduce((s, p) => s + p.amountCents, 0);
  return {
    salesCount: counted.length,
    grossCents,
    platformCents,
    hostCents,
    paidOutCents,
    owedCents: hostCents - paidOutCents,
  };
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

type Ctx = QueryCtx | MutationCtx;

/** The public shape — NEVER includes `resources`. */
function publicProduct(p: Doc<"communityProducts">) {
  return {
    _id: p._id,
    hostOrgId: p.hostOrgId,
    name: p.name,
    description: p.description,
    benefits: p.benefits,
    priceCents: p.priceCents,
    billing: p.billing,
    resourceCount: p.resources?.length ?? 0,
    status: p.status,
    sortOrder: p.sortOrder ?? 0,
  };
}

async function purchasesFor(ctx: Ctx, productId: Id<"communityProducts">, userId: Id<"users">) {
  const rows = await ctx.db
    .query("productPurchases")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return rows.filter((r) => String(r.productId) === String(productId));
}

async function viewerManages(ctx: Ctx, hostOrgId: Id<"hostOrgs">, userId: Id<"users"> | null): Promise<boolean> {
  if (!userId) return false;
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (isAdminProfile(profile)) return true;
  const m = await getCommunityMember(ctx, hostOrgId, userId);
  return !!m && m.status === "active" && canManageCommunity(m.role);
}

/** Public: a community's active products, with the viewer's access flag
 * (false when signed out). Never the resources. */
export const listProducts = query({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const products = await ctx.db
      .query("communityProducts")
      .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
      .collect();
    const manages = await viewerManages(ctx, args.hostOrgId, userId);
    const now = Date.now();
    const out = [];
    for (const p of products) {
      if (p.status !== "active" && !manages) continue;
      const owned = userId ? hasProductAccess(await purchasesFor(ctx, p._id, userId), now) : false;
      out.push({ ...publicProduct(p), viewer: { hasAccess: owned || manages, canManage: manages } });
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents);
  },
});

/** The ONLY query that returns a product's resources — and only to a buyer
 * with current access, the community's hosts, or an operator. */
export const getProductAccess = query({
  args: { productId: v.id("communityProducts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const product = await ctx.db.get(args.productId);
    if (!product) return null;
    const manages = await viewerManages(ctx, product.hostOrgId, userId);
    const purchases = await purchasesFor(ctx, product._id, userId);
    const hasAccess = manages || hasProductAccess(purchases, Date.now());
    if (!hasAccess) return { ...publicProduct(product), hasAccess: false, resources: [] };
    return { ...publicProduct(product), hasAccess: true, resources: product.resources ?? [] };
  },
});

/** Everything the signed-in user has bought, for their settings page. */
export const listMyPurchases = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("productPurchases")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const out = [];
    for (const r of rows) {
      const [product, org] = await Promise.all([ctx.db.get(r.productId), ctx.db.get(r.hostOrgId)]);
      if (!product || !org) continue;
      out.push({
        purchaseId: r._id,
        productId: r.productId,
        productName: product.name,
        communityName: org.name,
        communitySlug: org.slug,
        billing: r.billing,
        status: r.status,
        grossCents: r.grossCents,
        currentPeriodEnd: r.currentPeriodEnd,
        createdAt: r.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

const productArgs = {
  name: v.string(),
  description: v.optional(v.string()),
  benefits: v.optional(v.string()),
  priceCents: v.number(),
  billing: v.string(),
  resources: v.optional(v.array(v.object({ label: v.string(), url: v.string() }))),
  sortOrder: v.optional(v.number()),
};

export const createProduct = mutation({
  args: { hostOrgId: v.id("hostOrgs"), ...productArgs },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    await assertCanManageCommunity(ctx, args.hostOrgId, userId);
    const invalid = validateProduct(args);
    if (invalid) throw new ConvexError(invalid);
    const now = Date.now();
    const id = await ctx.db.insert("communityProducts", {
      hostOrgId: args.hostOrgId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      benefits: args.benefits?.trim() || undefined,
      priceCents: args.priceCents,
      billing: args.billing,
      resources: args.resources?.map((r) => ({ label: r.label.trim(), url: r.url.trim() })),
      status: "active",
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    return { productId: id };
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("communityProducts"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    benefits: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    resources: v.optional(v.array(v.object({ label: v.string(), url: v.string() }))),
    sortOrder: v.optional(v.number()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const product = await ctx.db.get(args.productId);
    if (!product) throw new ConvexError({ code: "not_found", reason: "That product isn't there." });
    await assertCanManageCommunity(ctx, product.hostOrgId, userId);

    // Billing can't change after creation — existing subscriptions were
    // sold on the original terms. Archive and create a new one instead.
    const invalid = validateProduct({
      name: args.name ?? product.name,
      priceCents: args.priceCents ?? product.priceCents,
      billing: product.billing,
      resources: args.resources ?? product.resources,
    });
    if (invalid) throw new ConvexError(invalid);

    const patch: Partial<Doc<"communityProducts">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.benefits !== undefined) patch.benefits = args.benefits.trim() || undefined;
    if (args.priceCents !== undefined) patch.priceCents = args.priceCents;
    if (args.resources !== undefined)
      patch.resources = args.resources.map((r) => ({ label: r.label.trim(), url: r.url.trim() }));
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.productId, patch);
    return { ok: true };
  },
});

/** Host view: sales, earnings, and the buyer list (names only, never
 * email to hosts — operators see email in the admin ledger). */
export const getCommunityEarnings = query({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (!(await viewerManages(ctx, args.hostOrgId, userId))) return null;

    const [purchases, payouts, products] = await Promise.all([
      ctx.db
        .query("productPurchases")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
        .collect(),
      ctx.db
        .query("hostPayouts")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
        .collect(),
      ctx.db
        .query("communityProducts")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
        .collect(),
    ]);
    const productName = new Map(products.map((p) => [String(p._id), p.name]));
    const buyerIds = [...new Set(purchases.map((p) => p.userId).filter((id): id is Id<"users"> => !!id))];
    const profiles = await Promise.all(
      buyerIds.map((id) =>
        ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", id))
          .unique(),
      ),
    );
    const nameById = new Map<string, string>();
    for (const p of profiles) if (p) nameById.set(String(p.userId), p.name);

    return {
      ...computeHostEarnings(purchases, payouts),
      byProduct: products.map((p) => {
        const rows = purchases.filter((r) => String(r.productId) === String(p._id) && r.status !== "refunded");
        return {
          productId: p._id,
          name: p.name,
          status: p.status,
          salesCount: rows.length,
          hostCents: rows.reduce((s, r) => s + r.hostCents, 0),
        };
      }),
      recent: [...purchases]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 25)
        .map((r) => ({
          purchaseId: r._id,
          productName: productName.get(String(r.productId)) ?? "Product",
          buyerName: r.userId ? nameById.get(String(r.userId)) ?? "A member" : "Guest",
          grossCents: r.grossCents,
          hostCents: r.hostCents,
          billing: r.billing,
          status: r.status,
          createdAt: r.createdAt,
        })),
      payouts: [...payouts].sort((a, b) => b.paidAt - a.paidAt).map((p) => ({
        amountCents: p.amountCents,
        reference: p.reference,
        note: p.note,
        paidAt: p.paidAt,
      })),
    };
  },
});

/** Operator-only: record a manual transfer of a host's owed share. */
export const recordHostPayout = mutation({
  args: {
    hostOrgId: v.id("hostOrgs"),
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
    const org = await ctx.db.get(args.hostOrgId);
    if (!org) throw new ConvexError({ code: "not_found", reason: "That community isn't there." });
    const paidAt = args.paidAtISO ? new Date(args.paidAtISO).getTime() : Date.now();
    if (!Number.isFinite(paidAt)) {
      throw new ConvexError({ code: "invalid_date", reason: "That date didn't parse." });
    }
    const id = await ctx.db.insert("hostPayouts", {
      hostOrgId: args.hostOrgId,
      amountCents: args.amountCents,
      reference: args.reference?.trim() || undefined,
      note: args.note?.trim() || undefined,
      paidAt,
      createdAt: Date.now(),
    });
    return { payoutId: id };
  },
});
