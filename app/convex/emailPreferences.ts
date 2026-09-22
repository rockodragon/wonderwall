// Per-user email opt-outs by category. A missing row means every category
// is on — this table only ever records an explicit "I turned this off."
// "transactional" email (waitlist approval, team invite claim links) has no
// opt-out and never touches this table.
//
// No "use node" — crypto.getRandomValues is available in Convex's V8
// runtime (same as garden/projectTeam.ts's crypto.randomUUID() claim
// tokens), so this stays importable from mutations/queries directly.

import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";

const categoryValidator = v.union(
  v.literal("activity"),
  v.literal("digest"),
  v.literal("announcements"),
);
export type EmailCategory = "activity" | "digest" | "announcements";

function generateToken(): string {
  const bytes = new Uint8Array(16); // 16 bytes -> 32 hex chars
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates an all-true preferences row for a user who doesn't have one yet,
 * or returns their existing row. Used by scheduleNotificationEmail (which
 * needs a token to put in the email footer) and by the get/update mutations
 * below. */
export async function getOrCreatePreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"emailPreferences">> {
  const existing = await ctx.db
    .query("emailPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing;

  const now = Date.now();
  const _id = await ctx.db.insert("emailPreferences", {
    userId,
    activity: true,
    digest: true,
    announcements: true,
    unsubscribeToken: generateToken(),
    updatedAt: now,
  });
  const created = await ctx.db.get(_id);
  if (!created) throw new Error("Failed to create email preferences row");
  return created;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const row = await ctx.db
      .query("emailPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!row) {
      return { activity: true, digest: true, announcements: true };
    }
    return {
      activity: row.activity,
      digest: row.digest,
      announcements: row.announcements,
    };
  },
});

export const update = mutation({
  args: {
    category: categoryValidator,
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const row = await getOrCreatePreferences(ctx, userId);
    await ctx.db.patch(row._id, {
      [args.category]: args.enabled,
      updatedAt: Date.now(),
    });
  },
});

// Public, no auth — the token itself is the credential (it's what the
// email footer link carries). Returns null rather than throwing on an
// unknown token so an expired/garbled link fails quietly on the frontend.
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailPreferences")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", args.token))
      .unique();
    if (!row) return null;
    return {
      activity: row.activity,
      digest: row.digest,
      announcements: row.announcements,
    };
  },
});

// Public, no auth. No category = turn off all three (the RFC 8058
// one-click unsubscribe target, and the plain "unsubscribe" link).
export const unsubscribeByToken = mutation({
  args: { token: v.string(), category: v.optional(categoryValidator) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("emailPreferences")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", args.token))
      .unique();
    if (!row) return { ok: false };

    if (args.category) {
      await ctx.db.patch(row._id, { [args.category]: false, updatedAt: Date.now() });
    } else {
      await ctx.db.patch(row._id, {
        activity: false,
        digest: false,
        announcements: false,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});
