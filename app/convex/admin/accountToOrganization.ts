// Internal-only tool, run by an operator (`npx convex run`). Turns an account
// that was made FOR an organization — a shared login named after it, like
// "Abiding Practice" (Rick, 2026-10-10: "it should only be an org") — into
// that organization:
//
//   - its projects are posted as the organization (projects.organizationId)
//     and run by `runBy`, a real person who is part of it;
//   - the people it invited, the teams it built and its conversations move
//     to `runBy`, so nothing it started is lost;
//   - its own traces (its place on organizations, its community membership,
//     saves, views, notices, sign-ins, profile) go, then the account itself.
//
// Anything else still pointing at the account (tickets, payments, events it
// runs…) blocks the run instead of being left dangling: those need a person
// to decide. `dryRun` reports what would happen and changes nothing.
//
//   npx convex run admin/accountToOrganization:accountToOrganization \
//     '{"userId":"…","organizationId":"…","runBy":"…","dryRun":true}' --prod

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isCurrent } from "../organizationRules";
import { getProfileByUserId } from "../helpers";
import { MergeReads, PROFILE_ID_FIELDS, USER_ID_FIELDS } from "./mergeUsers";

/** References this tool moves or removes itself. invites.usedBy stays: the
 * invite was used, and clearing it would let it be used again. */
const HANDLED_USER_FIELDS = new Set([
  "projects.userId",
  "projectMembers.userId",
  "projectMembers.invitedByUserId",
  "invites.inviterId",
  "invites.usedBy",
  "notifications.userId",
  "notifications.relatedUserId",
  "conversations.participants",
  "messages.senderId",
  "favorites.userId",
  "profileViews.viewerId",
  "communityMembers.userId",
  "emailPreferences.userId",
  // Named in mergeUsers' lists since 2026-10-26; this tool already removed
  // or now moves them.
  "orgPositions.userId",
  "updateReads.userId",
  "nudgeLog.userId",
  "organizations.createdByUserId",
  "uploadClaims.userId",
  // Named in mergeUsers' lists since 2026-10-27. A conversation's summaries
  // follow the conversation (below); the emails sent to the login go with it.
  "conversationParticipants.userId",
  "conversationParticipants.otherUserId",
  "emailDeliveries.recipientUserId",
]);
const HANDLED_PROFILE_FIELDS = new Set([
  "profileViews.profileId",
  "orgPositions.profileId",
  "favorites.targetId",
  "handleForwards.profileId",
]);

async function rowsWhere(ctx: MutationCtx, table: string, test: (row: any) => boolean): Promise<any[]> {
  return (await ctx.db.query(table as any).collect()).filter(test);
}

const refersTo = (field: string, id: string, array?: boolean) => (row: any) =>
  array ? Array.isArray(row[field]) && row[field].includes(id) : row[field] === id;

/** The per-person summaries kept for one conversation (engagement/conversations.ts). */
const summariesOf = (ctx: MutationCtx, conversationId: Id<"conversations">) =>
  ctx.db
    .query("conversationParticipants")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
    .collect();

export const accountToOrganization = internalMutation({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    runBy: v.id("users"),
    dryRun: v.boolean(),
  },
  handler: async (ctx, { userId, organizationId, runBy, dryRun }) => {
    if (userId === runBy) throw new Error("runBy has to be a real person, not the account being converted.");
    const [user, org] = await Promise.all([ctx.db.get(userId), ctx.db.get(organizationId)]);
    if (!user) throw new Error("No such account.");
    if (!org) throw new Error("No such organization.");

    const [profile, runByProfile] = await Promise.all([
      getProfileByUserId(ctx, userId),
      getProfileByUserId(ctx, runBy),
    ]);
    const runByPosition = runByProfile
      ? await ctx.db
          .query("orgPositions")
          .withIndex("by_organizationId_profileId", (q) =>
            q.eq("organizationId", organizationId).eq("profileId", runByProfile._id),
          )
          .first()
      : null;
    if (!runByPosition || !isCurrent(runByPosition)) {
      throw new Error(`runBy isn't part of ${org.name}. Add them to it first.`);
    }

    // ——— What would be left pointing at the account ———
    // Read the way mergeUsers reads: by index where the field has one.
    const reads = new MergeReads(ctx);
    const blockers: Record<string, number> = {};
    for (const ref of USER_ID_FIELDS) {
      const key = `${ref.table}.${ref.field}`;
      if (HANDLED_USER_FIELDS.has(key)) continue;
      const n = (await reads.pointingAt(ref, userId)).length;
      if (n) blockers[key] = n;
    }
    if (profile) {
      for (const ref of PROFILE_ID_FIELDS) {
        const key = `${ref.table}.${ref.field}`;
        if (HANDLED_PROFILE_FIELDS.has(key)) continue;
        const n = (await reads.pointingAt(ref, profile._id)).length;
        if (n) blockers[key] = n;
      }
    }
    if (Object.keys(blockers).length > 0) return { blocked: true as const, blockers };

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const conversations = (await rowsWhere(
      ctx,
      "conversations",
      refersTo("participants", userId, true),
    )) as Doc<"conversations">[];
    const plan = {
      account: profile?.name ?? user.name ?? String(userId),
      organization: org.name,
      runBy: runByProfile?.name ?? String(runBy),
      projects: projects.map((p) => p.title),
      conversations: conversations.length,
    };
    if (dryRun) return { dryRun: true as const, ...plan };

    // ——— Projects: posted as the organization, run by runBy ———
    for (const project of projects) {
      await ctx.db.patch(project._id, { userId: runBy, organizationId, updatedAt: Date.now() });
      // runBy leads it now, so a member row of theirs on it would list them twice.
      for (const row of await rowsWhere(
        ctx,
        "projectMembers",
        (r) => r.projectId === project._id && r.userId === runBy,
      )) {
        await ctx.db.delete(row._id);
      }
    }
    for (const row of await rowsWhere(ctx, "projectMembers", refersTo("userId", userId))) {
      await ctx.db.delete(row._id);
    }
    for (const row of await rowsWhere(ctx, "projectMembers", refersTo("invitedByUserId", userId))) {
      await ctx.db.patch(row._id, { invitedByUserId: runBy });
    }

    // ——— What it started moves to runBy ———
    for (const row of await rowsWhere(ctx, "invites", refersTo("inviterId", userId))) {
      await ctx.db.patch(row._id, { inviterId: runBy });
    }
    for (const row of await rowsWhere(ctx, "notifications", refersTo("relatedUserId", userId))) {
      await ctx.db.patch(row._id, { relatedUserId: runBy });
    }
    // The organizations it started, and the pictures it uploaded (the
    // projects' photos among them): runBy can replace them now.
    for (const row of await rowsWhere(ctx, "organizations", refersTo("createdByUserId", userId))) {
      await ctx.db.patch(row._id, { createdByUserId: runBy });
    }
    for (const row of await rowsWhere(ctx, "uploadClaims", refersTo("userId", userId))) {
      await ctx.db.patch(row._id, { userId: runBy });
    }
    for (const conversation of conversations) {
      const other = conversation.participants.find((p) => p !== userId);
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
        .collect();
      if (!other || other === runBy) {
        // A conversation with runBy themselves: nobody left to talk to.
        for (const m of messages) await ctx.db.delete(m._id);
        for (const s of await summariesOf(ctx, conversation._id)) await ctx.db.delete(s._id);
        await ctx.db.delete(conversation._id);
        continue;
      }
      const existing = (
        await rowsWhere(
          ctx,
          "conversations",
          (c) => c._id !== conversation._id && c.participants.includes(runBy) && c.participants.includes(other),
        )
      )[0] as Doc<"conversations"> | undefined;
      for (const m of messages) {
        await ctx.db.patch(m._id, {
          ...(existing ? { conversationId: existing._id } : {}),
          ...(m.senderId === userId ? { senderId: runBy } : {}),
        });
      }
      if (existing) {
        await ctx.db.patch(existing._id, {
          lastMessageAt: Math.max(existing.lastMessageAt, conversation.lastMessageAt),
        });
        // The kept conversation's summaries no longer match its messages:
        // marked incomplete, they are recomputed from the messages next time.
        for (const s of await summariesOf(ctx, existing._id)) await ctx.db.patch(s._id, { historyComplete: false });
        for (const s of await summariesOf(ctx, conversation._id)) await ctx.db.delete(s._id);
        await ctx.db.delete(conversation._id);
      } else {
        await ctx.db.patch(conversation._id, {
          participants: conversation.participants.map((p) => (p === userId ? runBy : p)),
        });
        for (const s of await summariesOf(ctx, conversation._id)) {
          await ctx.db.patch(s._id, {
            userId: s.userId === userId ? runBy : s.userId,
            otherUserId: s.otherUserId === userId ? runBy : s.otherUserId,
          });
        }
      }
    }

    // ——— Its own traces go ———
    const gone: [string, (row: any) => boolean][] = [
      ["notifications", refersTo("userId", userId)],
      ["favorites", refersTo("userId", userId)],
      ["profileViews", refersTo("viewerId", userId)],
      ["orgPositions", refersTo("userId", userId)],
      ["communityMembers", refersTo("userId", userId)],
      ["emailPreferences", refersTo("userId", userId)],
      ["updateReads", refersTo("userId", userId)],
      ["nudgeLog", refersTo("userId", userId)],
    ];
    if (profile) {
      gone.push(
        ["favorites", (r) => r.targetType === "profile" && r.targetId === profile._id],
        ["profileViews", refersTo("profileId", profile._id)],
        ["orgPositions", refersTo("profileId", profile._id)],
        ["handleForwards", refersTo("profileId", profile._id)],
      );
    }
    for (const [table, test] of gone) {
      for (const row of await rowsWhere(ctx, table, test)) await ctx.db.delete(row._id);
    }
    // The record of emails sent to the login (read by index: it holds every
    // email ever sent). One still waiting to go never will.
    for (const row of await ctx.db
      .query("emailDeliveries")
      .withIndex("by_recipientUserId_createdAt", (q) => q.eq("recipientUserId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    // ——— Sign-ins, profile, account ———
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) await ctx.db.delete(code._id);
      await ctx.db.delete(account._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete(token._id);
      await ctx.db.delete(session._id);
    }
    if (profile) await ctx.db.delete(profile._id);
    await ctx.db.delete(userId);

    return { done: true as const, ...plan };
  },
});
