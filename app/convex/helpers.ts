import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// Admin emails - can be extended or moved to env vars later
const ADMIN_EMAILS = ["rickmoy@gmail.com"];

/**
 * Check if a user is an admin by their user ID
 * @param ctx - Convex query or mutation context
 * @param userId - The user ID to check
 * @returns true if the user is an admin
 */
export async function isAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;

  const email = "email" in user ? user.email : null;
  if (!email || typeof email !== "string") return false;

  return ADMIN_EMAILS.includes(email);
}

/**
 * Check if the current user email is an admin (for use with raw user objects)
 * @param user - The user document
 * @returns true if the user is an admin
 */
export function isAdminUser(user: Doc<"users"> | null): boolean {
  if (!user) return false;

  const email = "email" in user ? user.email : null;
  if (!email || typeof email !== "string") return false;

  return ADMIN_EMAILS.includes(email);
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
  const isUserAdmin = await isAdmin(ctx, userId);
  if (!isUserAdmin) {
    throw new Error("Unauthorized - Admin access only");
  }
}
