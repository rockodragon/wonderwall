// Internal-only tool: merges one or more "source" accounts into a "target"
// account. Built for the situation Part 1 of the Google/password linking
// work can't fully resolve on its own — two users already exist for the
// same person (e.g. they signed up with a password, then years later with
// Google under a *different* verified email that later turned out to be
// the same person, or a support case needs to combine two accounts by
// hand). Never callable from a client: internalMutation only, run from the
// Convex dashboard or `npx convex run` by an operator.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Every table with a `v.id("users")` field whose rows count as "real
// content" on an account (i.e. NOT just the account's own empty profile or
// its auth plumbing). Regenerate by grepping `v.id("users")` in
// convex/schema.ts — kept as an explicit, reviewable list rather than
// introspecting the schema's validator tree at runtime.
const USER_ID_FIELDS: { table: string; field: string; array?: boolean }[] = [
  { table: "wonderingResponses", field: "responderId" },
  { table: "events", field: "organizerId" },
  { table: "eventApplications", field: "applicantId" },
  { table: "invites", field: "inviterId" },
  { table: "invites", field: "usedBy" },
  { table: "profileViews", field: "viewerId" },
  { table: "profileLikes", field: "userId" },
  { table: "artifactLikes", field: "userId" },
  { table: "favorites", field: "userId" },
  { table: "waitlist", field: "approvedBy" },
  { table: "showcaseApplications", field: "decidedBy" },
  { table: "showcaseVotes", field: "userId" },
  { table: "jobs", field: "posterId" },
  { table: "jobInterests", field: "userId" },
  { table: "conversations", field: "participants", array: true },
  { table: "messages", field: "senderId" },
  { table: "blocks", field: "blockerId" },
  { table: "blocks", field: "blockedId" },
  { table: "notifications", field: "userId" },
  { table: "notifications", field: "relatedUserId" },
  { table: "reports", field: "reporterId" },
  { table: "reports", field: "reportedUserId" },
  { table: "reports", field: "reviewedBy" },
  { table: "crawlerRuns", field: "triggeredBy" },
  { table: "hostOrgs", field: "ownerUserId" },
  { table: "communityMembers", field: "userId" },
  { table: "billingCustomers", field: "userId" },
  { table: "memberships", field: "userId" },
  { table: "coverageRedemptions", field: "userId" },
  { table: "projects", field: "userId" },
  { table: "projectMembers", field: "userId" },
  { table: "projectMembers", field: "invitedByUserId" },
  { table: "projectSupport", field: "supporterUserId" },
  { table: "offerings", field: "userId" },
  { table: "offerings", field: "pausedBy" },
  { table: "offeringReports", field: "reporterId" },
  { table: "offeringReports", field: "resolvedBy" },
  { table: "offeringSignups", field: "userId" },
  { table: "gardenTables", field: "hostUserId" },
  { table: "tableMemberships", field: "userId" },
  { table: "sessionRsvps", field: "userId" },
  { table: "eventRsvps", field: "userId" },
  { table: "ticketPurchases", field: "userId" },
  { table: "grantContributions", field: "userId" },
  { table: "grantProposals", field: "userId" },
  { table: "grantProposals", field: "decidedByUserId" },
  { table: "productPurchases", field: "userId" },
  { table: "backingPayments", field: "payeeUserId" },
  { table: "backingPayments", field: "backerUserId" },
  { table: "classPayments", field: "payeeUserId" },
  { table: "classPayments", field: "buyerUserId" },
  { table: "creativePayouts", field: "payeeUserId" },
  { table: "creativePayouts", field: "recordedByUserId" },
  { table: "storyUpdates", field: "authorUserId" },
  { table: "announcements", field: "senderUserId" },
  { table: "announcementRecipients", field: "userId" },
  { table: "gigSeries", field: "hostUserId" },
  { table: "gigSlots", field: "bookedUserId" },
  { table: "gigResponses", field: "userId" },
  { table: "emailPreferences", field: "userId" },
];

// Tables that reference the source's PROFILE id rather than their user id
// directly — resolved via the source's own `profiles` row.
const PROFILE_ID_FIELDS: { table: string; field: string }[] = [
  { table: "attributes", field: "profileId" },
  { table: "links", field: "profileId" },
  { table: "artifacts", field: "profileId" },
  { table: "wonderings", field: "profileId" },
  { table: "profileViews", field: "profileId" },
  { table: "profileLikes", field: "profileId" },
  { table: "jobs", field: "profileId" },
  { table: "jobInterests", field: "profileId" },
  { table: "gigResponses", field: "profileId" },
];

async function countMatching(
  ctx: MutationCtx,
  table: string,
  field: string,
  value: unknown,
  array: boolean | undefined,
): Promise<number> {
  const rows = await ctx.db.query(table as any).collect();
  if (array) {
    return rows.filter((r: any) => Array.isArray(r[field]) && r[field].includes(value)).length;
  }
  return rows.filter((r: any) => r[field] === value).length;
}

/** Everything beyond a source account's own (possibly nonexistent) empty
 * profile and its auth plumbing. Returns a `{ "table.field": count }` map
 * of every non-empty reference found — an empty map means the account is
 * safe to merge without `force`. */
async function scanForContent(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ profile: Doc<"profiles"> | null; blockers: Record<string, number> }> {
  const blockers: Record<string, number> = {};

  for (const { table, field, array } of USER_ID_FIELDS) {
    const count = await countMatching(ctx, table, field, userId, array);
    if (count > 0) blockers[`${table}.${field}`] = count;
  }

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  if (profile) {
    for (const { table, field } of PROFILE_ID_FIELDS) {
      const count = await countMatching(ctx, table, field, profile._id, false);
      if (count > 0) blockers[`${table}.${field}`] = count;
    }
  }

  return { profile, blockers };
}

function maskPhone(phone: string): string {
  return `••••${phone.slice(-4)}`;
}

type SourceReport =
  | { sourceUserId: Id<"users">; skipped: string }
  | { sourceUserId: Id<"users">; blocked: true; blockers: Record<string, number> }
  | { sourceUserId: Id<"users">; dryRun: true; blockers: Record<string, number>; wouldMerge: boolean }
  | {
      sourceUserId: Id<"users">;
      merged: true;
      movedAccountCount: number;
      movedGoogleVerifiedEmail: boolean;
      movedPhoneMasked: string | null;
      forced: boolean;
    };

export const mergeUsers = internalMutation({
  args: {
    targetUserId: v.id("users"),
    sourceUserIds: v.array(v.id("users")),
    dryRun: v.boolean(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { targetUserId, sourceUserIds, dryRun, force }) => {
    const results: SourceReport[] = [];

    for (const sourceUserId of sourceUserIds) {
      if (sourceUserId === targetUserId) {
        results.push({ sourceUserId, skipped: "same as target" });
        continue;
      }

      const { profile, blockers } = await scanForContent(ctx, sourceUserId);
      const hasContent = Object.keys(blockers).length > 0;

      if (hasContent && !force) {
        results.push({ sourceUserId, blocked: true, blockers });
        continue;
      }

      if (dryRun) {
        results.push({ sourceUserId, dryRun: true, blockers, wouldMerge: true });
        continue;
      }

      // ---- actually merge ----
      const targetAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", targetUserId))
        .collect();
      const targetHasPassword = targetAccounts.some((a) => a.provider === "password");

      const sourceAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", sourceUserId))
        .collect();

      let movedGoogleVerifiedEmail = false;
      let movedPhone: string | null = null;

      for (const account of sourceAccounts) {
        // Clean up verification codes tied to this account before it's
        // either moved (codes stay valid, harmless to leave — but we drop
        // them anyway since a merge invalidates any in-flight sign-in) or
        // deleted (would otherwise orphan).
        const codes = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .collect();
        for (const code of codes) await ctx.db.delete(code._id);

        if (account.provider === "password" && targetHasPassword) {
          // Target already has a password account — the source's would
          // collide, so it's dropped rather than moved.
          await ctx.db.delete(account._id);
          continue;
        }

        await ctx.db.patch(account._id, { userId: targetUserId });
        if (account.provider === "google" && account.emailVerified) {
          movedGoogleVerifiedEmail = true;
        }
        if (account.provider === "phone") {
          movedPhone = account.providerAccountId;
        }
      }

      const targetPatch: Record<string, unknown> = {};
      if (movedGoogleVerifiedEmail) targetPatch.emailVerificationTime = Date.now();
      if (movedPhone) {
        targetPatch.phone = movedPhone;
        targetPatch.phoneVerificationTime = Date.now();
      }
      if (Object.keys(targetPatch).length > 0) {
        await ctx.db.patch(targetUserId, targetPatch);
      }

      // Delete the source's auth sessions (and each session's refresh
      // tokens) and its profile, then the user row itself.
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", sourceUserId))
        .collect();
      for (const session of sessions) {
        const refreshTokens = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        for (const token of refreshTokens) await ctx.db.delete(token._id);
        await ctx.db.delete(session._id);
      }

      if (profile) {
        await ctx.db.delete(profile._id);
      }

      await ctx.db.delete(sourceUserId);

      results.push({
        sourceUserId,
        merged: true,
        movedAccountCount: sourceAccounts.length,
        movedGoogleVerifiedEmail,
        movedPhoneMasked: movedPhone ? maskPhone(movedPhone) : null,
        forced: hasContent,
      });
    }

    return { targetUserId, results };
  },
});
