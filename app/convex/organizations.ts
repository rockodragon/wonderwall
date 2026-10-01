// Organizations and the positions that link people to them
// (docs/features/organizations.md). Pages are public (/orgs/:slug); anyone
// signed in can add a position to their own profile; an organization's
// admins edit its page and its people.

import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth } from "./auth";
import {
  checkYears,
  isCurrent,
  normalizeOrgUrl,
  normalizeSocial,
  ORG_CATEGORIES,
  ORG_LIMITS,
  orgNameKey,
  primaryPosition,
  slugifyOrgName,
  sortPositions,
} from "./organizationRules";

type Ctx = QueryCtx | MutationCtx;

function fail(code: string, reason: string): never {
  throw new ConvexError({ code, reason });
}

async function profileByUserId(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

async function requireMe(ctx: MutationCtx) {
  const userId = await auth.getUserId(ctx);
  if (!userId) fail("unauthenticated", "Sign in first.");
  const profile = await profileByUserId(ctx, userId);
  if (!profile) fail("no_profile", "Finish your profile first.");
  return { userId, profile };
}

async function logoUrl(ctx: Ctx, org: Doc<"organizations">) {
  return org.logoStorageId ? await ctx.storage.getUrl(org.logoStorageId) : null;
}

async function avatarUrl(ctx: Ctx, profile: Doc<"profiles">) {
  if (profile.imageStorageId) return await ctx.storage.getUrl(profile.imageStorageId);
  return profile.imageUrl || null;
}

async function positionsOfOrg(ctx: Ctx, organizationId: Id<"organizations">) {
  return await ctx.db
    .query("orgPositions")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .collect();
}

async function positionsOfProfile(ctx: Ctx, profileId: Id<"profiles">) {
  return await ctx.db
    .query("orgPositions")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .collect();
}

async function positionOf(ctx: Ctx, organizationId: Id<"organizations">, profileId: Id<"profiles">) {
  return await ctx.db
    .query("orgPositions")
    .withIndex("by_organizationId_profileId", (q) =>
      q.eq("organizationId", organizationId).eq("profileId", profileId),
    )
    .first();
}

/** The organization shown with a person's name on events they host, or null. */
export async function primaryOrgByUserId(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<{ name: string; slug: string; websiteUrl?: string } | null> {
  const positions = await ctx.db
    .query("orgPositions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  const primary = primaryPosition(positions);
  if (!primary) return null;
  const org = await ctx.db.get(primary.organizationId);
  return org ? { name: org.name, slug: org.slug, websiteUrl: org.websiteUrl } : null;
}

/** User ids whose primary organization is this one — whose events it hosts. */
export async function hostUserIdsForOrg(ctx: Ctx, organizationId: Id<"organizations">) {
  const out = new Set<string>();
  for (const p of await positionsOfOrg(ctx, organizationId)) {
    if (!isCurrent(p)) continue;
    const primary = primaryPosition(
      await ctx.db
        .query("orgPositions")
        .withIndex("by_userId", (q) => q.eq("userId", p.userId))
        .collect(),
    );
    if (primary?.organizationId === organizationId) out.add(String(p.userId));
  }
  return out;
}

/** A person's positions for their profile: current first, in their order. */
export async function profileOrganizations(ctx: Ctx, profileId: Id<"profiles">) {
  const positions = sortPositions(await positionsOfProfile(ctx, profileId));
  const out = [];
  for (const p of positions) {
    const org = await ctx.db.get(p.organizationId);
    if (!org) continue;
    out.push({
      organizationId: org._id,
      name: org.name,
      slug: org.slug,
      category: org.category ?? null,
      logoUrl: await logoUrl(ctx, org),
      title: p.title ?? null,
      startYear: p.startYear ?? null,
      endYear: p.endYear ?? null,
      current: isCurrent(p),
      isAdmin: p.isAdmin,
    });
  }
  return out;
}

/** Rewrite profiles.orgName/orgUrl from the primary position — the cache
 * older readers (onboarding prefill, the gig form) still use. */
export async function syncProfileOrgCache(ctx: MutationCtx, profileId: Id<"profiles">) {
  const primary = primaryPosition(await positionsOfProfile(ctx, profileId));
  const org = primary ? await ctx.db.get(primary.organizationId) : null;
  const profile = await ctx.db.get(profileId);
  if (!profile) return;
  const orgName = org?.name;
  const orgUrl = org?.websiteUrl;
  if (profile.orgName === orgName && profile.orgUrl === orgUrl) return;
  await ctx.db.patch(profileId, { orgName, orgUrl, updatedAt: Date.now() });
}

/** Write `order` 0..n down a person's current positions, then refresh the
 * cache of their primary. */
async function renumber(ctx: MutationCtx, profileId: Id<"profiles">, ordered: Id<"orgPositions">[]) {
  for (let i = 0; i < ordered.length; i++) {
    await ctx.db.patch(ordered[i], { order: i });
  }
  await syncProfileOrgCache(ctx, profileId);
}

function checkName(raw: string) {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) fail("name_required", "Give the organization a name.");
  if (name.length > ORG_LIMITS.name) fail("too_long", `Keep the name under ${ORG_LIMITS.name} characters.`);
  return name;
}

function checkTitle(raw: string | undefined | null) {
  const title = (raw ?? "").trim();
  if (title.length > ORG_LIMITS.title) fail("too_long", `Keep the title under ${ORG_LIMITS.title} characters.`);
  return title || undefined;
}

async function uniqueSlug(ctx: MutationCtx, name: string) {
  const base = slugifyOrgName(name);
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!taken) return slug;
  }
  return `${base}-${Date.now()}`;
}

/** Find an organization by name, or create it. Never makes a duplicate. */
async function findOrCreate(ctx: MutationCtx, userId: Id<"users">, rawName: string) {
  const name = checkName(rawName);
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_nameKey", (q) => q.eq("nameKey", orgNameKey(name)))
    .first();
  if (existing) return { org: existing, created: false };
  const now = Date.now();
  const id = await ctx.db.insert("organizations", {
    name,
    nameKey: orgNameKey(name),
    slug: await uniqueSlug(ctx, name),
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  });
  return { org: (await ctx.db.get(id))!, created: true };
}

/** Add (or keep) a person's position at an organization. The first person
 * at an organization with no admin becomes its admin. `primary` moves it to
 * the front of their current positions. */
async function addPosition(
  ctx: MutationCtx,
  org: Doc<"organizations">,
  profile: Doc<"profiles">,
  opts: { title?: string; primary?: boolean },
) {
  const mine = await positionsOfProfile(ctx, profile._id);
  let position = mine.find((p) => p.organizationId === org._id) ?? null;
  if (!position) {
    const hasAdmin = (await positionsOfOrg(ctx, org._id)).some((p) => p.isAdmin);
    const id = await ctx.db.insert("orgPositions", {
      organizationId: org._id,
      userId: profile.userId,
      profileId: profile._id,
      title: opts.title,
      isAdmin: !hasAdmin,
      order: mine.length,
      createdAt: Date.now(),
    });
    position = (await ctx.db.get(id))!;
    mine.push(position);
  } else if (opts.title !== undefined && opts.title !== position.title) {
    await ctx.db.patch(position._id, { title: opts.title });
  }
  const current = sortPositions(mine).filter(isCurrent).map((p) => p._id);
  const ordered = opts.primary ? [position._id, ...current.filter((id) => id !== position!._id)] : current;
  await renumber(ctx, profile._id, ordered);
  return position;
}

/** Profile-side entry point for a typed organization name (onboarding, the
 * operator CLI): find or create it, and make it the person's primary. */
export async function linkOrgByName(ctx: MutationCtx, profile: Doc<"profiles">, name: string) {
  const { org } = await findOrCreate(ctx, profile.userId, name);
  await addPosition(ctx, org, profile, { primary: true });
  return org;
}

/** Drop a person's primary position (the old "clear Organization" field). */
export async function unlinkPrimaryOrg(ctx: MutationCtx, profile: Doc<"profiles">) {
  const primary = primaryPosition(await positionsOfProfile(ctx, profile._id));
  if (primary) await removePosition(ctx, primary);
  else await syncProfileOrgCache(ctx, profile._id);
}

async function removePosition(ctx: MutationCtx, position: Doc<"orgPositions">) {
  const others = (await positionsOfOrg(ctx, position.organizationId)).filter((p) => p._id !== position._id);
  if (position.isAdmin && others.length > 0 && !others.some((p) => p.isAdmin)) {
    fail("last_admin", "Make someone else an admin first.");
  }
  await ctx.db.delete(position._id);
  const rest = sortPositions(await positionsOfProfile(ctx, position.profileId)).filter(isCurrent);
  await renumber(ctx, position.profileId, rest.map((p) => p._id));
}

/** The signed-in person may edit this organization: one of its admins, or a
 * platform admin. */
async function canEdit(ctx: Ctx, org: Doc<"organizations">) {
  const userId = await auth.getUserId(ctx);
  if (!userId) return false;
  const profile = await profileByUserId(ctx, userId);
  if (!profile) return false;
  if (profile.isAdmin) return true;
  const position = await positionOf(ctx, org._id, profile._id);
  return !!position?.isAdmin;
}

async function requireEditor(ctx: MutationCtx, organizationId: Id<"organizations">) {
  const org = await ctx.db.get(organizationId);
  if (!org) fail("not_found", "That organization is gone.");
  if (!(await canEdit(ctx, org))) fail("forbidden", "Only this organization's admins can change it.");
  return org;
}

async function refreshMemberCaches(ctx: MutationCtx, organizationId: Id<"organizations">) {
  for (const p of await positionsOfOrg(ctx, organizationId)) {
    await syncProfileOrgCache(ctx, p.profileId);
  }
}

/** Give an organization a website when it has none yet (the old single
 * Organization field, the operator CLI). */
export async function fillOrgWebsite(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  websiteUrl: string | null,
) {
  if (!websiteUrl) return;
  const org = await ctx.db.get(organizationId);
  if (!org || org.websiteUrl) return;
  await ctx.db.patch(org._id, { websiteUrl, updatedAt: Date.now() });
  await refreshMemberCaches(ctx, org._id);
}

// ——— Queries ———

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!org) return null;

    const people = [];
    for (const p of await positionsOfOrg(ctx, org._id)) {
      const profile = await ctx.db.get(p.profileId);
      if (!profile) continue;
      people.push({
        profileId: profile._id,
        name: profile.name,
        imageUrl: await avatarUrl(ctx, profile),
        title: p.title ?? null,
        startYear: p.startYear ?? null,
        endYear: p.endYear ?? null,
        isAdmin: p.isAdmin,
        current: isCurrent(p),
        createdAt: p.createdAt,
      });
    }
    // Longest-standing first; a position with no start year by when it was added.
    people.sort(
      (a, b) =>
        (a.startYear ?? 9999) - (b.startYear ?? 9999) ||
        a.createdAt - b.createdAt,
    );

    const hostOrg = org.hostOrgId ? await ctx.db.get(org.hostOrgId) : null;

    const userId = await auth.getUserId(ctx);
    const myProfile = userId ? await profileByUserId(ctx, userId) : null;
    const myPosition = myProfile ? await positionOf(ctx, org._id, myProfile._id) : null;

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      category: org.category ?? null,
      tagline: org.tagline ?? null,
      mission: org.mission ?? null,
      logoUrl: await logoUrl(ctx, org),
      websiteUrl: org.websiteUrl ?? null,
      instagram: org.instagram ?? null,
      x: org.x ?? null,
      linkedin: org.linkedin ?? null,
      location: org.location ?? null,
      locationType: org.locationType ?? null,
      address: org.address ?? null,
      coordinates: org.coordinates ?? null,
      placeId: org.placeId ?? null,
      people: people.filter((p) => p.current),
      alumni: people.filter((p) => !p.current),
      hostOrg: hostOrg ? { kind: hostOrg.kind, slug: hostOrg.slug, name: hostOrg.name } : null,
      viewer: {
        signedIn: !!userId,
        canEdit: await canEdit(ctx, org),
        hasPosition: !!myPosition,
      },
    };
  },
});

/** Typeahead for Settings: organizations whose name matches. */
export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const text = q.trim();
    if (!text) return [];
    const hits = await ctx.db
      .query("organizations")
      .withSearchIndex("search_name", (s) => s.search("name", text))
      .take(8);
    return await Promise.all(
      hits.map(async (o) => ({
        _id: o._id,
        name: o.name,
        slug: o.slug,
        category: o.category ?? null,
        location: o.location ?? null,
        logoUrl: await logoUrl(ctx, o),
        nameKey: o.nameKey,
      })),
    );
  },
});

/** The Organizations tab on People (/people?tab=orgs): every organization,
 * most people first, with the first few faces of its people. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    const rows = await Promise.all(
      orgs.map(async (o) => {
        const current = (await positionsOfOrg(ctx, o._id))
          .filter(isCurrent)
          .sort((a, b) => (a.startYear ?? 9999) - (b.startYear ?? 9999) || a.createdAt - b.createdAt);
        const faces = [];
        for (const p of current.slice(0, 3)) {
          const profile = await ctx.db.get(p.profileId);
          if (profile) faces.push({ name: profile.name, imageUrl: await avatarUrl(ctx, profile) });
        }
        return {
          _id: o._id,
          name: o.name,
          slug: o.slug,
          category: o.category ?? null,
          tagline: o.tagline ?? null,
          location: o.location ?? null,
          logoUrl: await logoUrl(ctx, o),
          peopleCount: current.length,
          faces,
        };
      }),
    );
    return rows.sort((a, b) => b.peopleCount - a.peopleCount || a.name.localeCompare(b.name));
  },
});

/** The signed-in person's positions, for Settings › Profile. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const profile = await profileByUserId(ctx, userId);
    if (!profile) return [];
    return await profileOrganizations(ctx, profile._id);
  },
});

// ——— A person's own positions ———

/** Add an organization to your profile by name — joins it if it exists,
 * creates it (with you as admin) if it doesn't. */
export const addByName = mutation({
  args: { name: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId, profile } = await requireMe(ctx);
    const { org, created } = await findOrCreate(ctx, userId, args.name);
    await addPosition(ctx, org, profile, { title: checkTitle(args.title) });
    return { slug: org.slug, created };
  },
});

export const join = mutation({
  args: { organizationId: v.id("organizations"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { profile } = await requireMe(ctx);
    const org = await ctx.db.get(args.organizationId);
    if (!org) fail("not_found", "That organization is gone.");
    await addPosition(ctx, org, profile, { title: checkTitle(args.title) });
    return { slug: org.slug };
  },
});

/** Your title and years at an organization. null clears a year. */
export const updateMyPosition = mutation({
  args: {
    organizationId: v.id("organizations"),
    title: v.optional(v.string()),
    startYear: v.optional(v.union(v.number(), v.null())),
    endYear: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const { profile } = await requireMe(ctx);
    const position = await positionOf(ctx, args.organizationId, profile._id);
    if (!position) fail("not_found", "That organization isn't on your profile.");
    const startYear = args.startYear === undefined ? position.startYear : (args.startYear ?? undefined);
    const endYear = args.endYear === undefined ? position.endYear : (args.endYear ?? undefined);
    const bad = checkYears(startYear, endYear);
    if (bad) fail("invalid_years", bad);
    await ctx.db.patch(position._id, {
      title: args.title === undefined ? position.title : checkTitle(args.title),
      startYear,
      endYear,
    });
    // Ending or un-ending a position can change which one is primary.
    const current = sortPositions(await positionsOfProfile(ctx, profile._id)).filter(isCurrent);
    await renumber(ctx, profile._id, current.map((p) => p._id));
    return { ok: true as const };
  },
});

export const leave = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { profile } = await requireMe(ctx);
    const position = await positionOf(ctx, args.organizationId, profile._id);
    if (!position) return { ok: true as const };
    await removePosition(ctx, position);
    return { ok: true as const };
  },
});

/** Reorder your current positions; the first is shown on your events. */
export const reorderMine = mutation({
  args: { organizationIds: v.array(v.id("organizations")) },
  handler: async (ctx, args) => {
    const { profile } = await requireMe(ctx);
    const current = sortPositions(await positionsOfProfile(ctx, profile._id)).filter(isCurrent);
    const byOrg = new Map(current.map((p) => [String(p.organizationId), p]));
    const ordered = args.organizationIds.map((id) => byOrg.get(String(id))).filter(Boolean) as Doc<"orgPositions">[];
    const rest = current.filter((p) => !ordered.includes(p));
    await renumber(ctx, profile._id, [...ordered, ...rest].map((p) => p._id));
    return { ok: true as const };
  },
});

// ——— The organization's page (admins) ———

const optionalText = v.optional(v.string());

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    category: optionalText,
    tagline: optionalText,
    mission: optionalText,
    websiteUrl: optionalText,
    instagram: optionalText,
    x: optionalText,
    linkedin: optionalText,
    location: optionalText,
    locationType: optionalText,
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    placeId: optionalText,
  },
  handler: async (ctx, args) => {
    const org = await requireEditor(ctx, args.organizationId);
    const name = checkName(args.name);
    const key = orgNameKey(name);
    if (key !== org.nameKey) {
      const clash = await ctx.db
        .query("organizations")
        .withIndex("by_nameKey", (q) => q.eq("nameKey", key))
        .first();
      if (clash) fail("name_taken", `There's already an organization called ${clash.name}.`);
    }
    const category = (args.category ?? "").trim();
    if (category && !(ORG_CATEGORIES as readonly string[]).includes(category)) {
      fail("invalid_category", "Pick a category from the list.");
    }
    const tagline = (args.tagline ?? "").trim();
    if (tagline.length > ORG_LIMITS.tagline) fail("too_long", `Keep the tagline under ${ORG_LIMITS.tagline} characters.`);
    const mission = (args.mission ?? "").trim();
    if (mission.length > ORG_LIMITS.mission) fail("too_long", `Keep the about under ${ORG_LIMITS.mission} characters.`);
    const website = normalizeOrgUrl(args.websiteUrl);
    if (!website.ok) fail("invalid_url", website.reason);
    const socials: Record<"instagram" | "x" | "linkedin", string | undefined> = {
      instagram: undefined,
      x: undefined,
      linkedin: undefined,
    };
    for (const kind of ["instagram", "x", "linkedin"] as const) {
      const r = normalizeSocial(kind, args[kind]);
      if (!r.ok) fail("invalid_social", r.reason);
      socials[kind] = r.value ?? undefined;
    }
    const location = (args.location ?? "").trim();
    await ctx.db.patch(org._id, {
      name,
      nameKey: key,
      category: category || undefined,
      tagline: tagline || undefined,
      mission: mission || undefined,
      websiteUrl: website.value ?? undefined,
      ...socials,
      location: location || undefined,
      locationType: location ? args.locationType : undefined,
      address: location ? args.address : undefined,
      coordinates: location ? args.coordinates : undefined,
      placeId: location ? args.placeId : undefined,
      updatedAt: Date.now(),
    });
    if (name !== org.name || (website.value ?? undefined) !== org.websiteUrl) {
      await refreshMemberCaches(ctx, org._id);
    }
    return { slug: org.slug };
  },
});

/** Set or clear the logo (an upload from files.generateUploadUrl). */
export const setLogo = mutation({
  args: { organizationId: v.id("organizations"), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const org = await requireEditor(ctx, args.organizationId);
    if (org.logoStorageId && org.logoStorageId !== args.storageId) {
      await ctx.storage.delete(org.logoStorageId);
    }
    await ctx.db.patch(org._id, { logoStorageId: args.storageId, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const removePerson = mutation({
  args: { organizationId: v.id("organizations"), profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.organizationId);
    const position = await positionOf(ctx, args.organizationId, args.profileId);
    if (!position) return { ok: true as const };
    await removePosition(ctx, position);
    return { ok: true as const };
  },
});

export const setAdmin = mutation({
  args: { organizationId: v.id("organizations"), profileId: v.id("profiles"), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    await requireEditor(ctx, args.organizationId);
    const position = await positionOf(ctx, args.organizationId, args.profileId);
    if (!position) fail("not_found", "They aren't listed here.");
    if (!args.isAdmin && position.isAdmin) {
      const admins = (await positionsOfOrg(ctx, args.organizationId)).filter((p) => p.isAdmin);
      if (admins.length === 1) fail("last_admin", "Make someone else an admin first.");
    }
    await ctx.db.patch(position._id, { isAdmin: args.isAdmin });
    return { ok: true as const };
  },
});

// ——— Operator ———

/**
 * One-time move from the old free-text field (docs/features/
 * organizations.md, Rollout): every distinct profiles.orgName becomes an
 * organization, carrying the first website anyone gave it; the first
 * person becomes its admin; a hostOrgs row with the same name gets linked.
 * Safe to re-run — existing organizations and positions are reused.
 *   npx convex run organizations:backfillFromProfiles '{"dryRun":true}' --prod
 */
export const backfillFromProfiles = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const profiles = (await ctx.db.query("profiles").collect())
      .filter((p) => p.orgName?.trim())
      .sort((a, b) => a.createdAt - b.createdAt);
    const hostOrgs = await ctx.db.query("hostOrgs").collect();
    const report: { profile: string; organization: string; created: boolean }[] = [];
    const seen = new Map<string, string>(); // nameKey → name, for the dry run
    for (const profile of profiles) {
      const name = profile.orgName!.trim();
      const key = orgNameKey(name);
      const existing = await ctx.db
        .query("organizations")
        .withIndex("by_nameKey", (q) => q.eq("nameKey", key))
        .first();
      const known = existing?.name ?? seen.get(key);
      report.push({ profile: profile.name, organization: known ?? name, created: !known });
      if (!known) seen.set(key, name);
      if (dryRun) continue;
      const org = await linkOrgByName(ctx, profile, name);
      const patch: Partial<Doc<"organizations">> = {};
      if (!org.websiteUrl && profile.orgUrl) patch.websiteUrl = profile.orgUrl;
      if (!org.hostOrgId) {
        const host = hostOrgs.find((h) => orgNameKey(h.name) === org.nameKey && h.kind !== "platform");
        if (host) patch.hostOrgId = host._id;
      }
      if (Object.keys(patch).length) {
        await ctx.db.patch(org._id, { ...patch, updatedAt: Date.now() });
        await refreshMemberCaches(ctx, org._id);
      }
    }
    return { dryRun: !!dryRun, count: report.length, report };
  },
});

/** Point an organization at the community or fund it runs here.
 *   npx convex run organizations:linkHostOrg '{"slug":"abiding-practice","hostOrgSlug":"abiding-practice"}' --prod */
export const linkHostOrg = internalMutation({
  args: { slug: v.string(), hostOrgSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!org) throw new Error(`No organization ${args.slug}`);
    let hostOrgId: Id<"hostOrgs"> | undefined;
    if (args.hostOrgSlug) {
      const host = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", args.hostOrgSlug!))
        .first();
      if (!host) throw new Error(`No hostOrg ${args.hostOrgSlug}`);
      hostOrgId = host._id;
    }
    await ctx.db.patch(org._id, { hostOrgId, updatedAt: Date.now() });
    return { organization: org.name, hostOrgId: hostOrgId ?? null };
  },
});
