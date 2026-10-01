import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { auth } from "./auth";
import { requireAdmin, requireAdminCtx, ensureAdminCode } from "./helpers";
import { followEachOther, inviteFollowPairs } from "./follows";
import { ADMIN_EMAILS } from "./adminEmails";

// Bootstrap admin - only works if no admins exist yet
// Run from Convex dashboard: admin:bootstrapAdmin({ email: "rickmoy@gmail.com" })
export const bootstrapAdmin = mutation({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if any admins already exist
    const existingAdmin = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("isAdmin"), true))
      .first();

    if (existingAdmin) {
      throw new Error(
        "Bootstrap failed: Admin already exists. Use setAdminStatus instead.",
      );
    }

    // Find user by email
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => "email" in u && u.email === args.email);

    if (!user) {
      throw new Error(`User with email ${args.email} not found`);
    }

    // Get their profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    if (!profile) {
      throw new Error(`Profile not found for user ${args.email}`);
    }

    // Set as admin
    await ctx.db.patch(profile._id, {
      isAdmin: true,
    });

    return {
      success: true,
      message: `${args.email} is now an admin`,
    };
  },
});

export const getAllUsersWithInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await requireAdmin(ctx, userId);

    // Get all profiles
    const profiles = await ctx.db.query("profiles").collect();

    // Get all invites to build invite relationships
    const invites = await ctx.db.query("invites").collect();

    // Build a map of userId -> inviter userId
    const inviteMap = new Map();
    for (const invite of invites) {
      if (invite.usedBy) {
        inviteMap.set(invite.usedBy, invite.inviterId);
      }
    }

    // Get all auth users to fetch emails
    const users = await Promise.all(
      profiles.map(async (profile) => {
        const authUser = await ctx.db.get(profile.userId);
        const inviterId = inviteMap.get(profile.userId);
        let inviterProfile = null;
        let inviterEmail = null;

        if (inviterId) {
          const inviterAuth = await ctx.db.get(inviterId);
          inviterProfile = await ctx.db
            .query("profiles")
            .withIndex("by_userId", (q) => q.eq("userId", inviterId))
            .first();
          inviterEmail =
            inviterAuth && "email" in inviterAuth
              ? inviterAuth.email
              : undefined;
        }

        return {
          _id: profile._id,
          userId: profile.userId,
          name: profile.name,
          email: authUser && "email" in authUser ? authUser.email : undefined,
          inviteSlug: profile.inviteSlug,
          inviteUsageCount: profile.inviteUsageCount || 0,
          createdAt: profile.createdAt,
          invitedBy: inviterProfile
            ? {
                name: inviterProfile.name,
                email: inviterEmail,
              }
            : null,
        };
      }),
    );

    // Sort by creation date (newest first)
    return users.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Debug query to check invite records
export const debugInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await requireAdmin(ctx, userId);

    const invites = await ctx.db.query("invites").collect();

    return {
      totalInvites: invites.length,
      usedInvites: invites.filter((i) => i.usedBy).length,
      unusedInvites: invites.filter((i) => !i.usedBy).length,
      invites: invites.map((inv) => ({
        code: inv.code,
        inviterId: inv.inviterId,
        usedBy: inv.usedBy,
        usedAt: inv.usedAt,
        createdAt: inv.createdAt,
      })),
    };
  },
});

// Manual backfill mutation to link a user to their inviter
export const manuallyLinkInvite = mutation({
  args: {
    inviteeUserId: v.id("users"),
    inviterUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    await requireAdmin(ctx, userId);

    // Get inviter profile to increment their usage count
    const inviterProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.inviterUserId))
      .first();

    if (!inviterProfile) {
      throw new Error("Inviter profile not found");
    }

    // Check if invite record already exists
    const existingInvite = await ctx.db
      .query("invites")
      .withIndex("by_inviterId", (q) => q.eq("inviterId", args.inviterUserId))
      .filter((q) => q.eq(q.field("usedBy"), args.inviteeUserId))
      .first();

    if (existingInvite) {
      return { message: "Invite link already exists", existing: true };
    }

    // Create invite record
    await ctx.db.insert("invites", {
      inviterId: args.inviterUserId,
      code: inviterProfile.inviteSlug || "manual-backfill",
      usedBy: args.inviteeUserId,
      usedAt: Date.now(),
      createdAt: Date.now(),
    });

    // Increment inviter's usage count
    const currentCount = inviterProfile.inviteUsageCount || 0;
    await ctx.db.patch(inviterProfile._id, {
      inviteUsageCount: currentCount + 1,
    });

    // Same mutual follow a real redemption gets (follows.ts).
    await followEachOther(ctx, args.inviterUserId, args.inviteeUserId);

    return { message: "Successfully linked invite", existing: false };
  },
});

// One-off backfill for invites accepted before redemption started making
// the inviter and invitee follow each other (follows.ts followEachOther).
// Safe to run again — existing follows are skipped — but a re-run will
// re-follow anyone who has since unfollowed their inviter, so it's meant
// to be run once. Button on /admin.
export const backfillInviteFollows = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdminCtx(ctx);

    const invites = await ctx.db.query("invites").collect();
    const pairs = inviteFollowPairs(invites);

    let followsCreated = 0;
    for (const [inviterId, inviteeId] of pairs) {
      followsCreated += await followEachOther(ctx, inviterId, inviteeId);
    }

    return { pairs: pairs.length, followsCreated };
  },
});

// Labels for the delete preview: [one, many]. Anything else is "other".
const DELETE_LABELS: Record<string, [string, string]> = {
  events: ["event", "events"],
  projects: ["project", "projects"],
  offerings: ["class", "classes"],
  jobs: ["job", "jobs"],
  artifacts: ["portfolio piece", "portfolio pieces"],
  conversations: ["conversation", "conversations"],
  messages: ["message", "messages"],
  eventRsvps: ["RSVP", "RSVPs"],
  projectSupport: ["cheer or backing", "cheers and backings"],
};

/** "1 event, 6 projects, 12 other records" — for the admin confirm dialog. */
export function summarizeDeletion(counts: Record<string, number>): string {
  const parts: string[] = [];
  let other = 0;
  for (const [table, n] of Object.entries(counts)) {
    if (!n || table === "unlinkedPieces") continue;
    const label = DELETE_LABELS[table];
    if (label) parts.push(`${n} ${n === 1 ? label[0] : label[1]}`);
    else other += n;
  }
  if (other) parts.push(`${other} other ${other === 1 ? "record" : "records"}`);
  return parts.join(", ") || "nothing besides the account";
}

// Delete a user and everything they own: their profile and portfolio, the
// events, projects, classes and jobs they posted (and what hangs off them),
// their RSVPs, cheers, messages and notifications, and their sign-in.
// Refuses when money is involved — payments, memberships, payouts, gifts —
// because those rows are the books; and when they own a community. With
// dryRun it only reports what it would do (admin.tsx shows this first).
export const deleteUser = mutation({
  args: {
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const adminUserId = await auth.getUserId(ctx);
    if (!adminUserId) {
      throw new Error("Not authenticated");
    }
    await requireAdmin(ctx, adminUserId);
    if (args.userId === adminUserId) {
      throw new ConvexError("You can't delete your own account from here.");
    }

    const u = args.userId;
    // Table names are data here; the generated types only cover literals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.db as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Row = { _id: string } & Record<string, any>;
    const where = async (table: string, field: string, value: unknown): Promise<Row[]> =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.query(table).filter((q: any) => q.eq(q.field(field), value)).collect();
    const whereIn = async (table: string, field: string, ids: Set<string>): Promise<Row[]> =>
      ids.size === 0
        ? []
        : ((await db.query(table).collect()) as Row[]).filter((r) => ids.has(String(r[field])));
    const idSet = (rows: Row[]) => new Set(rows.map((r) => String(r._id)));

    const profile = (await where("profiles", "userId", u))[0] ?? null;
    const events = await where("events", "organizerId", u);
    const projects = await where("projects", "userId", u);
    const offerings = await where("offerings", "userId", u);
    const jobs = await where("jobs", "posterId", u);
    const eventIds = idSet(events);
    const projectIds = idSet(projects);
    const offeringIds = idSet(offerings);

    // ——— What stops it ———
    const blocked: string[] = [];
    const block = (rows: Row[], what: string) => {
      if (rows.length > 0) blocked.push(`${rows.length} ${what}`);
    };
    block(await where("hostOrgs", "ownerUserId", u), "community they own");
    block(await where("gardenTables", "hostUserId", u), "table they host");
    for (const [table, field, what] of [
      ["billingCustomers", "userId", "billing account"],
      ["memberships", "userId", "membership"],
      ["productPurchases", "userId", "purchase"],
      ["apGiftSubscriptions", "userId", "fund subscription"],
      ["grantContributions", "userId", "fund contribution"],
      ["grantProposals", "userId", "grant proposal"],
      ["memberGifts", "userId", "monthly gift"],
      ["memberGifts", "recipientUserId", "monthly gift received"],
      ["giftPayments", "giverUserId", "gift payment"],
      ["giftPayments", "payeeUserId", "gift payment received"],
      ["backingPayments", "backerUserId", "backing payment"],
      ["backingPayments", "payeeUserId", "backing payment received"],
      ["classPayments", "buyerUserId", "class payment"],
      ["classPayments", "payeeUserId", "class payment received"],
      ["ticketPurchases", "userId", "ticket purchase"],
      ["creativePayouts", "payeeUserId", "payout"],
      ["coverageRedemptions", "userId", "covered seat"],
    ] as const) {
      block(await where(table, field, u), what);
    }
    block(await whereIn("backingPayments", "projectId", projectIds), "backing payment on their projects");
    block(await whereIn("allocations", "projectId", projectIds), "grant allocation on their projects");
    block(await whereIn("memberGifts", "projectId", projectIds), "monthly gift to their projects");
    block(await whereIn("grantProposals", "projectId", projectIds), "grant proposal on their projects");
    block(await whereIn("classPayments", "offeringId", offeringIds), "payment for their classes");
    block(await whereIn("ticketPurchases", "eventId", eventIds), "ticket sold for their events");

    // ——— What goes ———
    const doomed = new Map<string, { table: string; id: string }>();
    const add = (table: string, rows: Row[]) => {
      for (const r of rows) doomed.set(String(r._id), { table, id: r._id });
    };

    add("events", events);
    for (const t of ["eventRsvps", "eventApplications", "eventVideo"]) {
      add(t, await whereIn(t, "eventId", eventIds));
    }
    add("projects", projects);
    for (const t of [
      "projectMembers",
      "projectRoles",
      "patronTiers",
      "projectSupport",
      "storyUpdates",
      "gigSeries",
      "gigSlots",
      "gigResponses",
    ]) {
      add(t, await whereIn(t, "projectId", projectIds));
    }
    add("offerings", offerings);
    add("offeringSignups", await whereIn("offeringSignups", "offeringId", offeringIds));
    add("offeringReports", await whereIn("offeringReports", "offeringId", offeringIds));
    add("jobs", jobs);
    add("jobInterests", await whereIn("jobInterests", "jobId", idSet(jobs)));

    for (const [table, field] of [
      ["eventRsvps", "userId"],
      ["eventApplications", "applicantId"],
      ["projectMembers", "userId"],
      ["projectSupport", "supporterUserId"],
      ["gigResponses", "userId"],
      ["offeringSignups", "userId"],
      ["sessionRsvps", "userId"],
      ["tableMemberships", "userId"],
      ["communityMembers", "userId"],
      ["jobInterests", "userId"],
      ["showcaseVotes", "userId"],
      ["wonderingResponses", "responderId"],
      ["artifactLikes", "userId"],
      ["profileLikes", "userId"],
      ["profileViews", "viewerId"],
      ["favorites", "userId"],
      ["blocks", "blockerId"],
      ["blocks", "blockedId"],
      ["notifications", "userId"],
      ["notifications", "relatedUserId"],
      ["emailPreferences", "userId"],
      ["phoneLinkCodes", "userId"],
      ["phoneLinkStarts", "userId"],
      ["announcementRecipients", "userId"],
      ["announcements", "senderUserId"],
      ["invites", "inviterId"],
      ["invites", "usedBy"],
    ] as const) {
      add(table, await where(table, field, u));
    }

    // Other people's portfolio pieces attached to a project being deleted
    // stay — they're just unlinked from it.
    const unlink: Row[] = [];
    if (profile) {
      const artifacts = await where("artifacts", "profileId", profile._id);
      add("artifacts", artifacts);
      add("artifactLikes", await whereIn("artifactLikes", "artifactId", idSet(artifacts)));
      const wonderings = await where("wonderings", "profileId", profile._id);
      add("wonderings", wonderings);
      add("wonderingResponses", await whereIn("wonderingResponses", "wonderingId", idSet(wonderings)));
      for (const t of ["attributes", "links", "profileViews", "profileLikes"]) {
        add(t, await where(t, "profileId", profile._id));
      }
      add("favorites", await where("favorites", "targetId", String(profile._id)));
    }
    for (const a of await whereIn("artifacts", "projectId", projectIds)) {
      if (!doomed.has(String(a._id))) unlink.push(a);
    }
    add("favorites", await whereIn("favorites", "targetId", eventIds));

    const conversations = ((await db.query("conversations").collect()) as Row[]).filter((c) =>
      (c.participants as string[]).some((p) => String(p) === String(u)),
    );
    add("conversations", conversations);
    add("messages", await whereIn("messages", "conversationId", idSet(conversations)));
    add("messages", await where("messages", "senderId", u));

    const authAccounts: Row[] = await db
      .query("authAccounts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("userIdAndProvider", (q: any) => q.eq("userId", u))
      .collect();
    const authSessions: Row[] = await db
      .query("authSessions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("userId", (q: any) => q.eq("userId", u))
      .collect();
    add("authAccounts", authAccounts);
    add("authSessions", authSessions);
    add("authRefreshTokens", await whereIn("authRefreshTokens", "sessionId", idSet(authSessions)));
    if (profile) add("profiles", [profile as Row]);

    const counts: Record<string, number> = {};
    for (const { table } of doomed.values()) counts[table] = (counts[table] ?? 0) + 1;
    if (unlink.length) counts.unlinkedPieces = unlink.length;

    if (args.dryRun) {
      return { deleted: false, blocked, counts, summary: summarizeDeletion(counts) };
    }
    if (blocked.length > 0) {
      throw new ConvexError(
        `Not deleted. This account has ${blocked.join(", ")}. Money and community records stay for the books.`,
      );
    }

    for (const a of unlink) await db.patch(a._id, { projectId: undefined });
    for (const { id } of doomed.values()) await db.delete(id);
    await db.delete(u);

    return { deleted: true, blocked, counts, summary: summarizeDeletion(counts) };
  },
});

// Set admin status on a user's profile
export const setAdminStatus = mutation({
  args: {
    userId: v.id("users"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const adminUserId = await auth.getUserId(ctx);
    if (!adminUserId) {
      throw new Error("Not authenticated");
    }

    await requireAdmin(ctx, adminUserId);

    // Get user's profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!profile) {
      throw new Error("Profile not found");
    }

    await ctx.db.patch(profile._id, {
      isAdmin: args.isAdmin,
    });

    return {
      success: true,
      message: `Admin status ${args.isAdmin ? "granted" : "revoked"} for user`,
    };
  },
});

// Backfills the standing admin group (adminEmails.ts) for accounts that
// already existed when an email was added to that list — auth.ts's signup
// hook only covers new signups. Also (re)generates each admin's fixed
// waitlist-approval code (profiles.adminCode) if they don't have one yet.
// Safe to call repeatedly: already-admin, already-coded accounts are
// left untouched. Requires an existing admin to call it (see admin.tsx's
// "Sync Admin Group" button) — same gate as setAdminStatus above.
export const syncAdminGroup = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdminCtx(ctx);

    const allUsers = await ctx.db.query("users").collect();

    let grantedAdmin = 0;
    let codesGenerated = 0;
    const notFound: string[] = [];

    for (const email of ADMIN_EMAILS) {
      const user = allUsers.find(
        (u) => "email" in u && u.email?.toLowerCase() === email,
      );
      if (!user) {
        notFound.push(email);
        continue;
      }

      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .first();
      if (!profile) {
        notFound.push(email);
        continue;
      }

      if (!profile.isAdmin) {
        await ctx.db.patch(profile._id, { isAdmin: true });
        grantedAdmin++;
      }
      if (!profile.adminCode) {
        await ensureAdminCode(ctx, profile);
        codesGenerated++;
      }
    }

    return {
      grantedAdmin,
      codesGenerated,
      notFound, // emails with no account yet — nothing to do until they sign up
    };
  },
});
