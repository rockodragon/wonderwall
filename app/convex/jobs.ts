import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Create a new job posting
export const createJob = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    location: v.union(
      v.literal("Remote"),
      v.literal("Hybrid"),
      v.literal("On-site"),
    ),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    jobType: v.union(
      v.literal("Full-time"),
      v.literal("Part-time"),
      v.literal("Contract"),
      v.literal("Freelance"),
    ),
    visibility: v.union(v.literal("Private"), v.literal("Members")),
    hiringOrg: v.optional(v.string()),
    postAnonymously: v.optional(v.boolean()),
    compensationRange: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    disciplines: v.optional(v.array(v.string())),
    experienceLevel: v.optional(
      v.union(
        v.literal("Entry"),
        v.literal("Mid"),
        v.literal("Senior"),
        v.literal("Any"),
      ),
    ),
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

    // Validate required fields
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    if (title.length > 100) {
      throw new Error("Title must be 100 characters or less");
    }

    const description = args.description.trim();
    if (!description) throw new Error("Description is required");
    if (description.length > 5000) {
      throw new Error("Description must be 5000 characters or less");
    }

    // If location is not Remote, require city/state/country
    if (args.location !== "Remote") {
      if (!args.city || !args.state || !args.country) {
        throw new Error(
          "City, state, and country are required for non-remote positions",
        );
      }
    }

    const now = Date.now();

    const jobId = await ctx.db.insert("jobs", {
      posterId: userId,
      profileId: profile._id,
      title,
      description,
      location: args.location,
      city: args.city?.trim(),
      state: args.state?.trim(),
      country: args.country?.trim(),
      zipCode: args.zipCode?.trim(),
      jobType: args.jobType,
      visibility: args.visibility,
      hiringOrg: args.hiringOrg?.trim(),
      postAnonymously: args.postAnonymously ?? false,
      compensationRange: args.compensationRange?.trim(),
      externalLink: args.externalLink?.trim(),
      disciplines: args.disciplines,
      experienceLevel: args.experienceLevel,
      status: "Open",
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

// Update an existing job posting
export const updateJob = mutation({
  args: {
    jobId: v.id("jobs"),
    title: v.string(),
    description: v.string(),
    location: v.union(
      v.literal("Remote"),
      v.literal("Hybrid"),
      v.literal("On-site"),
    ),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    jobType: v.union(
      v.literal("Full-time"),
      v.literal("Part-time"),
      v.literal("Contract"),
      v.literal("Freelance"),
    ),
    visibility: v.union(v.literal("Private"), v.literal("Members")),
    hiringOrg: v.optional(v.string()),
    postAnonymously: v.optional(v.boolean()),
    compensationRange: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    disciplines: v.optional(v.array(v.string())),
    experienceLevel: v.optional(
      v.union(
        v.literal("Entry"),
        v.literal("Mid"),
        v.literal("Senior"),
        v.literal("Any"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get the job and check ownership
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.posterId !== userId) {
      throw new Error("Not authorized to update this job");
    }

    // Validate fields
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    if (title.length > 100) {
      throw new Error("Title must be 100 characters or less");
    }

    const description = args.description.trim();
    if (!description) throw new Error("Description is required");
    if (description.length > 5000) {
      throw new Error("Description must be 5000 characters or less");
    }

    // If location is not Remote, require city/state/country
    if (args.location !== "Remote") {
      if (!args.city || !args.state || !args.country) {
        throw new Error(
          "City, state, and country are required for non-remote positions",
        );
      }
    }

    await ctx.db.patch(args.jobId, {
      title,
      description,
      location: args.location,
      city: args.city?.trim(),
      state: args.state?.trim(),
      country: args.country?.trim(),
      zipCode: args.zipCode?.trim(),
      jobType: args.jobType,
      visibility: args.visibility,
      hiringOrg: args.hiringOrg?.trim(),
      postAnonymously: args.postAnonymously ?? false,
      compensationRange: args.compensationRange?.trim(),
      externalLink: args.externalLink?.trim(),
      disciplines: args.disciplines,
      experienceLevel: args.experienceLevel,
      updatedAt: Date.now(),
    });
  },
});

// Close a job posting
export const closeJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get the job and check ownership
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.posterId !== userId) {
      throw new Error("Not authorized to close this job");
    }

    await ctx.db.patch(args.jobId, {
      status: "Closed",
      updatedAt: Date.now(),
    });
  },
});

// Reopen a closed job posting
export const reopenJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get the job and check ownership
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.posterId !== userId) {
      throw new Error("Not authorized to reopen this job");
    }

    await ctx.db.patch(args.jobId, {
      status: "Open",
      updatedAt: Date.now(),
    });
  },
});

// Express interest in a job
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

// Withdraw interest from a job
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

// Query: List all jobs (with filters)
export const list = query({
  args: {
    status: v.optional(v.union(v.literal("Open"), v.literal("Closed"))),
    location: v.optional(
      v.union(
        v.literal("Remote"),
        v.literal("Hybrid"),
        v.literal("On-site"),
      ),
    ),
    jobType: v.optional(
      v.union(
        v.literal("Full-time"),
        v.literal("Part-time"),
        v.literal("Contract"),
        v.literal("Freelance"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    let jobs = await ctx.db.query("jobs").collect();

    // Filter by status (default to Open)
    if (args.status) {
      jobs = jobs.filter((j) => j.status === args.status);
    } else {
      jobs = jobs.filter((j) => j.status === "Open");
    }

    // Only show Members visibility jobs
    jobs = jobs.filter((j) => j.visibility === "Members");

    // Filter by location
    if (args.location) {
      jobs = jobs.filter((j) => j.location === args.location);
    }

    // Filter by jobType
    if (args.jobType) {
      jobs = jobs.filter((j) => j.jobType === args.jobType);
    }

    // Sort by most recent first
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    // Resolve poster profiles
    const jobsWithPosters = await Promise.all(
      jobs.map(async (job) => {
        const profile = await ctx.db.get(job.profileId);

        let posterName = "Anonymous";
        let posterImageUrl: string | null = null;

        if (profile && !job.postAnonymously) {
          posterName = profile.name;
          posterImageUrl = profile.imageStorageId
            ? await ctx.storage.getUrl(profile.imageStorageId)
            : profile.imageUrl || null;
        }

        // Get interest count
        const interests = await ctx.db
          .query("jobInterests")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .collect();

        return {
          ...job,
          posterName,
          posterImageUrl,
          interestCount: interests.length,
        };
      }),
    );

    return jobsWithPosters;
  },
});

// Query: Get a single job by ID
export const get = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);

    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    // Get poster profile
    const profile = await ctx.db.get(job.profileId);

    let posterName = "Anonymous";
    let posterImageUrl: string | null = null;
    let posterProfileId: string | null = null;

    if (profile && !job.postAnonymously) {
      posterName = profile.name;
      posterImageUrl = profile.imageStorageId
        ? await ctx.storage.getUrl(profile.imageStorageId)
        : profile.imageUrl || null;
      posterProfileId = profile._id;
    }

    // Get interest count
    const interests = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Check if current user has expressed interest
    const userInterest = userId
      ? interests.find((i) => i.userId === userId)
      : null;

    // Check if current user is the poster
    const isPoster = userId === job.posterId;

    return {
      ...job,
      posterName,
      posterImageUrl,
      posterProfileId,
      interestCount: interests.length,
      userInterest,
      isPoster,
    };
  },
});

// Query: Get jobs posted by current user
export const getMyJobs = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_posterId", (q) => q.eq("posterId", userId))
      .collect();

    // Sort by most recent first
    jobs.sort((a, b) => b.createdAt - a.createdAt);

    // Get interest counts for each job
    const jobsWithInterests = await Promise.all(
      jobs.map(async (job) => {
        const interests = await ctx.db
          .query("jobInterests")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .collect();

        return {
          ...job,
          interestCount: interests.length,
        };
      }),
    );

    return jobsWithInterests;
  },
});

// Query: Get interests for a job (for job poster only)
export const getInterests = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    // Verify user is the job poster
    const job = await ctx.db.get(args.jobId);
    if (!job || job.posterId !== userId) {
      return [];
    }

    const interests = await ctx.db
      .query("jobInterests")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Get profile and artifact details for each interest
    const interestsWithDetails = await Promise.all(
      interests.map(async (interest) => {
        const profile = await ctx.db.get(interest.profileId);

        let profileImageUrl: string | null = null;
        if (profile?.imageStorageId) {
          profileImageUrl = await ctx.storage.getUrl(profile.imageStorageId);
        } else if (profile?.imageUrl) {
          profileImageUrl = profile.imageUrl;
        }

        // Resolve work links
        const workSamples = await Promise.all(
          interest.workLinks.map(async (artifactId) => {
            const artifact = await ctx.db.get(artifactId);
            if (!artifact) return null;

            let mediaUrl = artifact.mediaUrl || null;
            if (artifact.mediaStorageId) {
              mediaUrl = await ctx.storage.getUrl(artifact.mediaStorageId);
            }

            return {
              _id: artifact._id,
              type: artifact.type,
              title: artifact.title,
              content: artifact.content,
              mediaUrl,
              ogImageUrl: artifact.ogImageUrl,
            };
          }),
        );

        return {
          ...interest,
          profile: profile
            ? {
                _id: profile._id,
                name: profile.name,
                bio: profile.bio,
                imageUrl: profileImageUrl,
              }
            : null,
          workSamples: workSamples.filter(Boolean),
        };
      }),
    );

    // Sort by most recent first
    interestsWithDetails.sort((a, b) => b.createdAt - a.createdAt);

    return interestsWithDetails;
  },
});
