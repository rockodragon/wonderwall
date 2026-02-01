import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// Types
// ============================================

interface ParsedOrganization {
  url: string;
  name?: string;
  category?: string;
  location?: string;
}

// ============================================
// PublicSquare Parser
// ============================================

const PUBLICSQUARE_CATEGORIES = [
  "restaurants",
  "retail",
  "services",
  "health-wellness",
  "home-garden",
  "automotive",
  "travel-entertainment",
  "professional-services",
  "faith-community",
];

async function fetchWithRetry(
  url: string,
  retries = 3,
): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; WonderwallBot/1.0; +https://wonderwall.app)",
          Accept: "application/json, text/html",
        },
      });
      if (response.ok) return response;
    } catch {
      if (i === retries - 1) return null;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

// PublicSquare has a JSON API we can hit
export const parsePublicSquare = internalAction({
  args: {
    category: v.optional(v.string()),
    page: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ urls: ParsedOrganization[]; hasMore: boolean }> => {
    const category = args.category || "all";
    const page = args.page || 1;

    // Try the API endpoint first (they likely have one for their marketplace)
    const apiUrl = `https://www.publicsquare.com/api/marketplace/businesses?category=${category}&page=${page}&limit=50`;

    const response = await fetchWithRetry(apiUrl);
    if (!response) {
      // Fallback to scraping the HTML page
      return parsePublicSquareHtml(category, page);
    }

    try {
      const data = await response.json();

      // Extract business URLs and metadata
      const urls: ParsedOrganization[] = [];

      // Adapt based on actual API response structure
      const businesses = data.businesses || data.data || data.results || [];
      for (const biz of businesses) {
        if (biz.website || biz.url) {
          urls.push({
            url: biz.website || biz.url,
            name: biz.name || biz.businessName,
            category: biz.category || category,
            location: biz.city ? `${biz.city}, ${biz.state}` : undefined,
          });
        }
      }

      const hasMore = data.hasMore || data.nextPage || urls.length >= 50;
      return { urls, hasMore };
    } catch {
      // API didn't return expected JSON, try HTML
      return parsePublicSquareHtml(category, page);
    }
  },
});

async function parsePublicSquareHtml(
  category: string,
  page: number,
): Promise<{ urls: ParsedOrganization[]; hasMore: boolean }> {
  const htmlUrl = `https://www.publicsquare.com/marketplace/${category}?page=${page}`;

  const response = await fetchWithRetry(htmlUrl);
  if (!response) {
    return { urls: [], hasMore: false };
  }

  const html = await response.text();

  // Extract business listings from HTML
  // Look for common patterns like href="/business/..." or data-url attributes
  const urls: ParsedOrganization[] = [];

  // Pattern 1: Direct website links
  const websitePattern = /href="(https?:\/\/(?!www\.publicsquare)[^"]+)"/g;
  let match;
  while ((match = websitePattern.exec(html)) !== null) {
    const url = match[1];
    // Skip internal links, social media, etc.
    if (
      !url.includes("facebook.com") &&
      !url.includes("twitter.com") &&
      !url.includes("instagram.com") &&
      !url.includes("linkedin.com")
    ) {
      urls.push({ url, category });
    }
  }

  // Dedupe
  const seen = new Set<string>();
  const dedupedUrls = urls.filter((u) => {
    if (seen.has(u.url)) return false;
    seen.add(u.url);
    return true;
  });

  // Check for pagination
  const hasMore =
    html.includes(`page=${page + 1}`) || html.includes("Load More");

  return { urls: dedupedUrls, hasMore };
}

// ============================================
// Church Finder Parser
// ============================================

const STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

export const parseChurchFinder = internalAction({
  args: {
    state: v.string(),
    page: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ urls: ParsedOrganization[]; hasMore: boolean }> => {
    const page = args.page || 1;

    // Try multiple church directory sources
    const sources = [
      `https://www.churchchurch.com/churches/${args.state.toLowerCase()}?page=${page}`,
      `https://www.findachurch.com/state/${args.state.toLowerCase()}/page/${page}`,
      `https://church.org/churches/${args.state.toLowerCase()}?p=${page}`,
    ];

    const urls: ParsedOrganization[] = [];

    for (const sourceUrl of sources) {
      const response = await fetchWithRetry(sourceUrl);
      if (!response) continue;

      const html = await response.text();

      // Extract church websites from the directory listing
      // Look for patterns like "Visit Website" or website icons
      const patterns = [
        /href="(https?:\/\/[^"]+)"[^>]*>(?:visit website|website|view site)/gi,
        /data-website="(https?:\/\/[^"]+)"/g,
        /<a[^>]*href="(https?:\/\/(?!(?:www\.)?churchchurch|findachurch|church\.org)[^"]+)"[^>]*class="[^"]*website/gi,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          const url = match[1];
          if (!url.includes("facebook.com") && !url.includes("google.com")) {
            urls.push({
              url,
              category: "church",
              location: args.state,
            });
          }
        }
      }

      // If we found churches, break (don't hit all sources)
      if (urls.length > 0) break;
    }

    // Dedupe
    const seen = new Set<string>();
    const dedupedUrls = urls.filter((u) => {
      if (seen.has(u.url)) return false;
      seen.add(u.url);
      return true;
    });

    return { urls: dedupedUrls, hasMore: dedupedUrls.length >= 20 };
  },
});

// ============================================
// Kingdom Advisors Parser
// ============================================

export const parseKingdomAdvisors = internalAction({
  args: {
    page: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ urls: ParsedOrganization[]; hasMore: boolean }> => {
    const page = args.page || 1;

    // Kingdom Advisors member directory
    const url = `https://kingdomadvisors.com/find-an-advisor?page=${page}`;

    const response = await fetchWithRetry(url);
    if (!response) {
      return { urls: [], hasMore: false };
    }

    const html = await response.text();
    const urls: ParsedOrganization[] = [];

    // Extract advisor firm websites
    const patterns = [
      /href="(https?:\/\/(?!kingdomadvisors\.com)[^"]+)"[^>]*>(?:website|visit)/gi,
      /data-url="(https?:\/\/[^"]+)"/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        urls.push({
          url: match[1],
          category: "financial-advisor",
        });
      }
    }

    // Dedupe
    const seen = new Set<string>();
    const dedupedUrls = urls.filter((u) => {
      if (seen.has(u.url)) return false;
      seen.add(u.url);
      return true;
    });

    return { urls: dedupedUrls, hasMore: dedupedUrls.length >= 20 };
  },
});

// ============================================
// Main Crawler Actions
// ============================================

export const crawlPublicSquare = action({
  args: {
    maxPages: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ added: number; skipped: number; pages: number }> => {
    const maxPages = args.maxPages || 5;
    let totalAdded = 0;
    let totalSkipped = 0;
    let pagesProcessed = 0;

    for (const category of PUBLICSQUARE_CATEGORIES) {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= maxPages) {
        const result = await ctx.runAction(
          internal.sourceParsers.parsePublicSquare,
          {
            category,
            page,
          },
        );

        if (result.urls.length > 0) {
          const queueResult = await ctx.runMutation(
            api.crawler.bulkAddToQueue,
            {
              urls: result.urls.map((u) => ({
                url: u.url,
                source: "publicsquare",
                priority: 5,
              })),
            },
          );

          totalAdded += queueResult.added;
          totalSkipped += queueResult.skipped;
        }

        hasMore = result.hasMore;
        page++;
        pagesProcessed++;

        // Rate limiting
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return { added: totalAdded, skipped: totalSkipped, pages: pagesProcessed };
  },
});

export const crawlChurches = action({
  args: {
    states: v.optional(v.array(v.string())),
    maxPagesPerState: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ added: number; skipped: number; states: number }> => {
    const states = args.states || STATES;
    const maxPages = args.maxPagesPerState || 3;
    let totalAdded = 0;
    let totalSkipped = 0;
    let statesProcessed = 0;

    for (const state of states) {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= maxPages) {
        const result = await ctx.runAction(
          internal.sourceParsers.parseChurchFinder,
          {
            state,
            page,
          },
        );

        if (result.urls.length > 0) {
          const queueResult = await ctx.runMutation(
            api.crawler.bulkAddToQueue,
            {
              urls: result.urls.map((u) => ({
                url: u.url,
                source: "church_finder",
                priority: 6, // Higher priority for churches
              })),
            },
          );

          totalAdded += queueResult.added;
          totalSkipped += queueResult.skipped;
        }

        hasMore = result.hasMore;
        page++;

        // Rate limiting
        await new Promise((r) => setTimeout(r, 1500));
      }

      statesProcessed++;
    }

    return {
      added: totalAdded,
      skipped: totalSkipped,
      states: statesProcessed,
    };
  },
});

export const crawlKingdomAdvisors = action({
  args: {
    maxPages: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ added: number; skipped: number; pages: number }> => {
    const maxPages = args.maxPages || 10;
    let totalAdded = 0;
    let totalSkipped = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      const result = await ctx.runAction(
        internal.sourceParsers.parseKingdomAdvisors,
        {
          page,
        },
      );

      if (result.urls.length > 0) {
        const queueResult = await ctx.runMutation(api.crawler.bulkAddToQueue, {
          urls: result.urls.map((u) => ({
            url: u.url,
            source: "kingdom_advisors",
            priority: 7, // High priority for financial advisors
          })),
        });

        totalAdded += queueResult.added;
        totalSkipped += queueResult.skipped;
      }

      hasMore = result.hasMore;
      page++;

      // Rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }

    return { added: totalAdded, skipped: totalSkipped, pages: page - 1 };
  },
});

// Crawl all sources
export const crawlAllSources = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    publicsquare: { added: number; skipped: number };
    churches: { added: number; skipped: number };
    kingdomAdvisors: { added: number; skipped: number };
    total: { added: number; skipped: number };
  }> => {
    console.log("[Crawler] Starting full crawl of all sources...");

    // Crawl PublicSquare (limit to 2 pages per category for initial run)
    const psResult = await ctx.runAction(api.sourceParsers.crawlPublicSquare, {
      maxPages: 2,
    });
    console.log(
      `[Crawler] PublicSquare: ${psResult.added} added, ${psResult.skipped} skipped`,
    );

    // Crawl churches (limit to 5 states for initial run)
    const churchResult = await ctx.runAction(api.sourceParsers.crawlChurches, {
      states: ["CA", "TX", "FL", "NY", "GA"],
      maxPagesPerState: 2,
    });
    console.log(
      `[Crawler] Churches: ${churchResult.added} added, ${churchResult.skipped} skipped`,
    );

    // Crawl Kingdom Advisors
    const kaResult = await ctx.runAction(
      api.sourceParsers.crawlKingdomAdvisors,
      {
        maxPages: 5,
      },
    );
    console.log(
      `[Crawler] Kingdom Advisors: ${kaResult.added} added, ${kaResult.skipped} skipped`,
    );

    return {
      publicsquare: { added: psResult.added, skipped: psResult.skipped },
      churches: { added: churchResult.added, skipped: churchResult.skipped },
      kingdomAdvisors: { added: kaResult.added, skipped: kaResult.skipped },
      total: {
        added: psResult.added + churchResult.added + kaResult.added,
        skipped: psResult.skipped + churchResult.skipped + kaResult.skipped,
      },
    };
  },
});
