// Everyone who has an account is a member of The Garden — it's the one
// community at launch (Rick, 2026-09-29). New accounts join in auth.ts's
// afterUserCreatedOrUpdated; accounts that predate this are added once by
// backfillDefaultCommunity below:
//   npx convex run garden/defaultCommunity:backfillDefaultCommunity '{"dryRun":true}' [--prod]
//   npx convex run garden/defaultCommunity:backfillSeatCommunity '{"dryRun":true}' [--prod]
//   npx convex run garden/defaultCommunity:seedCreateSd [--prod]
//
// Run the backfill BEFORE switching The Garden to invite-only (joinPolicy
// "invite"): once it is, joinDefaultCommunity adds nobody — signups join
// through joinCommunity with their code instead — so the backfill refuses to
// run rather than skip everyone.

import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const DEFAULT_COMMUNITY_SLUG = "the-garden";
// The San Diego secular community — The Creative Exchange San Diego, at
// /sd (renamed from "Create SD" 2026-09-29; createsd.org forwards there).
export const CREATE_SD_SLUG = "sd";

/** The Garden's membership terms — also the default for any community that
 * hasn't set its own (hostOrgs.seatPriceCents / duesGroupPct / duesPoolPct).
 * The brief's money table: 40% runs the group, 50% project pool, 10%
 * platform. */
export const DEFAULT_SEAT_PRICE_CENTS = 1000;
export const DEFAULT_DUES = { groupPct: 40, poolPct: 50 } as const;

export async function getDefaultCommunity(ctx: QueryCtx | MutationCtx) {
  return ctx.db
    .query("hostOrgs")
    .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_COMMUNITY_SLUG))
    .unique();
}

/** Adds the user to The Garden as an active member. Does nothing when The
 * Garden isn't seeded, when it's invite-only (the new account joins with its
 * code via communities.ts joinCommunity, which is what checks the code), or
 * when the user already has a row — including a "removed" row, so someone a
 * host removed is never quietly re-added.
 * `agreedAt` only when the person saw the agreements: signup and login
 * carry the consent line that lists them (AgreementsConsent.tsx); the
 * backfill doesn't pass it. */
export async function joinDefaultCommunity(
  ctx: MutationCtx,
  userId: Id<"users">,
  opts: { hostOrgId?: Id<"hostOrgs">; agreedAt?: number } = {},
): Promise<boolean> {
  const org = opts.hostOrgId ? await ctx.db.get(opts.hostOrgId) : await getDefaultCommunity(ctx);
  if (!org) return false;
  if (org.joinPolicy === "invite") return false;
  const orgId = org._id;
  const existing = await ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", orgId).eq("userId", userId))
    .unique();
  if (existing) return false;
  await ctx.db.insert("communityMembers", {
    hostOrgId: orgId,
    userId,
    role: "member",
    status: "active",
    joinedAt: Date.now(),
    ...(opts.agreedAt ? { agreedAt: opts.agreedAt } : {}),
  });
  return true;
}

/** The community a new account joins, and its agreements as its hosts wrote
 * them — what the signup and login consent line lists beside the
 * platform's. One default community today. When entry domains route
 * signups (communityDomains.ts resolveEntryCommunity), this and the join in
 * auth.ts change together, so what people read is what they join. Public:
 * there's no account yet. Null when the default isn't seeded.
 *
 * `inviteOnly`: the new account doesn't join on its own — signup asks for a
 * code and joins through joinCommunity. `viewer` tells that page whether
 * the person is signed in and already in, e.g. someone who signed in with
 * Google before they had a code. */
export const getSignupCommunity = query({
  args: {},
  handler: async (ctx) => {
    const org = await getDefaultCommunity(ctx);
    if (!org) return null;
    const userId = await getAuthUserId(ctx);
    const row = userId
      ? await ctx.db
          .query("communityMembers")
          .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", org._id).eq("userId", userId))
          .unique()
      : null;
    return {
      id: org._id,
      slug: org.slug,
      name: org.name,
      agreements: org.agreements ?? [],
      inviteOnly: org.joinPolicy === "invite",
      viewer: { signedIn: !!userId, isMember: row?.status === "active" },
    };
  },
});

/** One page of users per call; run again with the returned cursor until
 * `isDone`. dryRun counts who would be added without writing. */
export const backfillDefaultCommunity = internalMutation({
  args: {
    dryRun: v.boolean(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const org = await getDefaultCommunity(ctx);
    if (!org) throw new Error(`"${DEFAULT_COMMUNITY_SLUG}" isn't seeded`);
    // joinDefaultCommunity adds nobody to an invite-only Garden, so this would
    // count people as added and add none.
    if (org.joinPolicy === "invite") {
      throw new Error(
        `"${DEFAULT_COMMUNITY_SLUG}" is invite-only — run the backfill while it's still open, then switch it`,
      );
    }

    const page = await ctx.db
      .query("users")
      .paginate({ numItems: 500, cursor: args.cursor ?? null });

    let added = 0;
    let alreadyIn = 0;
    for (const user of page.page) {
      const existing = await ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId_userId", (q) =>
          q.eq("hostOrgId", org._id).eq("userId", user._id),
        )
        .unique();
      if (existing) {
        alreadyIn++;
        continue;
      }
      if (!args.dryRun) await joinDefaultCommunity(ctx, user._id, { hostOrgId: org._id });
      added++;
    }

    return {
      dryRun: args.dryRun,
      scanned: page.page.length,
      [args.dryRun ? "wouldAdd" : "added"]: added,
      alreadyIn,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

/** Records The Garden on every paid seat that predates per-community tiers
 * (2026-09-29). Behavior doesn't change — a seat with no communityId
 * already counts as The Garden — this just makes the record explicit.
 * Covered seats keep their sponsor in hostOrgId. */
export const backfillSeatCommunity = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const org = await getDefaultCommunity(ctx);
    if (!org) throw new Error(`"${DEFAULT_COMMUNITY_SLUG}" isn't seeded`);
    const rows = await ctx.db.query("memberships").collect();
    const missing = rows.filter((m) => m.communityId === undefined);
    if (!args.dryRun) {
      for (const m of missing) await ctx.db.patch(m._id, { communityId: org._id });
    }
    return {
      dryRun: args.dryRun,
      seats: rows.length,
      [args.dryRun ? "wouldTag" : "tagged"]: missing.length,
    };
  },
});

/** What membership checkout (stripe.ts createMembershipCheckout) needs to
 * sell a seat in a community: The Garden when communityId is unset. Refuses
 * a community that isn't open yet (e.g. Create SD before launch), and one
 * with no Stripe price of its own — only The Garden falls back to the
 * platform's STRIPE_PRICE_SEAT. */
export const getCheckoutCommunity = internalQuery({
  args: { communityId: v.optional(v.id("hostOrgs")) },
  handler: async (ctx, args) => {
    const garden = await getDefaultCommunity(ctx);
    const org = args.communityId ? await ctx.db.get(args.communityId) : garden;
    if (!org || org.kind !== "community") {
      return { ok: false as const, reason: "That community isn't there." };
    }
    if (org.status && org.status !== "active") {
      return { ok: false as const, reason: `${org.name} isn't open to members yet.` };
    }
    const isDefault = !!garden && org._id === garden._id;
    return {
      ok: true as const,
      communityId: org._id,
      name: org.name,
      isDefault,
      seatStripePriceId: org.seatStripePriceId,
    };
  },
});

/** Seeds Create SD — San Diego's city-wide creative community, for
 * creatives of any faith or none and for funders that can't back a
 * religious group — as a pending, unlisted placeholder (Rick, 2026-09-29:
 * build it now, launch later). Pending means it isn't listed, nobody can
 * join, and checkout refuses it. To launch: set status "active" and
 * visibility "public", create its Stripe price, set seatStripePriceId.
 *   npx convex run garden/defaultCommunity:seedCreateSd [--prod] */
export const seedCreateSd = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", CREATE_SD_SLUG))
      .unique();
    if (existing) return { created: false, id: existing._id };
    const id = await ctx.db.insert("hostOrgs", {
      name: "The Creative Exchange San Diego",
      slug: CREATE_SD_SLUG,
      kind: "community",
      tagline: "San Diego's creative community.",
      locationLabel: "San Diego",
      websiteUrl: "https://createsd.org",
      status: "pending",
      visibility: "unlisted",
      joinPolicy: "open",
      seatPriceCents: DEFAULT_SEAT_PRICE_CENTS,
      duesGroupPct: DEFAULT_DUES.groupPct,
      duesPoolPct: DEFAULT_DUES.poolPct,
      createdAt: Date.now(),
    });
    return { created: true, id };
  },
});
