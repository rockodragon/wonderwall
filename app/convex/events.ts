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

    return events;
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
      organizer: profile
        ? { name: profile.name, imageUrl: profile.imageUrl }
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
