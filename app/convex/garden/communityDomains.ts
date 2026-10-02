// Community domains (Rick, 2026-09-29): each community can have its own
// front-door domains — thegardensd.org for The Garden, createsd.org for
// Create SD. A visitor who arrives on one is tagged to that community
// (waitlist today; signup later). thecreative.exchange is the neutral hub and
// belongs to no community. Accounts and sign-in stay on thecreative.exchange.
//   npx convex run garden/communityDomains:setCommunityDomains '{"slug":"create-sd","domains":["createsd.org"]}' [--prod]

import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { isHiddenCommunity } from "./hiddenCommunity";
import { communityVisibility } from "./communityVisibility";

/** "WWW.CreateSD.org:443" → "createsd.org". Empty for anything unusable. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  let h = host.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (h.startsWith("www.")) h = h.slice(4);
  return h;
}

/** The community whose domains include `host`, if any. */
export function findCommunityForHost<T extends { domains?: string[] }>(
  host: string | null | undefined,
  communities: T[],
): T | null {
  const h = normalizeHost(host);
  if (!h) return null;
  return communities.find((c) => (c.domains ?? []).some((d) => normalizeHost(d) === h)) ?? null;
}

/** Which community a visitor arrived for: an explicit `?community=<slug>`
 * wins, then the domain. null = the neutral hub. hostOrgs is a small
 * table (a handful of communities), so a scan is fine. A hidden (test)
 * community is never an entry point: the visitor is anonymous, and a hidden
 * one has no front door to tag them to. */
export async function resolveEntryCommunity(
  ctx: QueryCtx | MutationCtx,
  args: { host?: string; communitySlug?: string },
): Promise<Doc<"hostOrgs"> | null> {
  if (args.communitySlug) {
    const bySlug = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.communitySlug!.trim().toLowerCase()))
      .unique();
    if (bySlug && bySlug.kind === "community" && !isHiddenCommunity(bySlug)) return bySlug;
  }
  if (!args.host) return null;
  const communities = (await ctx.db.query("hostOrgs").collect()).filter(
    (o) => o.kind === "community" && !isHiddenCommunity(o),
  );
  return findCommunityForHost(args.host, communities);
}

/** For the page: which community this domain (or ?community=) is for. */
export const getEntryCommunity = query({
  args: { host: v.optional(v.string()), communitySlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const org = await resolveEntryCommunity(ctx, args);
    if (!org) return null;
    return { id: org._id, slug: org.slug, name: org.name, tagline: org.tagline ?? null };
  },
});

export const setCommunityDomains = internalMutation({
  args: { slug: v.string(), domains: v.array(v.string()) },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org || org.kind !== "community") throw new Error(`No community "${args.slug}"`);
    const domains = [...new Set(args.domains.map(normalizeHost).filter(Boolean))];
    // A domain can only point at one community.
    const others = (await ctx.db.query("hostOrgs").collect()).filter((o) => o._id !== org._id);
    for (const d of domains) {
      const taken = others.find((o) => (o.domains ?? []).some((x) => normalizeHost(x) === d));
      if (taken) throw new Error(`${d} already points at ${taken.slug}`);
    }
    await ctx.db.patch(org._id, { domains });
    return { slug: org.slug, domains };
  },
});

/** The public front door at /<slug> (community.landing.tsx): enough to show
 * a community's name and a waitlist before it opens. Returns nothing about
 * members or money. null for anything that isn't a community, or one that
 * was declined or archived. */
export const getCommunityLanding = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase()))
      .unique();
    if (!org || org.kind !== "community") return null;
    const status = org.status ?? "active";
    if (status === "declined" || status === "archived") return null;
    // A hidden (test) community has no front door for anyone but admins and
    // its members.
    if (!(await communityVisibility(ctx).orgVisible(org))) return null;
    return {
      slug: org.slug,
      name: org.name,
      tagline: org.tagline ?? null,
      description: org.description ?? null,
      locationLabel: org.locationLabel ?? null,
      open: status === "active",
    };
  },
});

/** First path segments the site already uses (app/routes.ts, public/) — a
 * community slug is its /<slug> address, so it can't be one of these. */
export const RESERVED_SLUGS = new Set(
  (
    "about admin api assets c campaign claim communities coverage create demo events faq " +
    "favorites for fund garden grant-program host ia j jobs join legal login messages " +
    "oauth-callback offerings offers onboarding opportunities patron people profile projects " +
    "search settings showcase signup story tables today unsubscribe works"
  ).split(" "),
);

/** Renames a community (and optionally its slug, which is its /<slug>
 * address). Slugs must be unused, lowercase letters, digits and dashes.
 *   npx convex run garden/communityDomains:renameCommunity '{"slug":"create-sd","newSlug":"sd","name":"The Creative Exchange San Diego"}' [--prod] */
export const renameCommunity = internalMutation({
  args: {
    slug: v.string(),
    newSlug: v.optional(v.string()),
    name: v.optional(v.string()),
    tagline: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org || org.kind !== "community") throw new Error(`No community "${args.slug}"`);
    const patch: { slug?: string; name?: string; tagline?: string } = {};
    if (args.newSlug && args.newSlug !== org.slug) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(args.newSlug)) throw new Error(`Bad slug "${args.newSlug}"`);
      if (RESERVED_SLUGS.has(args.newSlug)) throw new Error(`/${args.newSlug} is already a page on the site`);
      const taken = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", args.newSlug!))
        .unique();
      if (taken) throw new Error(`"${args.newSlug}" is taken by ${taken.name}`);
      patch.slug = args.newSlug;
    }
    if (args.name) patch.name = args.name.trim();
    if (args.tagline) patch.tagline = args.tagline.trim();
    await ctx.db.patch(org._id, patch);
    return { id: org._id, ...patch };
  },
});
