import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { auth } from "./auth";
import { scheduleNotificationEmail } from "./emailHelpers";

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

export const list = query({
  args: {
    status: v.optional(v.string()),
    upcoming: v.optional(v.boolean()),
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

    // Sort by date
    events.sort((a, b) => a.datetime - b.datetime);

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
    const userId = await auth.getUserId(ctx);
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
      isOrganizer: userId === event.organizerId,
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
    location: v.optional(v.string()),
    venueAddress: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const endTimeError = validateEndTime(args.datetime, args.endTime);
    if (endTimeError) throw new Error(endTimeError);

    const { tiers, error: tiersError } = normalizeTicketTiers(args.ticketTiers);
    if (tiersError) throw new Error(tiersError);

    const now = Date.now();

    return await ctx.db.insert("events", {
      organizerId: userId,
      title: args.title.trim(),
      description: args.description.trim(),
      datetime: args.datetime,
      endTime: args.endTime,
      ticketTiers: tiers,
      location: args.location?.trim(),
      venueAddress: args.venueAddress?.trim() || undefined,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      tags: args.tags,
      requiresApproval: args.requiresApproval,
      status: "published",
      createdAt: now,
      updatedAt: now,
    });
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
    location: v.optional(v.string()),
    venueAddress: v.optional(v.string()),
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

    await ctx.db.patch(args.eventId, {
      title: args.title.trim(),
      description: args.description.trim(),
      datetime: args.datetime,
      endTime: args.endTime,
      ticketTiers: tiers,
      location: args.location?.trim(),
      venueAddress: args.venueAddress?.trim() || undefined,
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      tags: args.tags,
      requiresApproval: args.requiresApproval,
      updatedAt: Date.now(),
    });
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
    if (!event) throw new Error("Event not found");
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
        body: `<strong>${applicantName}</strong> applied to your event "<strong>${event.title}</strong>".`,
        ctaText: "View Application",
        ctaUrl: `/events/${args.eventId}`,
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
  },
  handler: async (ctx, args) => {
    const q = args.query.toLowerCase();

    // Get published, upcoming events
    const now = Date.now();
    let events = await ctx.db.query("events").collect();
    events = events.filter((e) => e.status === "published" && e.datetime > now);

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

    // Resolve cover images
    const eventsWithImages = await Promise.all(
      filtered.slice(0, 20).map(async (event) => {
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

    return {
      title: event.title,
      status: event.status,
      datetime: event.datetime,
      tier,
      sold,
    };
  },
});
