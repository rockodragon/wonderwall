import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

// ============================================
// Types
// ============================================

export const PERSONA_TAGS = [
  "CHURCH",
  "MINISTRY",
  "EDUCATION",
  "HEALTHCARE",
  "LEGAL",
  "FINANCIAL",
  "TRADES",
  "RETAIL",
  "FOOD_SERVICE",
  "MANUFACTURING",
  "PROFESSIONAL",
  "NONPROFIT",
  "SOCIAL_SERVICES",
  "MEDIA",
  "OUTDOOR_LIFESTYLE",
  "PREPAREDNESS",
] as const;

export const ORG_STATUSES = [
  "new",
  "contacted",
  "responded",
  "converted",
  "declined",
  "nurture",
] as const;

export const SEGMENTS = ["hot", "warm", "nurture", "research", "low"] as const;

export const SOURCES = [
  "publicsquare",
  "church_finder",
  "directory",
  "manual",
  "referral",
  "linkedin",
  "google",
  "csv_import",
] as const;

// ============================================
// Queries
// ============================================

// List organizations with filtering
export const listOrganizations = query({
  args: {
    status: v.optional(v.string()),
    segment: v.optional(v.string()),
    source: v.optional(v.string()),
    state: v.optional(v.string()),
    personaTag: v.optional(v.string()),
    minScore: v.optional(v.number()),
    exportedToCrm: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let orgsQuery = ctx.db.query("crawledOrganizations");

    // Apply filters based on available indexes
    if (args.status) {
      orgsQuery = ctx.db
        .query("crawledOrganizations")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else if (args.segment) {
      orgsQuery = ctx.db
        .query("crawledOrganizations")
        .withIndex("by_segment", (q) => q.eq("segment", args.segment!));
    } else if (args.source) {
      orgsQuery = ctx.db
        .query("crawledOrganizations")
        .withIndex("by_source", (q) => q.eq("source", args.source!));
    } else if (args.state) {
      orgsQuery = ctx.db
        .query("crawledOrganizations")
        .withIndex("by_state", (q) => q.eq("state", args.state!));
    }

    let orgs = await orgsQuery.order("desc").take(limit + 1);

    // Apply additional filters in memory
    if (args.minScore !== undefined) {
      orgs = orgs.filter((o) => o.totalScore >= args.minScore!);
    }
    if (args.personaTag) {
      orgs = orgs.filter((o) => o.personaTags.includes(args.personaTag!));
    }
    if (args.exportedToCrm !== undefined) {
      orgs = orgs.filter((o) => o.exportedToCrm === args.exportedToCrm);
    }

    const hasMore = orgs.length > limit;
    if (hasMore) {
      orgs = orgs.slice(0, limit);
    }

    return {
      organizations: orgs.map((o) => ({
        ...o,
        rawHtml: undefined, // Don't send raw HTML to client
        rawClassification: undefined,
      })),
      hasMore,
      nextCursor: hasMore ? orgs[orgs.length - 1]._id : undefined,
    };
  },
});

// Get single organization
export const getOrganization = query({
  args: { id: v.id("crawledOrganizations") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.id);
  },
});

// Get crawler stats
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const allOrgs = await ctx.db.query("crawledOrganizations").collect();

    const byStatus = allOrgs.reduce(
      (acc, org) => {
        acc[org.status] = (acc[org.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const bySegment = allOrgs.reduce(
      (acc, org) => {
        acc[org.segment] = (acc[org.segment] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const bySource = allOrgs.reduce(
      (acc, org) => {
        acc[org.source] = (acc[org.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const avgScore =
      allOrgs.length > 0
        ? allOrgs.reduce((sum, o) => sum + o.totalScore, 0) / allOrgs.length
        : 0;

    return {
      total: allOrgs.length,
      byStatus,
      bySegment,
      bySource,
      avgScore: Math.round(avgScore),
      hotLeads: bySegment.hot || 0,
      warmLeads: bySegment.warm || 0,
      exportedCount: allOrgs.filter((o) => o.exportedToCrm).length,
    };
  },
});

// Get recent crawler runs
export const getCrawlerRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return ctx.db
      .query("crawlerRuns")
      .withIndex("by_startedAt")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// Get crawler sources
export const getSources = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("crawlerSources").collect();
  },
});

// ============================================
// Mutations
// ============================================

// Create or update organization (upsert by website)
export const upsertOrganization = mutation({
  args: {
    sourceUrl: v.string(),
    source: v.string(),
    name: v.string(),
    website: v.optional(v.string()),
    industry: v.optional(v.string()),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    country: v.optional(v.string()),
    employeeEstimate: v.optional(v.string()),
    orgType: v.optional(v.string()),
    personaTags: v.array(v.string()),
    valuesScore: v.number(),
    hiringScore: v.number(),
    qualityScore: v.number(),
    contactScore: v.number(),
    faithSignals: v.array(v.string()),
    conservativeSignals: v.array(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    contactFormUrl: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    rawHtml: v.optional(v.string()),
    rawClassification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const totalScore =
      args.valuesScore + args.hiringScore + args.qualityScore + args.contactScore;

    // Determine segment based on score
    let segment: string;
    if (totalScore >= 80) segment = "hot";
    else if (totalScore >= 60) segment = "warm";
    else if (totalScore >= 40) segment = "nurture";
    else if (totalScore >= 20) segment = "research";
    else segment = "low";

    // Check if organization already exists by website
    const websiteToCheck = args.website || args.sourceUrl;
    const existing = await ctx.db
      .query("crawledOrganizations")
      .withIndex("by_website", (q) => q.eq("website", websiteToCheck))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        ...args,
        totalScore,
        segment,
        lastUpdated: now,
      });
      return { id: existing._id, created: false };
    }

    // Create new
    const id = await ctx.db.insert("crawledOrganizations", {
      ...args,
      website: websiteToCheck,
      totalScore,
      segment,
      status: "new",
      exportedToCrm: false,
      discoveredAt: now,
      crawledAt: now,
      lastUpdated: now,
    });

    return { id, created: true };
  },
});

// Update organization status
export const updateStatus = mutation({
  args: {
    id: v.id("crawledOrganizations"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      notes: args.notes,
      lastUpdated: Date.now(),
    });
  },
});

// Bulk update segment
export const bulkUpdateSegment = mutation({
  args: {
    ids: v.array(v.id("crawledOrganizations")),
    segment: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      await ctx.db.patch(id, {
        segment: args.segment,
        lastUpdated: now,
      });
    }
    return { updated: args.ids.length };
  },
});

// Mark as exported to CRM
export const markExported = mutation({
  args: {
    ids: v.array(v.id("crawledOrganizations")),
    crmId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.ids) {
      await ctx.db.patch(id, {
        exportedToCrm: true,
        crmId: args.crmId,
        lastExportedAt: now,
        lastUpdated: now,
      });
    }
  },
});

// Delete organization
export const deleteOrganization = mutation({
  args: { id: v.id("crawledOrganizations") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Create crawler source
export const createSource = mutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    baseUrl: v.string(),
    crawlFrequency: v.string(),
    requestsPerMinute: v.number(),
    delayBetweenRequests: v.number(),
    selectors: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("crawlerSources", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Toggle source active status
export const toggleSource = mutation({
  args: {
    id: v.id("crawlerSources"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

// Add URL to crawler queue
export const addToQueue = mutation({
  args: {
    url: v.string(),
    source: v.string(),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if URL already in queue
    const existing = await ctx.db
      .query("crawlerQueue")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .first();

    if (existing) {
      return { id: existing._id, alreadyExists: true };
    }

    const id = await ctx.db.insert("crawlerQueue", {
      url: args.url,
      source: args.source,
      priority: args.priority ?? 5,
      status: "pending",
      retryCount: 0,
      maxRetries: 3,
      addedAt: Date.now(),
    });

    return { id, alreadyExists: false };
  },
});

// Bulk add URLs to queue
export const bulkAddToQueue = mutation({
  args: {
    urls: v.array(
      v.object({
        url: v.string(),
        source: v.string(),
        priority: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let added = 0;
    let skipped = 0;

    for (const item of args.urls) {
      const existing = await ctx.db
        .query("crawlerQueue")
        .withIndex("by_url", (q) => q.eq("url", item.url))
        .first();

      if (!existing) {
        await ctx.db.insert("crawlerQueue", {
          url: item.url,
          source: item.source,
          priority: item.priority ?? 5,
          status: "pending",
          retryCount: 0,
          maxRetries: 3,
          addedAt: now,
        });
        added++;
      } else {
        skipped++;
      }
    }

    return { added, skipped };
  },
});

// Record crawler run
export const recordCrawlerRun = mutation({
  args: {
    source: v.string(),
    status: v.string(),
    config: v.optional(v.string()),
    urlsProcessed: v.number(),
    orgsFound: v.number(),
    orgsCreated: v.number(),
    orgsUpdated: v.number(),
    errors: v.array(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    triggeredBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("crawlerRuns", args);
  },
});

// Internal: Update queue item status
export const updateQueueItem = internalMutation({
  args: {
    id: v.id("crawlerQueue"),
    status: v.string(),
    organizationId: v.optional(v.id("crawledOrganizations")),
    errorMessage: v.optional(v.string()),
    incrementRetry: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) return;

    const updates: Partial<Doc<"crawlerQueue">> = {
      status: args.status,
      processedAt: Date.now(),
    };

    if (args.organizationId) {
      updates.organizationId = args.organizationId;
    }
    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }
    if (args.incrementRetry) {
      updates.retryCount = item.retryCount + 1;
    }

    await ctx.db.patch(args.id, updates);
  },
});

// ============================================
// Manual Entry (for testing and manual adds)
// ============================================

export const manualAddOrganization = mutation({
  args: {
    name: v.string(),
    website: v.string(),
    source: v.optional(v.string()),
    industry: v.optional(v.string()),
    description: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    personaTags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing
    const existing = await ctx.db
      .query("crawledOrganizations")
      .withIndex("by_website", (q) => q.eq("website", args.website))
      .first();

    if (existing) {
      throw new Error("Organization with this website already exists");
    }

    // Manual entries get default scores that need AI classification
    const id = await ctx.db.insert("crawledOrganizations", {
      sourceUrl: args.website,
      source: args.source || "manual",
      name: args.name,
      website: args.website,
      industry: args.industry,
      description: args.description,
      city: args.city,
      state: args.state,
      email: args.email,
      phone: args.phone,
      personaTags: args.personaTags || [],
      valuesScore: 0,
      hiringScore: 0,
      qualityScore: 0,
      contactScore: args.email ? 4 : args.phone ? 2 : 0,
      totalScore: args.email ? 4 : args.phone ? 2 : 0,
      faithSignals: [],
      conservativeSignals: [],
      status: "new",
      segment: "research", // Needs classification
      exportedToCrm: false,
      notes: args.notes,
      discoveredAt: now,
      crawledAt: now,
      lastUpdated: now,
    });

    return id;
  },
});
