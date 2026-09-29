// Community domains (Rick, 2026-09-29): each community can have its own
// front-door domains — thegardensd.org for The Garden, createsd.org for
// Create SD. A visitor who arrives on one is tagged to that community
// (waitlist today; signup later). creatives.exchange is the neutral hub and
// belongs to no community. Accounts and sign-in stay on creatives.exchange.
//   npx convex run garden/communityDomains:setCommunityDomains '{"slug":"create-sd","domains":["createsd.org"]}' [--prod]

import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

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
 * table (a handful of communities), so a scan is fine. */
export async function resolveEntryCommunity(
  ctx: QueryCtx | MutationCtx,
  args: { host?: string; communitySlug?: string },
): Promise<Doc<"hostOrgs"> | null> {
  if (args.communitySlug) {
    const bySlug = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.communitySlug!.trim().toLowerCase()))
      .unique();
    if (bySlug && bySlug.kind === "community") return bySlug;
  }
  if (!args.host) return null;
  const communities = (await ctx.db.query("hostOrgs").collect()).filter(
    (o) => o.kind === "community",
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
