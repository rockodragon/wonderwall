import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { auth } from "./auth";
import { AWARD_TYPES, isCelebrationType } from "./celebrationTypes";
import { fundDisplayName } from "./garden/allocations";

// Get notifications for the current user
export const getNotifications = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const limit = args.limit || 20;

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    // Enrich with related user info
    const enriched = await Promise.all(
      notifications.map(async (n) => {
        let relatedUserProfile = null;
        if (n.relatedUserId) {
          relatedUserProfile = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", n.relatedUserId!))
            .first();
        }
        return {
          ...n,
          relatedUserProfile: relatedUserProfile
            ? {
                // profiles._id — what /profile/:id routes on. relatedUserId
                // is a users id, which no client route accepts.
                profileId: relatedUserProfile._id,
                name: relatedUserProfile.name,
                // An uploaded photo resolves to its storage URL, the way
                // getConversations does; the raw `imageUrl` field alone is
                // only the legacy external link and misses uploads.
                imageUrl: await resolveProfileImage(ctx, relatedUserProfile),
                inviteSlug: relatedUserProfile.inviteSlug,
              }
            : null,
        };
      }),
    );

    return enriched;
  },
});

// Get count of unread notifications
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_readAt", (q) =>
        q.eq("userId", userId).eq("readAt", undefined),
      )
      .collect();

    return unread.length;
  },
});

// ——— Celebrations (the canvas's cards) ———

/** The canvas shows at most this many celebration cards at once. */
export const MAX_CELEBRATIONS = 8;

/** A celebration nobody closed leaves the canvas after this long. */
export const CELEBRATION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back listCelebrations looks: a person's newest notifications,
 * enough to hold a month of celebrations among everything else. */
const CELEBRATION_SCAN = 200;

/** The rows worth celebrating (celebrationTypes.ts) that haven't been done
 * yet and are under a month old, newest first, capped. Read or unread doesn't
 * matter: Messages marks everything read on sight (see schema celebratedAt).
 * Pure, so the rules are pinned without Convex. */
export function pickCelebrations<T extends { type: string; createdAt: number; celebratedAt?: number }>(
  rows: readonly T[],
  now: number,
): T[] {
  const since = now - CELEBRATION_DAYS * DAY_MS;
  return rows
    .filter((n) => isCelebrationType(n.type) && n.celebratedAt === undefined && n.createdAt >= since)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_CELEBRATIONS);
}

export type Celebration = {
  _id: Id<"notifications">;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  createdAt: number;
  from: { userId: Id<"users">; profileId: Id<"profiles">; name: string; imageUrl: string | null } | null;
  project: { title: string; href: string } | null;
  fund: { name: string; href: string } | null; // award types only (AWARD_TYPES)
  amountCents: number | null;
};

/** What a notification mentions, looked up: who, which project, which fund.
 * The canvas card and the daily email both link these. */
export type CelebrationContext = Pick<Celebration, "from" | "project" | "fund">;

/** One notification as the canvas gets it. `from` is who it came from (the
 * cheerer, the giver) and is null when nobody is named or they have no
 * profile; `imageUrl` is already resolved, so the card needs no second lookup.
 * `project` and `fund` are null when the row doesn't name one, or the one it
 * names is gone. */
export function toCelebration(
  n: {
    _id: Id<"notifications">;
    type: string;
    title: string;
    message: string;
    linkUrl?: string;
    amountCents?: number;
    createdAt: number;
  },
  context: CelebrationContext,
): Celebration {
  return {
    _id: n._id,
    type: n.type,
    title: n.title,
    message: n.message,
    linkUrl: n.linkUrl ?? null,
    createdAt: n.createdAt,
    from: context.from,
    project: context.project,
    fund: context.fund,
    amountCents: n.amountCents ?? null,
  };
}

/** Which project a notification's link points at, for the rows written before
 * notifications carried a projectId: `/projects/<id>` or `/story/<slug>`
 * (supportProject and notifyBackingConfirmed link whichever the project has).
 * Anything else, a gift's /give or an award's /fund/..., names no project.
 * Pure. */
export function projectRefFromLink(linkUrl: string | undefined): { id: string } | { slug: string } | null {
  if (!linkUrl) return null;
  const path = stripQueryAndHash(linkUrl);
  const byId = /^\/projects\/([^/]+)\/?$/.exec(path);
  if (byId) return { id: byId[1] };
  const bySlug = /^\/story\/([^/]+)\/?$/.exec(path);
  if (bySlug) return { slug: bySlug[1] };
  return null;
}

/** The fund a link points at (`/fund/<slug>`), the slug only. Pure. */
export function fundSlugFromLink(linkUrl: string | undefined): string | null {
  if (!linkUrl) return null;
  const match = /^\/fund\/([^/?#]+)/.exec(linkUrl);
  return match ? match[1] : null;
}

/** Where a project's page lives: the public story when it has one, else its
 * project page. Same rule the notifications were written with. Pure. */
export function projectHref(project: { _id: string; storySlug?: string }): string {
  return project.storySlug ? `/story/${project.storySlug}` : `/projects/${project._id}`;
}

// A profile photo is either an uploaded file or an external URL.
async function resolveProfileImage(ctx: QueryCtx, profile: Doc<"profiles">): Promise<string | null> {
  if (profile.imageStorageId) return await ctx.storage.getUrl(profile.imageStorageId);
  return profile.imageUrl || null;
}

/** Looks up what one celebration notification mentions. Shared by the canvas
 * (listCelebrations) and the daily email (supportDigest.ts), so the two link
 * the same people and projects.
 *  - from: the person it came from. An award is from the fund, not from the
 *    operator who recorded it (decideProposal names them), so it has none.
 *  - project: the row's projectId; older rows have none, so its link is read
 *    instead (projectRefFromLink).
 *  - fund: award rows only, from their /fund/<slug> link. */
export async function celebrationContext(ctx: QueryCtx, n: Doc<"notifications">): Promise<CelebrationContext> {
  const isAward = AWARD_TYPES.has(n.type);

  const relatedUserId = isAward ? undefined : n.relatedUserId;
  const profile = relatedUserId
    ? await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", relatedUserId))
        .first()
    : null;
  const from =
    relatedUserId && profile
      ? {
          userId: relatedUserId,
          profileId: profile._id,
          name: profile.name,
          imageUrl: await resolveProfileImage(ctx, profile),
        }
      : null;

  let projectDoc: Doc<"projects"> | null = null;
  if (n.projectId) {
    projectDoc = await ctx.db.get(n.projectId);
  } else {
    const ref = projectRefFromLink(n.linkUrl);
    if (ref && "id" in ref) {
      const id = ctx.db.normalizeId("projects", ref.id);
      projectDoc = id ? await ctx.db.get(id) : null;
    } else if (ref) {
      projectDoc = await ctx.db
        .query("projects")
        .withIndex("by_storySlug", (q) => q.eq("storySlug", ref.slug))
        .first();
    }
  }
  const project = projectDoc ? { title: projectDoc.title, href: projectHref(projectDoc) } : null;

  const fundSlug = isAward ? fundSlugFromLink(n.linkUrl) : null;
  const hostOrg = fundSlug
    ? await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", fundSlug))
        .first()
    : null;
  const fund = hostOrg && n.linkUrl ? { name: fundDisplayName(hostOrg), href: n.linkUrl } : null;

  return { from, project, fund };
}

// Cheers, offers of help, backings, gifts and awards for the signed-in user
// that are still on the canvas, newest first. Reads the newest few hundred
// notifications and filters them (the type filter can't use the index). One
// leaves when finishCelebration marks it done, or after CELEBRATION_DAYS.
export const listCelebrations = query({
  args: {},
  handler: async (ctx): Promise<Celebration[]> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(CELEBRATION_SCAN);

    return await Promise.all(
      pickCelebrations(recent, Date.now()).map(async (n) => toCelebration(n, await celebrationContext(ctx, n))),
    );
  },
});

// A celebration's card is done (closed, "Got it", or its button pressed): it
// leaves the canvas and Today, and counts as read. Idempotent.
export const finishCelebration = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return false;
    if (notification.userId !== userId) throw new Error("Not authorized");

    if (notification.celebratedAt === undefined) {
      const now = Date.now();
      await ctx.db.patch(args.notificationId, { celebratedAt: now, readAt: notification.readAt ?? now });
    }
    return true;
  },
});

// Mark a single notification as read
export const markAsRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");
    if (notification.userId !== userId) throw new Error("Not authorized");

    if (!notification.readAt) {
      await ctx.db.patch(args.notificationId, {
        readAt: Date.now(),
      });
    }

    return true;
  },
});

// Mark all notifications as read
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_readAt", (q) =>
        q.eq("userId", userId).eq("readAt", undefined),
      )
      .collect();

    const now = Date.now();
    await Promise.all(unread.map((n) => ctx.db.patch(n._id, { readAt: now })));

    return unread.length;
  },
});

// Mark every unread notification whose linkUrl points at the page the user
// just landed on — covers reaching that page any way other than clicking
// the bell (email CTA, direct link, the conversation list), which otherwise
// left the notification unread and the badge count drifting. Compares the
// stored linkUrl and the given one both as-is and with a trailing query
// string/hash stripped, since a stored link and the current pathname don't
// always carry the same suffix.
export const markReadByLinkUrl = mutation({
  args: { linkUrl: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_userId_readAt", (q) =>
        q.eq("userId", userId).eq("readAt", undefined),
      )
      .collect();

    const target = stripQueryAndHash(args.linkUrl);
    const toMark = unread.filter(
      (n) =>
        n.linkUrl === args.linkUrl ||
        (n.linkUrl !== undefined && stripQueryAndHash(n.linkUrl) === target),
    );

    const now = Date.now();
    await Promise.all(toMark.map((n) => ctx.db.patch(n._id, { readAt: now })));

    return toMark.length;
  },
});

function stripQueryAndHash(url: string): string {
  return url.split("?")[0].split("#")[0];
}

// Internal helper to create a notification (used by other mutations)
export const createNotification = mutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    linkUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    relatedUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      linkUrl: args.linkUrl,
      imageUrl: args.imageUrl,
      relatedUserId: args.relatedUserId,
      createdAt: Date.now(),
    });
  },
});
