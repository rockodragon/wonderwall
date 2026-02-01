import { v } from "convex/values";
import {
  internalMutation,
  internalAction,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

// ============================================
// Constants
// ============================================

const FREQUENCY_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000, // 1 hour
  daily: 24 * 60 * 60 * 1000, // 24 hours
  weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
  monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
  manual: Infinity, // Never auto-trigger
};

// ============================================
// Queries
// ============================================

// Get scheduler status for admin UI
export const getSchedulerStatus = query({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db
      .query("crawlerSources")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    const now = Date.now();

    return sources.map((source) => {
      const isDue = shouldCrawl(source, now);
      const nextCrawlAt = calculateNextCrawl(
        source.crawlFrequency,
        source.lastCrawledAt,
      );

      return {
        id: source._id,
        name: source.name,
        displayName: source.displayName,
        crawlFrequency: source.crawlFrequency,
        lastCrawledAt: source.lastCrawledAt,
        nextCrawlAt,
        isDue,
        isActive: source.isActive,
      };
    });
  },
});

// Internal: Get sources due for crawling
export const getSourcesDueForCrawl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db
      .query("crawlerSources")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    const now = Date.now();
    return sources.filter((source) => shouldCrawl(source, now));
  },
});

// ============================================
// Mutations
// ============================================

// Update source after crawl
export const updateSourceAfterCrawl = internalMutation({
  args: {
    name: v.string(),
    lastCrawledAt: v.number(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("crawlerSources")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (!source) return;

    const nextCrawlAt = calculateNextCrawl(
      source.crawlFrequency,
      args.lastCrawledAt,
    );

    await ctx.db.patch(source._id, {
      lastCrawledAt: args.lastCrawledAt,
      nextCrawlAt,
      updatedAt: args.lastCrawledAt,
    });
  },
});

// Manual trigger: Run crawl now (override schedule)
export const triggerCrawlNow = mutation({
  args: {
    sourceName: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("crawlerSources")
      .withIndex("by_name", (q) => q.eq("name", args.sourceName))
      .first();

    if (!source) {
      throw new Error(`Source not found: ${args.sourceName}`);
    }

    // Schedule the crawl action
    await ctx.scheduler.runAfter(
      0,
      internal.crawlerScheduler.runCrawlForSource,
      {
        sourceName: args.sourceName,
      },
    );

    return { scheduled: true, sourceName: args.sourceName };
  },
});

// Skip next scheduled crawl
export const skipNextCrawl = mutation({
  args: {
    sourceName: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("crawlerSources")
      .withIndex("by_name", (q) => q.eq("name", args.sourceName))
      .first();

    if (!source) {
      throw new Error(`Source not found: ${args.sourceName}`);
    }

    const now = Date.now();
    const nextCrawlAt = calculateNextCrawl(source.crawlFrequency, now);

    await ctx.db.patch(source._id, {
      lastCrawledAt: now, // Pretend we just crawled
      nextCrawlAt,
      updatedAt: now,
    });

    return { skipped: true, nextCrawlAt };
  },
});

// Update crawl frequency
export const updateCrawlFrequency = mutation({
  args: {
    sourceName: v.string(),
    crawlFrequency: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("crawlerSources")
      .withIndex("by_name", (q) => q.eq("name", args.sourceName))
      .first();

    if (!source) {
      throw new Error(`Source not found: ${args.sourceName}`);
    }

    const nextCrawlAt = calculateNextCrawl(
      args.crawlFrequency,
      source.lastCrawledAt,
    );

    await ctx.db.patch(source._id, {
      crawlFrequency: args.crawlFrequency,
      nextCrawlAt,
      updatedAt: Date.now(),
    });

    return { updated: true, nextCrawlAt };
  },
});

// ============================================
// Internal Actions (Cron handlers)
// ============================================

// Main scheduler: Check which sources need crawling (called by hourly cron)
export const checkScheduledCrawls = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; triggered: number }> => {
    const dueSourcesList = await ctx.runQuery(
      internal.crawlerScheduler.getSourcesDueForCrawl,
    );

    console.log(
      `[Scheduler] Checking sources... ${dueSourcesList.length} due for crawl`,
    );

    let triggered = 0;

    for (const source of dueSourcesList) {
      console.log(`[Scheduler] Triggering crawl for: ${source.name}`);

      // Schedule the crawl
      await ctx.scheduler.runAfter(
        0,
        internal.crawlerScheduler.runCrawlForSource,
        {
          sourceName: source.name,
        },
      );

      triggered++;
    }

    return { checked: dueSourcesList.length, triggered };
  },
});

// Process queue cron (called every 5 minutes)
export const processQueueCron = internalAction({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    // Check if there are pending items
    const pending = await ctx.runQuery(internal.crawler.getNextPendingItems, {
      limit: 1,
    });

    if (pending.length === 0) {
      return { processed: 0 };
    }

    // Process a batch
    const result = await ctx.runAction(internal.crawler.processNextBatch, {
      batchSize: 5,
      delayMs: 2000,
    });

    console.log(
      `[Scheduler] Queue processed: ${result.succeeded} succeeded, ${result.failed} failed`,
    );

    return { processed: result.processed };
  },
});

// Run crawl for a specific source
export const runCrawlForSource = internalAction({
  args: {
    sourceName: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    added: number;
    skipped: number;
    error?: string;
  }> => {
    const now = Date.now();

    console.log(`[Scheduler] Starting crawl for source: ${args.sourceName}`);

    try {
      let result: { added: number; skipped: number };

      // Route to the appropriate crawler based on source name
      switch (args.sourceName) {
        case "publicsquare":
          const psResult = await ctx.runAction(
            api.sourceParsers.crawlPublicSquare,
            {
              maxPages: 3,
            },
          );
          result = { added: psResult.added, skipped: psResult.skipped };
          break;

        case "church_finder":
          const churchResult = await ctx.runAction(
            api.sourceParsers.crawlChurches,
            {
              maxPagesPerState: 2,
            },
          );
          result = { added: churchResult.added, skipped: churchResult.skipped };
          break;

        case "kingdom_advisors":
          const kaResult = await ctx.runAction(
            api.sourceParsers.crawlKingdomAdvisors,
            {
              maxPages: 5,
            },
          );
          result = { added: kaResult.added, skipped: kaResult.skipped };
          break;

        default:
          console.log(
            `[Scheduler] Unknown source: ${args.sourceName}, skipping`,
          );
          return {
            success: false,
            added: 0,
            skipped: 0,
            error: `Unknown source: ${args.sourceName}`,
          };
      }

      // Update source with last crawled timestamp
      await ctx.runMutation(internal.crawlerScheduler.updateSourceAfterCrawl, {
        name: args.sourceName,
        lastCrawledAt: now,
      });

      console.log(
        `[Scheduler] Completed crawl for ${args.sourceName}: ${result.added} added, ${result.skipped} skipped`,
      );

      return { success: true, ...result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[Scheduler] Crawl failed for ${args.sourceName}: ${errorMessage}`,
      );
      return { success: false, added: 0, skipped: 0, error: errorMessage };
    }
  },
});

// ============================================
// Seed Data
// ============================================

// Default crawler sources configuration
const DEFAULT_SOURCES = [
  {
    name: "publicsquare",
    displayName: "PublicSquare",
    baseUrl: "https://www.publicsquare.com/marketplace",
    crawlFrequency: "weekly",
    requestsPerMinute: 30,
    delayBetweenRequests: 2000,
  },
  {
    name: "church_finder",
    displayName: "Church Finder",
    baseUrl: "https://www.churchchurch.com/churches",
    crawlFrequency: "weekly",
    requestsPerMinute: 20,
    delayBetweenRequests: 3000,
  },
  {
    name: "kingdom_advisors",
    displayName: "Kingdom Advisors",
    baseUrl: "https://kingdomadvisors.com/find-an-advisor",
    crawlFrequency: "weekly",
    requestsPerMinute: 20,
    delayBetweenRequests: 3000,
  },
];

// Seed crawler sources
export const seedCrawlerSources = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const source of DEFAULT_SOURCES) {
      const existing = await ctx.db
        .query("crawlerSources")
        .withIndex("by_name", (q) => q.eq("name", source.name))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("crawlerSources", {
        ...source,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created, skipped };
  },
});

// ============================================
// Helper Functions
// ============================================

function shouldCrawl(source: Doc<"crawlerSources">, now: number): boolean {
  // Manual sources never auto-crawl
  if (source.crawlFrequency === "manual") {
    return false;
  }

  // If never crawled, it's due
  if (!source.lastCrawledAt) {
    return true;
  }

  // Check if enough time has passed
  const frequencyMs = FREQUENCY_MS[source.crawlFrequency] || FREQUENCY_MS.daily;
  const timeSinceLastCrawl = now - source.lastCrawledAt;

  return timeSinceLastCrawl >= frequencyMs;
}

function calculateNextCrawl(
  frequency: string,
  lastCrawledAt: number | undefined,
): number | undefined {
  if (frequency === "manual") {
    return undefined;
  }

  const frequencyMs = FREQUENCY_MS[frequency] || FREQUENCY_MS.daily;
  const baseTime = lastCrawledAt || Date.now();

  return baseTime + frequencyMs;
}
