import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

function computePriorityScore(a: {
  role?: string;
  projectDescription?: string;
  projectUrl?: string;
  hasLaunchProject?: boolean;
  portfolioUrl?: string;
  interestedInHosting?: boolean;
  hearAboutUs?: string;
}) {
  let score = 0;
  if (a.role) score += 10;
  if (a.projectDescription?.trim()) score += 10;
  if (a.projectUrl?.trim()) score += 10;
  if (a.hasLaunchProject && a.portfolioUrl?.trim()) score += 15;
  if (a.interestedInHosting) score += 10;
  if (a.hearAboutUs?.trim()) score += 5;
  return score;
}

// O(n) over the whole table — fine at waitlist scale (hundreds/low
// thousands of rows pre-launch); revisit if that changes.
async function rankOf(ctx: QueryCtx, entry: Doc<"waitlist">) {
  const all = await ctx.db.query("waitlist").collect();
  const score = entry.priorityScore ?? 0;
  const ahead = all.filter((w) => {
    const wScore = w.priorityScore ?? 0;
    if (wScore !== score) return wScore > score;
    return w.createdAt < entry.createdAt;
  }).length;
  return ahead + 1;
}

export const addToWaitlist = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    // Check if email already exists
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existing) {
      return {
        success: true,
        message: "You're already on the waitlist!",
        position: await rankOf(ctx, existing),
      };
    }

    // Add to waitlist
    const id = await ctx.db.insert("waitlist", {
      email,
      createdAt: Date.now(),
      priorityScore: 0,
    });
    const entry = await ctx.db.get(id);

    return {
      success: true,
      message: "Thanks! We'll be in touch soon.",
      position: entry ? await rankOf(ctx, entry) : null,
    };
  },
});

export const answerWaitlistQuestions = mutation({
  args: {
    email: v.string(),
    role: v.optional(
      v.union(v.literal("creative"), v.literal("patron"), v.literal("partner")),
    ),
    projectDescription: v.optional(v.string()),
    projectUrl: v.optional(v.string()),
    hasLaunchProject: v.optional(v.boolean()),
    portfolioUrl: v.optional(v.string()),
    interestedInHosting: v.optional(v.boolean()),
    hearAboutUs: v.optional(v.string()),
    hearAboutUsOther: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!existing) {
      throw new Error("We couldn't find that email on the waitlist.");
    }

    const answers = {
      role: args.role,
      projectDescription: args.projectDescription?.trim() || undefined,
      projectUrl: args.projectUrl?.trim() || undefined,
      hasLaunchProject: args.hasLaunchProject,
      portfolioUrl: args.portfolioUrl?.trim() || undefined,
      interestedInHosting: args.interestedInHosting,
      hearAboutUs: args.hearAboutUs,
      hearAboutUsOther: args.hearAboutUsOther?.trim() || undefined,
    };

    await ctx.db.patch(existing._id, {
      ...answers,
      priorityScore: computePriorityScore(answers),
      answeredAt: Date.now(),
    });

    const updated = await ctx.db.get(existing._id);
    return {
      success: true,
      position: updated ? await rankOf(ctx, updated) : null,
    };
  },
});
