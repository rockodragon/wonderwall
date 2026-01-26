import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
      return { success: true, message: "You're already on the waitlist!" };
    }

    // Add to waitlist
    await ctx.db.insert("waitlist", {
      email,
      createdAt: Date.now(),
    });

    return {
      success: true,
      message: "Thanks! We'll be in touch soon.",
    };
  },
});
