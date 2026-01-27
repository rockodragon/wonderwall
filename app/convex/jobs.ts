import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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

    // Get poster profile info and interest counts for each job
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

        // Get interest count
        const interests = await ctx.db
          .query("jobInterests")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .collect();

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

/**
 * Close a job (poster only)
 */
export const closeJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    if (job.posterId !== userId) {
      throw new Error("Only the poster can close this job");
    }

    await ctx.db.patch(args.jobId, {
      status: "Closed",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reopen a closed job (poster only)
 */
export const reopenJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    if (job.posterId !== userId) {
      throw new Error("Only the poster can reopen this job");
    }

    await ctx.db.patch(args.jobId, {
      status: "Open",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Express interest in a job
 */
export const expressInterest = mutation({
  args: {
    jobId: v.id("jobs"),
    note: v.optional(v.string()),
    workLinks: v.array(v.id("artifacts")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get user's profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!profile) throw new Error("Profile not found");

    // Get the job and validate it's available
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    // Check job is Open
    if (job.status !== "Open") {
      throw new Error("This job is no longer accepting interest");
    }

    // Check job is visible (Members visibility means visible to all logged-in users)
    if (job.visibility !== "Members") {
      throw new Error("This job is not accepting interest");
    }

    // Validate note length
    if (args.note && args.note.trim().length > 500) {
      throw new Error("Note must be 500 characters or less");
    }

    // Validate workLinks max 3
    if (args.workLinks.length > 3) {
      throw new Error("You can select up to 3 work samples");
    }

    // Verify all workLinks belong to the user
    for (const artifactId of args.workLinks) {
      const artifact = await ctx.db.get(artifactId);
      if (!artifact) {
        throw new Error("Work sample not found");
      }
      if (artifact.profileId !== profile._id) {
        throw new Error("Work sample does not belong to you");
      }
    }

    // Check if user has already expressed interest
    const existing = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId_userId", (q) =>
        q.eq("jobId", args.jobId).eq("userId", userId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing interest
      await ctx.db.patch(existing._id, {
        note: args.note?.trim(),
        workLinks: args.workLinks,
        updatedAt: now,
      });
    } else {
      // Create new interest
      await ctx.db.insert("jobInterests", {
        jobId: args.jobId,
        userId,
        profileId: profile._id,
        note: args.note?.trim(),
        workLinks: args.workLinks,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Withdraw interest from a job
 */
export const withdrawInterest = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Find the user's interest record
    const interest = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId_userId", (q) =>
        q.eq("jobId", args.jobId).eq("userId", userId),
      )
      .first();

    if (!interest) {
      throw new Error("You have not expressed interest in this job");
    }

    // Delete the interest record
    await ctx.db.delete(interest._id);
  },
});
