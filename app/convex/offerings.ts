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
import { internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { assertCommunityMember } from "./garden/communities";
import { classCheckoutRefusal, classPaymentPath } from "./garden/stripeHandlers";

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

/** The public "N signed up" count: people who are actually in. A "pledged" row
 * is a student who started checkout and hasn't paid (or a pledge from before
 * checkout existed), so it isn't counted — the owner's roster
 * (listSignupsForOffering) still lists every row with its status. */
function confirmedCount(signups: { status: string }[]): number {
  return signups.filter((s) => s.status === "confirmed").length;
}

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
          signupCount: confirmedCount(signups),
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
      signupCount: confirmedCount(signups),
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

// Sign-up for a free class, and the external-payment-link path ("Jenna's
// case"): even when the instructor takes payment through an outside tool,
// clicking through still calls this so the sign-up is recorded here too.
// Derives userId/name server-side from the authenticated caller's profile,
// never a client-supplied identity (mirrors garden/support.ts's
// supportProject).
//
// Status is always "confirmed": the class is free, or externalPaymentLinkUrl
// is set (payment, if any, happens off-platform — this row is just the
// record that they joined).
//
// A PAID class with no external link is refused (payment_required): its
// money moves through checkout (garden/stripe.ts's createClassCheckout), and
// the Stripe webhook confirms the sign-up when the payment lands. Rows that
// were pledged before checkout existed stay as they are.
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

    if (classPaymentPath(offering) === "checkout") {
      throw new ConvexError({
        code: "payment_required",
        reason: "This class is paid. Use Pay to sign up.",
      });
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const signupId = await ctx.db.insert("offeringSignups", {
      offeringId: args.offeringId,
      userId,
      name: profile?.name ?? "Someone",
      status: "confirmed",
      createdAt: Date.now(),
    });

    return { signupId, alreadySignedUp: false };
  },
});

// The signed-in caller's own sign-up on one offering — what the detail page
// reads to tell a student whether their payment landed, and what the paid
// sign-up modal reads so someone already in isn't offered Pay again. Null
// when signed out, on a bad id, or with no row. `offeringId` is v.string()
// for the same reason getOffering's is: a stale URL is a null, not a crash.
export const getMySignup = query({
  args: { offeringId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId("offerings", args.offeringId);
    if (!id) return null;

    const row = await ctx.db
      .query("offeringSignups")
      .withIndex("by_offeringId_userId", (q) => q.eq("offeringId", id).eq("userId", userId))
      .unique();
    return row ? { status: row.status } : null;
  },
});

// The database half of garden/stripe.ts's createClassCheckout (a "use node"
// action, no ctx.db of its own). Decides whether this student may pay —
// stripeHandlers.ts's classCheckoutRefusal is the one authority — and if so
// makes sure they have a sign-up row to pay against: "pledged" until the
// Stripe webhook confirms the payment. Idempotent: a second checkout or a
// double click finds the same row. Returns the refusal rather than throwing,
// so the action decides how it reaches the student, and writes nothing when
// it refuses.
export const startClassCheckout = internalMutation({
  args: { offeringId: v.id("offerings"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const offering = await ctx.db.get(args.offeringId);
    const existing = offering
      ? await ctx.db
          .query("offeringSignups")
          .withIndex("by_offeringId_userId", (q) =>
            q.eq("offeringId", args.offeringId).eq("userId", args.userId),
          )
          .unique()
      : null;

    const refusal = classCheckoutRefusal({
      offering: offering
        ? {
            userId: String(offering.userId),
            status: offering.status,
            priceCents: offering.priceCents,
            externalPaymentLinkUrl: offering.externalPaymentLinkUrl,
          }
        : null,
      buyerUserId: String(args.userId),
      signupStatus: existing?.status,
    });
    if (refusal) return { ok: false as const, refusal };

    // classCheckoutRefusal refuses a missing offering, so it exists from here
    // on, and (having passed) has a whole-cent price inside the allowed range.
    const found = offering!;

    let signupId = existing?._id;
    if (!signupId) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique();
      signupId = await ctx.db.insert("offeringSignups", {
        offeringId: args.offeringId,
        userId: args.userId,
        name: profile?.name ?? "Someone",
        status: "pledged",
        createdAt: Date.now(),
      });
    }

    return {
      ok: true as const,
      title: found.title,
      priceCents: found.priceCents!,
      signupId: String(signupId),
    };
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
