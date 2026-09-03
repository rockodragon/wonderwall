import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAdminCtx, ensureAdminCode } from "./helpers";

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

// Everyone on the list, with their "move up the list" answers, for the
// admin waitlist table (routes/admin.waitlist.tsx). Ordered the same way
// rankOf ranks an individual entry, so the admin view and an applicant's
// own position agree.
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminCtx(ctx);

    const all = await ctx.db.query("waitlist").collect();
    const sorted = [...all].sort((a, b) => {
      const scoreA = a.priorityScore ?? 0;
      const scoreB = b.priorityScore ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.createdAt - b.createdAt;
    });

    const approverIds = [
      ...new Set(
        sorted
          .map((w) => w.approvedBy)
          .filter((id): id is Id<"users"> => id !== undefined),
      ),
    ];
    const approverNames = new Map<Id<"users">, string>();
    for (const id of approverIds) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", id))
        .first();
      if (profile) approverNames.set(id, profile.name);
    }

    return sorted.map((w, i) => ({
      _id: w._id,
      email: w.email,
      createdAt: w.createdAt,
      answeredAt: w.answeredAt,
      rank: i + 1,
      priorityScore: w.priorityScore ?? 0,
      role: w.role,
      projectDescription: w.projectDescription,
      projectUrl: w.projectUrl,
      hasLaunchProject: w.hasLaunchProject,
      portfolioUrl: w.portfolioUrl,
      interestedInHosting: w.interestedInHosting,
      hearAboutUs: w.hearAboutUs,
      hearAboutUsOther: w.hearAboutUsOther,
      approved: w.approvedBy !== undefined,
      approvedAt: w.approvedAt,
      approvedByName: w.approvedBy
        ? (approverNames.get(w.approvedBy) ?? "Admin")
        : undefined,
    }));
  },
});

// Approves one waitlist entry: records who approved it, and emails the
// applicant the approving admin's fixed code (profiles.adminCode,
// generated on first use here if they don't have one yet) so they can
// sign up at /signup/:code — the same route a peer invite lands on, since
// invites.ts's findInviterProfile resolves either kind of code. Idempotent:
// a second call on an already-approved entry is a no-op, so a double click
// or two admins racing on the same row doesn't re-send the email or
// overwrite who approved it first.
export const approveEntry = mutation({
  args: { waitlistId: v.id("waitlist") },
  handler: async (ctx, args) => {
    const adminUserId = await requireAdminCtx(ctx);

    const entry = await ctx.db.get(args.waitlistId);
    if (!entry) throw new Error("Waitlist entry not found");
    if (entry.approvedBy !== undefined) {
      return { alreadyApproved: true, code: undefined };
    }

    const adminProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", adminUserId))
      .first();
    if (!adminProfile) throw new Error("Admin profile not found");

    const code = await ensureAdminCode(ctx, adminProfile);

    await ctx.db.patch(entry._id, {
      approvedBy: adminUserId,
      approvedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
      to: entry.email,
      subject: "You're approved for creatives.exchange",
      previewText: "Your invite code is ready — come on in.",
      heading: "You're in!",
      body: `Good news — you're approved to join The Exchange. Use invite code <strong>${code}</strong> when you sign up, or just tap the button below and it'll be filled in for you.`,
      ctaText: "Create your account",
      ctaUrl: `/signup/${code}`,
    });

    return { alreadyApproved: false, code };
  },
});
