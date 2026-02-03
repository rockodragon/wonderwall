import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// Scraper Service Client
// ============================================

// Environment variables (set via npx convex env set)
declare const process: { env: Record<string, string | undefined> };

const SCRAPER_SERVICE_URL = "https://successful-mandrill-388.convex.site";

// Schema to find job category links on a career hub page
const LINK_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    job_category_links: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          label: { type: "string" },
        },
        required: ["url"],
      },
    },
    has_direct_job_listings: { type: "boolean" },
  },
  required: ["job_category_links", "has_direct_job_listings"],
};

const LINK_EXTRACTION_PROMPT = `Analyze this career/jobs page. Look for:
1. Links to job category pages (e.g., "View Faculty Positions", "Staff Jobs", "See All Openings")
2. Whether this page directly lists individual job positions

Return JSON with:
- job_category_links: array of {url, label} for links that lead to more job listings. Convert relative URLs to absolute. Include links like "View Positions", "See Jobs", "Open Roles", category links, department links, etc. Maximum 5 most relevant links.
- has_direct_job_listings: true if this page shows actual job titles/positions, false if it's just a hub page with category links`;

// Job schema for extraction - OpenAI handles richer schemas reliably
const JOB_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    jobs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          department: { type: "string" },
          location: { type: "string" },
          apply_url: { type: "string" },
        },
        required: ["title"],
      },
    },
    total: { type: "integer" },
  },
  required: ["jobs", "total"],
};

const JOB_EXTRACTION_PROMPT = `Extract ALL job listings from this career page.

For each position found, extract:
- title: The job title (required)
- department: Department or team if mentioned
- location: City/State or "Remote" if shown
- apply_url: The URL to apply or view job details (convert relative URLs to absolute)

Return JSON with jobs array and total count.`;

// ============================================
// Types
// ============================================

interface BotProtection {
  detected: boolean;
  type: string | null;
  confidence: string;
  indicators: string[];
}

interface ExtractedJob {
  title: string;
  department?: string;
  location?: string;
  location_type?: string;
  employment_type?: string;
  salary_text?: string;
  description_snippet?: string;
  apply_url?: string;
}

interface ScraperJobResult {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  url: string;
  result?: {
    // The scraper service wraps extraction results in an items array
    items?: Array<{
      jobs?: ExtractedJob[];
      total_jobs_found?: number;
      total?: number;
      error?: boolean;
    }>;
    // Legacy direct format (for backwards compatibility)
    jobs?: ExtractedJob[];
    total_jobs_found?: number;
    career_page_url?: string;
    _botProtection?: BotProtection;
  };
  raw_markdown?: string;
  metadata?: {
    pages_fetched: number;
    tokens_used: number;
    duration_ms: number;
  };
  error?: string;
  created_at: string;
  completed_at?: string;
}

// Helper to extract jobs from scraper result (handles both formats)
function extractJobsFromResult(result: ScraperJobResult["result"]): {
  jobs: ExtractedJob[];
  totalFound: number;
} {
  if (!result) return { jobs: [], totalFound: 0 };

  // Check for items array format (new format from scraper service)
  if (result.items && result.items.length > 0) {
    const item = result.items[0];
    const jobs = item.jobs || [];
    const total = item.total_jobs_found || item.total || jobs.length;
    return { jobs, totalFound: total };
  }

  // Legacy direct format
  const jobs = result.jobs || [];
  return { jobs, totalFound: result.total_jobs_found || jobs.length };
}

// ============================================
// Client Functions
// ============================================

async function submitScrapeJob(
  apiKey: string,
  url: string,
  schema: object,
  extractionPrompt: string,
): Promise<{ jobId: string; status: string }> {
  const response = await fetch(`${SCRAPER_SERVICE_URL}/api/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      schema,
      extraction_prompt: extractionPrompt,
      options: {
        timeout: 60000,
        waitFor: "domcontentloaded",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Scraper service error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return { jobId: data.job_id, status: data.status };
}

async function getJobResult(
  apiKey: string,
  jobId: string,
): Promise<ScraperJobResult> {
  // Use query param endpoint (path params have routing issues)
  const fetchUrl = `${SCRAPER_SERVICE_URL}/api/job-status?id=${jobId}`;

  const response = await fetch(fetchUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Scraper service error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function pollForResult(
  apiKey: string,
  jobId: string,
  maxWaitMs = 120000,
  pollIntervalMs = 3000,
): Promise<ScraperJobResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await getJobResult(apiKey, jobId);

    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Scraper job ${jobId} timed out after ${maxWaitMs}ms`);
}

// ============================================
// Exported Actions
// ============================================

export const scrapeCareerPage = internalAction({
  args: {
    url: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    jobs: Array<{
      title: string;
      department?: string;
      location?: string;
      location_type?: string;
      employment_type?: string;
      salary_text?: string;
      description_snippet?: string;
      apply_url?: string;
    }>;
    totalJobsFound: number;
    pagesScraped: number;
    botProtection?: BotProtection;
    rawMarkdown?: string;
    error?: string;
    durationMs?: number;
  }> => {
    const apiKey = process.env.SCRAPER_SERVICE_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        jobs: [],
        totalJobsFound: 0,
        pagesScraped: 0,
        error: "Missing SCRAPER_SERVICE_API_KEY environment variable",
      };
    }

    try {
      const allJobs: ExtractedJob[] = [];
      let totalDurationMs = 0;
      let pagesScraped = 0;
      let lastBotProtection: BotProtection | undefined;

      // Phase 1: Check if this is a hub page with category links
      console.log(`Phase 1: Checking for job category links on ${args.url}`);
      const { jobId: linkJobId } = await submitScrapeJob(
        apiKey,
        args.url,
        LINK_EXTRACTION_SCHEMA,
        LINK_EXTRACTION_PROMPT,
      );

      const linkResult = await pollForResult(apiKey, linkJobId);
      totalDurationMs += linkResult.metadata?.duration_ms || 0;
      pagesScraped++;

      if (linkResult.status === "failed") {
        return {
          success: false,
          jobs: [],
          totalJobsFound: 0,
          pagesScraped,
          error: linkResult.error || "Failed to analyze career page",
          botProtection: linkResult.result?._botProtection,
          durationMs: totalDurationMs,
        };
      }

      // Extract link data from items array (scraper service wraps results)
      const rawLinkResult = linkResult.result;
      let linkData: {
        job_category_links?: Array<{ url: string; label?: string }>;
        has_direct_job_listings?: boolean;
      } = {};

      if (rawLinkResult?.items && rawLinkResult.items.length > 0) {
        linkData = rawLinkResult.items[0] as typeof linkData;
      }

      lastBotProtection = rawLinkResult?._botProtection;
      const categoryLinks = linkData?.job_category_links || [];
      const hasDirectListings = linkData?.has_direct_job_listings || false;

      console.log(
        `Found ${categoryLinks.length} category links, hasDirectListings: ${hasDirectListings}`,
      );

      // Phase 2: Scrape pages for jobs
      const urlsToScrape: string[] = [];

      // Always try the main page first - it often has jobs directly listed
      urlsToScrape.push(args.url);

      // Also add category links if found (up to 5)
      const linksToFollow = categoryLinks.slice(0, 5);
      for (const link of linksToFollow) {
        if (link.url && !urlsToScrape.includes(link.url)) {
          urlsToScrape.push(link.url);
        }
      }

      console.log(`Phase 2: Scraping ${urlsToScrape.length} pages for jobs`);

      // Scrape each page for jobs
      for (const pageUrl of urlsToScrape) {
        try {
          console.log(`Scraping jobs from: ${pageUrl}`);
          const { jobId } = await submitScrapeJob(
            apiKey,
            pageUrl,
            JOB_EXTRACTION_SCHEMA,
            JOB_EXTRACTION_PROMPT,
          );

          const result = await pollForResult(apiKey, jobId);
          totalDurationMs += result.metadata?.duration_ms || 0;
          pagesScraped++;

          if (result.status === "completed") {
            const { jobs, totalFound } = extractJobsFromResult(result.result);
            console.log(
              `Found ${jobs.length} jobs on ${pageUrl} (total: ${totalFound})`,
            );
            allJobs.push(...jobs);
          }

          if (result.result?._botProtection) {
            lastBotProtection = result.result._botProtection;
          }
        } catch (pageError) {
          console.error(`Error scraping ${pageUrl}:`, pageError);
          // Continue with other pages
        }
      }

      // Deduplicate jobs by title + apply_url
      const seen = new Set<string>();
      const uniqueJobs = allJobs.filter((job) => {
        const key = `${job.title}|${job.apply_url || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(
        `Total: ${uniqueJobs.length} unique jobs from ${pagesScraped} pages`,
      );

      return {
        success: true,
        jobs: uniqueJobs,
        totalJobsFound: uniqueJobs.length,
        pagesScraped,
        botProtection: lastBotProtection,
        durationMs: totalDurationMs,
      };
    } catch (error) {
      return {
        success: false,
        jobs: [],
        totalJobsFound: 0,
        pagesScraped: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Direct scrape action for testing
export const testScrape = action({
  args: {
    url: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    jobs: Array<{
      title: string;
      department?: string;
      location?: string;
      location_type?: string;
      employment_type?: string;
      salary_text?: string;
      description_snippet?: string;
      apply_url?: string;
    }>;
    totalJobsFound: number;
    pagesScraped: number;
    botProtection?: BotProtection;
    rawMarkdown?: string;
    error?: string;
    durationMs?: number;
  }> => {
    return ctx.runAction(internal.scraperService.scrapeCareerPage, {
      url: args.url,
    });
  },
});
