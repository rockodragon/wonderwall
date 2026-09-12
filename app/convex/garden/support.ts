// Support widget (docs/the-exchange-v1-prd.md §9, revised 2026-08-30). Four
// types in one record: financial one-time/recurring, encouragement,
// resource.
//
// Real checkout has landed for the two FINANCIAL types: the Support modal
// (app/routes/projects.tsx) now calls garden/stripe.ts's
// createBackingCheckout, which writes its projectSupport row through
// startBacking below (status "pending") and lets the Stripe webhook confirm
// it (garden/stripeHandlers.ts's handleBackingCheckoutCompleted). Money
// really moves there. supportProject stays the path for encouragement and
// resource offers — no money, real the moment they're posted — and keeps its
// original financial branch for the operator/manual lane (confirmSupport).
//
// STATUS VOCABULARY (a real, pre-existing inconsistency, named here rather
// than papered over): schema.ts documents projectSupport.status as
// "pending" | "confirmed", supportProject writes "pledged" for financial
// intent, and VISIBLE_STATUSES below reads "confirmed" | "pledged". All
// three disagree. The new backing path deliberately uses the schema's own
// pair — "pending" until Stripe confirms, then "confirmed" — so an
// abandoned checkout shows up nowhere ("pending" is in neither
// VISIBLE_STATUSES nor garden/projects.ts's confirmed-only filter). Fixing
// the older "pledged" rows is a schema-owner call, not this file's.

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
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
      // Encouragement/resource are real the moment they're posted.
      // Financial here is the legacy/manual pledge lane only — real card
      // money now goes through startBacking below ("pending" → "confirmed"),
      // never this branch. "pledged" is kept verbatim so the rows written
      // before checkout existed keep reading the same in the modal.
      // (See this file's header: schema.ts says "pending" | "confirmed";
      // this value matches neither. Named, not silently changed.)
      status: FINANCIAL_TYPES.has(args.type) ? "pledged" : "confirmed",
      createdAt: Date.now(),
    });

    return { supportId };
  },
});

// ——— Backing checkout support (garden/stripe.ts's createBackingCheckout) ———

/** Validates the project and writes the "pending" projectSupport row a
 * backing checkout will confirm, in one round trip (an action has no ctx.db
 * of its own). Returns null — never throws — when the project is gone or
 * archived, so the action can raise its own ConvexError with a reason the
 * modal can show, exactly like memberships.ts's getProductForCheckout.
 *
 * The row is written BEFORE the redirect on purpose: it's what gives the
 * webhook a row id to converge on (projectSupport has no stripeRef column),
 * and it carries the message/visibility captured at intent time. An
 * abandoned checkout leaves a "pending" row that is visible nowhere and
 * counted nowhere — that's the whole reason "pending" is the right status
 * for it. */
export const startBacking = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    amountCents: v.number(),
    recurring: v.boolean(),
    visible: v.boolean(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.status === "archived") return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const supporterName = profile?.name ?? "Someone";

    const supportId = await ctx.db.insert("projectSupport", {
      projectId: args.projectId,
      supporterUserId: args.userId,
      supporterName,
      type: args.recurring ? "financial_recurring" : "financial_one_time",
      amountCents: args.amountCents,
      message: args.message?.trim() || undefined,
      visible: args.visible,
      status: "pending", // → "confirmed" when Stripe says the money moved
      createdAt: Date.now(),
    });

    return { supportId, supporterName, projectTitle: project.title };
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
