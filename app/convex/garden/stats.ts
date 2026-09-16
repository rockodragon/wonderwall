// Public aggregate counts — the "By the numbers" strip on /grant-program.
//
// PUBLIC, NO AUTH. The handler never reads the caller's identity and returns
// eight plain numbers: no names, ids, emails or rows, so there is nothing to
// gate. Convex re-runs it reactively whenever a table it read changes, so the
// strip updates on the same write that changes the ledger (a new allocation,
// a confirmed backer, an approved community).
//
// Visibility rules are borrowed, not re-invented:
//   - projects follow projectsPublic.ts's listProjects: VISIBLE_STATUSES,
//     origin !== "portfolio", kind passion|paid. Kept in sync by hand (same
//     as the two listProjects implementations note in that file's header).
//   - communities follow communities.ts's isListedCommunity (imported).
//   - seeded sample postings (seedPaidPostings.ts) are posted by users whose
//     email ends in @seed.creatives.exchange; those users, their profiles and
//     their projects are excluded so the strip never counts invented people
//     or invented work. The domain is replicated here because the seed file
//     does not export it and importing an internalMutation module for one
//     string is not worth the coupling.
//
// Money numbers are integer cents; the route formats them.

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { COMMUNITY_KIND, isListedCommunity } from "./communities";

/** Same set as projectsPublic.ts / projects.ts VISIBLE_STATUSES. */
const VISIBLE_STATUSES = new Set(["active", "in_progress", "completed"]);

/** Mirrors seedPaidPostings.ts SEED_EMAIL_DOMAIN (not exported there). */
const SEED_EMAIL_SUFFIX = "@seed.creatives.exchange";

/** hostOrgs kinds whose pool is tracked in-platform (grantContributions
 * inflows through our Stripe). "org"/"church" funds (Abiding Practice) are
 * off-platform: they record allocations OUT but never inflows, so netting
 * their allocations against pool inflows would produce a meaningless
 * negative. poolBalanceCents is therefore restricted to these kinds;
 * grantsAwarded* below still counts every fund's allocations. */
const POOL_KINDS = new Set(["platform", "community"]);

function isPosted(p: { origin?: string }): boolean {
  return p.origin !== "portfolio";
}

/** One users lookup per distinct userId, memoized for the life of the query. */
class SeedCheck {
  private cache = new Map<string, boolean>();
  constructor(private ctx: QueryCtx) {}
  async isSeed(userId: Id<"users">): Promise<boolean> {
    const key = String(userId);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const user = await this.ctx.db.get(userId);
    const seed = !!user?.email?.endsWith(SEED_EMAIL_SUFFIX);
    this.cache.set(key, seed);
    return seed;
  }
}

/** primaryRole is the V1 onboarding door someone walked through —
 * "creative" | "patron" | "partner" — and is OPTIONAL: every profile written
 * before V1 onboarding has none, and those accounts are the original Garden
 * creatives. So an undefined primaryRole counts as a creative; only an
 * explicit patron/partner is excluded. Someone who onboarded as a patron
 * and later also makes work is undercounted — acceptable for a headline
 * number, and it errs low rather than high. */
function isCreativeProfile(p: Doc<"profiles">): boolean {
  return p.primaryRole === undefined || p.primaryRole === "creative";
}

export const publicCounts = query({
  args: {},
  handler: async (ctx) => {
    const seedCheck = new SeedCheck(ctx);

    // — creatives —
    const profiles = await ctx.db.query("profiles").collect();
    let creatives = 0;
    for (const p of profiles) {
      if (!isCreativeProfile(p)) continue;
      if (await seedCheck.isSeed(p.userId)) continue;
      creatives++;
    }

    // — communities —
    const communityRows = await ctx.db
      .query("hostOrgs")
      .withIndex("by_kind_status", (q) => q.eq("kind", COMMUNITY_KIND))
      .collect();
    const communities = communityRows.filter(isListedCommunity).length;

    // — projects —
    const projectRows = (
      await Promise.all(
        (["passion", "paid"] as const).map((kind) =>
          ctx.db
            .query("projects")
            .withIndex("by_kind_status", (q) => q.eq("kind", kind))
            .collect(),
        ),
      )
    ).flat();
    let activeProjects = 0;
    let paidOpportunities = 0;
    for (const p of projectRows) {
      if (!VISIBLE_STATUSES.has(p.status) || !isPosted(p)) continue;
      if (await seedCheck.isSeed(p.userId)) continue;
      activeProjects++;
      if (p.kind === "paid" && p.budgetType !== "volunteer") paidOpportunities++;
    }

    // — direct backing (projectSupport, confirmed financial rows only) —
    const support = await ctx.db.query("projectSupport").collect();
    let backedCents = 0;
    for (const s of support) {
      if (s.status !== "confirmed" || !s.type.startsWith("financial")) continue;
      backedCents += s.amountCents ?? 0;
    }

    // — pools and awards —
    const orgs = await ctx.db.query("hostOrgs").collect();
    const poolOrgIds = new Set(
      orgs.filter((o) => POOL_KINDS.has(o.kind)).map((o) => String(o._id)),
    );

    const contributions = await ctx.db.query("grantContributions").collect();
    let poolInCents = 0;
    for (const c of contributions) {
      if (poolOrgIds.has(String(c.hostOrgId))) poolInCents += c.poolCents;
    }

    const allocations = await ctx.db.query("allocations").collect();
    let poolOutCents = 0;
    let grantsAwardedCents = 0;
    for (const a of allocations) {
      grantsAwardedCents += a.amountCents;
      if (poolOrgIds.has(String(a.hostOrgId))) poolOutCents += a.amountCents;
    }

    return {
      creatives,
      communities,
      activeProjects,
      paidOpportunities,
      backedCents,
      poolBalanceCents: poolInCents - poolOutCents,
      grantsAwarded: allocations.length,
      grantsAwardedCents,
    };
  },
});
