import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// Scraper Service Client
// ============================================

// Environment variables (set via npx convex env set)
declare const process: { env: Record<string, string | undefined> };

const SCRAPER_SERVICE_URL = "https://successful-mandrill-388.convex.site";

// Job schema for extraction
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
          location_type: { type: "string" },
          employment_type: { type: "string" },
          salary_text: { type: "string" },
          description_snippet: { type: "string" },
          apply_url: { type: "string" },
        },
        required: ["title"],
      },
    },
    career_page_url: { type: "string" },
    total_jobs_found: { type: "integer" },
  },
  required: ["jobs", "total_jobs_found"],
};

const JOB_EXTRACTION_PROMPT = `Extract ALL job listings from this career page. Include full-time jobs, part-time jobs, internships, volunteer positions, and any other opportunities.

For each position found, extract:
- title: The job title
- department: Department or team if mentioned
- location: City/State or "Remote" if mentioned
- location_type: "remote", "onsite", or "hybrid" if indicated
- employment_type: "full-time", "part-time", "contract", "internship", "volunteer" as appropriate
- salary_text: Raw salary/compensation text if shown
- description_snippet: First 200 characters of description
- apply_url: The URL to apply (convert relative URLs to absolute)

Return JSON with:
- jobs: array of all positions found
- career_page_url: the URL of the career page
- total_jobs_found: count of positions`;

// ============================================
// Types
// ============================================

interface BotProtection {
  detected: boolean;
  type: string | null;
  confidence: string;
  indicators: string[];
}

interface ScraperJobResult {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  url: string;
  result?: {
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
    total_jobs_found: number;
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
        wait_for: "domcontentloaded",
        delay: 1000,
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
  const response = await fetch(`${SCRAPER_SERVICE_URL}/api/job/${jobId}`, {
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
        error: "Missing SCRAPER_SERVICE_API_KEY environment variable",
      };
    }

    try {
      // Submit job
      const { jobId } = await submitScrapeJob(
        apiKey,
        args.url,
        JOB_EXTRACTION_SCHEMA,
        JOB_EXTRACTION_PROMPT,
      );

      // Poll for result
      const result = await pollForResult(apiKey, jobId);

      if (result.status === "failed") {
        return {
          success: false,
          jobs: [],
          totalJobsFound: 0,
          error: result.error || "Scrape job failed",
          botProtection: result.result?._botProtection,
        };
      }

      const jobs = result.result?.jobs || [];
      const botProtection = result.result?._botProtection;

      return {
        success: true,
        jobs,
        totalJobsFound: result.result?.total_jobs_found || jobs.length,
        botProtection,
        rawMarkdown: result.raw_markdown,
        durationMs: result.metadata?.duration_ms,
      };
    } catch (error) {
      return {
        success: false,
        jobs: [],
        totalJobsFound: 0,
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
