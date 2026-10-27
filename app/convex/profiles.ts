import { v, ConvexError } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { currentUserId, getProfileByUserId, isOwnerOrAdmin, requireProfile, requireUserId } from "./helpers";
import { hasRealName } from "./names";
import type { Doc } from "./_generated/dataModel";
import { profileForHandle } from "./handles";
import { normalizeHandle, PAYOUT_KINDS, type PayoutHandles } from "./garden/gigRules";
import { fillOrgWebsite, linkOrgByName, profileOrganizations, unlinkPrimaryOrg } from "./organizations";
import { normalizeOrgUrl } from "./organizationRules";
import { communityVisibility } from "./garden/communityVisibility";
import { isGardenMember } from "./garden/defaultCommunity";
import { pieceMediaUrl, profileImageUrl, storedFileUrl } from "./images";
import { byLatestActivity, directoryLimit, latestPostAt, listedFor, searchedText } from "./directoryRules";
import { activeMembersOfCommunity } from "./garden/communityLookup";
import { isCommunityLeader, leaderUserIds } from "./garden/communityLeader";
import { filterProfiles } from "../app/lib/browse/peopleFilter";

export { normalizeOrgUrl };

// What any visitor may see of someone else's profile. getProfile, directory
// and search are public queries (/people works signed out), so this is an allowlist:
// a field added to profiles later (payout handles, Stripe ids, addresses)
// stays private until someone adds it here on purpose. Coordinates are
// rounded to ~1 km — enough for "Near me", not a doorstep.
export function toPublicProfile(profile: Doc<"profiles">) {
  const { coordinates } = profile;
  return {
    _id: profile._id,
    _creationTime: profile._creationTime,
    userId: profile.userId,
    name: profile.name,
    bio: profile.bio,
    imageUrl: profile.imageUrl,
    imageStorageId: profile.imageStorageId,
    interests: profile.interests,
    location: profile.location,
    locationType: profile.locationType,
    coordinates: coordinates
      ? {
          lat: Math.round(coordinates.lat * 100) / 100,
          lng: Math.round(coordinates.lng * 100) / 100,
        }
      : undefined,
    primaryRole: profile.primaryRole,
    patronRole: profile.patronRole,
    partnerRole: profile.partnerRole,
    orgName: profile.orgName,
    orgUrl: profile.orgUrl,
    supportInterests: profile.supportInterests,
    partnerOfferings: profile.partnerOfferings,
    // The address, /@handle (handleRules.ts), and whether its page asks
    // search engines to leave it out. Both public by nature: the address is
    // the link, and the page itself carries the noindex.
    handle: profile.handle,
    hideFromSearch: profile.hideFromSearch,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

type PublicProfile = ReturnType<typeof toPublicProfile>;

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;

    const profile = await getProfileByUserId(ctx, userId);

    if (!profile) return null;

    // Resolve image URL
    const imageUrl = await profileImageUrl(ctx, profile);

    // Get attributes
    const attributes = await ctx.db
      .query("attributes")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get links
    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // A phone-only sign-in has no email on the `users` table (@convex-dev/
    // auth's authTables) — onboarding.tsx uses this to decide whether to
    // ask for one (Stripe receipts and notifications need an email even
    // for a phone user).
    const user = await ctx.db.get(userId);
    const email = (user as { email?: string } | null)?.email ?? null;

    return {
      ...profile,
      email,
      imageUrl,
      attributes: Object.fromEntries(attributes.map((a) => [a.key, a.value])),
      links: links.sort((a, b) => a.order - b.order),
    };
  },
});

/**
 * Everything a person's page shows (routes/profile.tsx): the public fields
 * (toPublicProfile), the picture, attributes, links, pieces, the active
 * wondering, positions at organizations and whether they lead a community
 * (`isLeader`, for the badge beside their name: garden/communityLeader.ts,
 * a yes or no, never the admin flag behind it). getProfile (by id) and
 * getProfileByHandle (by address) answer with exactly this, so the page is
 * the same whichever way it was reached.
 */
export async function publicProfilePage(ctx: QueryCtx, profile: Doc<"profiles">) {
    // Resolve image URL
    const imageUrl = await profileImageUrl(ctx, profile);

    // Get attributes
    const attributes = await ctx.db
      .query("attributes")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get links
    const links = await ctx.db
      .query("links")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();

    // Get artifacts
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .collect();
    const artifactsWithUrls = await Promise.all(
      artifacts.map(async (artifact) => {
        // Resolve storage URL if exists
        const resolvedMediaUrl = await pieceMediaUrl(ctx, artifact);

        return {
          ...artifact,
          mediaUrl: resolvedMediaUrl, // The displayable media (uploaded image or external URL)
          linkUrl: artifact.mediaUrl || null, // The original link URL (if any)
        };
      }),
    );

    // Get active wondering
    const wondering = await ctx.db
      .query("wonderings")
      .withIndex("by_profileId_active", (q) =>
        q.eq("profileId", profile._id).eq("isActive", true),
      )
      .first();

    // Resolve wondering image URL if exists
    let wonderingWithImage = null;
    if (wondering) {
      const wonderingImageUrl = wondering.imageStorageId
        ? await storedFileUrl(ctx, wondering.imageStorageId)
        : null;
      wonderingWithImage = {
        ...wondering,
        imageUrl: wonderingImageUrl,
      };
    }

    // Payout handles (docs/features/live-booking.md §6) are for the venue
    // that booked this person, never the public page — gigs.getSlotPayment
    // is the only reader.
    return {
      ...toPublicProfile(profile),
      imageUrl,
      attributes: Object.fromEntries(attributes.map((a) => [a.key, a.value])),
      links: links.sort((a, b) => a.order - b.order),
      artifacts: artifactsWithUrls.sort((a, b) => a.order - b.order),
      wondering: wonderingWithImage,
      // Positions at organizations (docs/features/organizations.md).
      organizations: await profileOrganizations(ctx, profile._id),
      // The Garden's members are found under createthegarden.com (Rick,
      // 2026-10-25): their page's canonical address (lib/profileHead.ts).
      inGarden: await isGardenMember(ctx, profile.userId),
      isLeader: await isCommunityLeader(ctx, profile.userId, profile),
    };
}

/**
 * Whether the viewer may see this person's page. Someone who signed in but
 * never gave a name (convex/names.ts) has no page for other members yet:
 * only they and admins see it (/admin links to it).
 */
export async function canSeeProfile(ctx: QueryCtx, profile: Doc<"profiles">): Promise<boolean> {
  if (hasRealName(profile.name)) return true;
  const viewerId = await currentUserId(ctx);
  if (!viewerId) return false;
  return await isOwnerOrAdmin(ctx, profile.userId, viewerId);
}

export const getProfile = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || !(await canSeeProfile(ctx, profile))) return null;
    return await publicProfilePage(ctx, profile);
  },
});

/**
 * A person's page by their address, /@handle (routes/slug.tsx and the edge,
 * functions/[handle].ts). Public like getProfile: the page works signed out
 * and is for search engines to find. An old address still answers for
 * HANDLE_FORWARD_DAYS after a change (handles.profileForHandle); the caller
 * compares `handle` on the answer with the address it asked for and moves to
 * the current one. Null for an address nobody has.
 */
export const getProfileByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const profile = await profileForHandle(ctx, args.handle);
    return profile && (await canSeeProfile(ctx, profile)) ? await publicProfilePage(ctx, profile) : null;
  },
});

/**
 * Fills in a brand-new account's basics without touching anything else:
 * the name (only while it hasn't been given one, convex/names.ts) and the
 * email (only while the account has none). The event RSVP sign-up
 * (event.tsx) uses this instead of upsertProfile because upsertProfile
 * replaces bio/location/etc., which would wipe a returning member who
 * signs in through that form.
 */
export const fillMissingBasics = mutation({
  args: { name: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Signed out is requireUserId's ConvexError (code "unauthenticated"),
    // not a plain Error: production hides plain error messages, and the
    // RSVP and signup forms retry on it while a fresh sign-in settles
    // (isNotSignedIn in app/lib/convexError.ts).
    const userId = await requireUserId(ctx);

    const email = args.email?.trim().toLowerCase();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ConvexError("That doesn't look like a valid email.");
      }
      const user = await ctx.db.get(userId);
      if (user && !(user as { email?: string }).email) {
        await ctx.db.patch(userId, { email });
      }
    }

    const name = args.name?.trim();
    if (name) {
      const profile = await getProfileByUserId(ctx, userId);
      if (profile && !hasRealName(profile.name)) {
        await ctx.db.patch(profile._id, { name, updatedAt: Date.now() });
      }
    }
  },
});

export const upsertProfile = mutation({
  args: {
    name: v.string(),
    bio: v.optional(v.string()),
    // Optional, not required: Patron/Partner onboarding never shows an
    // interests picker at all, so it must be able to omit this entirely
    // rather than being forced to send [] and blank out a Creative's
    // previously-set list when they add a second role.
    interests: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
    locationType: v.optional(v.string()),
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
    placeId: v.optional(v.string()),
    primaryRole: v.optional(v.string()),
    orgName: v.optional(v.string()),
    supportInterests: v.optional(v.array(v.string())),
    partnerOfferings: v.optional(v.array(v.string())),
    // Onboarding-only: a phone sign-in has no email, but Stripe receipts
    // and notifications need one. Lives on the `users` table (authTables'
    // own `email` field), not on this profiles document — there's no email
    // column here to mirror it into — so this patches that table instead
    // of `existing`/the insert below.
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    if (args.email !== undefined) {
      const trimmedEmail = args.email.trim();
      if (trimmedEmail) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          throw new ConvexError("That doesn't look like a valid email.");
        }
        const user = await ctx.db.get(userId);
        // Never overwrite an email a user already signed in with (Google,
        // password) — this is only for filling in a missing one.
        if (!(user as { email?: string } | null)?.email) {
          await ctx.db.patch(userId, { email: trimmedEmail.toLowerCase() });
        }
      }
    }

    const existing = await getProfileByUserId(ctx, userId);

    const now = Date.now();
    // Roles stay additive (PRD §2, "money is never the only door" territory
    // for capability, but role flags themselves are just true/true-or-unset,
    // never revoked here) — picking "patron" or "partner" as your primary
    // onramp sets that flag; it never clears one you already held.
    const roleFlags: { patronRole?: boolean; partnerRole?: boolean } = {};
    if (args.primaryRole === "patron") roleFlags.patronRole = true;
    if (args.primaryRole === "partner") roleFlags.partnerRole = true;

    let profileId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        bio: args.bio,
        interests: args.interests ?? existing.interests,
        location: args.location,
        locationType: args.locationType,
        address: args.address,
        coordinates: args.coordinates,
        placeId: args.placeId,
        primaryRole: args.primaryRole ?? existing.primaryRole,
        // These are role-specific (Patron's orgName/supportInterests vs.
        // Partner's orgName/partnerOfferings), and a person can hold more
        // than one role — onboarding into a second role must not blank out
        // data captured for the first one.
        orgName: args.orgName ?? existing.orgName,
        supportInterests: args.supportInterests ?? existing.supportInterests,
        partnerOfferings: args.partnerOfferings ?? existing.partnerOfferings,
        ...roleFlags,
        updatedAt: now,
      });
      profileId = existing._id;
    } else {
      profileId = await ctx.db.insert("profiles", {
        userId,
        name: args.name,
        bio: args.bio,
        interests: args.interests ?? [],
        location: args.location,
        locationType: args.locationType,
        address: args.address,
        coordinates: args.coordinates,
        placeId: args.placeId,
        primaryRole: args.primaryRole,
        orgName: args.orgName,
        supportInterests: args.supportInterests,
        partnerOfferings: args.partnerOfferings,
        ...roleFlags,
        createdAt: now,
        updatedAt: now,
      });
    }

    // A typed organization (onboarding) becomes a real one, made primary;
    // that also rewrites the orgName cache above to its canonical name.
    const typedOrg = args.orgName?.trim();
    if (typedOrg) {
      const saved = await ctx.db.get(profileId);
      if (saved) await linkOrgByName(ctx, saved, typedOrg);
    }

    // Schedule embedding generation
    await ctx.scheduler.runAfter(0, api.embeddings.embedProfile, { profileId });

    return profileId;
  },
});

export const updateAttribute = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const profile = await getProfileByUserId(ctx, userId);

    if (!profile) throw new Error("Profile not found");

    const existing = await ctx.db
      .query("attributes")
      .withIndex("by_profileId_key", (q) =>
        q.eq("profileId", profile._id).eq("key", args.key),
      )
      .first();

    if (existing) {
      if (args.value) {
        await ctx.db.patch(existing._id, { value: args.value });
      } else {
        await ctx.db.delete(existing._id);
      }
    } else if (args.value) {
      await ctx.db.insert("attributes", {
        profileId: profile._id,
        key: args.key,
        value: args.value,
      });
    }
  },
});

// ——————————————————————————————————————————————————————————————
// The People directory
// ——————————————————————————————————————————————————————————————

/** What narrows the directory. Nothing set is everyone. */
type DirectoryFilter = {
  query?: string;
  /** People with any of these interests (the Discipline multi-select). */
  interests?: readonly string[];
  location?: string;
  communitySlug?: string;
  /** Near me: within `radius` miles of lat/lng, nearest first. */
  near?: { lat: number; lng: number; radius: number };
};

/** How many name matches search returns (the org page's "Add a person"). */
const SEARCH_LIMIT = 30;

/**
 * Everyone the directory lists for this caller and filter, in its order
 * (directoryRules.ts): latest activity first, or nearest first under Near
 * me. A visitor's list leaves out anyone who hid their profile from search.
 *
 * Reads every profile, and every project and published event once, to find
 * each person's latest post in memory. That is fine at this size (hundreds
 * of profiles); thousands would want the latest post stored on the profile.
 * Rows are the public projection (toPublicProfile), so Near me measures the
 * rounded coordinates anyone can see, never the exact ones.
 */
async function directoryPeople(ctx: QueryCtx, filter: DirectoryFilter, signedIn: boolean) {
  const gate = communityVisibility(ctx);
  let profiles = (await ctx.db.query("profiles").collect()).filter((p) => listedFor(p, signedIn));

  // Community context (docs/features/community-ux.md §2): when set, only
  // ACTIVE members of that community are people here. An unknown slug
  // matches nobody rather than everybody — a wrong filter must fail
  // closed, never leak the whole directory under a community's name.
  if (filter.communitySlug) {
    const org = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", filter.communitySlug!))
      .unique();
    if (!org) return [];
    // A hidden (test) community's people are findable only by admins and
    // its own members — same empty answer as an unknown slug.
    if (!(await gate.orgVisible(org))) return [];
    const members = await activeMembersOfCommunity(ctx, org._id);
    const memberIds = new Set(members.map((m) => String(m.userId)));
    profiles = profiles.filter((p) => memberIds.has(String(p.userId)));
  }

  if (filter.location) {
    const place = filter.location.toLowerCase();
    profiles = profiles.filter((p) => p.location?.toLowerCase().includes(place));
  }

  // A visitor's one-letter search is no search (searchedText), so a sweep
  // through the alphabet can't page the directory 24 at a time.
  const text = searchedText(filter.query, signedIn);
  if (text) {
    // What each person is wondering is searched too.
    const wonderings = await ctx.db
      .query("wonderings")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const wonderingOf = new Map(wonderings.map((w) => [String(w.profileId), w.prompt]));
    const q = text.toLowerCase();
    profiles = profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.bio?.toLowerCase().includes(q) ||
        p.interests.some((interest) => interest.toLowerCase().includes(q)) ||
        p.location?.toLowerCase().includes(q) ||
        p.orgName?.toLowerCase().includes(q) ||
        wonderingOf.get(String(p._id))?.toLowerCase().includes(q),
    );
  }

  // Latest activity, from what their profile shows: a project or event
  // posted into a hidden (test) community counts only for those who may see it.
  const [projects, events] = await Promise.all([
    ctx.db.query("projects").collect(),
    ctx.db
      .query("events")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect(),
  ]);
  const latest = latestPostAt(await gate.filter(projects), await gate.filter(events));
  const ordered = byLatestActivity(profiles.map(toPublicProfile), latest);

  // The pages' own Discipline and Near me cut, run over everyone who matches.
  const near = filter.near;
  const people: (PublicProfile & { _distance?: number })[] = filterProfiles(ordered, {
    interests: filter.interests ?? [],
    near: near ? { pos: { lat: near.lat, lng: near.lng }, radius: near.radius } : null,
  });
  return people;
}

/** A directory row: the public profile (with how far away they are, under
 * Near me), its picture resolved, and whether they lead a community (the
 * badge on their card; `leaders` is leaderUserIds of the page's people). */
async function directoryRow(
  ctx: QueryCtx,
  person: PublicProfile & { _distance?: number },
  leaders: ReadonlySet<string>,
) {
  return { ...person, imageUrl: await profileImageUrl(ctx, person), isLeader: leaders.has(String(person.userId)) };
}

/** The rows of one directory page, in order. The leaders among them are
 * found once for the page (two indexed reads a person), not per query. */
async function directoryRows(ctx: QueryCtx, shown: (PublicProfile & { _distance?: number })[]) {
  const leaders = await leaderUserIds(ctx, shown.map((person) => person.userId));
  return await Promise.all(shown.map((person) => directoryRow(ctx, person, leaders)));
}

/**
 * The People directory (/people, and the desk's People › Everyone), a page
 * at a time: the first `limit` people in its order, and `total`, how many
 * match in all. A member raises `limit` by DIRECTORY_PAGE to load more. A
 * visitor (`visitor` true) gets one page at most whatever `limit` says, and
 * the page ends with how many more there are and a way to join.
 */
export const directory = query({
  args: {
    query: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    communitySlug: v.optional(v.string()),
    near: v.optional(v.object({ lat: v.number(), lng: v.number(), radius: v.number() })),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const signedIn = (await currentUserId(ctx)) !== null;
    const everyone = await directoryPeople(ctx, args, signedIn);
    const shown = everyone.slice(0, directoryLimit(args.limit, signedIn));
    return {
      people: await directoryRows(ctx, shown),
      total: everyone.length,
      visitor: !signedIn,
    };
  },
});

/**
 * The directory's people matching a search, as a plain list: what /people
 * and the organization page's "Add a person" called before directory and
 * searchPeopleForInvite. No page calls it now; it stays for pages loaded
 * before that deploy, and can go once they are gone. The same rules as
 * directory, so a visitor gets one page at most here too.
 */
export const search = query({
  args: {
    query: v.optional(v.string()),
    interest: v.optional(v.string()),
    location: v.optional(v.string()),
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const signedIn = (await currentUserId(ctx)) !== null;
    const everyone = await directoryPeople(
      ctx,
      {
        query: args.query,
        interests: args.interest ? [args.interest] : undefined,
        location: args.location,
        communitySlug: args.communitySlug,
      },
      signedIn,
    );
    const shown = everyone.slice(0, directoryLimit(SEARCH_LIMIT, signedIn));
    return await directoryRows(ctx, shown);
  },
});

// Operator CLI only (`npx convex run profiles:setAdminByName '{...}' --prod`)
// — internalMutation, not reachable from the client API. This was a plain
// public `mutation` with no auth check at all, which let anyone self-grant
// admin by calling it from the browser console. Fixed 2026-08-30.
export const setAdminByName = internalMutation({
  args: { name: v.string(), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .collect();

    if (profiles.length === 0) {
      throw new Error(`Profile not found: ${args.name}`);
    }

    for (const profile of profiles) {
      await ctx.db.patch(profile._id, { isAdmin: args.isAdmin });
    }

    return { updated: profiles.length };
  },
});

export const backfillCoordinates = internalAction({
  args: {},
  handler: async (ctx) => {
    const profiles: Array<{ _id: any; location?: string; coordinates?: { lat: number; lng: number } }> =
      await ctx.runQuery(internal.profiles.profilesNeedingCoordinates);
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not set");
    let updated = 0;
    for (const p of profiles) {
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.location",
          },
          body: JSON.stringify({ textQuery: p.location, maxResultCount: 1 }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const loc = data.places?.[0]?.location;
        if (!loc?.latitude || !loc?.longitude) continue;
        await ctx.runMutation(internal.profiles.patchCoordinates, {
          profileId: p._id,
          coordinates: { lat: loc.latitude, lng: loc.longitude },
        });
        updated++;
      } catch {
        // skip individual failures
      }
    }
    return { checked: profiles.length, updated };
  },
});

export const profilesNeedingCoordinates = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("profiles").collect();
    return all
      .filter((p) => p.location && !p.coordinates)
      .map((p) => ({ _id: p._id, location: p.location }));
  },
});

export const patchCoordinates = internalMutation({
  args: {
    profileId: v.id("profiles"),
    coordinates: v.object({ lat: v.number(), lng: v.number() }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.profileId, { coordinates: args.coordinates });
  },
});

/**
 * The old single "Organization" field (Settings › Profile before
 * docs/features/organizations.md). Kept so a client still on the old form
 * keeps working: a name becomes a real organization and the person's
 * primary; empty drops their primary. The website fills in only when the
 * organization has none yet.
 */
export const setOrgName = mutation({
  args: { orgName: v.optional(v.string()), orgUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, userId);
    const orgName = (args.orgName ?? "").trim();
    if (orgName.length > 80) {
      throw new ConvexError({ code: "too_long", reason: "Keep the organization under 80 characters." });
    }
    const url = normalizeOrgUrl(args.orgUrl);
    if (!url.ok) throw new ConvexError({ code: "invalid_url", reason: url.reason });
    if (!orgName) {
      await unlinkPrimaryOrg(ctx, profile);
      return { ok: true as const };
    }
    const org = await linkOrgByName(ctx, profile, orgName);
    await fillOrgWebsite(ctx, org._id, url.value);
    return { ok: true as const };
  },
});

// Operator CLI only, like setAdminByName: put someone at an organization
// (made their primary), creating it if needed (Rick, 2026-10-01: David
// Russo → Abiding Practice).
//   npx convex run profiles:setOrgByProfileId '{"profileId":"…","orgName":"Abiding Practice","orgUrl":"abidingpractice.com"}' --prod
export const setOrgByProfileId = internalMutation({
  args: { profileId: v.id("profiles"), orgName: v.string(), orgUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    const url = normalizeOrgUrl(args.orgUrl);
    if (!url.ok) throw new Error(url.reason);
    const org = await linkOrgByName(ctx, profile, args.orgName, { silent: true });
    await fillOrgWebsite(ctx, org._id, url.value);
    return { name: profile.name, organization: org.name, slug: org.slug };
  },
});

/**
 * Live booking (docs/features/live-booking.md §6): where a venue pays you.
 * Each value is normalized (an "@", a "$", a pasted profile URL all reduce
 * to the bare handle) and validated by gigRules.ts's normalizeHandle; an
 * empty value clears that app. The whole object clears when every app is
 * empty, so a profile that never set any stays exactly as it was.
 */
export const setPayoutHandles = mutation({
  args: {
    venmo: v.optional(v.string()),
    cashapp: v.optional(v.string()),
    paypal: v.optional(v.string()),
    zelle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, userId);

    const handles: PayoutHandles = {};
    for (const kind of PAYOUT_KINDS) {
      const result = normalizeHandle(kind, args[kind]);
      if (!result.ok) throw new ConvexError({ code: "invalid_handle", field: kind, reason: result.reason });
      if (result.value) handles[kind] = result.value;
    }
    const any = Object.keys(handles).length > 0;
    await ctx.db.patch(profile._id, { payoutHandles: any ? handles : undefined, updatedAt: Date.now() });
    return { ok: true as const, handles: any ? handles : null };
  },
});
