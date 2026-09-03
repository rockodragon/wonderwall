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
import { assertCommunityMember } from "./garden/communities";

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
export const listOfferings = query({
  args: {},
  handler: async (ctx) => {
    const offerings = await ctx.db
      .query("offerings")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

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
          ...offering,
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
export const getOffering = query({
  args: { offeringId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("offerings", args.offeringId);
    if (!id) return null;

    const offering = await ctx.db.get(id);
    if (!offering) return null;

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
      ...offering,
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
      hostOrgId: args.clearCommunity ? undefined : (args.hostOrgId ?? offering.hostOrgId),
      interests: args.interests,
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
