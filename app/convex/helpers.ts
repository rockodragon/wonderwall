import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

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
