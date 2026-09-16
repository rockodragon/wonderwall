// Public aggregate counts — the "By the numbers" strip on /grant-program.
//
// PUBLIC, NO AUTH. The handler never reads the caller's identity and returns
// eight plain numbers plus a location breakdown (`cities`, `withoutLocation`)
// that is itself only labels and counts: no names, ids, emails or rows, so
// there is nothing to gate. Convex re-runs it reactively whenever a table it
// read changes, so the strip updates on the same write that changes the
// ledger (a new allocation, a confirmed backer, an approved community).
//
// Location breakdown: creatives and projects are bucketed by city label
// (structured address.city + stateCode, else the free-text `location`
// string, else "without location"). Only the top 6 buckets are returned and
// any bucket with fewer than LOCATION_BUCKET_MIN members is omitted — a
// PRIVACY FLOOR, since a city with a single member names that member's
// city. Omitted buckets are not folded into withoutLocation.
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

/** One row of the public location breakdown: a display label and counts. */
type LocationBucket = { label: string; creatives: number; projects: number };

/** Privacy floor: a bucket needs at least this many creatives + projects to
 * be published. A city with a single member is that member's city, so buckets
 * below the floor are omitted entirely (not moved into withoutLocation, which
 * would leak "there is exactly one person somewhere unlisted"). */
const LOCATION_BUCKET_MIN = 2;

/** Buckets returned after sorting — the strip only has room for a handful. */
const LOCATION_BUCKET_LIMIT = 6;

/** The subset of the profiles/projects location shape the breakdown reads. */
type Locatable = {
  address?: { city?: string; stateCode?: string };
  location?: string;
};

/** Display label for a row's location, or null when it has none.
 *   - structured address.city wins: "City, ST" (stateCode upper-cased) or
 *     just "City" when there is no stateCode;
 *   - else the free-text `location` string, trimmed, internal whitespace
 *     collapsed, first letter capitalised. It is NOT parsed further — the
 *     string is whatever the member typed. */
function locationLabel(row: Locatable): string | null {
  const city = row.address?.city?.trim();
  if (city) {
    const code = row.address?.stateCode?.trim();
    return code ? `${city}, ${code.toUpperCase()}` : city;
  }
  const free = row.location?.trim().replace(/\s+/g, " ");
  if (free) return free.charAt(0).toUpperCase() + free.slice(1);
  return null;
}

/** Case-insensitive bucketing: "san diego, CA" and "San Diego, CA" merge and
 * the first-seen casing is the one displayed. */
class LocationTally {
  private buckets = new Map<string, LocationBucket>();
  readonly withoutLocation = { creatives: 0, projects: 0 };

  add(row: Locatable, field: "creatives" | "projects"): void {
    const label = locationLabel(row);
    if (label === null) {
      this.withoutLocation[field]++;
      return;
    }
    const key = label.toLowerCase();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { label, creatives: 0, projects: 0 };
      this.buckets.set(key, bucket);
    }
    bucket[field]++;
  }

  /** Buckets at or above the privacy floor, sorted by creatives desc, then
   * projects desc, then label, capped at LOCATION_BUCKET_LIMIT. */
  top(): LocationBucket[] {
    return [...this.buckets.values()]
      .filter((b) => b.creatives + b.projects >= LOCATION_BUCKET_MIN)
      .sort(
        (a, b) =>
          b.creatives - a.creatives ||
          b.projects - a.projects ||
          a.label.localeCompare(b.label),
      )
      .slice(0, LOCATION_BUCKET_LIMIT);
  }
}

export const publicCounts = query({
  args: {},
  handler: async (ctx) => {
    const seedCheck = new SeedCheck(ctx);
    const locations = new LocationTally();

    // — creatives —
    const profiles = await ctx.db.query("profiles").collect();
    let creatives = 0;
    for (const p of profiles) {
      if (!isCreativeProfile(p)) continue;
      if (await seedCheck.isSeed(p.userId)) continue;
      creatives++;
      locations.add(p, "creatives");
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
      locations.add(p, "projects");
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
      cities: locations.top(),
      withoutLocation: locations.withoutLocation,
    };
  },
});
