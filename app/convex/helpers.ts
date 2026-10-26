import { ConvexError, v } from "convex/values";
import type { Auth } from "convex/server";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { auth } from "./auth";
import { fail } from "./errors";
import { hasRealName } from "./names";

/**
 * The signed-in person's user id, or null when signed out. For a query that
 * shows a signed-out visitor nothing (null / []); use requireUserId when
 * signed out is a refusal.
 *
 * The one place that asks. It goes through ./auth (the same answer as
 * getAuthUserId) because tests stand in for the signed-in person by mocking
 * that module.
 */
export async function currentUserId(ctx: { auth: Auth }): Promise<Id<"users"> | null> {
  return await auth.getUserId(ctx);
}

/**
 * The signed-in person's user id. Signed out is refused with
 * `ConvexError({ code: "unauthenticated", reason: "Sign in first." })`,
 * which the page can read (isNotSignedIn), unlike a plain Error.
 */
export async function requireUserId(ctx: { auth: Auth }): Promise<Id<"users">> {
  const userId = await currentUserId(ctx);
  if (!userId) fail("unauthenticated", "Sign in first.");
  return userId;
}

/**
 * A person's profile, by their user id, or null when they have none. The one
 * lookup: `.first()`, so a person who somehow has two profiles still gets
 * one instead of an error (`.unique()` throws).
 */
export async function getProfileByUserId(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

/** The signed-in person's own profile, for a change that needs one. No
 * profile yet is refused with `no_profile` ("Finish your profile first."). */
export async function requireProfile(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const profile = await getProfileByUserId(ctx, userId);
  if (!profile) fail("no_profile", "Finish your profile first.");
  return profile;
}

/** A person's name for a line about them ("Ada joined …"), or `fallback`
 * when they have no profile or haven't named themselves yet. */
export async function displayNameOf(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
  fallback = "Someone",
): Promise<string> {
  const name = (await getProfileByUserId(ctx, userId))?.name;
  return name && hasRealName(name) ? name.trim() : fallback;
}

/** How to reach a person, off their sign-in (users) row: the email and the
 * phone, either of which may be missing (a phone sign-up has no email).
 * For admin views only. */
export function contactOf(user: Doc<"users"> | null): { email?: string; phone?: string } {
  return { email: user?.email || undefined, phone: user?.phone || undefined };
}

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
  const profile = await getProfileByUserId(ctx, userId);

  return profile?.isAdmin === true;
}

/** The ownership rule: `userId` is the owner, or is a platform admin. What
 * requireOwner applies, and what a check on another owner field (a gig
 * series' hostUserId, a project handed in as a doc) applies in its own words. */
export async function isOwnerOrAdmin(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  userId: Id<"users">,
): Promise<boolean> {
  return ownerId === userId || (await isAdmin(ctx, userId));
}

/** What a refusal says, per kind of thing a person owns. */
const OWNED = {
  projects: { notFound: "That project isn't here.", forbidden: "Only the person who runs this project can change it." },
  offerings: { notFound: "No such offering.", forbidden: "Creator-only." },
} as const;

/**
 * The one ownership check for projects and classes: the signed-in person
 * and the row, when it's theirs (row.userId) — or, with `orAdmin`, when
 * they're a platform admin. Everyone else is refused with a ConvexError
 * the client can show.
 */
export async function requireOwner<T extends keyof typeof OWNED>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  id: Id<T>,
  { orAdmin = false }: { orAdmin?: boolean } = {},
): Promise<{ userId: Id<"users">; row: Doc<T> }> {
  const userId = await requireUserId(ctx);
  const row = (await ctx.db.get(id)) as Doc<T> | null;
  if (!row) throw new ConvexError({ code: "not_found", reason: OWNED[table].notFound });
  const mayChange = orAdmin ? await isOwnerOrAdmin(ctx, row.userId, userId) : row.userId === userId;
  if (!mayChange) {
    throw new ConvexError({ code: "forbidden", reason: OWNED[table].forbidden });
  }
  return { userId, row };
}

/** Things on a profile, and what a missing one says. */
const ON_PROFILE = {
  artifacts: "Artifact not found",
  links: "Link not found",
  wonderings: "Wondering not found",
} as const;

/**
 * The one check for changing something on a profile (a piece, a link, a
 * wondering): it has to be on the signed-in person's own profile. Returns
 * them, the row and the profile.
 */
export async function requireOwnProfileRow<T extends keyof typeof ON_PROFILE>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  id: Id<T>,
): Promise<{ userId: Id<"users">; row: Doc<T>; profile: Doc<"profiles"> }> {
  const userId = await requireUserId(ctx);
  const row = (await ctx.db.get(id)) as Doc<T> | null;
  if (!row) fail("not_found", ON_PROFILE[table]);
  const profile = await ctx.db.get(row.profileId as Id<"profiles">);
  if (!profile || profile.userId !== userId) fail("forbidden", "That isn't on your profile.");
  return { userId, row, profile };
}

/**
 * Check if a profile is an admin (for use with raw profile objects)
 * @param profile - The profile document
 * @returns true if the profile is an admin
 */
export function isAdminProfile(profile: Doc<"profiles"> | null): boolean {
  return profile?.isAdmin === true;
}

/** What a refusal says to someone who isn't an operator. */
const NOT_AN_OPERATOR = "This is an operator tool — this account doesn't have that access.";

/**
 * The one operator gate: the signed-in person and their profile, when the
 * profile is an admin (profile.isAdmin). Signed out is "unauthenticated",
 * anyone else is "forbidden" — ConvexErrors the client can read. Every
 * operator-only query and mutation goes through this, or through
 * requireAdmin / requireAdminCtx below, which are the same check.
 */
export async function requireOperator(
  ctx: QueryCtx | MutationCtx,
): Promise<{ userId: Id<"users">; profile: Doc<"profiles"> }> {
  const userId = await requireUserId(ctx);
  const profile = await getProfileByUserId(ctx, userId);
  if (!profile || !isAdminProfile(profile)) {
    throw new ConvexError({ code: "forbidden", reason: NOT_AN_OPERATOR });
  }
  return { userId, profile };
}

/**
 * Require admin access for a user you already have - throws if they aren't
 * @param ctx - Convex query or mutation context
 * @param userId - The user ID to check
 * @throws ConvexError "forbidden" if the user is not an admin
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (!(await isAdmin(ctx, userId))) {
    throw new ConvexError({ code: "forbidden", reason: NOT_AN_OPERATOR });
  }
}

/**
 * Internal query wrapper around requireAdmin, for use inside `action` handlers.
 *
 * Actions don't have `ctx.db` (their ctx is not a QueryCtx | MutationCtx), so
 * requireAdmin can't be called directly from an action. Actions do have
 * `ctx.auth`, so the caller should resolve the userId there (e.g. via
 * `requireUserId(ctx)`) and then run this through `ctx.runQuery` to perform
 * the actual admin check against the database.
 */
export const requireAdminForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<void> => {
    await requireAdmin(ctx, args.userId);
  },
});

/**
 * One-liner for query/mutation handlers that only need the admin's userId:
 * requireOperator, handing back just the id.
 * @throws ConvexError "unauthenticated" if signed out, "forbidden" if the
 * caller isn't an admin
 */
export async function requireAdminCtx(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  return (await requireOperator(ctx)).userId;
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
