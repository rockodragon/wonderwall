import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

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

    // Fetch based on the primary filter
    let orgs: Doc<"crawledOrganizations">[];
    if (args.status) {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit + 1);
    } else if (args.segment) {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_segment", (q) => q.eq("segment", args.segment!))
        .order("desc")
        .take(limit + 1);
    } else if (args.source) {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .order("desc")
        .take(limit + 1);
    } else if (args.state) {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_state", (q) => q.eq("state", args.state!))
        .order("desc")
        .take(limit + 1);
    } else {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .order("desc")
        .take(limit + 1);
    }

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
      {} as Record<string, number>,
    );

    const bySegment = allOrgs.reduce(
      (acc, org) => {
        acc[org.segment] = (acc[org.segment] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const bySource = allOrgs.reduce(
      (acc, org) => {
        acc[org.source] = (acc[org.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
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
      args.valuesScore +
      args.hiringScore +
      args.qualityScore +
      args.contactScore;

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
      }),
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

// ============================================
// Queue Processor
// ============================================

// Get queue status for admin UI
export const getQueueStatus = query({
  args: {},
  handler: async (ctx) => {
    const allItems = await ctx.db.query("crawlerQueue").collect();

    const byStatus = allItems.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const recentCompleted = allItems
      .filter((i) => i.status === "completed" && i.processedAt)
      .sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0))
      .slice(0, 5);

    const recentFailed = allItems
      .filter((i) => i.status === "failed")
      .sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0))
      .slice(0, 5);

    return {
      total: allItems.length,
      pending: byStatus["pending"] || 0,
      processing: byStatus["processing"] || 0,
      completed: byStatus["completed"] || 0,
      failed: byStatus["failed"] || 0,
      recentCompleted,
      recentFailed,
    };
  },
});

// Internal: Get next pending items to process
export const getNextPendingItems = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    // Get pending items, prioritized by priority (higher first)
    const items = await ctx.db
      .query("crawlerQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(args.limit * 2); // Get extra to sort by priority

    // Sort by priority descending and take limit
    return items.sort((a, b) => b.priority - a.priority).slice(0, args.limit);
  },
});

// Internal: Process a single queue item
export const processQueueItem = internalAction({
  args: {
    itemId: v.id("crawlerQueue"),
    url: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      // Mark as processing
      await ctx.runMutation(internal.crawler.updateQueueItem, {
        id: args.itemId,
        status: "processing",
      });

      // Call the classifier
      const result = await ctx.runAction(api.crawlerClassifier.classifyUrl, {
        url: args.url,
        source: args.source,
      });

      if (result.success && result.organizationId) {
        // Mark as completed
        await ctx.runMutation(internal.crawler.updateQueueItem, {
          id: args.itemId,
          status: "completed",
          organizationId: result.organizationId as Id<"crawledOrganizations">,
        });
        return { success: true };
      } else {
        // Classification failed
        await ctx.runMutation(internal.crawler.updateQueueItem, {
          id: args.itemId,
          status: "failed",
          errorMessage: result.error || "Classification failed",
          incrementRetry: true,
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      // Unexpected error
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(internal.crawler.updateQueueItem, {
        id: args.itemId,
        status: "failed",
        errorMessage,
        incrementRetry: true,
      });
      return { success: false, error: errorMessage };
    }
  },
});

// Process next batch of queue items
export const processNextBatch = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    delayMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; succeeded: number; failed: number }> => {
    const batchSize = args.batchSize ?? 3;
    const delayMs = args.delayMs ?? 2000;

    // Get pending items
    const items = await ctx.runQuery(internal.crawler.getNextPendingItems, {
      limit: batchSize,
    });

    if (items.length === 0) {
      console.log("[Crawler] No pending items in queue");
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[Crawler] Processing ${items.length} items...`);

    let succeeded = 0;
    let failed = 0;

    for (const item of items) {
      const result = await ctx.runAction(internal.crawler.processQueueItem, {
        itemId: item._id,
        url: item.url,
        source: item.source,
      });

      if (result.success) {
        succeeded++;
        console.log(`[Crawler] ✓ Classified: ${item.url}`);
      } else {
        failed++;
        console.log(`[Crawler] ✗ Failed: ${item.url} - ${result.error}`);
      }

      // Delay between items to respect rate limits
      if (items.indexOf(item) < items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { processed: items.length, succeeded, failed };
  },
});

// Public action to start processing the queue
export const startQueueProcessor = action({
  args: {
    batchSize: v.optional(v.number()),
    continueProcessing: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; succeeded: number; failed: number }> => {
    const batchSize = args.batchSize ?? 5;

    // Process first batch
    const result = await ctx.runAction(internal.crawler.processNextBatch, {
      batchSize,
    });

    // If continueProcessing and there might be more items, schedule next batch
    if (args.continueProcessing && result.processed > 0) {
      // Schedule next batch after a delay
      await ctx.scheduler.runAfter(5000, internal.crawler.processNextBatch, {
        batchSize,
      });
    }

    return result;
  },
});

// Seed queue with test URLs (for POC)
export const seedTestUrls = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ message: string; added: number; skipped: number }> => {
    const testUrls = [
      { url: "https://www.northpoint.org", source: "church_finder" },
      { url: "https://www.saddleback.com", source: "church_finder" },
      { url: "https://www.publicsquare.com", source: "publicsquare" },
      { url: "https://www.hobby-lobby.com", source: "directory" },
      { url: "https://www.chick-fil-a.com", source: "directory" },
      { url: "https://adflegal.org", source: "directory" },
      { url: "https://www.kingdomadvisors.com", source: "kingdom_advisors" },
      { url: "https://www.accsedu.org", source: "directory" },
      { url: "https://www.acsi.org", source: "directory" },
      { url: "https://samaritanministries.org", source: "directory" },
    ];

    const result = await ctx.runMutation(api.crawler.bulkAddToQueue, {
      urls: testUrls,
    });

    return {
      message: `Seeded ${result.added} URLs (${result.skipped} already existed)`,
      added: result.added,
      skipped: result.skipped,
    };
  },
});
