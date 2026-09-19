// Classes & Coaching — recurring offerings (a weekly class, a mentorship
// slot, a workshop series) that don't fit projects (one-off) or events
// (single datetime, RSVP-based). Tied directly to the creator (userId), not
// a Host org — see schema.ts's `offerings` table comment and
// docs/the-exchange-v1-prd.md §2/§16 for why the deferred gardenTables/
// hostOrgs system isn't what this is built on.
//
// Conventions mirrored from convex/garden/projects.ts and
// convex/garden/support.ts: getAuthUserId from @convex-dev/auth/server,
// ConvexError with a {code, reason} payload, creator-or-admin auth via
// profile.isAdmin (same pattern as garden/support.ts's confirmSupport).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertCommunityMember, canManageCommunity } from "./garden/communities";
import { isAdminProfile } from "./helpers";

const VALID_STATUSES = new Set(["active", "archived"]);

const addressValidator = v.object({
  street: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  stateCode: v.optional(v.string()),
  zip: v.optional(v.string()),
  country: v.optional(v.string()),
  countryCode: v.optional(v.string()),
});

const coordinatesValidator = v.object({
  lat: v.number(),
  lng: v.number(),
});

// Editable fields shared by createOffering and updateOffering — kept as one
// literal object (rather than a helper spread of `v.object(...)` field defs,
// since Convex's mutation `args` need the raw validators inline) so the two
// mutations can't drift apart on which fields exist.
const offeringFields = {
  title: v.string(),
  description: v.optional(v.string()),
  format: v.string(),
  cadence: v.optional(v.string()),
  startDate: v.optional(v.number()),
  isRecurring: v.optional(v.boolean()),
  endDate: v.optional(v.number()),
  priceCents: v.optional(v.number()),
  location: v.optional(v.string()),
  locationType: v.optional(v.string()),
  address: v.optional(addressValidator),
  coordinates: v.optional(coordinatesValidator),
  placeId: v.optional(v.string()),
  remote: v.optional(v.boolean()),
  photoUrl: v.optional(v.string()),
  photoStorageId: v.optional(v.id("_storage")),
  externalPaymentLinkUrl: v.optional(v.string()),
  interests: v.optional(v.array(v.string())),
  // The community this offering is posted INTO (optional — content stays
  // owned by the creator, this only tags it; community-groups.md §0).
  hostOrgId: v.optional(v.id("hostOrgs")),
};

/** Batches hostOrgs lookups into one Map keyed by hostOrgId string — used by
 * listOfferings/getOffering so N offerings sharing a community cost one
 * ctx.db.get per community, not one per offering. */
async function resolveCommunities(
  ctx: { db: { get: (id: Id<"hostOrgs">) => Promise<{ name: string; slug: string } | null> } },
  hostOrgIds: (Id<"hostOrgs"> | undefined)[],
): Promise<Map<string, { name: string; slug: string }>> {
  const distinct = [...new Set(hostOrgIds.filter((id): id is Id<"hostOrgs"> => !!id))];
  const orgs = await Promise.all(distinct.map((id) => ctx.db.get(id)));
  const out = new Map<string, { name: string; slug: string }>();
  distinct.forEach((id, i) => {
    const org = orgs[i];
    if (org) out.set(String(id), { name: org.name, slug: org.slug });
  });
  return out;
}

// ——————————————————————————————————————————————————————————————
// Pause and report (docs/features/class-payments-and-moderation.md, "How a
// community steps in"). Members post freely; a community's hosts can pause a
// class after complaints, and any signed-in member can report one. House
// style: every decision is a plain function of plain data here — unit-tested
// in offeringModeration.test.ts — and the ctx.db wrappers further down
// (loadViewer, pauseOffering, reportOffering ...) only load data and call it.
// ——————————————————————————————————————————————————————————————

export const PAUSE_REASON_MAX = 300;
export const REPORT_DETAILS_MAX = 500;

/** The offering fields the moderation rules read. */
export interface ModeratedOffering {
  userId: string; // the teacher
  hostOrgId?: string; // the community it was posted into, if any
  pausedAt?: number;
}

/** Who is looking. `memberships` is ALL of the person's community
 * memberships — the rules pick the one for the offering's own community, so
 * being a host somewhere else never counts. */
export interface ModerationActor {
  userId?: string; // absent = signed out
  isAdmin: boolean; // platform admin (profile.isAdmin)
  memberships: { hostOrgId: string; status: string; role: string }[];
}

export function isOfferingTeacher(offering: ModeratedOffering, actor: ModerationActor): boolean {
  return !!actor.userId && actor.userId === offering.userId;
}

/** An ACTIVE host (or legacy moderator) of the offering's own community. A
 * class with no community has no hosts, so this is false for it. */
export function managesOfferingCommunity(offering: ModeratedOffering, actor: ModerationActor): boolean {
  if (!offering.hostOrgId) return false;
  const member = actor.memberships.find((m) => m.hostOrgId === offering.hostOrgId);
  return !!member && member.status === "active" && canManageCommunity(member.role);
}

/** Who may pause, restore, read the reports on, and dismiss reports on a
 * class: platform admins, and the hosts of the class's community. A class
 * with no community answers to admins only. The TEACHER never can (unless
 * they're a platform admin) — not even if they are also a host of that
 * community, otherwise one host could undo another host's pause of their
 * class and the pause would mean nothing. */
export function canModerateOffering(offering: ModeratedOffering, actor: ModerationActor): boolean {
  if (actor.isAdmin) return true;
  if (isOfferingTeacher(offering, actor)) return false;
  return managesOfferingCommunity(offering, actor);
}

/** The paused-class visibility rule. An unpaused class is visible to all
 * (archived is a separate filter, in the callers). A paused class is visible
 * only to its teacher, the hosts of ITS community, and platform admins —
 * a host of some other community sees nothing. Every read that returns
 * offerings to the public goes through this. */
export function canSeeOffering(offering: ModeratedOffering, actor: ModerationActor): boolean {
  if (!offering.pausedAt) return true;
  return actor.isAdmin || isOfferingTeacher(offering, actor) || managesOfferingCommunity(offering, actor);
}

/** The block signUpForOffering applies to a paused class. Exported so any
 * other path that takes money or a spot for a class (a checkout) can refuse
 * the same way. */
export function signupBlock(offering: { pausedAt?: number }): { code: string; reason: string } | null {
  if (!offering.pausedAt) return null;
  return { code: "paused", reason: "This class is paused right now." };
}

/** What every read shows about a pause: the raw columns (pausedBy names a
 * person) never leave the server. `reason` is only ever built for viewers
 * who already passed canSeeOffering. */
export function pauseView(
  offering: { pausedAt?: number; pausedReason?: string },
  canModerate: boolean,
): { paused: boolean; reason: string | null; at: number | null; canRestore: boolean } {
  const paused = !!offering.pausedAt;
  return {
    paused,
    reason: paused ? (offering.pausedReason ?? null) : null,
    at: paused ? (offering.pausedAt ?? null) : null,
    canRestore: paused && canModerate,
  };
}

export function validatePauseReason(reason: string): { code: string; reason: string } | null {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { code: "missing_reason", reason: "Say why you're pausing it — the teacher will see this." };
  }
  if (trimmed.length > PAUSE_REASON_MAX) {
    return { code: "reason_too_long", reason: `Keep it under ${PAUSE_REASON_MAX} characters.` };
  }
  return null;
}

const REPORT_REASONS = new Set(["harassment", "spam", "unsafe", "misleading", "other"]);

const reportReasonValidator = v.union(
  v.literal("harassment"),
  v.literal("spam"),
  v.literal("unsafe"),
  v.literal("misleading"),
  v.literal("other"),
);

export function validateOfferingReport(input: {
  reason: string;
  details?: string;
}): { code: string; reason: string } | null {
  if (!REPORT_REASONS.has(input.reason)) {
    return { code: "invalid_reason", reason: "Pick what's wrong." };
  }
  if ((input.details?.trim().length ?? 0) > REPORT_DETAILS_MAX) {
    return { code: "details_too_long", reason: `Keep it under ${REPORT_DETAILS_MAX} characters.` };
  }
  return null;
}

export type ReportDecision =
  | { ok: true; action: "create" }
  | { ok: true; action: "update"; reportId: string }
  | { ok: false; code: string; reason: string };

/** The gate for reportOffering. Signed-in only; not your own class; not a
 * class you can't see (a paused one is invisible to most people, so it
 * reads as not found); and one open report per reporter per offering — a
 * second report from the same person updates theirs instead of stacking
 * up. `openReports` is the class's OPEN reports only. */
export function resolveOfferingReport(input: {
  offering: ModeratedOffering;
  actor: ModerationActor;
  openReports: { _id: string; reporterId: string }[];
}): ReportDecision {
  const { offering, actor, openReports } = input;
  if (!actor.userId) {
    return { ok: false, code: "unauthenticated", reason: "Sign in to report a class." };
  }
  if (isOfferingTeacher(offering, actor)) {
    return { ok: false, code: "own_offering", reason: "This is your class — you can't report it." };
  }
  if (!canSeeOffering(offering, actor)) {
    return { ok: false, code: "not_found", reason: "No such offering." };
  }
  const mine = openReports.find((r) => r.reporterId === actor.userId);
  return mine ? { ok: true, action: "update", reportId: mine._id } : { ok: true, action: "create" };
}

/** updateOffering's community rule. Editing normally can move a class to
 * another community or take it out of one. While a class is paused that
 * would be an escape — pull it out of the community that paused it — so for
 * everyone but a platform admin the community is frozen until it's restored.
 * Returns the hostOrgId to write (the same "leave alone" / "clear" / "set"
 * semantics updateOffering always had). */
export function resolveCommunityChange<T extends string>(input: {
  current: T | undefined;
  requested: T | undefined;
  clear: boolean | undefined;
  paused: boolean;
  actorIsAdmin: boolean;
}): { ok: true; hostOrgId: T | undefined } | { ok: false; code: string; reason: string } {
  const next = input.clear ? undefined : (input.requested ?? input.current);
  if (input.paused && !input.actorIsAdmin && next !== input.current) {
    return {
      ok: false,
      code: "paused",
      reason: "This class is paused, so it stays in its community until it's restored.",
    };
  }
  return { ok: true, hostOrgId: next };
}

/** The signed-in person (or nobody) in the shape the rules above take. One
 * caller-supplied userId so a handler that already authenticated doesn't
 * pay for a second auth read. */
async function loadViewer(ctx: QueryCtx | MutationCtx, userId: Id<"users"> | null): Promise<ModerationActor> {
  if (!userId) return { isAdmin: false, memberships: [] };
  const [profile, members] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("communityMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  return {
    userId,
    isAdmin: isAdminProfile(profile),
    memberships: members.map((m) => ({ hostOrgId: m.hostOrgId, status: m.status, role: m.role })),
  };
}

/** Swaps the raw pause columns for the `pause` view every read returns. */
function withPauseView<T extends { pausedAt?: number; pausedBy?: Id<"users">; pausedReason?: string }>(
  offering: T,
  canModerate: boolean,
) {
  const { pausedAt, pausedBy: _pausedBy, pausedReason, ...rest } = offering;
  return { ...rest, pause: pauseView({ pausedAt, pausedReason }, canModerate) };
}

async function openReportsFor(ctx: QueryCtx | MutationCtx, offeringId: Id<"offerings">) {
  const reports = await ctx.db
    .query("offeringReports")
    .withIndex("by_offeringId", (q) => q.eq("offeringId", offeringId))
    .collect();
  return reports.filter((r) => r.status === "open");
}

export const createOffering = mutation({
  args: offeringFields,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    if (!args.title.trim()) {
      throw new ConvexError({ code: "missing_title", reason: "Give it a title." });
    }
    if (!args.format.trim()) {
      throw new ConvexError({ code: "missing_format", reason: "Pick a format." });
    }

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    const now = Date.now();
    const id = await ctx.db.insert("offerings", {
      userId,
      title: args.title,
      description: args.description,
      format: args.format,
      cadence: args.cadence,
      startDate: args.startDate,
      isRecurring: args.isRecurring,
      endDate: args.endDate,
      priceCents: args.priceCents,
      location: args.location,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      remote: args.remote ?? true,
      photoUrl: args.photoUrl,
      photoStorageId: args.photoStorageId,
      externalPaymentLinkUrl: args.externalPaymentLinkUrl,
      interests: args.interests,
      hostOrgId: args.hostOrgId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { offeringId: id };
  },
});

// The public Classes & Coaching browse surface. Joins each offering to its
// creator profile, newest first. Small-scale by design, same call as
// garden/projects.ts's listProjects: a full table scan is simpler and fast
// enough at V1 scale, no index tuning yet.
//
// Also resolves photoStorageId → a real URL, same pattern as garden/
// projects.ts's listProjects resolving artifact.mediaStorageId, and returns
// a public signupCount (the roster's full detail — names — stays behind
// listSignupsForOffering's creator-or-admin gate, same split as projects.tsx
// showing supportCount publicly while listSupportForProject is contextual).
//
// A paused class (pauseOffering) is left out unless the viewer is its
// teacher, a host of its community, or a platform admin. The viewer (an auth
// read plus their memberships) is only loaded when the table holds a paused
// class at all, so the common case costs what it always did.
export const listOfferings = query({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("offerings")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const viewer = active.some((o) => o.pausedAt)
      ? await loadViewer(ctx, await getAuthUserId(ctx))
      : null;
    const offerings = viewer ? active.filter((o) => canSeeOffering(o, viewer)) : active;

    const communityById = await resolveCommunities(ctx, offerings.map((o) => o.hostOrgId));

    const withDetails = await Promise.all(
      offerings.map(async (offering) => {
        const [user, signups] = await Promise.all([
          ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", offering.userId))
            .unique(),
          ctx.db
            .query("offeringSignups")
            .withIndex("by_offeringId", (q) => q.eq("offeringId", offering._id))
            .collect(),
        ]);

        const resolvedPhotoUrl = offering.photoStorageId
          ? await ctx.storage.getUrl(offering.photoStorageId)
          : (offering.photoUrl ?? null);

        return {
          ...withPauseView(offering, viewer ? canModerateOffering(offering, viewer) : false),
          photoUrl: resolvedPhotoUrl,
          signupCount: signups.length,
          creator: user
            ? {
                _id: user._id,
                name: user.name,
                imageUrl: user.imageUrl,
              }
            : null,
          community: offering.hostOrgId ? (communityById.get(String(offering.hostOrgId)) ?? null) : null,
        };
      }),
    );

    return withDetails.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Single-offering fetch for the detail page (routes/offerings.$id.tsx).
// Same per-row shape as listOfferings above (resolved photo URL, creator,
// signupCount, community) — deliberately WITHOUT the full signups roster;
// that stays behind listSignupsForOffering's creator-or-admin gate, called
// separately by the detail page's owner-only view when it needs names.
// `offeringId` is v.string() rather than v.id("offerings") so a malformed
// or foreign id normalizes to null instead of throwing — a plain 404, not
// a crash, for a bad/stale URL.
//
// A paused class reads as not found (null) to everyone but its teacher, the
// hosts of its community, and platform admins. For those three it carries
// the `pause` view ({paused, reason, at, canRestore}); `canModerate` says
// whether this viewer may pause/restore and see the reports; `canReport`
// whether they get the Report control (signed in, not the teacher);
// `viewerHasOpenReport` whether they've already reported it.
export const getOffering = query({
  args: { offeringId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("offerings", args.offeringId);
    if (!id) return null;

    const offering = await ctx.db.get(id);
    if (!offering) return null;

    const userId = await getAuthUserId(ctx);
    const viewer = await loadViewer(ctx, userId);
    if (!canSeeOffering(offering, viewer)) return null;

    const canModerate = canModerateOffering(offering, viewer);
    const canReport = !!userId && !isOfferingTeacher(offering, viewer);
    const viewerHasOpenReport = canReport
      ? (await openReportsFor(ctx, offering._id)).some((r) => r.reporterId === userId)
      : false;

    const [user, signups, communityById] = await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", offering.userId))
        .unique(),
      ctx.db
        .query("offeringSignups")
        .withIndex("by_offeringId", (q) => q.eq("offeringId", offering._id))
        .collect(),
      resolveCommunities(ctx, [offering.hostOrgId]),
    ]);

    const resolvedPhotoUrl = offering.photoStorageId
      ? await ctx.storage.getUrl(offering.photoStorageId)
      : (offering.photoUrl ?? null);

    return {
      ...withPauseView(offering, canModerate),
      photoUrl: resolvedPhotoUrl,
      signupCount: signups.length,
      creator: user
        ? {
            _id: user._id,
            name: user.name,
            imageUrl: user.imageUrl,
          }
        : null,
      community: offering.hostOrgId ? (communityById.get(String(offering.hostOrgId)) ?? null) : null,
      canModerate,
      canReport,
      viewerHasOpenReport,
    };
  },
});

export const updateOfferingStatus = mutation({
  args: {
    offeringId: v.id("offerings"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    if (!VALID_STATUSES.has(args.status)) {
      throw new ConvexError({ code: "invalid_status", reason: "Not a real status." });
    }

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (offering.userId !== userId && !profile?.isAdmin) {
      throw new ConvexError({ code: "forbidden", reason: "Creator-only." });
    }

    await ctx.db.patch(args.offeringId, { status: args.status, updatedAt: Date.now() });
    return { ok: true };
  },
});

// Full edit — every field the composer collects, same creator-or-admin auth
// as updateOfferingStatus/deleteOffering above. Deletes the old storage
// image when a new photoStorageId replaces it, same as files.ts's
// saveProfileImage/saveEventCoverImage.
export const updateOffering = mutation({
  args: {
    offeringId: v.id("offerings"),
    ...offeringFields,
    // Convex validators don't accept `null` through v.optional — pass this
    // instead to remove an already-set hostOrgId (offeringFields.hostOrgId
    // above is only ever "set to this" or "leave alone").
    clearCommunity: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (offering.userId !== userId && !profile?.isAdmin) {
      throw new ConvexError({ code: "forbidden", reason: "Creator-only." });
    }

    if (!args.title.trim()) {
      throw new ConvexError({ code: "missing_title", reason: "Give it a title." });
    }
    if (!args.format.trim()) {
      throw new ConvexError({ code: "missing_format", reason: "Pick a format." });
    }

    // A paused class can't be moved out of (or into) a community by editing
    // — see resolveCommunityChange. Everything else stays editable.
    const community = resolveCommunityChange({
      current: offering.hostOrgId,
      requested: args.hostOrgId,
      clear: args.clearCommunity,
      paused: !!offering.pausedAt,
      actorIsAdmin: isAdminProfile(profile),
    });
    if (!community.ok) {
      throw new ConvexError({ code: community.code, reason: community.reason });
    }

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    // updateOffering fully replaces the record from form state each submit
    // (same convention as events.ts's `update`), so a photoStorageId that's
    // missing from args means the owner removed the photo, not "leave it
    // alone." Either way — replaced or removed — the old storage object is
    // now orphaned and gets cleaned up, same as files.ts's
    // saveProfileImage/saveEventCoverImage.
    if (offering.photoStorageId && args.photoStorageId !== offering.photoStorageId) {
      await ctx.storage.delete(offering.photoStorageId);
    }

    await ctx.db.patch(args.offeringId, {
      title: args.title,
      description: args.description,
      format: args.format,
      cadence: args.cadence,
      startDate: args.startDate,
      isRecurring: args.isRecurring,
      endDate: args.endDate,
      priceCents: args.priceCents,
      location: args.location,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      remote: args.remote ?? true,
      photoUrl: args.photoUrl,
      photoStorageId: args.photoStorageId,
      externalPaymentLinkUrl: args.externalPaymentLinkUrl,
      hostOrgId: community.hostOrgId,
      interests: args.interests,
      // pausedAt/pausedBy/pausedReason are deliberately absent: a patch only
      // touches the fields it names, so an edit can never clear a pause.
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const deleteOffering = mutation({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (offering.userId !== userId && !profile?.isAdmin) {
      throw new ConvexError({ code: "forbidden", reason: "Creator-only." });
    }

    await ctx.db.delete(args.offeringId);
    return { ok: true };
  },
});

// Sign-up — the pledge-only, no-checkout path (mirrors garden/support.ts's
// supportProject: derive userId/name server-side from the authenticated
// caller's profile, never trust a client-supplied identity) AND the
// external-payment-link path ("Jenna's case"): even when the instructor
// takes payment through an outside tool, clicking through still calls this
// so the sign-up is recorded here too.
//
// Status:
//   "confirmed" — free (no priceCents), or externalPaymentLinkUrl is set
//                 (payment, if any, happens off-platform — this row is just
//                 the record that they joined).
//   "pledged"   — a paid offering with no external link: real intent, no
//                 money actually moved yet, same "pledge" semantics as
//                 projectSupport's financial types.
//
// Duplicate sign-ups no-op (checked via by_offeringId_userId) rather than
// erroring — a double-click shouldn't surface a loud failure.
export const signUpForOffering = mutation({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    // A paused class takes no new sign-ups (existing ones stay).
    const blocked = signupBlock(offering);
    if (blocked) throw new ConvexError(blocked);

    const existing = await ctx.db
      .query("offeringSignups")
      .withIndex("by_offeringId_userId", (q) =>
        q.eq("offeringId", args.offeringId).eq("userId", userId),
      )
      .unique();
    if (existing) {
      return { signupId: existing._id, alreadySignedUp: true };
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const isFree = !offering.priceCents || offering.priceCents <= 0;
    const status = isFree || offering.externalPaymentLinkUrl ? "confirmed" : "pledged";

    const signupId = await ctx.db.insert("offeringSignups", {
      offeringId: args.offeringId,
      userId,
      name: profile?.name ?? "Someone",
      status,
      createdAt: Date.now(),
    });

    return { signupId, alreadySignedUp: false };
  },
});

// Creator-or-admin only (same auth pattern as updateOfferingStatus) — the
// roster, for the offering's owner to see who's coming. The public signup
// COUNT is on listOfferings; this is the name-bearing detail that stays
// owner-only.
export const listSignupsForOffering = query({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (offering.userId !== userId && !profile?.isAdmin) {
      throw new ConvexError({ code: "forbidden", reason: "Creator-only." });
    }

    const signups = await ctx.db
      .query("offeringSignups")
      .withIndex("by_offeringId", (q) => q.eq("offeringId", args.offeringId))
      .collect();

    return signups.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ——————————————————————————————————————————————————————————————
// Pause and report — the mutations. The rules live in the pure core near the
// top of this file; these load the actor, call it, and write.
// ——————————————————————————————————————————————————————————————

// Hosts of the class's community and platform admins (canModerateOffering).
// A class with no community can only be paused by a platform admin. Marks
// the class's open reports resolved — pausing IS the answer to them. Pausing
// an already-paused class is a no-op, so a second host never overwrites the
// first host's reason.
export const pauseOffering = mutation({
  args: { offeringId: v.id("offerings"), reason: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const viewer = await loadViewer(ctx, userId);
    if (!canModerateOffering(offering, viewer)) {
      throw new ConvexError({
        code: "forbidden",
        reason: offering.hostOrgId
          ? "Only the community's hosts can pause this class."
          : "Only the site team can pause a class that isn't in a community.",
      });
    }

    const invalid = validatePauseReason(args.reason);
    if (invalid) throw new ConvexError(invalid);

    if (offering.pausedAt) return { ok: true, alreadyPaused: true };

    const now = Date.now();
    await ctx.db.patch(args.offeringId, {
      pausedAt: now,
      pausedBy: userId,
      pausedReason: args.reason.trim(),
    });
    for (const report of await openReportsFor(ctx, args.offeringId)) {
      await ctx.db.patch(report._id, { status: "resolved", resolvedBy: userId, resolvedAt: now });
    }
    return { ok: true, alreadyPaused: false };
  },
});

// Same actors as pauseOffering. The teacher can't restore their own class.
// Sign-ups made before the pause were never touched, and reports resolved by
// the pause stay resolved.
export const restoreOffering = mutation({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const viewer = await loadViewer(ctx, userId);
    if (!canModerateOffering(offering, viewer)) {
      throw new ConvexError({
        code: "forbidden",
        reason: offering.hostOrgId
          ? "Only the community's hosts can restore this class."
          : "Only the site team can restore a class that isn't in a community.",
      });
    }

    if (!offering.pausedAt) return { ok: true, wasPaused: false };

    // Patching a field to undefined removes it.
    await ctx.db.patch(args.offeringId, {
      pausedAt: undefined,
      pausedBy: undefined,
      pausedReason: undefined,
    });
    return { ok: true, wasPaused: true };
  },
});

// Any signed-in member except the teacher, on a class they can see. One open
// report per reporter per offering: reporting again updates the first one.
// The teacher never learns who reported; the hosts see the reason and note
// but not the name (listReportsForOffering).
export const reportOffering = mutation({
  args: {
    offeringId: v.id("offerings"),
    reason: reportReasonValidator,
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    const invalid = validateOfferingReport({ reason: args.reason, details: args.details });
    if (invalid) throw new ConvexError(invalid);

    const decision = resolveOfferingReport({
      offering,
      actor: await loadViewer(ctx, userId),
      openReports: await openReportsFor(ctx, args.offeringId),
    });
    if (!decision.ok) throw new ConvexError({ code: decision.code, reason: decision.reason });

    const details = args.details?.trim() || undefined;
    if (decision.action === "update") {
      await ctx.db.patch(decision.reportId as Id<"offeringReports">, { reason: args.reason, details });
      return { reportId: decision.reportId, updated: true };
    }

    const reportId = await ctx.db.insert("offeringReports", {
      offeringId: args.offeringId,
      hostOrgId: offering.hostOrgId,
      reporterId: userId,
      reason: args.reason,
      details,
      status: "open",
      createdAt: Date.now(),
    });
    return { reportId, updated: false };
  },
});

// Open reports on one class, newest first. Same actors as pauseOffering. No
// reporter identity: hosts are neighbours of the teacher, and a name on a
// complaint invites retaliation. (The row is there for a platform admin who
// needs it.)
export const listReportsForOffering = query({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const offering = await ctx.db.get(args.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "No such offering." });

    if (!canModerateOffering(offering, await loadViewer(ctx, userId))) {
      throw new ConvexError({ code: "forbidden", reason: "Only the community's hosts can see reports." });
    }

    const open = await openReportsFor(ctx, args.offeringId);
    return open
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id,
        reason: r.reason,
        details: r.details ?? null,
        createdAt: r.createdAt,
      }));
  },
});

// "This one's fine" — closes a report without pausing. Same actors as
// pauseOffering, judged against the class's community as it is now.
export const dismissReport = mutation({
  args: { reportId: v.id("offeringReports") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const report = await ctx.db.get(args.reportId);
    if (!report) throw new ConvexError({ code: "not_found", reason: "No such report." });

    const offering = await ctx.db.get(report.offeringId);
    if (!offering) throw new ConvexError({ code: "not_found", reason: "That class isn't here anymore." });

    if (!canModerateOffering(offering, await loadViewer(ctx, userId))) {
      throw new ConvexError({ code: "forbidden", reason: "Only the community's hosts can dismiss reports." });
    }

    if (report.status !== "open") return { ok: true };
    await ctx.db.patch(args.reportId, { status: "dismissed", resolvedBy: userId, resolvedAt: Date.now() });
    return { ok: true };
  },
});
