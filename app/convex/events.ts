import { v } from "convex/values";
import { escapeHtml } from "./email/template";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { scheduleNotificationEmail } from "./emailHelpers";
import { assertCommunityMember } from "./garden/communities";
import { formatFollowedEventDate, notifyFollowers } from "./follows";
import { canonicalMediaUrl, schedulePreviewFetch } from "./linkPreview";
import { canSeeEvent, eventVisibilityChecker, isFreeEvent } from "./garden/eventVisibility";

// ——— Pure validation helpers (unit-tested in events.test.ts) ———

/** Optional end time must land strictly after the start. Returns null when
 * valid, otherwise the user-facing error message. */
export function validateEndTime(
  datetime: number,
  endTime: number | undefined,
): string | null {
  if (endTime === undefined) return null;
  if (endTime <= datetime) return "End time must be after the start time";
  return null;
}

export interface TicketTierInput {
  name: string;
  priceCents: number;
  description?: string;
  quantity?: number;
}

export const MAX_TICKET_TIERS = 10;

/** Validates + normalizes a ticket tier list (trims strings, drops empty
 * descriptions). Returns { tiers } on success or { error } with a
 * user-facing message. An empty array normalizes to undefined — an event
 * with no tiers stores no field at all. */
export function normalizeTicketTiers(
  tiers: TicketTierInput[] | undefined,
): { tiers?: TicketTierInput[]; error?: string } {
  if (!tiers || tiers.length === 0) return { tiers: undefined };
  if (tiers.length > MAX_TICKET_TIERS) {
    return { error: `At most ${MAX_TICKET_TIERS} ticket tiers are allowed` };
  }

  const normalized: TicketTierInput[] = [];
  const seenNames = new Set<string>();
  for (const tier of tiers) {
    const name = tier.name.trim();
    if (!name) return { error: "Every ticket tier needs a name" };
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      return { error: `Duplicate ticket tier name "${name}"` };
    }
    seenNames.add(nameKey);

    // Stripe's minimum charge is $0.50 — enforce it here so checkout can't
    // fail later on a tier that was always unchargeable.
    if (!Number.isInteger(tier.priceCents) || tier.priceCents < 50) {
      return {
        error: `Ticket tier "${name}" needs a price of at least $0.50`,
      };
    }
    if (
      tier.quantity !== undefined &&
      (!Number.isInteger(tier.quantity) || tier.quantity < 1)
    ) {
      return {
        error: `Ticket tier "${name}" has an invalid quantity cap`,
      };
    }

    const description = tier.description?.trim();
    normalized.push({
      name,
      priceCents: tier.priceCents,
      description: description || undefined,
      quantity: tier.quantity,
    });
  }
  return { tiers: normalized };
}

const ticketTiersValidator = v.optional(
  v.array(
    v.object({
      name: v.string(),
      priceCents: v.number(),
      description: v.optional(v.string()),
      quantity: v.optional(v.number()),
    }),
  ),
);

// ——— External ticketing (schema.ts's events.externalTicketUrl comment) ———

const STRIPE_PAYMENT_LINK_HOST = "buy.stripe.com";

export interface ExternalTicketInput {
  url?: string;
  priceCents?: number;
}

export interface ExternalTicketResult {
  externalTicketUrl?: string;
  externalTicketPriceCents?: number;
  error?: string;
}

/** Validates + normalizes the external-ticket fields together, since a
 * price with no link is meaningless: an empty/absent url clears BOTH
 * fields, regardless of what priceCents was. The url must be a Stripe
 * Payment Link — nothing else, because AP's webhook (garden/apGifts.ts)
 * is the only thing watching for a purchase to come back, and it only
 * knows how to read a checkout.session event off that one Stripe account. */
export function normalizeExternalTicket(
  input: ExternalTicketInput,
): ExternalTicketResult {
  const trimmed = input.url?.trim();
  if (!trimmed) return {};

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Use a Stripe Payment Link (buy.stripe.com/…)." };
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== STRIPE_PAYMENT_LINK_HOST) {
    return { error: "Use a Stripe Payment Link (buy.stripe.com/…)." };
  }

  if (
    input.priceCents !== undefined &&
    (!Number.isInteger(input.priceCents) || input.priceCents <= 0)
  ) {
    return { error: "Ticket price must be a whole number of cents greater than zero" };
  }

  return { externalTicketUrl: trimmed, externalTicketPriceCents: input.priceCents };
}

// Ticket-gated visibility (isFreeEvent / eventVisibilityChecker) lives in
// garden/eventVisibility.ts — re-exported here so existing/expected imports
// from "./events" keep working, and so events.test.ts can test the pure
// part alongside this file's other pure helpers.
export { isFreeEvent, eventVisibilityChecker } from "./garden/eventVisibility";

// Batches hostOrgs lookups for a set of events into a single Map keyed by
// hostOrgId string — never one ctx.db.get per event (several events can
// share a community). Used by both `list` and `get`.
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

export const list = query({
  args: {
    status: v.optional(v.string()),
    upcoming: v.optional(v.boolean()),
    // The archive: events whose start time has passed, newest first. Off by
    // default, so every existing caller keeps the chronological upcoming
    // list it already gets. Still a public browse surface spreading the
    // event doc — which stays safe because the join and recording URLs were
    // never on that document (docs/gated-event-video-prd.md, Criticism #1).
    // The only video fact here is events.hasVideo, a public boolean.
    past: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db.query("events").collect();

    // Filter by status
    if (args.status) {
      events = events.filter((e) => e.status === args.status);
    } else {
      // Default: show published events
      events = events.filter((e) => e.status === "published");
    }

    // Filter to upcoming only
    if (args.upcoming) {
      const now = Date.now();
      events = events.filter((e) => e.datetime > now);
    }

    if (args.past) {
      const now = Date.now();
      events = events.filter((e) => e.datetime <= now);
    }

    // A ticketed event stays off every public browse surface until its
    // organizer can sell tickets (see eventVisibilityChecker above).
    const isPublic = eventVisibilityChecker(ctx);
    const visibility = await Promise.all(events.map((e) => isPublic(e)));
    events = events.filter((_, i) => visibility[i]);

    // Sort by date — the archive reads newest-first, everything else reads
    // next-up-first.
    events.sort((a, b) => (args.past ? b.datetime - a.datetime : a.datetime - b.datetime));

    const communityById = await resolveCommunities(ctx, events.map((e) => e.hostOrgId));

    // Resolve cover images
    const eventsWithImages = await Promise.all(
      events.map(async (event) => {
        let coverImageUrl: string | null = null;

        // Try cover image first
        if (event.coverImageStorageId) {
          coverImageUrl = await ctx.storage.getUrl(event.coverImageStorageId);
        }
        // Fall back to first gallery image
        else if (event.imageStorageIds && event.imageStorageIds.length > 0) {
          coverImageUrl = await ctx.storage.getUrl(event.imageStorageIds[0]);
        }

        // Get attendee count
        const applications = await ctx.db
          .query("eventApplications")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .filter((q) => q.eq(q.field("status"), "accepted"))
          .collect();

        return {
          ...event,
          coverImageUrl,
          attendeeCount: applications.length,
          community: event.hostOrgId ? (communityById.get(String(event.hostOrgId)) ?? null) : null,
        };
      }),
    );

    return eventsWithImages;
  },
});

export const getMyEvents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("events")
      .withIndex("by_organizerId", (q) => q.eq("organizerId", userId))
      .collect();
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const userId = await auth.getUserId(ctx);
    const isOrganizer = userId === event.organizerId;
    const isPublic = await eventVisibilityChecker(ctx)(event);
    // A ticketed event whose organizer can't sell tickets is not-found to
    // everyone except the organizer (same anatomy as a missing event, so a
    // hidden event can't be distinguished from one that never existed).
    if (!isPublic && !isOrganizer) return null;

    // Get organizer profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", event.organizerId))
      .first();

    // Resolve organizer image URL
    let organizerImageUrl = profile?.imageUrl || null;
    if (profile?.imageStorageId) {
      organizerImageUrl = await ctx.storage.getUrl(profile.imageStorageId);
    }

    // Resolve cover image URL
    const coverImageUrl = event.coverImageStorageId
      ? await ctx.storage.getUrl(event.coverImageStorageId)
      : null;

    // Resolve gallery image URLs
    const galleryImageUrls = event.imageStorageIds
      ? await Promise.all(
          event.imageStorageIds.map((id) => ctx.storage.getUrl(id)),
        )
      : [];

    // Get application count
    const applications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Check if current user has applied
    const userApplication = userId
      ? applications.find((a) => a.applicantId === userId)
      : null;

    // Paid tickets sold per tier (only fetched when the event has tiers) —
    // lets the client disable a capped tier's buy button when sold out.
    const ticketsSoldByTier: Record<string, number> = {};
    if (event.ticketTiers && event.ticketTiers.length > 0) {
      const purchases = await ctx.db
        .query("ticketPurchases")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect();
      for (const purchase of purchases) {
        if (purchase.status !== "paid") continue;
        ticketsSoldByTier[purchase.tierName] =
          (ticketsSoldByTier[purchase.tierName] ?? 0) + 1;
      }
    }

    const community = event.hostOrgId
      ? (await resolveCommunities(ctx, [event.hostOrgId])).get(String(event.hostOrgId)) ?? null
      : null;

    return {
      ...event,
      ticketsSoldByTier,
      coverImageUrl,
      galleryImageUrls: galleryImageUrls.filter(Boolean) as string[],
      organizer: profile
        ? {
            name: profile.name,
            imageUrl: organizerImageUrl,
            profileId: profile._id,
          }
        : null,
      applicationCount: applications.length,
      userApplication,
      isOrganizer,
      // Lets the organizer's own view show the "only you can see this"
      // notice; never true for anyone else, since a non-public event
      // already returned null above.
      hiddenUntilMembership: isOrganizer && !isPublic,
      community,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    datetime: v.number(),
    endTime: v.optional(v.number()),
    ticketTiers: ticketTiersValidator,
    externalTicketUrl: v.optional(v.string()),
    externalTicketPriceCents: v.optional(v.number()),
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
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()),
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
    // The community this event is posted INTO (optional — content stays
    // owned by the organizer, this only tags it; community-groups.md §0).
    hostOrgId: v.optional(v.id("hostOrgs")),
    // A pasted Instagram, TikTok, YouTube or Vimeo link in place of a cover
    // image (docs/features/creator-media-cross-post.md). Stored the way every
    // table stores one — see canonicalMediaUrl in convex/linkPreview.ts.
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const endTimeError = validateEndTime(args.datetime, args.endTime);
    if (endTimeError) throw new Error(endTimeError);

    const { tiers, error: tiersError } = normalizeTicketTiers(args.ticketTiers);
    if (tiersError) throw new Error(tiersError);

    const {
      externalTicketUrl,
      externalTicketPriceCents,
      error: ticketLinkError,
    } = normalizeExternalTicket({
      url: args.externalTicketUrl,
      priceCents: args.externalTicketPriceCents,
    });
    if (ticketLinkError) throw new Error(ticketLinkError);

    const mediaUrl = canonicalMediaUrl(args.mediaUrl);

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    const now = Date.now();
    const title = args.title.trim();

    const eventId = await ctx.db.insert("events", {
      organizerId: userId,
      title,
      description: args.description.trim(),
      datetime: args.datetime,
      endTime: args.endTime,
      ticketTiers: tiers,
      externalTicketUrl,
      externalTicketPriceCents,
      location: args.location?.trim(),
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      tags: args.tags,
      requiresApproval: args.requiresApproval,
      hostOrgId: args.hostOrgId,
      mediaUrl,
      status: "published",
      createdAt: now,
      updatedAt: now,
    });

    // The still cards show for the link. Only Instagram and TikTok need a
    // fetch (a no-op for the rest), and it runs off the request so create
    // returns at once; convex/linkPreview.ts patches the row when it lands.
    await schedulePreviewFetch(ctx, "event", eventId, mediaUrl);

    // Following fan-out (docs/features/following.md §1 #6): events are born
    // `published`, so create is the moment. Same linkUrl convention as the
    // event_application notification in `apply` below. `userId` is the
    // organizer's users id — notifyFollowers hops to the profile id that
    // follows are actually keyed on, and returns 0 (never throws) when the
    // organizer has no profile.
    const organizerProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const organizerName = organizerProfile?.name || "Someone";
    // Skip the fan-out when the new event is ticketed and not public yet —
    // followers would get a link to a page that 404s for them until the
    // organizer becomes a member (product rule, 2026-09-27).
    const isPublic = await eventVisibilityChecker(ctx)({
      ticketTiers: tiers,
      organizerId: userId,
    });
    if (isPublic) {
      await notifyFollowers(ctx, userId, {
        type: "followed_created_event",
        title: `${organizerName} is hosting ${title}`,
        message: formatFollowedEventDate(args.datetime),
        linkUrl: `/events/${eventId}`,
      });
    }

    return eventId;
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    description: v.string(),
    datetime: v.number(),
    endTime: v.optional(v.number()),
    ticketTiers: ticketTiersValidator,
    externalTicketUrl: v.optional(v.string()),
    externalTicketPriceCents: v.optional(v.number()),
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
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()),
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
    hostOrgId: v.optional(v.id("hostOrgs")),
    // Convex validators don't accept `null` through v.optional — pass this
    // instead to remove an already-set hostOrgId. See createPassionProject's
    // hostOrgId comment for what this field means.
    clearCommunity: v.optional(v.boolean()),
    // The pasted media link (see create). Left out = untouched, so a caller
    // that doesn't know the field can't wipe it; an empty string clears it —
    // the same v.optional-takes-no-null reason clearCommunity exists.
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    const endTimeError = validateEndTime(args.datetime, args.endTime);
    if (endTimeError) throw new Error(endTimeError);

    const { tiers, error: tiersError } = normalizeTicketTiers(args.ticketTiers);
    if (tiersError) throw new Error(tiersError);

    const {
      externalTicketUrl,
      externalTicketPriceCents,
      error: ticketLinkError,
    } = normalizeExternalTicket({
      url: args.externalTicketUrl,
      priceCents: args.externalTicketPriceCents,
    });
    if (ticketLinkError) throw new Error(ticketLinkError);

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    // A changed or cleared link takes its still with it: the file is deleted
    // rather than left orphaned in storage, and both preview columns are
    // cleared in the same patch so a card never shows the old reel's picture
    // over the new link while the new fetch (Instagram/TikTok) is in flight.
    let mediaPatch: Pick<
      Doc<"events">,
      "mediaUrl" | "mediaPreviewUrl" | "mediaPreviewStorageId"
    > = {};
    let fetchMediaUrl: string | undefined;
    if (args.mediaUrl !== undefined) {
      const mediaUrl = canonicalMediaUrl(args.mediaUrl);
      if (mediaUrl !== event.mediaUrl) {
        if (event.mediaPreviewStorageId) {
          // Best-effort, as garden/projects.ts's updateProject treats the same
          // delete: a file already gone must not fail the whole edit.
          try {
            await ctx.storage.delete(event.mediaPreviewStorageId);
          } catch {
            // already gone
          }
        }
        mediaPatch = { mediaUrl, mediaPreviewUrl: undefined, mediaPreviewStorageId: undefined };
        fetchMediaUrl = mediaUrl;
      }
    }

    // venueAddress (deprecated, schema.ts) is deliberately left out of this
    // patch — not read from args, not written as undefined — so an old
    // event that still has one keeps it untouched across edits instead of
    // having it silently cleared.
    await ctx.db.patch(args.eventId, {
      title: args.title.trim(),
      description: args.description.trim(),
      datetime: args.datetime,
      endTime: args.endTime,
      ticketTiers: tiers,
      externalTicketUrl,
      externalTicketPriceCents,
      location: args.location?.trim(),
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      tags: args.tags,
      requiresApproval: args.requiresApproval,
      hostOrgId: args.clearCommunity ? undefined : (args.hostOrgId ?? event.hostOrgId),
      ...mediaPatch,
      updatedAt: Date.now(),
    });

    await schedulePreviewFetch(ctx, "event", args.eventId, fetchMediaUrl);
  },
});

export const cancel = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    await ctx.db.patch(args.eventId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

export const apply = mutation({
  args: {
    eventId: v.id("events"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    // A hidden ticketed event reads as missing, same as its page does.
    if (!event || !(await canSeeEvent(ctx, event, userId))) throw new Error("Event not found");
    if (event.status !== "published")
      throw new Error("Event is not accepting applications");

    // Check if already applied
    const existing = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("applicantId"), userId))
      .first();

    if (existing) throw new Error("Already applied");

    const now = Date.now();

    const applicationId = await ctx.db.insert("eventApplications", {
      eventId: args.eventId,
      applicantId: userId,
      message: args.message?.trim(),
      status: event.requiresApproval ? "pending" : "accepted",
      createdAt: now,
      updatedAt: now,
    });

    // Notify the event organizer
    if (event.organizerId !== userId) {
      const applicantProfile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      const applicantName = applicantProfile?.name || "Someone";
      await ctx.db.insert("notifications", {
        userId: event.organizerId,
        type: "event_application",
        title: `${applicantName} applied to your event`,
        message: event.title,
        linkUrl: `/events/${args.eventId}`,
        relatedUserId: userId,
        createdAt: now,
      });

      await scheduleNotificationEmail(ctx, {
        userId: event.organizerId,
        subject: `${applicantName} applied to "${event.title}"`,
        previewText: `Someone applied to your event`,
        heading: "New event application",
        body: `<strong>${escapeHtml(applicantName)}</strong> applied to your event "<strong>${escapeHtml(event.title)}</strong>".`,
        ctaText: "View Application",
        ctaUrl: `/events/${args.eventId}`,
        category: "activity",
      });
    }

    return applicationId;
  },
});

export const getApplications = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const event = await ctx.db.get(args.eventId);
    if (!event || event.organizerId !== userId) return [];

    const applications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Get applicant profiles
    const withProfiles = await Promise.all(
      applications.map(async (app) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", app.applicantId))
          .first();
        return {
          ...app,
          applicant: profile
            ? {
                name: profile.name,
                imageUrl: profile.imageUrl,
                bio: profile.bio,
              }
            : null,
        };
      }),
    );

    return withProfiles;
  },
});

export const updateApplicationStatus = mutation({
  args: {
    applicationId: v.id("eventApplications"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found");

    const event = await ctx.db.get(application.eventId);
    if (!event || event.organizerId !== userId) {
      throw new Error("Not authorized");
    }

    if (!["pending", "accepted", "declined"].includes(args.status)) {
      throw new Error("Invalid status");
    }

    await ctx.db.patch(args.applicationId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const getAttendees = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canSeeEvent(ctx, event, await auth.getUserId(ctx)))) return [];
    const acceptedApplications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    const attendees = await Promise.all(
      acceptedApplications.map(async (app) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", app.applicantId))
          .first();

        let imageUrl = profile?.imageUrl || null;
        if (profile?.imageStorageId) {
          imageUrl = await ctx.storage.getUrl(profile.imageStorageId);
        }

        return {
          applicationId: app._id,
          userId: app.applicantId,
          profileId: profile?._id || null,
          name: profile?.name || "Anonymous",
          imageUrl,
          message: app.message || null,
          joinedAt: app.createdAt,
        };
      }),
    );

    return attendees;
  },
});

// Search events by title, description, location, tags
export const search = query({
  args: {
    query: v.string(),
    // Community context (docs/features/community-ux.md §2): only events
    // posted into that community. Unknown slug → nothing (fail closed).
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = args.query.toLowerCase();

    // Get published, upcoming events
    const now = Date.now();
    let events = await ctx.db.query("events").collect();
    events = events.filter((e) => e.status === "published" && e.datetime > now);

    if (args.communitySlug) {
      const org = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", args.communitySlug!))
        .unique();
      if (!org) return [];
      events = events.filter((e) => e.hostOrgId && String(e.hostOrgId) === String(org._id));
    }

    // Filter by search query
    const filtered = events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );

    // Sort by date
    filtered.sort((a, b) => a.datetime - b.datetime);

    // A ticketed event stays off search until its organizer can sell
    // tickets. Checked before the slice so a page of hidden events can't
    // starve out visible results.
    const isPublic = eventVisibilityChecker(ctx);
    const visibility = await Promise.all(filtered.map((e) => isPublic(e)));
    const visible = filtered.filter((_, i) => visibility[i]);

    // Resolve cover images
    const eventsWithImages = await Promise.all(
      visible.slice(0, 20).map(async (event) => {
        let coverImageUrl: string | null = null;

        if (event.coverImageStorageId) {
          coverImageUrl = await ctx.storage.getUrl(event.coverImageStorageId);
        } else if (event.imageStorageIds && event.imageStorageIds.length > 0) {
          coverImageUrl = await ctx.storage.getUrl(event.imageStorageIds[0]);
        }

        return {
          ...event,
          coverImageUrl,
        };
      }),
    );

    return eventsWithImages;
  },
});

// ——— Ticket checkout support ———

// Read by garden/stripe.ts's createTicketCheckout action ("use node" —
// actions have no ctx.db, so they call this via ctx.runQuery). Returns
// everything the action needs to validate + price the Checkout Session.
export const getEventForTicketCheckout = internalQuery({
  args: { eventId: v.id("events"), tierName: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    // A ticketed event whose organizer can't sell tickets refuses checkout
    // the same way a deleted event does ("isn't there anymore" —
    // createTicketCheckout in garden/stripe.ts).
    if (!(await eventVisibilityChecker(ctx)(event))) return null;

    const tier =
      event.ticketTiers?.find((t) => t.name === args.tierName) ?? null;

    // Sold count only matters for capped tiers.
    let sold = 0;
    if (tier?.quantity !== undefined) {
      const purchases = await ctx.db
        .query("ticketPurchases")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect();
      sold = purchases.filter(
        (p) => p.status === "paid" && p.tierName === args.tierName,
      ).length;
    }

    // The beneficiary org, if the event names one — garden/ticketRouting.ts
    // turns this into a Stripe destination (or a refusal).
    const beneficiaryOrg = event.beneficiaryHostOrgId
      ? await ctx.db.get(event.beneficiaryHostOrgId)
      : null;

    return {
      title: event.title,
      status: event.status,
      datetime: event.datetime,
      tier,
      sold,
      beneficiaryHostOrgId: event.beneficiaryHostOrgId ?? null,
      beneficiary: beneficiaryOrg
        ? {
            name: beneficiaryOrg.name,
            stripeConnectAccountId: beneficiaryOrg.stripeConnectAccountId,
            taxStatus: beneficiaryOrg.taxStatus,
          }
        : null,
    };
  },
});
