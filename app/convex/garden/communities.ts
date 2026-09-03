// Communities — the visible layer on top of creatives.exchange
// (docs/features/community-groups.md). A community is a `hostOrgs` row of
// kind "community": hosts APPLY (self-serve), operators approve, members
// join for free, and content (projects/events/offerings/tables) is TAGGED
// to the community while staying owned by the person who posted it.
//
// House style (same as tables.ts / operator.ts): a pure core at the top —
// validation and the join decision, unit-tested without Convex in
// communities.test.ts — and thin ctx.db wrappers below.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdminProfile } from "../helpers";
import { can } from "./capabilities";
import { getGardenUser, throwDenial } from "./entitlements";
import { slugifyTitle, resolveAvailableSlug } from "./stories";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export type CommunityStatus = "pending" | "active" | "declined" | "archived";
export type CommunityVisibility = "public" | "unlisted";
export type CommunityJoinPolicy = "open" | "apply";
export type CommunityRole = "host" | "moderator" | "member";

export const COMMUNITY_KIND = "community";
/** The one row that owns the platform-wide project pool ledger. Never
 * listed as a community; seeded by garden/devSeed.ts. */
export const PLATFORM_ORG_SLUG = "creatives-exchange";

export interface CommunityLike {
  kind: string;
  status?: string;
  visibility?: string;
  joinPolicy?: string;
}

/** Rows written before the community layer have none of the optional
 * fields — this is the single place their defaults live. */
export function normalizeCommunity<T extends CommunityLike>(
  row: T,
): T & { status: CommunityStatus; visibility: CommunityVisibility; joinPolicy: CommunityJoinPolicy } {
  return {
    ...row,
    status: (row.status as CommunityStatus | undefined) ?? "active",
    visibility: (row.visibility as CommunityVisibility | undefined) ?? "public",
    joinPolicy: (row.joinPolicy as CommunityJoinPolicy | undefined) ?? "open",
  };
}

/** Listed in the public directory: a community, approved, not unlisted. */
export function isListedCommunity(row: CommunityLike): boolean {
  const c = normalizeCommunity(row);
  return row.kind === COMMUNITY_KIND && c.status === "active" && c.visibility === "public";
}

const NAME_MAX = 60;
const TAGLINE_MAX = 120;
const DESCRIPTION_MAX = 2000;

export interface ApplicationInput {
  name: string;
  tagline?: string;
  description?: string;
  websiteUrl?: string;
  locationLabel?: string;
  applicantNote?: string;
  joinPolicy?: string;
}

/** Warm, specific validation errors — the same {code, reason} anatomy every
 * other Garden mutation throws. Returns null when the input is fine. */
export function validateApplication(input: ApplicationInput): { code: string; reason: string } | null {
  const name = input.name.trim();
  if (!name) return { code: "invalid_name", reason: "Give the community a name." };
  if (name.length > NAME_MAX)
    return { code: "invalid_name", reason: `Keep the name under ${NAME_MAX} characters.` };
  if (!/[a-z0-9]/i.test(name.normalize("NFKD"))) {
    return { code: "invalid_name", reason: "The name needs at least one letter or number." };
  }
  if ((input.tagline?.trim().length ?? 0) > TAGLINE_MAX)
    return { code: "invalid_tagline", reason: `Keep the tagline under ${TAGLINE_MAX} characters.` };
  if ((input.description?.trim().length ?? 0) > DESCRIPTION_MAX)
    return {
      code: "invalid_description",
      reason: `Keep the description under ${DESCRIPTION_MAX} characters.`,
    };
  const website = input.websiteUrl?.trim();
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("scheme");
    } catch {
      return { code: "invalid_website", reason: "That website doesn't look like a real URL." };
    }
  }
  if (input.joinPolicy !== undefined && input.joinPolicy !== "open" && input.joinPolicy !== "apply") {
    return { code: "invalid_join_policy", reason: 'Join policy is "open" or "apply".' };
  }
  return null;
}

export interface JoinDecision {
  allowed: boolean;
  alreadyMember?: boolean;
  /** The communityMembers.status the join should write. */
  newStatus?: "active" | "pending";
  reason?: string;
}

/** The join decision: community status × join policy × existing row. Pure
 * so getCommunity's viewer.canJoin and joinCommunity's gate can't drift. */
export function resolveCommunityJoin(args: {
  community: CommunityLike;
  existing: { status: string } | null;
}): JoinDecision {
  const c = normalizeCommunity(args.community);
  if (args.community.kind !== COMMUNITY_KIND) {
    return { allowed: false, reason: "That isn't a community you can join." };
  }
  if (args.existing && args.existing.status !== "removed") {
    return { allowed: true, alreadyMember: true };
  }
  if (c.status !== "active") {
    return {
      allowed: false,
      reason:
        c.status === "pending"
          ? "This community is still being set up — it opens once it's approved."
          : "This community isn't open right now.",
    };
  }
  return { allowed: true, newStatus: c.joinPolicy === "apply" ? "pending" : "active" };
}

export function canManageCommunity(role: string | undefined): boolean {
  return role === "host" || role === "moderator";
}

// ——————————————————————————————————————————————————————————————
// Leadership — a community has exactly one owner (hostOrgs.ownerUserId,
// always an active role-"host" member) and any number of admins (any other
// active role-"host" member). Both are co-listed publicly. "moderator"
// stays valid for existing rows — it can still manage — but is never
// treated as a leader here and no new moderator rows get created.
// ——————————————————————————————————————————————————————————————

/** Only role "host" counts as a leader (owner or admin) for public
 * co-listing — "moderator" manages but isn't listed. */
export function isLeaderRole(role: string | undefined): boolean {
  return role === "host";
}

export interface LeaderRow {
  userId: string;
  name: string;
}

export interface Leader {
  userId: string;
  name: string;
  isOwner: boolean;
}

/** Owner first, then admins by name (locale compare) — the shape every
 * public "Hosted by …" line and the host-tools roster order from. `rows`
 * should already be the active role-"host" members. */
export function orderLeaders(rows: LeaderRow[], ownerUserId: string | undefined): Leader[] {
  const owner = ownerUserId ? rows.find((r) => r.userId === ownerUserId) : undefined;
  const admins = rows
    .filter((r) => r.userId !== ownerUserId)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const out: Leader[] = [];
  if (owner) out.push({ userId: owner.userId, name: owner.name, isOwner: true });
  for (const a of admins) out.push({ userId: a.userId, name: a.name, isOwner: false });
  return out;
}

export interface RoleChangeInput {
  actorIsOwner: boolean;
  actorIsOperator: boolean;
  targetIsOwner: boolean;
  targetStatus: string;
  nextRole: string;
}

export interface RoleDecision {
  allowed: boolean;
  reason?: string;
}

/** The gate for setMemberRole: who may promote/demote whom. */
export function resolveRoleChange(input: RoleChangeInput): RoleDecision {
  if (!input.actorIsOwner && !input.actorIsOperator) {
    return { allowed: false, reason: "Only the community's owner can change roles." };
  }
  if (input.nextRole !== "host" && input.nextRole !== "member") {
    return { allowed: false, reason: 'Role is "host" or "member".' };
  }
  if (input.targetIsOwner) {
    return {
      allowed: false,
      reason: "The owner's role can't be changed from here — transfer ownership first.",
    };
  }
  if (input.targetStatus !== "active") {
    return { allowed: false, reason: "That person isn't an active member." };
  }
  return { allowed: true };
}

export interface OwnershipTransferInput {
  actorIsOwner: boolean;
  actorIsOperator: boolean;
  targetIsActiveMember: boolean;
  targetIsOwner: boolean;
}

/** The gate for transferOwnership. */
export function resolveOwnershipTransfer(input: OwnershipTransferInput): RoleDecision {
  if (!input.actorIsOwner && !input.actorIsOperator) {
    return { allowed: false, reason: "Only the community's owner can transfer ownership." };
  }
  if (input.targetIsOwner) {
    return { allowed: false, reason: "They're already the owner." };
  }
  if (!input.targetIsActiveMember) {
    return { allowed: false, reason: "Only an active member can become the owner." };
  }
  return { allowed: true };
}

// ——————————————————————————————————————————————————————————————
// Shared server helpers (used by projects.ts / events.ts / offerings.ts to
// validate a `hostOrgId` on content — "post into a community")
// ——————————————————————————————————————————————————————————————

type Ctx = QueryCtx | MutationCtx;

export async function getCommunityMember(
  ctx: Ctx,
  hostOrgId: Id<"hostOrgs">,
  userId: Id<"users">,
): Promise<Doc<"communityMembers"> | null> {
  return ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) => q.eq("hostOrgId", hostOrgId).eq("userId", userId))
    .unique();
}

/** Throws unless `userId` is an ACTIVE member of an ACTIVE community.
 * Content mutations call this before writing a hostOrgId onto a row. */
export async function assertCommunityMember(
  ctx: Ctx,
  hostOrgId: Id<"hostOrgs">,
  userId: Id<"users">,
): Promise<Doc<"hostOrgs">> {
  const org = await ctx.db.get(hostOrgId);
  if (!org || org.kind !== COMMUNITY_KIND) {
    throw new ConvexError({
      code: "unknown_community",
      reason: "That community isn't there — pick another, or post without one.",
    });
  }
  if (normalizeCommunity(org).status !== "active") {
    throw new ConvexError({
      code: "community_not_active",
      reason: "That community isn't open yet — post without one for now.",
    });
  }
  const member = await getCommunityMember(ctx, hostOrgId, userId);
  if (!member || member.status !== "active") {
    throw new ConvexError({
      code: "not_a_member",
      reason: "Join the community first, then post into it.",
    });
  }
  return org;
}

/** Same gate for operators: admins pass regardless of membership. */
export async function assertCanManageCommunity(
  ctx: Ctx,
  hostOrgId: Id<"hostOrgs">,
  userId: Id<"users">,
): Promise<Doc<"hostOrgs">> {
  const org = await ctx.db.get(hostOrgId);
  if (!org) throw new ConvexError({ code: "not_found", reason: "That community isn't there." });
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (isAdminProfile(profile)) return org;
  const member = await getCommunityMember(ctx, hostOrgId, userId);
  if (!member || member.status !== "active" || !canManageCommunity(member.role)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "Only the community's hosts can change this.",
    });
  }
  return org;
}

async function requireOperator(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated" });
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!isAdminProfile(profile)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "This is an operator tool — this account doesn't have that access.",
    });
  }
  return userId;
}

/** Only `name` off profiles — never email (same rule as tables.ts). */
async function profileNames(ctx: Ctx, userIds: Id<"users">[]): Promise<Map<string, string>> {
  const profiles = await Promise.all(
    userIds.map((id) =>
      ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", id))
        .unique(),
    ),
  );
  const out = new Map<string, string>();
  for (const p of profiles) if (p) out.set(String(p.userId), p.name);
  return out;
}

/** Owner-first, then admins by name — see orderLeaders. `names` misses an
 * id when the profile lookup came up empty (same defensive filter `hosts`
 * uses), so those ids are silently dropped here too. */
function buildLeaders(
  hostIds: Id<"users">[],
  names: Map<string, string>,
  ownerUserId: Id<"users"> | undefined,
): Leader[] {
  const rows: LeaderRow[] = hostIds
    .map((id) => ({ userId: String(id), name: names.get(String(id)) }))
    .filter((r): r is LeaderRow => !!r.name);
  return orderLeaders(rows, ownerUserId ? String(ownerUserId) : undefined);
}

function publicShape(org: Doc<"hostOrgs">) {
  const c = normalizeCommunity(org);
  return {
    _id: org._id,
    name: org.name,
    slug: org.slug,
    tagline: org.tagline,
    description: org.description,
    coverUrl: org.coverUrl,
    websiteUrl: org.websiteUrl,
    locationLabel: org.locationLabel,
    givingUrl: org.givingUrl,
    status: c.status,
    visibility: c.visibility,
    joinPolicy: c.joinPolicy,
    createdAt: org.createdAt,
  };
}

// ——————————————————————————————————————————————————————————————
// Public reads
// ——————————————————————————————————————————————————————————————

/** The directory: approved, public communities with a member count and
 * their hosts' names. Small-scale scan (a handful of communities). */
export const listCommunities = query({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db
      .query("hostOrgs")
      .withIndex("by_kind_status", (q) => q.eq("kind", COMMUNITY_KIND))
      .collect();
    const listed = orgs.filter(isListedCommunity);

    return Promise.all(
      listed.map(async (org) => {
        const members = await ctx.db
          .query("communityMembers")
          .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
          .collect();
        const active = members.filter((m) => m.status === "active");
        const hostIds = active.filter((m) => m.role === "host").map((m) => m.userId);
        const names = await profileNames(ctx, hostIds);
        return {
          ...publicShape(org),
          memberCount: active.length,
          hosts: hostIds.map((id) => names.get(String(id))).filter((n): n is string => !!n),
          leaders: buildLeaders(hostIds, names, org.ownerUserId),
        };
      }),
    );
  },
});

const VISIBLE_PROJECT_STATUSES = new Set(["active", "in_progress", "completed"]);

/** One community's page: who runs it, who's in it, and everything tagged
 * to it (tables, upcoming events, projects, offerings). Public — a pending
 * or declined community returns null to everyone except its hosts and
 * operators, so an unapproved application never has a public URL. */
export const getCommunity = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org || org.kind !== COMMUNITY_KIND) return null;

    const userId = await getAuthUserId(ctx);
    const c = normalizeCommunity(org);

    const [members, viewerProfile] = await Promise.all([
      ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
        .collect(),
      userId
        ? ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .unique()
        : Promise.resolve(null),
    ]);
    const mine = userId ? members.find((m) => String(m.userId) === String(userId)) ?? null : null;
    const viewerIsOperator = isAdminProfile(viewerProfile);
    const viewerManages =
      viewerIsOperator || (mine?.status === "active" && canManageCommunity(mine.role));

    if (c.status !== "active" && !viewerManages) return null;

    const activeMembers = members.filter((m) => m.status === "active");
    const hostIds = activeMembers.filter((m) => m.role === "host").map((m) => m.userId);
    const names = await profileNames(ctx, hostIds);

    const now = Date.now();
    const [tables, events, projects, offerings, allocations] = await Promise.all([
      ctx.db
        .query("gardenTables")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
        .collect(),
      ctx.db
        .query("projects")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
        .collect(),
      ctx.db
        .query("offerings")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
        .collect(),
      ctx.db
        .query("allocations")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", org._id))
        .collect(),
    ]);

    const visibleProjects = projects.filter(
      (p) => VISIBLE_PROJECT_STATUSES.has(p.status) && p.origin !== "portfolio",
    );
    const creatorNames = await profileNames(ctx, [
      ...new Set(visibleProjects.map((p) => p.userId)),
    ]);

    const decision = resolveCommunityJoin({ community: org, existing: mine });

    return {
      ...publicShape(org),
      hosts: hostIds.map((id) => names.get(String(id))).filter((n): n is string => !!n),
      leaders: buildLeaders(hostIds, names, org.ownerUserId),
      memberCount: activeMembers.length,
      pendingCount: viewerManages ? members.filter((m) => m.status === "pending").length : 0,
      hasFund: allocations.length > 0 || !!org.givingUrl || !!org.paymentLinkUrl,
      tables: tables
        .filter((t) => t.status === "active")
        .map((t) => ({
          _id: t._id,
          name: t.name,
          slug: t.slug,
          mode: t.mode,
          format: t.format,
          cadence: t.cadence,
        })),
      events: events
        .filter((e) => e.status === "published" && e.datetime > now)
        .sort((a, b) => a.datetime - b.datetime)
        .map((e) => ({
          _id: e._id,
          title: e.title,
          datetime: e.datetime,
          location: e.location,
        })),
      projects: visibleProjects
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((p) => ({
          _id: p._id,
          title: p.title,
          kind: p.kind,
          blurb: p.blurb,
          photoUrl: p.photoUrl,
          storySlug: p.storySlug,
          byName: creatorNames.get(String(p.userId)) ?? "A creative",
        })),
      offerings: offerings
        .filter((o) => o.status === "active")
        .map((o) => ({
          _id: o._id,
          title: o.title,
          format: o.format,
          cadence: o.cadence,
          priceCents: o.priceCents,
        })),
      viewer: {
        isSignedIn: !!userId,
        membership: mine ? { role: mine.role, status: mine.status, isHome: !!mine.isHome } : null,
        canManage: viewerManages,
        isOwner: !!userId && !!org.ownerUserId && String(org.ownerUserId) === String(userId),
        canJoin: decision.alreadyMember
          ? { allowed: false, reason: undefined }
          : { allowed: decision.allowed, reason: decision.reason },
        joinWouldBePending: decision.newStatus === "pending",
      },
    };
  },
});

/** The communities the signed-in user can post INTO — the "post to" picker
 * on create forms. Only active membership of active communities counts. */
export const listMyCommunities = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const out: { _id: Id<"hostOrgs">; name: string; slug: string; role: string; status: string; isHome: boolean }[] = [];
    for (const m of rows) {
      if (m.status === "removed") continue;
      const org = await ctx.db.get(m.hostOrgId);
      if (!org || org.kind !== COMMUNITY_KIND) continue;
      const c = normalizeCommunity(org);
      // Pending applications (host of a pending community) are listed so the
      // applicant can find their own page; they can't post into it yet.
      if (c.status !== "active" && m.role !== "host") continue;
      out.push({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        role: m.role,
        status: c.status === "active" && m.status === "active" ? "active" : "pending",
        isHome: !!m.isHome,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ——————————————————————————————————————————————————————————————
// Member writes
// ——————————————————————————————————————————————————————————————

/** Apply to host a community. Self-serve, free (hosting is free — Aug 31
 * model), lands `pending`; an operator approves before it's listed. The
 * applicant is written as the community's host immediately so they can
 * see their own (unlisted) page while it's under review. */
export const applyToHost = mutation({
  args: {
    name: v.string(),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    locationLabel: v.optional(v.string()),
    applicantNote: v.optional(v.string()),
    joinPolicy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const gardenUser = await getGardenUser(ctx, userId);
    const gate = can(gardenUser, "community.create");
    if (!gate.allowed) throwDenial("community.create", gate);

    const invalid = validateApplication(args);
    if (invalid) throw new ConvexError(invalid);

    // One application in review at a time per person — keeps the operator
    // queue honest and stops accidental double-submits.
    const mine = await ctx.db
      .query("hostOrgs")
      .withIndex("by_ownerUserId", (q) => q.eq("ownerUserId", userId))
      .collect();
    if (mine.some((o) => normalizeCommunity(o).status === "pending")) {
      throw new ConvexError({
        code: "application_pending",
        reason: "You already have a community in review — we'll be in touch about that one first.",
      });
    }

    const name = args.name.trim();
    const slug = await resolveAvailableSlug(slugifyTitle(name), async (candidate) => {
      const hit = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", candidate))
        .unique();
      return hit !== null;
    });

    const now = Date.now();
    const hostOrgId = await ctx.db.insert("hostOrgs", {
      name,
      slug,
      kind: COMMUNITY_KIND,
      tagline: args.tagline?.trim() || undefined,
      description: args.description?.trim() || undefined,
      websiteUrl: args.websiteUrl?.trim() || undefined,
      locationLabel: args.locationLabel?.trim() || undefined,
      applicantNote: args.applicantNote?.trim() || undefined,
      ownerUserId: userId,
      status: "pending",
      visibility: "public",
      joinPolicy: args.joinPolicy === "apply" ? "apply" : "open",
      createdAt: now,
    });
    await ctx.db.insert("communityMembers", {
      hostOrgId,
      userId,
      role: "host",
      status: "active",
      joinedAt: now,
    });
    return { hostOrgId, slug };
  },
});

export const joinCommunity = mutation({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const org = await ctx.db.get(args.hostOrgId);
    if (!org) throw new ConvexError({ code: "not_found", reason: "That community isn't there." });

    const existing = await getCommunityMember(ctx, args.hostOrgId, userId);
    const decision = resolveCommunityJoin({ community: org, existing });
    if (decision.alreadyMember) return { alreadyMember: true, status: existing?.status };
    if (!decision.allowed) {
      throw new ConvexError({ code: "cannot_join", reason: decision.reason });
    }

    const status = decision.newStatus ?? "active";
    if (existing) {
      // A previously removed member rejoining — reuse the row.
      await ctx.db.patch(existing._id, { status, role: "member", joinedAt: Date.now() });
    } else {
      await ctx.db.insert("communityMembers", {
        hostOrgId: args.hostOrgId,
        userId,
        role: "member",
        status,
        joinedAt: Date.now(),
      });
    }
    return { ok: true, status };
  },
});

export const leaveCommunity = mutation({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const existing = await getCommunityMember(ctx, args.hostOrgId, userId);
    if (!existing) return { ok: true };
    const org = await ctx.db.get(args.hostOrgId);
    if (org?.ownerUserId && String(org.ownerUserId) === String(userId)) {
      throw new ConvexError({
        code: "owner_cannot_leave",
        reason: "You're the owner — transfer ownership to someone else before leaving.",
      });
    }
    if (existing.role === "host") {
      const hosts = await ctx.db
        .query("communityMembers")
        .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
        .collect();
      if (hosts.filter((m) => m.role === "host" && m.status === "active").length <= 1) {
        throw new ConvexError({
          code: "last_host",
          reason: "You're the only host — hand it to someone else before leaving.",
        });
      }
    }
    await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

/** Name (or clear) the community your dues support. One home at most. */
export const setHomeCommunity = mutation({
  args: { hostOrgId: v.optional(v.id("hostOrgs")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    if (args.hostOrgId) {
      const target = rows.find((m) => String(m.hostOrgId) === String(args.hostOrgId));
      if (!target || target.status !== "active") {
        throw new ConvexError({ code: "not_a_member", reason: "Join the community first." });
      }
    }
    for (const m of rows) {
      const shouldBeHome = !!args.hostOrgId && String(m.hostOrgId) === String(args.hostOrgId);
      if (!!m.isHome !== shouldBeHome) await ctx.db.patch(m._id, { isHome: shouldBeHome });
    }
    return { ok: true };
  },
});

// ——————————————————————————————————————————————————————————————
// Host writes
// ——————————————————————————————————————————————————————————————

export const updateCommunity = mutation({
  args: {
    hostOrgId: v.id("hostOrgs"),
    name: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    coverUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    locationLabel: v.optional(v.string()),
    joinPolicy: v.optional(v.string()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const org = await assertCanManageCommunity(ctx, args.hostOrgId, userId);

    const invalid = validateApplication({
      name: args.name ?? org.name,
      tagline: args.tagline,
      description: args.description,
      websiteUrl: args.websiteUrl,
      joinPolicy: args.joinPolicy,
    });
    if (invalid) throw new ConvexError(invalid);
    if (args.visibility !== undefined && args.visibility !== "public" && args.visibility !== "unlisted") {
      throw new ConvexError({ code: "invalid_visibility", reason: 'Visibility is "public" or "unlisted".' });
    }

    const patch: Partial<Doc<"hostOrgs">> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.tagline !== undefined) patch.tagline = args.tagline.trim() || undefined;
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.coverUrl !== undefined) patch.coverUrl = args.coverUrl.trim() || undefined;
    if (args.websiteUrl !== undefined) patch.websiteUrl = args.websiteUrl.trim() || undefined;
    if (args.locationLabel !== undefined) patch.locationLabel = args.locationLabel.trim() || undefined;
    if (args.joinPolicy !== undefined) patch.joinPolicy = args.joinPolicy;
    if (args.visibility !== undefined) patch.visibility = args.visibility;
    await ctx.db.patch(args.hostOrgId, patch);
    return { ok: true };
  },
});

/** Hosts approve/decline pending joins (joinPolicy "apply") and remove
 * members. Never touches other hosts. */
export const setMemberStatus = mutation({
  args: {
    hostOrgId: v.id("hostOrgs"),
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("removed")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    await assertCanManageCommunity(ctx, args.hostOrgId, userId);
    const target = await getCommunityMember(ctx, args.hostOrgId, args.userId);
    if (!target) throw new ConvexError({ code: "not_found", reason: "No such member." });
    if (target.role === "host") {
      throw new ConvexError({ code: "forbidden", reason: "Hosts can't be changed from here." });
    }
    await ctx.db.patch(target._id, { status: args.status });
    return { ok: true };
  },
});

/** Only the owner — or a platform operator — may promote/demote. Admins
 * (role "host") keep the management powers they already have but can't
 * touch anyone's role. Gated by resolveRoleChange; never touches the
 * owner's own row (transfer ownership first). */
export const setMemberRole = mutation({
  args: {
    hostOrgId: v.id("hostOrgs"),
    userId: v.id("users"),
    role: v.union(v.literal("host"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new ConvexError({ code: "unauthenticated" });
    const org = await ctx.db.get(args.hostOrgId);
    if (!org || org.kind !== COMMUNITY_KIND) {
      throw new ConvexError({ code: "not_found", reason: "That community isn't there." });
    }
    const actorProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", actorId))
      .unique();
    const target = await getCommunityMember(ctx, args.hostOrgId, args.userId);

    const decision = resolveRoleChange({
      actorIsOwner: !!org.ownerUserId && String(org.ownerUserId) === String(actorId),
      actorIsOperator: isAdminProfile(actorProfile),
      targetIsOwner: !!org.ownerUserId && String(org.ownerUserId) === String(args.userId),
      targetStatus: target?.status ?? "removed",
      nextRole: args.role,
    });
    if (!decision.allowed) {
      throw new ConvexError({ code: "forbidden", reason: decision.reason });
    }

    // decision.allowed guarantees target is active, so it exists.
    await ctx.db.patch(target!._id, { role: args.role });
    return { ok: true };
  },
});

/** Hands the community to someone else. Only the owner or an operator may
 * call this. The new owner's row is guaranteed role "host"/active; the
 * previous owner keeps their role "host" row — they're now an admin. */
export const transferOwnership = mutation({
  args: { hostOrgId: v.id("hostOrgs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const actorId = await getAuthUserId(ctx);
    if (!actorId) throw new ConvexError({ code: "unauthenticated" });
    const org = await ctx.db.get(args.hostOrgId);
    if (!org || org.kind !== COMMUNITY_KIND) {
      throw new ConvexError({ code: "not_found", reason: "That community isn't there." });
    }
    const actorProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", actorId))
      .unique();
    const target = await getCommunityMember(ctx, args.hostOrgId, args.userId);

    const decision = resolveOwnershipTransfer({
      actorIsOwner: !!org.ownerUserId && String(org.ownerUserId) === String(actorId),
      actorIsOperator: isAdminProfile(actorProfile),
      targetIsActiveMember: !!target && target.status === "active",
      targetIsOwner: !!org.ownerUserId && String(org.ownerUserId) === String(args.userId),
    });
    if (!decision.allowed) {
      throw new ConvexError({ code: "forbidden", reason: decision.reason });
    }

    // decision.allowed guarantees target is an active member, so it exists.
    if (target!.role !== "host") {
      await ctx.db.patch(target!._id, { role: "host" });
    }
    await ctx.db.patch(args.hostOrgId, { ownerUserId: args.userId });
    return { ok: true };
  },
});

/** Roster for hosts: names + role + status, owner -> admins -> pending ->
 * members, each group by name. Members-only read. */
export const listMembers = query({
  args: { hostOrgId: v.id("hostOrgs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const org = await ctx.db.get(args.hostOrgId);
    if (!org) return null;
    const mine = await getCommunityMember(ctx, args.hostOrgId, userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const manages =
      isAdminProfile(profile) || (mine?.status === "active" && canManageCommunity(mine.role));
    if (!manages && mine?.status !== "active") return null;

    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", args.hostOrgId))
      .collect();
    const shown = rows.filter((m) => m.status !== "removed" && (manages || m.status === "active"));
    const names = await profileNames(ctx, shown.map((m) => m.userId));
    const ownerId = org.ownerUserId ? String(org.ownerUserId) : undefined;

    return shown
      .map((m) => ({
        userId: m.userId,
        name: names.get(String(m.userId)) ?? "Someone",
        role: m.role,
        status: m.status,
        isOwner: ownerId !== undefined && String(m.userId) === ownerId,
        joinedAt: m.joinedAt,
      }))
      .sort((a, b) => {
        const rank = (r: typeof a) =>
          r.isOwner ? 0 : r.status === "pending" ? 2 : isLeaderRole(r.role) ? 1 : 3;
        const ra = rank(a);
        const rb = rank(b);
        return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
      });
  },
});

// ——————————————————————————————————————————————————————————————
// Operator writes (approval queue) — /admin/garden
// ——————————————————————————————————————————————————————————————

export const listCommunityApplications = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);
    const orgs = await ctx.db
      .query("hostOrgs")
      .withIndex("by_kind_status", (q) => q.eq("kind", COMMUNITY_KIND))
      .collect();
    const ownerIds = orgs
      .map((o) => o.ownerUserId)
      .filter((id): id is Id<"users"> => id !== undefined);
    const names = await profileNames(ctx, ownerIds);
    return Promise.all(
      orgs.map(async (o) => {
        const members = await ctx.db
          .query("communityMembers")
          .withIndex("by_hostOrgId", (q) => q.eq("hostOrgId", o._id))
          .collect();
        return {
          ...publicShape(o),
          applicantNote: o.applicantNote,
          ownerName: o.ownerUserId ? names.get(String(o.ownerUserId)) : undefined,
          memberCount: members.filter((m) => m.status === "active").length,
        };
      }),
    ).then((rows) =>
      rows.sort((a, b) =>
        a.status === b.status ? b.createdAt - a.createdAt : a.status === "pending" ? -1 : 1,
      ),
    );
  },
});

export const reviewCommunity = mutation({
  args: {
    hostOrgId: v.id("hostOrgs"),
    decision: v.union(
      v.literal("approve"),
      v.literal("decline"),
      v.literal("archive"),
      v.literal("reopen"),
    ),
  },
  handler: async (ctx, args) => {
    await requireOperator(ctx);
    const org = await ctx.db.get(args.hostOrgId);
    if (!org || org.kind !== COMMUNITY_KIND) {
      throw new ConvexError({ code: "not_found", reason: "That community isn't there." });
    }
    const next: Record<typeof args.decision, CommunityStatus> = {
      approve: "active",
      decline: "declined",
      archive: "archived",
      reopen: "active",
    };
    await ctx.db.patch(args.hostOrgId, {
      status: next[args.decision],
      approvedAt: args.decision === "approve" ? Date.now() : org.approvedAt,
    });
    return { ok: true, status: next[args.decision] };
  },
});
