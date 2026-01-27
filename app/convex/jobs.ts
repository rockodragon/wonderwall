import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { auth } from "./auth";
import type { Doc } from "./_generated/dataModel";

// Helper to resolve image URL from storage or external URL
async function resolveImageUrl(
  ctx: QueryCtx,
  profile: Doc<"profiles">,
): Promise<string | null> {
  if (profile.imageStorageId) {
    return await ctx.storage.getUrl(profile.imageStorageId);
  }
  return profile.imageUrl || null;
}

/**
 * Get all jobs with filters
 */
export const getJobs = query({
  args: {
    statusFilter: v.optional(
      v.union(v.literal("Open"), v.literal("Closed"), v.literal("All")),
    ),
    locationFilter: v.optional(
      v.union(
        v.literal("Remote"),
        v.literal("Hybrid"),
        v.literal("On-site"),
        v.literal("All"),
      ),
    ),
    disciplinesFilter: v.optional(v.array(v.string())),
    myPosts: v.optional(v.boolean()),
    myInterests: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);

    // Get all jobs
    let jobs = await ctx.db.query("jobs").collect();

    // Filter by status (default: All)
    const statusFilter = args.statusFilter || "All";
    if (statusFilter !== "All") {
      jobs = jobs.filter((j) => j.status === statusFilter);
    }

    // Filter by location (default: All)
    const locationFilter = args.locationFilter || "All";
    if (locationFilter !== "All") {
      jobs = jobs.filter((j) => j.location === locationFilter);
    }

    // Filter by disciplines
    if (args.disciplinesFilter && args.disciplinesFilter.length > 0) {
      jobs = jobs.filter((j) => {
        if (!j.disciplines || j.disciplines.length === 0) return false;
        return args.disciplinesFilter!.some((discipline) =>
          j.disciplines!.includes(discipline),
        );
      });
    }

    // Filter by user's posted jobs
    if (args.myPosts && userId) {
      jobs = jobs.filter((j) => j.posterId === userId);
    }

    // Filter by user's interested jobs
    if (args.myInterests && userId) {
      const userInterests = await ctx.db
        .query("jobInterests")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect();
      const interestedJobIds = new Set(userInterests.map((i) => i.jobId));
      jobs = jobs.filter((j) => interestedJobIds.has(j._id));
    }

    // Sort by createdAt descending (newest first)
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    // Get poster profile info for each job
    const jobsWithPosterInfo = await Promise.all(
      jobs.map(async (job) => {
        const posterProfile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", job.posterId))
          .first();

        // Resolve poster image URL
        let posterImageUrl: string | null = null;
        if (posterProfile) {
          posterImageUrl = await resolveImageUrl(ctx, posterProfile);
        }

        return {
          ...job,
          poster: posterProfile
            ? {
                name: posterProfile.name,
                imageUrl: posterImageUrl,
                jobFunctions: posterProfile.jobFunctions,
                profileId: posterProfile._id,
              }
            : null,
        };
      }),
    );

    return jobsWithPosterInfo;
  },
});

/**
 * Get single job by ID with full details
 */
export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    // Get poster profile
    const posterProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", job.posterId))
      .first();

    // Resolve poster image URL
    let posterImageUrl: string | null = null;
    if (posterProfile) {
      posterImageUrl = await resolveImageUrl(ctx, posterProfile);
    }

    // Get interest count
    const interests = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Check if current user is poster
    const userId = await auth.getUserId(ctx);
    const isPoster = userId === job.posterId;

    return {
      ...job,
      poster: posterProfile
        ? {
            name: posterProfile.name,
            imageUrl: posterImageUrl,
            jobFunctions: posterProfile.jobFunctions,
            profileId: posterProfile._id,
          }
        : null,
      interestCount: interests.length,
      isPoster,
    };
  },
});

/**
 * Get interests for a job
 * If current user is poster: return full list with profile info, notes, work links
 * If not poster: return only count
 */
export const getJobInterests = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      // Not authenticated - return only count
      const interests = await ctx.db
        .query("jobInterests")
        .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
        .collect();
      return { count: interests.length, interests: [] };
    }

    const job = await ctx.db.get(args.jobId);
    if (!job) return { count: 0, interests: [] };

    const interests = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // If current user is not the poster, return only count
    if (job.posterId !== userId) {
      return { count: interests.length, interests: [] };
    }

    // Current user is the poster - return full details
    const interestsWithDetails = await Promise.all(
      interests.map(async (interest) => {
        // Get interested user's profile
        const profile = await ctx.db.get(interest.profileId);

        // Resolve profile image URL
        let imageUrl: string | null = null;
        if (profile) {
          imageUrl = await resolveImageUrl(ctx, profile);
        }

        // Get work link artifacts
        const workLinkArtifacts = await Promise.all(
          interest.workLinks.map(async (artifactId) => {
            const artifact = await ctx.db.get(artifactId);
            if (!artifact) return null;

            let mediaUrl = artifact.mediaUrl || null;
            if (artifact.mediaStorageId) {
              mediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
            }

            return {
              ...artifact,
              mediaUrl,
            };
          }),
        );

        return {
          ...interest,
          profile: profile
            ? {
                _id: profile._id,
                name: profile.name,
                imageUrl,
                bio: profile.bio,
                jobFunctions: profile.jobFunctions,
              }
            : null,
          workLinkArtifacts: workLinkArtifacts.filter(Boolean),
        };
      }),
    );

    return {
      count: interests.length,
      interests: interestsWithDetails.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

/**
 * Get current user's interest for a job (if exists)
 */
export const getUserJobInterest = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const interest = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId_userId", (q) =>
        q.eq("jobId", args.jobId).eq("userId", userId),
      )
      .first();

    if (!interest) return null;

    // Get work link artifacts
    const workLinkArtifacts = await Promise.all(
      interest.workLinks.map(async (artifactId) => {
        const artifact = await ctx.db.get(artifactId);
        if (!artifact) return null;

        let mediaUrl = artifact.mediaUrl || null;
        if (artifact.mediaStorageId) {
          mediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
        }

        return {
          ...artifact,
          mediaUrl,
        };
      }),
    );

    return {
      ...interest,
      workLinkArtifacts: workLinkArtifacts.filter(Boolean),
    };
  },
});
