import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { auth } from "./auth";

/**
 * Check if a user is an admin by their user ID
 * Checks the isAdmin field on their profile
 * @param ctx - Convex query or mutation context
 * @param userId - The user ID to check
 * @returns true if the user is an admin
 */
export async function isAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  return profile?.isAdmin === true;
}

/**
 * Check if a profile is an admin (for use with raw profile objects)
 * @param profile - The profile document
 * @returns true if the profile is an admin
 */
export function isAdminProfile(profile: Doc<"profiles"> | null): boolean {
  return profile?.isAdmin === true;
}

/**
 * Require admin access - throws if user is not an admin
 * @param ctx - Convex query or mutation context
 * @param userId - The user ID to check
 * @throws Error if user is not an admin
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const userIsAdmin = await isAdmin(ctx, userId);
  if (!userIsAdmin) {
    throw new Error("Unauthorized - Admin access only");
  }
}

/**
 * Internal query wrapper around requireAdmin, for use inside `action` handlers.
 *
 * Actions don't have `ctx.db` (their ctx is not a QueryCtx | MutationCtx), so
 * requireAdmin can't be called directly from an action. Actions do have
 * `ctx.auth`, so the caller should resolve the userId there (e.g. via
 * `auth.getUserId(ctx)`) and then run this through `ctx.runQuery` to perform
 * the actual admin check against the database.
 */
export const requireAdminForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx, args.userId);
  },
});

/**
 * One-liner for query/mutation handlers: resolve the caller's userId from
 * ctx.auth and require admin access. Replaces the repeated
 *   const userId = await auth.getUserId(ctx);
 *   if (!userId) throw new Error("Not authenticated");
 *   await requireAdmin(ctx, userId);
 * preamble. Returns the userId in case a handler needs it.
 * @throws Error if there's no caller identity, or if the caller isn't an admin
 */
export async function requireAdminCtx(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await auth.getUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  await requireAdmin(ctx, userId);
  return userId;
}

const ADMIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/**
 * The admin's fixed waitlist-approval code (profiles.adminCode): part of
 * their name, uppercased, padded with random characters to 6, unique
 * against both adminCode and inviteSlug (they resolve at the same
 * /signup/:code route — see invites.ts's findInviterProfile). Generates
 * and persists one on first call; every later call for the same profile
 * returns the same code, so an admin's approvals all carry one code.
 */
export async function ensureAdminCode(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
): Promise<string> {
  // The code has to be reusable across every waitlist approval this admin
  // makes, so it can't be subject to the normal 3-invite progressive cap
  // (getInviteLimit in invites.ts) — unlimitedInvites is what exempts a
  // profile from that check in redeemBySlug. Guaranteed here, alongside the
  // code itself, rather than left to callers to remember.
  if (profile.adminCode) {
    if (!profile.unlimitedInvites) {
      await ctx.db.patch(profile._id, { unlimitedInvites: true });
    }
    return profile.adminCode;
  }

  const prefix = profile.name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4) || "MBR";

  const takenCandidate = async (candidate: string) => {
    const [bySlug, byCode] = await Promise.all([
      ctx.db
        .query("profiles")
        .withIndex("by_inviteSlug", (q) => q.eq("inviteSlug", candidate))
        .first(),
      ctx.db
        .query("profiles")
        .withIndex("by_adminCode", (q) => q.eq("adminCode", candidate))
        .first(),
    ]);
    return bySlug !== null || byCode !== null;
  };

  let code = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffixLen = 6 - prefix.length;
    let suffix = "";
    for (let i = 0; i < suffixLen; i++) {
      suffix +=
        ADMIN_CODE_CHARS[Math.floor(Math.random() * ADMIN_CODE_CHARS.length)];
    }
    const candidate = prefix + suffix;
    if (!(await takenCandidate(candidate))) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("Could not generate a unique admin code");

  await ctx.db.patch(profile._id, { adminCode: code, unlimitedInvites: true });
  return code;
}
