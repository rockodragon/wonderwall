import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getOrCreatePreferences, type EmailCategory } from "./emailPreferences";

/**
 * Look up a user's email — first from the users table (OAuth),
 * then fall back to profile attributes.
 */
export async function getUserEmail(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<string | null> {
  // Primary: email from OAuth on users table
  const user = await ctx.db.get(userId);
  if (user?.email) return user.email;

  // Fallback: email from profile attributes
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  if (!profile) return null;

  const emailAttr = await ctx.db
    .query("attributes")
    .withIndex("by_profileId_key", (q) =>
      q.eq("profileId", profile._id).eq("key", "email"),
    )
    .first();

  return emailAttr?.value || null;
}

/**
 * Schedule a notification email if the user has an email on file.
 *
 * `category` gates non-transactional email against the recipient's saved
 * preferences (convex/emailPreferences.ts): a false preference for that
 * category means this returns without scheduling anything. "transactional"
 * email (waitlist approval, team invite claim links) has no opt-out, so it
 * skips the preferences lookup and carries no unsubscribe token.
 */
export async function scheduleNotificationEmail(
  ctx: MutationCtx,
  opts: {
    userId: Id<"users">;
    subject: string;
    previewText: string;
    heading: string;
    body: string;
    ctaText?: string;
    ctaUrl?: string;
    category: EmailCategory | "transactional";
  },
) {
  const email = await getUserEmail(ctx, opts.userId);
  if (!email) return;

  let unsubscribeToken: string | undefined;
  if (opts.category !== "transactional") {
    const prefs = await getOrCreatePreferences(ctx, opts.userId);
    if (!prefs[opts.category]) return;
    unsubscribeToken = prefs.unsubscribeToken;
  }

  await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
    to: email,
    subject: opts.subject,
    previewText: opts.previewText,
    heading: opts.heading,
    body: opts.body,
    ctaText: opts.ctaText,
    ctaUrl: opts.ctaUrl,
    category: opts.category,
    unsubscribeToken,
  });
}
