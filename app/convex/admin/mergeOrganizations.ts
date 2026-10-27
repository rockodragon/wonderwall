// Merges one organization (the "source") into another (the "target"): two
// rows made for the same organization, e.g. "The Grove Center for" and "The
// Grove Center for the Arts & Media". Everything pointing at the source
// moves to the target, the target's empty fields are filled from the
// source, and the source is deleted:
//
//   - its people (orgPositions) move; someone listed at both keeps one
//     place: the fuller of the two (title and years), an admin if either
//     was, first in their list if either was;
//   - its projects (projects.organizationId) and the events that show it
//     as a host (events.displayHosts) move;
//   - the target's empty logo, type, tagline, about, website, socials,
//     location and community link come from the source (the target's own
//     always win);
//   - /orgs/<source slug> keeps working: it forwards to the target
//     (orgSlugForwards, read by organizations.ts orgBySlug), and adding an
//     organization by the source's name finds the target (findOrCreate), so
//     the copy isn't made again.
//
// Upload claims (uploads.ts) are left alone: a moved logo is already on the
// target's row, and setLogo lets the target's admins replace a logo the row
// holds without a claim. A source logo the target doesn't take (it has its
// own) stays in storage, unused.
//
// The internalMutation is for an operator:
//   npx convex run admin/mergeOrganizations:mergeOrganizations \
//     '{"targetId":"…","sourceId":"…","dryRun":true}' --prod
// The duplicates page (admin/duplicates.ts) calls runMergeOrganizations
// behind its own admin check.

import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { fail } from "../errors";
import { swapDisplayHost } from "../eventHosts";
import { positionsOfOrg, syncProfileOrgCache } from "../organizations";
import { orgNameKey } from "../organizationRules";

/** Every field that points at an organization (grep `v.id("organizations")`
 * in schema.ts; mergeOrganizations.test.ts fails on one this list misses),
 * with the index the merge reads it by. events.displayHosts has none: the
 * events table is read whole, once. */
export const ORG_ID_FIELDS: { table: string; field: string; hostRefs?: boolean; index?: string }[] = [
  { table: "orgPositions", field: "organizationId", index: "by_organizationId" },
  { table: "projects", field: "organizationId", index: "by_organizationId" },
  { table: "events", field: "displayHosts", hostRefs: true },
  { table: "orgSlugForwards", field: "organizationId", index: "by_organizationId" },
];

/** The target's fields a merge fills from the source when the target has
 * none, by what the page calls them. A group moves together, decided by its
 * first field (a location is its text and its map data). */
const ORG_FILL_GROUPS: { word: string; fields: (keyof Doc<"organizations">)[] }[] = [
  { word: "logo", fields: ["logoStorageId"] },
  { word: "type", fields: ["category"] },
  { word: "tagline", fields: ["tagline"] },
  { word: "about", fields: ["mission"] },
  { word: "website", fields: ["websiteUrl"] },
  { word: "Instagram", fields: ["instagram"] },
  { word: "X", fields: ["x"] },
  { word: "LinkedIn", fields: ["linkedin"] },
  { word: "location", fields: ["location", "locationType", "address", "coordinates", "placeId"] },
  { word: "community link", fields: ["hostOrgId"] },
];

const isEmpty = (value: unknown) => value === undefined || value === null || value === "";

/** What the target takes from the source: the patch, and the plain words
 * for it ("logo", "about"). */
export function orgFill(
  source: Partial<Doc<"organizations">>,
  target: Partial<Doc<"organizations">>,
): { patch: Partial<Doc<"organizations">>; words: string[] } {
  const patch: Record<string, unknown> = {};
  const words: string[] = [];
  for (const { word, fields } of ORG_FILL_GROUPS) {
    if (!isEmpty(target[fields[0]]) || isEmpty(source[fields[0]])) continue;
    for (const f of fields) patch[f] = source[f];
    words.push(word);
  }
  return { patch: patch as Partial<Doc<"organizations">>, words };
}

/** How much a position says: a title and years. The fuller one is kept. */
const fullness = (p: Doc<"orgPositions">) => (p.title ? 1 : 0) + (p.startYear ? 1 : 0) + (p.endYear ? 1 : 0);

export type OrgMergeReport = {
  dryRun: boolean;
  target: { name: string; slug: string };
  source: { name: string; slug: string };
  /** Names of the people who move over. */
  peopleMoved: string[];
  /** Names of the people listed at both, who keep one place. */
  peopleCombined: string[];
  projectsMoved: number;
  eventsMoved: number;
  /** Plain words for the fields filled ("logo", "about"). */
  filled: string[];
  /** The source's slug, which now forwards to the target. */
  slugForwarded: string;
  /** Both had a logo: the source's isn't used. */
  sourceLogoUnused: boolean;
  /** Both were linked to a different community: the target's link stays. */
  hostOrgConflict: boolean;
};

/** A dry run of several organizations into one: what the earlier ones would
 * have changed, so each later one is planned as the merge would find it. */
export type OrgDryRunCarry = {
  /** The target's fields the earlier ones filled. */
  filled: Partial<Doc<"organizations">>;
  /** People the earlier ones moved to the target. */
  people: Set<Id<"profiles">>;
  /** Events' "shown as host" lists as the earlier ones left them. */
  hosts: Map<Id<"events">, Doc<"events">["displayHosts"]>;
};

export const newOrgDryRunCarry = (): OrgDryRunCarry => ({ filled: {}, people: new Set(), hosts: new Map() });

export async function runMergeOrganizations(
  ctx: MutationCtx,
  { targetId, sourceId, dryRun }: { targetId: Id<"organizations">; sourceId: Id<"organizations">; dryRun: boolean },
  carry?: OrgDryRunCarry,
): Promise<OrgMergeReport> {
  if (targetId === sourceId) fail("same_organization", "Pick two different organizations.");
  const [stored, source] = await Promise.all([ctx.db.get(targetId), ctx.db.get(sourceId)]);
  if (!stored || !source) fail("not_found", "One of these organizations is gone already. Reload the page.");
  const target = { ...stored, ...(dryRun ? carry?.filled : {}) };

  const nameOf = async (profileId: Id<"profiles">) => (await ctx.db.get(profileId))?.name?.trim() || "Someone";

  // ——— People ———
  const [sourcePositions, targetPositions] = await Promise.all([
    positionsOfOrg(ctx, sourceId),
    positionsOfOrg(ctx, targetId),
  ]);
  const peopleMoved: string[] = [];
  const peopleCombined: string[] = [];
  const touchedProfiles = new Set<Id<"profiles">>(targetPositions.map((p) => p.profileId));
  for (const sp of sourcePositions) {
    touchedProfiles.add(sp.profileId);
    const tp = targetPositions.find((p) => p.profileId === sp.profileId);
    const movedEarlier = dryRun && !!carry?.people.has(sp.profileId);
    if (!tp && !movedEarlier) {
      peopleMoved.push(await nameOf(sp.profileId));
      if (dryRun) carry?.people.add(sp.profileId);
      else await ctx.db.patch(sp._id, { organizationId: targetId });
      continue;
    }
    peopleCombined.push(await nameOf(sp.profileId));
    if (dryRun || !tp) continue;
    const keep = fullness(sp) > fullness(tp) ? sp : tp;
    await ctx.db.patch(tp._id, {
      title: keep.title,
      startYear: keep.startYear,
      endYear: keep.endYear,
      isAdmin: sp.isAdmin || tp.isAdmin,
      order: Math.min(sp.order, tp.order),
      createdAt: Math.min(sp.createdAt, tp.createdAt),
    });
    await ctx.db.delete(sp._id);
  }

  // ——— Projects posted as it, events that show it as a host ———
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", sourceId))
    .collect();
  if (!dryRun) {
    for (const p of projects) await ctx.db.patch(p._id, { organizationId: targetId });
  }
  let eventsMoved = 0;
  for (const event of await ctx.db.query("events").collect()) {
    const hosts = (dryRun && carry?.hosts.get(event._id)) || event.displayHosts;
    const next = swapDisplayHost(hosts, "org", sourceId, targetId);
    if (!next) continue;
    eventsMoved++;
    if (dryRun) carry?.hosts.set(event._id, next as Doc<"events">["displayHosts"]);
    else await ctx.db.patch(event._id, { displayHosts: next as Doc<"events">["displayHosts"] });
  }

  // ——— Its page: empty fields filled, its address forwarded ———
  const { patch, words } = orgFill(source, target);
  if (dryRun && carry) Object.assign(carry.filled, patch);
  const forwards = await ctx.db
    .query("orgSlugForwards")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", sourceId))
    .collect();
  if (!dryRun) {
    if (words.length > 0) await ctx.db.patch(targetId, { ...patch, updatedAt: Date.now() });
    for (const f of forwards) await ctx.db.patch(f._id, { organizationId: targetId });
    await ctx.db.insert("orgSlugForwards", {
      slug: source.slug,
      nameKey: source.nameKey || orgNameKey(source.name),
      organizationId: targetId,
      createdAt: Date.now(),
    });
    await ctx.db.delete(sourceId);
    // The organization shown with each person's name may have changed.
    for (const profileId of touchedProfiles) await syncProfileOrgCache(ctx, profileId);
  }

  return {
    dryRun,
    target: { name: target.name, slug: target.slug },
    source: { name: source.name, slug: source.slug },
    peopleMoved,
    peopleCombined,
    projectsMoved: projects.length,
    eventsMoved,
    filled: words,
    slugForwarded: source.slug,
    sourceLogoUnused: !!source.logoStorageId && !!target.logoStorageId,
    hostOrgConflict: !!source.hostOrgId && !!target.hostOrgId && source.hostOrgId !== target.hostOrgId,
  };
}

export const mergeOrganizations = internalMutation({
  args: { targetId: v.id("organizations"), sourceId: v.id("organizations"), dryRun: v.boolean() },
  handler: (ctx, args) => runMergeOrganizations(ctx, args),
});
