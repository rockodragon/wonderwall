// Support widget (docs/the-exchange-v1-prd.md §9, revised 2026-08-30). Four
// types in one record: financial one-time/recurring, encouragement,
// resource. Financial support is UX-only for now, on purpose — no Stripe,
// no payment link required, no money actually moves. It records a pledge
// (status "pledged") the same way a real gift will later; the only thing
// that changes when real checkout lands is what happens after submit.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

const FINANCIAL_TYPES = new Set(["financial_one_time", "financial_recurring"]);
const VALID_TYPES = new Set([...FINANCIAL_TYPES, "encouragement", "resource"]);

export const supportProject = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.string(),
    amountCents: v.optional(v.number()),
    message: v.optional(v.string()),
    resourceDescription: v.optional(v.string()),
    visible: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    if (!VALID_TYPES.has(args.type)) {
      throw new ConvexError({ code: "invalid_type", reason: "Not a real support type." });
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError({ code: "not_found", reason: "No such project." });

    if (FINANCIAL_TYPES.has(args.type)) {
      if (!args.amountCents || args.amountCents <= 0) {
        throw new ConvexError({ code: "invalid_amount", reason: "Needs a real amount." });
      }
    }
    if (args.type === "resource" && !args.resourceDescription?.trim()) {
      throw new ConvexError({ code: "missing_description", reason: "Say what you're offering." });
    }
    if (args.type === "encouragement" && !args.message?.trim()) {
      throw new ConvexError({ code: "missing_message", reason: "Write a word of encouragement." });
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const supportId = await ctx.db.insert("projectSupport", {
      projectId: args.projectId,
      supporterUserId: userId,
      supporterName: profile?.name ?? "Someone",
      type: args.type,
      amountCents: args.amountCents,
      message: args.message?.trim() || undefined,
      resourceDescription: args.resourceDescription?.trim() || undefined,
      visible: args.visible,
      // Encouragement/resource are real the moment they're posted. Financial
      // pledges are real intent, not received money — "pledged" until a
      // future real-checkout pass changes what happens after submit.
      status: FINANCIAL_TYPES.has(args.type) ? "pledged" : "confirmed",
      createdAt: Date.now(),
    });

    return { supportId };
  },
});

const VISIBLE_STATUSES = new Set(["confirmed", "pledged"]);

export const listSupportForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("projectSupport")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    return entries
      .filter((e) => VISIBLE_STATUSES.has(e.status))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((e) => ({
        _id: e._id,
        projectId: e.projectId,
        type: e.type,
        amountCents: e.amountCents,
        message: e.message,
        resourceDescription: e.resourceDescription,
        status: e.status,
        createdAt: e.createdAt,
        // Explicit allowlist, not a spread: someone who asked to give
        // anonymously (visible: false) must not have their identity
        // reach the client at all — a masked name alone still leaked
        // supporterUserId to anyone who opened the Support modal.
        supporterName: e.visible ? e.supporterName : "Anonymous",
        ...(e.visible ? { supporterUserId: e.supporterUserId } : {}),
      }));
  },
});

// Operator-only: mark a pending financial pledge as received. No Stripe
// webhook in V1 (PRD §9) — this is the manual confirmation step.
export const confirmSupport = mutation({
  args: { supportId: v.id("projectSupport") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile?.isAdmin) {
      throw new ConvexError({ code: "forbidden", reason: "Operator-only." });
    }

    const entry = await ctx.db.get(args.supportId);
    if (!entry) throw new ConvexError({ code: "not_found" });
    await ctx.db.patch(args.supportId, { status: "confirmed" });
    return { ok: true };
  },
});
