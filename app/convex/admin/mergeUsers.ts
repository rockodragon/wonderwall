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
import { syncCoHosts } from "../eventHosts";

// Every table with a `v.id("users")` field whose rows count as "real
// content" on an account (i.e. NOT just the account's own empty profile or
// its auth plumbing). Regenerate by grepping `v.id("users")` in
// convex/schema.ts — kept as an explicit, reviewable list rather than
// introspecting the schema's validator tree at runtime. eventCoHosts isn't
// here: it mirrors events.coHostIds, and repoint re-syncs it from that.
const USER_ID_FIELDS: { table: string; field: string; array?: boolean }[] = [
  { table: "wonderingResponses", field: "responderId" },
  { table: "events", field: "organizerId" },
  { table: "events", field: "coHostIds", array: true },
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
  { table: "externalTicketExceptions", field: "resolvedByUserId" },
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
  { table: "phoneLinkCodes", field: "userId" },
  { table: "phoneLinkStarts", field: "userId" },
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

// For `moveContent`: tables where one person should hold at most one row
// per key. When the target already has a row with the same key, the
// source's copy is dropped instead of moved (two memberships in the same
// community, two likes on the same piece). Keyed by "table.field" — the
// field being re-pointed — so profileLikes can dedupe differently on its
// user side and its profile side.
const DEDUPE_KEYS: Record<string, string[]> = {
  "communityMembers.userId": ["hostOrgId"],
  "favorites.userId": ["targetType", "targetId"],
  "profileLikes.userId": ["profileId"],
  "profileLikes.profileId": ["userId"],
  "artifactLikes.userId": ["artifactId"],
  "showcaseVotes.userId": ["applicationId"],
  "tableMemberships.userId": ["tableId"],
  "emailPreferences.userId": [],
  "projectMembers.userId": ["projectId"],
  "jobInterests.userId": ["jobId"],
  "sessionRsvps.userId": ["sessionId"],
  "eventRsvps.userId": ["eventId"],
  "gigResponses.userId": ["slotId"],
  "offeringSignups.userId": ["offeringId"],
  "announcementRecipients.userId": ["announcementId"],
};

// One Stripe customer per account: two can't be combined by re-pointing,
// so a merge where both sides have one stops and says so.
const ONE_PER_ACCOUNT_BLOCKING = ["billingCustomers"];

/** Re-points every row in `table` whose `field` is `from` to `to`, dropping
 * rows that would duplicate one the target already has. Returns
 * [moved, dropped]. */
async function repoint(
  ctx: MutationCtx,
  table: string,
  field: string,
  from: string,
  to: string,
  array: boolean | undefined,
): Promise<[number, number]> {
  const rows: any[] = await ctx.db.query(table as any).collect();
  const dedupe = DEDUPE_KEYS[`${table}.${field}`];
  let moved = 0;
  let dropped = 0;
  for (const row of rows) {
    if (array) {
      if (!Array.isArray(row[field]) || !row[field].includes(from)) continue;
      const next = [...new Set(row[field].map((x: string) => (x === from ? to : x)))];
      await ctx.db.patch(row._id, { [field]: next } as any);
      // A co-host list carries its eventCoHosts rows with it (eventHosts.ts).
      if (table === "events" && field === "coHostIds") await syncCoHosts(ctx, row._id, next as Id<"users">[]);
      moved++;
      continue;
    }
    if (row[field] !== from) continue;
    if (dedupe) {
      const clash = rows.find(
        (other) => other[field] === to && dedupe.every((k) => other[k] === row[k]),
      );
      if (clash) {
        await ctx.db.delete(row._id);
        dropped++;
        continue;
      }
    }
    await ctx.db.patch(row._id, { [field]: to } as any);
    row[field] = to; // later rows in this pass dedupe against it
    moved++;
  }
  return [moved, dropped];
}

// Profile fields never copied between accounts: identity and bookkeeping.
const PROFILE_FIELDS_NOT_COPIED = new Set(["_id", "_creationTime", "userId", "createdAt", "updatedAt"]);

/** Fills fields the target's profile leaves empty from the source's, so
 * nothing the person wrote on either account is lost. The target's own
 * values always win. Creates the target's profile from the source's if it
 * has none. Returns the target profile id and which fields were filled. */
async function mergeProfiles(
  ctx: MutationCtx,
  sourceProfile: Doc<"profiles">,
  targetUserId: Id<"users">,
): Promise<{ targetProfileId: Id<"profiles">; filled: string[] }> {
  const targetProfile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
    .first();
  if (!targetProfile) {
    await ctx.db.patch(sourceProfile._id, { userId: targetUserId, updatedAt: Date.now() });
    return { targetProfileId: sourceProfile._id, filled: ["(whole profile moved)"] };
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourceProfile)) {
    if (PROFILE_FIELDS_NOT_COPIED.has(key)) continue;
    const current = (targetProfile as any)[key];
    const empty =
      current === undefined ||
      current === null ||
      current === "" ||
      (Array.isArray(current) && current.length === 0);
    if (empty && value !== undefined) patch[key] = value;
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(targetProfile._id, { ...patch, updatedAt: Date.now() } as any);
  }
  return { targetProfileId: targetProfile._id, filled: Object.keys(patch) };
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
      copiedEmailVerification: boolean;
      movedPhoneMasked: string | null;
      forced: boolean;
      contentMoved?: { moved: Record<string, number>; droppedDuplicates: Record<string, number>; profileFieldsFilled: string[] };
    };

export const mergeUsers = internalMutation({
  args: {
    targetUserId: v.id("users"),
    sourceUserIds: v.array(v.id("users")),
    dryRun: v.boolean(),
    force: v.optional(v.boolean()),
    // Move the source's content (projects, work, memberships, messages…)
    // onto the target instead of refusing. Unlike `force`, nothing is left
    // pointing at the deleted account.
    moveContent: v.optional(v.boolean()),
  },
  handler: async (ctx, { targetUserId, sourceUserIds, dryRun, force, moveContent }) => {
    const results: SourceReport[] = [];

    for (const sourceUserId of sourceUserIds) {
      if (sourceUserId === targetUserId) {
        results.push({ sourceUserId, skipped: "same as target" });
        continue;
      }

      const { profile, blockers } = await scanForContent(ctx, sourceUserId);
      const hasContent = Object.keys(blockers).length > 0;

      if (hasContent && !force && !moveContent) {
        results.push({ sourceUserId, blocked: true, blockers });
        continue;
      }

      if (moveContent) {
        const clashes: Record<string, number> = {};
        for (const table of ONE_PER_ACCOUNT_BLOCKING) {
          const rows: any[] = await ctx.db.query(table as any).collect();
          if (rows.some((r) => r.userId === sourceUserId) && rows.some((r) => r.userId === targetUserId)) {
            clashes[`${table} (both accounts have one)`] = 1;
          }
        }
        if (Object.keys(clashes).length > 0) {
          results.push({ sourceUserId, blocked: true, blockers: clashes });
          continue;
        }
      }

      if (dryRun) {
        results.push({ sourceUserId, dryRun: true, blockers, wouldMerge: true });
        continue;
      }

      // ---- actually merge ----
      let contentMoved: Extract<SourceReport, { merged: true }>["contentMoved"];
      if (moveContent && hasContent) {
        const moved: Record<string, number> = {};
        const droppedDuplicates: Record<string, number> = {};
        const note = (key: string, [m, d]: [number, number]) => {
          if (m) moved[key] = m;
          if (d) droppedDuplicates[key] = d;
        };
        for (const { table, field, array } of USER_ID_FIELDS) {
          note(`${table}.${field}`, await repoint(ctx, table, field, sourceUserId, targetUserId, array));
        }
        let profileFieldsFilled: string[] = [];
        if (profile) {
          const { targetProfileId, filled } = await mergeProfiles(ctx, profile, targetUserId);
          profileFieldsFilled = filled;
          if (targetProfileId !== profile._id) {
            for (const { table, field } of PROFILE_ID_FIELDS) {
              note(`${table}.${field}`, await repoint(ctx, table, field, profile._id, targetProfileId, false));
            }
          }
        }
        // A block between the two accounts is now a person blocking
        // themselves; drop it.
        for (const b of await ctx.db.query("blocks").collect()) {
          if (b.blockerId === targetUserId && b.blockedId === targetUserId) await ctx.db.delete(b._id);
        }
        contentMoved = { moved, droppedDuplicates, profileFieldsFilled };
      }

      const targetAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", targetUserId))
        .collect();
      const targetHasPassword = targetAccounts.some((a) => a.provider === "password");

      const sourceAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", sourceUserId))
        .collect();

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
        if (account.provider === "phone") {
          movedPhone = account.providerAccountId;
        }
      }

      // Carry the source's verified email over when it's the same address
      // as the target's. Read from the source's users row, not the moved
      // account: Convex Auth leaves authAccounts.emailVerified empty for
      // Google sign-ins, so checking the account never fired.
      const targetPatch: Record<string, unknown> = {};
      const [sourceUser, targetUser] = await Promise.all([
        ctx.db.get(sourceUserId),
        ctx.db.get(targetUserId),
      ]);
      const copiedEmailVerification = Boolean(
        sourceUser?.emailVerificationTime &&
          !targetUser?.emailVerificationTime &&
          sourceUser.email &&
          sourceUser.email.toLowerCase() === targetUser?.email?.toLowerCase(),
      );
      if (copiedEmailVerification) {
        targetPatch.emailVerificationTime = sourceUser!.emailVerificationTime;
      }
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

      const profileNow = profile ? await ctx.db.get(profile._id) : null;
      if (profileNow && profileNow.userId === sourceUserId) {
        await ctx.db.delete(profileNow._id);
      }

      await ctx.db.delete(sourceUserId);

      results.push({
        sourceUserId,
        merged: true,
        movedAccountCount: sourceAccounts.length,
        copiedEmailVerification,
        movedPhoneMasked: movedPhone ? maskPhone(movedPhone) : null,
        forced: hasContent && !moveContent,
        ...(contentMoved ? { contentMoved } : {}),
      });
    }

    return { targetUserId, results };
  },
});

/**
 * Sign-in records whose user no longer exists (accounts deleted before
 * deletion cleaned these up). Someone trying one of those emails gets an
 * error instead of a sign-up, so they're removed along with anything that
 * hangs off them. Internal only; `dryRun` reports without deleting. Reports
 * provider and creation date — never the email.
 */
export const deleteOrphanAuthAccounts = internalMutation({
  args: { dryRun: v.boolean() },
  handler: async (ctx, { dryRun }) => {
    const accounts = await ctx.db.query("authAccounts").collect();
    const orphans: Doc<"authAccounts">[] = [];
    for (const account of accounts) {
      if (!(await ctx.db.get(account.userId))) orphans.push(account);
    }
    let codes = 0;
    if (!dryRun) {
      for (const account of orphans) {
        const pending = await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", account._id))
          .collect();
        for (const code of pending) {
          await ctx.db.delete(code._id);
          codes++;
        }
        await ctx.db.delete(account._id);
      }
    }
    return {
      dryRun,
      orphanCount: orphans.length,
      verificationCodesDeleted: codes,
      orphans: orphans.map((a) => ({
        provider: a.provider,
        created: new Date(a._creationTime).toISOString().slice(0, 10),
      })),
    };
  },
});
