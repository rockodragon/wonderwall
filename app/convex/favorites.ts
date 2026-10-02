import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { auth } from "./auth";
import type { Id } from "./_generated/dataModel";
import { communityVisibility } from "./garden/communityVisibility";
import { eventVisibilityChecker } from "./garden/eventVisibility";
import { isAcceptingPeople } from "./garden/projectTeam";
import { VISIBLE_PROJECT_STATUSES } from "./moderationRules";

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
 * toggle, remove and isFavorited. */
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
  const notFound = () => new ConvexError({ code: "not_found", reason: "That isn't here anymore." });
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
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await findFavorite(ctx, userId, args);

    if (existing) {
      // Unfollow / unsave is silent — no notification (following.md §1 #3).
      await ctx.db.delete(existing._id);
      return { favorited: false };
    } else {
      if (args.targetType === "project" || args.targetType === "role") {
        await assertSaveable(ctx, userId, args.targetType, args.targetId);
      }
      const now = Date.now();
      await ctx.db.insert("favorites", {
        userId,
        targetType: args.targetType,
        targetId: args.targetId,
        createdAt: now,
      });

      // A profile favorite is a follow (docs/features/following.md). Tell
      // the followed person once, on create. `targetId` here is a PROFILE
      // id, so hop through the profile row to reach the recipient's users
      // id; `userId` (the actor) is already a users id. The link points at
      // the follower's profile, so we need the actor's profile id too.
      // Hearts and Shortlist saves tell nobody.
      if (args.targetType === "profile") {
        const followedProfile = await ctx.db.get(
          args.targetId as Id<"profiles">,
        );
        if (followedProfile && followedProfile.userId !== userId) {
          const actorProfile = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first();
          const followerName = actorProfile?.name || "Someone";
          await ctx.db.insert("notifications", {
            userId: followedProfile.userId,
            type: "new_follower",
            title: `${followerName} is following your work`,
            message: "",
            linkUrl: actorProfile ? `/profile/${actorProfile._id}` : undefined,
            relatedUserId: userId,
            createdAt: now,
          });
        }
      }
      return { favorited: true };
    }
  },
});

/** Unsave, unfollow or unheart, and only that: deletes the member's favorite
 * if it's there and does nothing if it isn't. The Shortlist's Remove calls
 * this rather than toggle, so a second press, or one after the save went
 * elsewhere, can't save it again. It never looks at the target, so a save
 * of something since hidden, closed or deleted can always go. */
export const remove = mutation({
  args: {
    targetType: favoriteTargetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await findFavorite(ctx, userId, args);
    // Silent, as toggle's unsave is.
    if (existing) await ctx.db.delete(existing._id);
    return { favorited: false };
  },
});

export const isFavorited = query({
  args: {
    targetType: favoriteTargetTypeValidator,
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return false;

    return !!(await findFavorite(ctx, userId, args));
  },
});

export const getMyFavorites = query({
  args: {
    targetType: v.optional(favoriteTargetTypeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
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
        if (!profile) return null;

        let imageUrl = profile.imageUrl || null;
        if (profile.imageStorageId) {
          imageUrl = await ctx.storage.getUrl(profile.imageStorageId);
        }

        // Get active wondering if exists
        const wondering = await ctx.db
          .query("wonderings")
          .withIndex("by_profileId_active", (q) =>
            q.eq("profileId", profileId).eq("isActive", true),
          )
          .first();

        let wonderingImageUrl: string | null = null;
        if (wondering?.imageStorageId) {
          wonderingImageUrl = await ctx.storage.getUrl(
            wondering.imageStorageId,
          );
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
        let coverImageUrl: string | null = null;
        if (event.coverImageStorageId) {
          coverImageUrl = await ctx.storage.getUrl(event.coverImageStorageId);
        } else if (event.imageStorageIds && event.imageStorageIds.length > 0) {
          coverImageUrl = await ctx.storage.getUrl(event.imageStorageIds[0]);
        }

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
            location: event.location,
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
