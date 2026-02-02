import { v } from "convex/values";
import { action, mutation, query, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ============================================
// Career Page Detection
// ============================================

const CAREER_PATH_PATTERNS = [
  "/careers",
  "/jobs",
  "/careers/openings",
  "/about/careers",
  "/join-us",
  "/work-with-us",
  "/employment",
  "/opportunities",
  "/join-our-team",
  "/career-opportunities",
];

// Common ATS (Applicant Tracking System) domains
const ATS_PATTERNS = [
  { pattern: "greenhouse.io", name: "Greenhouse" },
  { pattern: "lever.co", name: "Lever" },
  { pattern: "workday.com", name: "Workday" },
  { pattern: "bamboohr.com", name: "BambooHR" },
  { pattern: "jobvite.com", name: "Jobvite" },
  { pattern: "icims.com", name: "iCIMS" },
  { pattern: "ultipro.com", name: "UltiPro" },
  { pattern: "paylocity.com", name: "Paylocity" },
  { pattern: "paycom.com", name: "Paycom" },
  { pattern: "applicantpro.com", name: "ApplicantPro" },
];

// ============================================
// Utility Functions
// ============================================

function detectATS(url: string): { isATS: boolean; atsName?: string } {
  for (const ats of ATS_PATTERNS) {
    if (url.includes(ats.pattern)) {
      return { isATS: true, atsName: ats.name };
    }
  }
  return { isATS: false };
}

async function findCareerPageUrl(
  baseUrl: string,
): Promise<{ url: string | null; isATS: boolean; atsName?: string }> {
  // Try common career page paths
  const baseUrlClean = baseUrl.replace(/\/$/, "");

  for (const path of CAREER_PATH_PATTERNS) {
    const testUrl = `${baseUrlClean}${path}`;
    try {
      const response = await fetch(testUrl, {
        method: "HEAD",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; WonderwallBot/1.0; +https://wonderwall.app)",
        },
        redirect: "follow",
      });

      if (response.ok) {
        const finalUrl = response.url;
        const atsInfo = detectATS(finalUrl);
        return { url: finalUrl, ...atsInfo };
      }
    } catch {
      // Try next path
    }
  }

  return { url: null, isATS: false };
}

// ============================================
// Queries
// ============================================

export const getJobsByOrganization = query({
  args: { organizationId: v.id("crawledOrganizations") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("crawledJobs")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

export const getRecentCrawledJobs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return ctx.db
      .query("crawledJobs")
      .withIndex("by_crawledAt")
      .order("desc")
      .take(limit);
  },
});

export const getJobStats = query({
  args: {},
  handler: async (ctx) => {
    const allJobs = await ctx.db.query("crawledJobs").collect();

    return {
      total: allJobs.length,
      active: allJobs.filter((j) => j.isActive).length,
      crawled: allJobs.filter((j) => j.sourceType === "crawled").length,
      posted: allJobs.filter((j) => j.sourceType === "posted").length,
    };
  },
});

// ============================================
// Mutations
// ============================================

export const upsertJob = mutation({
  args: {
    organizationId: v.id("crawledOrganizations"),
    title: v.string(),
    department: v.optional(v.string()),
    location: v.optional(v.string()),
    locationType: v.optional(v.string()),
    employmentType: v.optional(v.string()),
    salaryMin: v.optional(v.number()),
    salaryMax: v.optional(v.number()),
    salaryPeriod: v.optional(v.string()),
    description: v.optional(v.string()),
    requirements: v.optional(v.array(v.string())),
    applyUrl: v.string(),
    applicationDeadline: v.optional(v.number()),
    sourceType: v.string(),
    sourceUrl: v.string(),
    postedDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if job already exists by applyUrl
    const existing = await ctx.db
      .query("crawledJobs")
      .withIndex("by_applyUrl", (q) => q.eq("applyUrl", args.applyUrl))
      .first();

    if (existing) {
      // Update lastSeenAt and reactivate if needed
      await ctx.db.patch(existing._id, {
        lastSeenAt: now,
        isActive: true,
        deactivatedAt: undefined,
        // Update fields that might have changed
        title: args.title,
        department: args.department,
        location: args.location,
        locationType: args.locationType,
        employmentType: args.employmentType,
        description: args.description,
      });
      return { id: existing._id, created: false };
    }

    // Create new job
    const id = await ctx.db.insert("crawledJobs", {
      ...args,
      crawledAt: now,
      lastSeenAt: now,
      isActive: true,
    });

    return { id, created: true };
  },
});

export const updateOrganizationCareerInfo = mutation({
  args: {
    id: v.id("crawledOrganizations"),
    hasCareerPage: v.boolean(),
    careerPageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      hasCareerPage: args.hasCareerPage,
      careerPageUrl: args.careerPageUrl,
      lastJobsCrawledAt: Date.now(),
    });
  },
});

export const deactivateMissingJobs = mutation({
  args: {
    organizationId: v.id("crawledOrganizations"),
    activeApplyUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingJobs = await ctx.db
      .query("crawledJobs")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    let deactivated = 0;
    for (const job of existingJobs) {
      if (!args.activeApplyUrls.includes(job.applyUrl)) {
        await ctx.db.patch(job._id, {
          isActive: false,
          deactivatedAt: now,
        });
        deactivated++;
      }
    }

    return { deactivated };
  },
});

// ============================================
// Actions
// ============================================

export const scrapeJobsForOrganization = action({
  args: { organizationId: v.id("crawledOrganizations") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    jobsFound: number;
    jobsCreated: number;
    botProtectionDetected?: boolean;
    error?: string;
  }> => {
    // Get organization
    const org = await ctx.runQuery(api.crawler.getOrganization, {
      id: args.organizationId,
    });

    if (!org || !org.website) {
      return {
        success: false,
        jobsFound: 0,
        jobsCreated: 0,
        error: "Organization not found or no website",
      };
    }

    try {
      // Find career page if not known
      let careerUrl: string | undefined = org.careerPageUrl;
      if (!careerUrl) {
        const careerInfo = await findCareerPageUrl(org.website);
        careerUrl = careerInfo.url || undefined;

        // Update org with career page info
        await ctx.runMutation(api.jobScraper.updateOrganizationCareerInfo, {
          id: args.organizationId,
          hasCareerPage: !!careerUrl,
          careerPageUrl: careerUrl || undefined,
        });

        if (!careerUrl) {
          return { success: true, jobsFound: 0, jobsCreated: 0 };
        }
      }

      // Use scraper service for JavaScript rendering and bot protection detection
      const scrapeResult = await ctx.runAction(
        internal.scraperService.scrapeCareerPage,
        { url: careerUrl },
      );

      if (!scrapeResult.success) {
        return {
          success: false,
          jobsFound: 0,
          jobsCreated: 0,
          botProtectionDetected: scrapeResult.botProtection?.detected,
          error: scrapeResult.error,
        };
      }

      // Save jobs
      let created = 0;
      const activeUrls: string[] = [];

      for (const job of scrapeResult.jobs) {
        if (!job.title) continue;

        const applyUrl = job.apply_url || careerUrl;
        activeUrls.push(applyUrl);

        const result = await ctx.runMutation(api.jobScraper.upsertJob, {
          organizationId: args.organizationId,
          title: job.title,
          department: job.department,
          location: job.location,
          locationType: job.location_type,
          employmentType: job.employment_type,
          description: job.description_snippet,
          applyUrl,
          sourceType: "crawled",
          sourceUrl: careerUrl,
        });

        if (result.created) created++;
      }

      // Deactivate jobs no longer on the page
      await ctx.runMutation(api.jobScraper.deactivateMissingJobs, {
        organizationId: args.organizationId,
        activeApplyUrls: activeUrls,
      });

      return {
        success: true,
        jobsFound: scrapeResult.totalJobsFound,
        jobsCreated: created,
        botProtectionDetected: scrapeResult.botProtection?.detected,
      };
    } catch (error) {
      return {
        success: false,
        jobsFound: 0,
        jobsCreated: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Scrape jobs for organizations with career pages
export const scrapeJobsBatch = action({
  args: {
    limit: v.optional(v.number()),
    onlyWithCareerPage: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    processed: number;
    totalJobsFound: number;
    totalJobsCreated: number;
    results: Array<{
      orgName: string;
      success: boolean;
      jobsFound: number;
      jobsCreated: number;
      error?: string;
    }>;
  }> => {
    const limit = args.limit ?? 10;

    // Get organizations to scrape
    const orgsResult = await ctx.runQuery(api.crawler.listOrganizations, {
      limit,
    });

    const orgs: typeof orgsResult.organizations = args.onlyWithCareerPage
      ? orgsResult.organizations.filter(
          (o: (typeof orgsResult.organizations)[0]) => o.hasCareerPage,
        )
      : orgsResult.organizations;

    const results: Array<{
      orgName: string;
      success: boolean;
      jobsFound: number;
      jobsCreated: number;
      error?: string;
    }> = [];

    for (const org of orgs.slice(0, limit)) {
      const result = await ctx.runAction(
        api.jobScraper.scrapeJobsForOrganization,
        {
          organizationId: org._id as Id<"crawledOrganizations">,
        },
      );
      results.push({
        orgName: org.name,
        ...result,
      });

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return {
      processed: results.length,
      totalJobsFound: results.reduce((sum, r) => sum + r.jobsFound, 0),
      totalJobsCreated: results.reduce((sum, r) => sum + r.jobsCreated, 0),
      results,
    };
  },
});
