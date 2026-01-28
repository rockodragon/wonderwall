import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

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

    return {
      ...event,
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
    location: v.optional(v.string()),
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const now = Date.now();

    return await ctx.db.insert("events", {
      organizerId: userId,
      title: args.title.trim(),
      description: args.description.trim(),
      datetime: args.datetime,
      location: args.location?.trim(),
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
    location: v.optional(v.string()),
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    await ctx.db.patch(args.eventId, {
      title: args.title.trim(),
      description: args.description.trim(),
      datetime: args.datetime,
      location: args.location?.trim(),
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

    return await ctx.db.insert("eventApplications", {
      eventId: args.eventId,
      applicantId: userId,
      message: args.message?.trim(),
      status: event.requiresApproval ? "pending" : "accepted",
      createdAt: now,
      updatedAt: now,
    });
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
