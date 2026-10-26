import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { currentUserId, getProfileByUserId, requireUserId } from "./helpers";
import { hasRealName } from "./names";
import { insertNotification } from "./notify";
import type { Id } from "./_generated/dataModel";
import { communityVisibility } from "./garden/communityVisibility";
import { eventVisibilityChecker } from "./garden/eventVisibility";
import { isAcceptingPeople } from "./garden/projectTeam";
import { VISIBLE_PROJECT_STATUSES } from "./moderationRules";
import { feedLocation } from "./eventAddress";
import { eventCoverUrl, profileImageUrl, storedFileUrl } from "./images";

/** What a favorite points at. A profile is a follow and an event is a heart
 * (docs/features/following.md); a project, or one role on it, is a save for
 * the Shortlist (docs/handoff/favorites-redesign/README.md). `targetId` is
 * the matching profiles, events, projects or projectRoles id. The schema
 * column is a plain string, so a new value here needs no migration. */
export const favoriteTargetTypeValidator = v.union(
  v.literal("profile"),
  v.literal("event"),
  v.literal("project"),
  v.literal("role"),
);
export type FavoriteTargetType = Infer<typeof favoriteTargetTypeValidator>;

/** The member's own favorite of one target, or null. The one lookup behind
 * toggle, remove, removeMany and isFavorited. */
function findFavorite(
  ctx: QueryCtx,
  userId: Id<"users">,
  target: { targetType: FavoriteTargetType; targetId: string },
) {
  return ctx.db
    .query("favorites")
    .withIndex("by_userId_target", (q) =>
      q.eq("userId", userId).eq("targetType", target.targetType).eq("targetId", target.targetId),
    )
    .first();
}

/** A save or follow of something gone, hidden, or not what it says it is. */
const notFound = () => new ConvexError({ code: "not_found", reason: "That isn't here anymore." });

/** Throws unless a member may newly save this project or role. A project
 * they can't browse to (VISIBLE_PROJECT_STATUSES), or one posted into a
 * hidden (test) community they can't see (communityVisibility, as on the
 * project page; its lead always can), reads as not found, the way
 * getProject reads a hidden one, so a save can't confirm it exists. A role
 * must also be an opening the way listRoles shows one: open, on a project
 * still taking people. Removing a save never comes here, so a role that has
 * since closed or filled can still be unsaved. */
async function assertSaveable(
  ctx: MutationCtx,
  userId: Id<"users">,
  targetType: "project" | "role",
  targetId: string,
): Promise<void> {
  const roleId = targetType === "role" ? ctx.db.normalizeId("projectRoles", targetId) : null;
  const role = roleId ? await ctx.db.get(roleId) : null;
  if (targetType === "role" && !role) throw notFound();

  const projectId = role ? role.projectId : ctx.db.normalizeId("projects", targetId);
  const project = projectId ? await ctx.db.get(projectId) : null;
  if (!project || !VISIBLE_PROJECT_STATUSES.has(project.status)) throw notFound();
  if (project.userId !== userId && !(await communityVisibility(ctx, userId).idVisible(project.hostOrgId))) {
    throw notFound();
  }

  if (role && (role.status !== "open" || !isAcceptingPeople(project))) {
    throw new ConvexError({ code: "role_closed", reason: "This role isn't open anymore." });
  }
}

export const toggle = mutation({
  args: {
    targetType: favoriteTargetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await findFavorite(ctx, userId, args);

    if (existing) {
      // Unfollow / unsave is silent — no notification (following.md §1 #3).
      await ctx.db.delete(existing._id);
      return { favorited: false };
    } else {
      if (args.targetType === "project" || args.targetType === "role") {
        await assertSaveable(ctx, userId, args.targetType, args.targetId);
      }
      // `targetId` here is a PROFILE id, so hop through the profile row to
      // reach its owner's users id; `userId` (the actor) is already one.
      // normalizeId, so another table's id never passes for a profile.
      const followedId = args.targetType === "profile" ? ctx.db.normalizeId("profiles", args.targetId) : null;
      const followedProfile = followedId ? await ctx.db.get(followedId) : null;
      // A follow is of a profile that's there; anything else was saved as
      // a row pointing nowhere.
      if (args.targetType === "profile" && !followedProfile) throw notFound();
      // Nobody follows themselves (Rick, 2026-10-26). An old self-follow
      // can still be unfollowed above.
      if (followedProfile && followedProfile.userId === userId) {
        throw new ConvexError({ code: "own_profile", reason: "That's your own profile." });
      }
      const now = Date.now();
      await ctx.db.insert("favorites", {
        userId,
        targetType: args.targetType,
        targetId: args.targetId,
        createdAt: now,
      });

      // A profile favorite is a follow (docs/features/following.md). Tell
      // the followed person once, on create. The link points at the
      // follower's profile, so we need the actor's profile id too.
      // Hearts and Shortlist saves tell nobody.
      if (followedProfile) {
        const actorProfile = await getProfileByUserId(ctx, userId);
        const followerName = actorProfile?.name || "Someone";
        await insertNotification(ctx, {
          userId: followedProfile.userId,
          type: "new_follower",
          title: `${followerName} is following your work`,
          message: "",
          linkUrl: actorProfile ? `/profile/${actorProfile._id}` : undefined,
          relatedUserId: userId,
          createdAt: now,
        });
      }
      return { favorited: true };
    }
  },
});

/** Deletes the member's favorite of one target if it's there, and does
 * nothing if it isn't; true when there was one. Silent, as toggle's unsave
 * is. The one unsave behind remove and removeMany. */
async function unsave(
  ctx: MutationCtx,
  userId: Id<"users">,
  target: { targetType: FavoriteTargetType; targetId: string },
): Promise<boolean> {
  const existing = await findFavorite(ctx, userId, target);
  if (existing) await ctx.db.delete(existing._id);
  return existing !== null;
}

const targetArgs = {
  targetType: favoriteTargetTypeValidator,
  targetId: v.string(),
};

/** Unsave, unfollow or unheart, and only that: deletes the member's favorite
 * if it's there and does nothing if it isn't. The Shortlist's Remove calls
 * this rather than toggle, so a second press, or one after the save went
 * elsewhere, can't save it again. It never looks at the target, so a save
 * of something since hidden, closed or deleted can always go. */
export const remove = mutation({
  args: targetArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    await unsave(ctx, userId, args);
    return { favorited: false };
  },
});

/** How many targets one removeMany takes. The Shortlist sends at most its
 * ended events (shortlist.ts ENDED_EVENTS_KEPT); this bounds a call's work. */
export const REMOVE_MANY_LIMIT = 100;

/** remove, for several targets in one call: the Shortlist's "Remove past
 * events". Each goes as remove takes it, one after another, so a target
 * already gone, or named twice, is skipped and the call can be repeated.
 * Returns how many were there to remove. */
export const removeMany = mutation({
  args: { targets: v.array(v.object(targetArgs)) },
  handler: async (ctx, { targets }) => {
    const userId = await requireUserId(ctx);
    if (targets.length > REMOVE_MANY_LIMIT) {
      throw new ConvexError({ code: "too_many", reason: `That's more than ${REMOVE_MANY_LIMIT} at once.` });
    }

    let removed = 0;
    for (const target of targets) {
      if (await unsave(ctx, userId, target)) removed++;
    }
    return { removed };
  },
});

export const isFavorited = query({
  args: {
    targetType: favoriteTargetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) return false;

    return !!(await findFavorite(ctx, userId, args));
  },
});

export const getMyFavorites = query({
  args: {
    targetType: v.optional(favoriteTargetTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (!userId) return { profiles: [], events: [] };

    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Filter by type if specified
    const filtered = args.targetType
      ? favorites.filter((f) => f.targetType === args.targetType)
      : favorites;

    // Profiles and events only. Project and role saves belong to the
    // Shortlist, which reads this table itself (convex/shortlist.ts), so
    // they never reach the pages that read this { profiles, events } shape.
    const profileFavs = filtered.filter((f) => f.targetType === "profile");
    const eventFavs = filtered.filter((f) => f.targetType === "event");

    // Fetch profile data
    const profiles = await Promise.all(
      profileFavs.map(async (fav) => {
        const profileId = fav.targetId as Id<"profiles">;
        const profile = await ctx.db.get(profileId);
        // Not until they've named themselves (convex/names.ts).
        if (!profile || !hasRealName(profile.name)) return null;

        const imageUrl = await profileImageUrl(ctx, profile);

        // Get active wondering if exists
        const wondering = await ctx.db
          .query("wonderings")
          .withIndex("by_profileId_active", (q) =>
            q.eq("profileId", profileId).eq("isActive", true),
          )
          .first();

        let wonderingImageUrl: string | null = null;
        if (wondering?.imageStorageId) {
          wonderingImageUrl = await storedFileUrl(ctx, wondering.imageStorageId);
        }

        return {
          favoriteId: fav._id,
          favoritedAt: fav.createdAt,
          profile: {
            _id: profile._id,
            name: profile.name,
            imageUrl,
            interests: profile.interests,
          },
          wondering: wondering
            ? {
                _id: wondering._id,
                prompt: wondering.prompt,
                imageUrl: wonderingImageUrl,
              }
            : null,
        };
      }),
    );

    // Fetch event data
    const isEventPublic = eventVisibilityChecker(ctx);
    const gate = communityVisibility(ctx, userId);
    const events = await Promise.all(
      eventFavs.map(async (fav) => {
        const eventId = fav.targetId as Id<"events">;
        const event = await ctx.db.get(eventId);
        if (!event) return null;
        // A ticketed event a viewer favorited before it lost visibility (or
        // before its organizer could ever sell tickets) drops out of their
        // list too — same rule as every other public surface — unless the
        // viewer is the organizer themselves. So does one posted into a
        // hidden (test) community the viewer can't see (communityVisibility).
        if (
          event.organizerId !== userId &&
          (!(await isEventPublic(event)) || !(await gate.idVisible(event.hostOrgId)))
        ) {
          return null;
        }

        // Resolve cover image URL (cover or first gallery image)
        const coverImageUrl = await eventCoverUrl(ctx, event);

        // Get attendee count
        const applications = await ctx.db
          .query("eventApplications")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .filter((q) => q.eq(q.field("status"), "accepted"))
          .collect();

        return {
          favoriteId: fav._id,
          favoritedAt: fav.createdAt,
          event: {
            _id: event._id,
            title: event.title,
            datetime: event.datetime,
            location: feedLocation(event),
            tags: event.tags,
            status: event.status,
            requiresApproval: event.requiresApproval,
            coverImageUrl,
            // A pasted reel's link and still, so the card can show it when
            // there is no cover (docs/features/creator-media-cross-post.md).
            mediaUrl: event.mediaUrl,
            mediaPreviewUrl: event.mediaPreviewUrl,
            attendeeCount: applications.length,
          },
        };
      }),
    );

    return {
      profiles: profiles.filter(Boolean),
      events: events.filter(Boolean),
    };
  },
});

// Follow and heart counts are public; how many people saved a project or a
// role isn't, so this answers for profiles and events only.
export const getFavoriteCount = query({
  args: {
    targetType: v.union(v.literal("profile"), v.literal("event")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("favorites")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .collect();

    return favorites.length;
  },
});
