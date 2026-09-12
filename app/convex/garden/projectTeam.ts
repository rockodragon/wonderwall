// Project teams (docs/features/project-teams.md §2–§6): who is on a project
// and how they got there. One table, `projectMembers`, holds requests
// ("Ask to join" / "Apply"), on-platform invites, and off-platform credits
// (a name the lead adds, optionally emailed a claim link). The lead is
// `projects.userId`, never a row.
//
// House style (communities.ts / tables.ts): a pure core at the top —
// stage twin, row-reuse rules, limits, HTML escaping, and the client
// projections that strip `email` / `claimToken` — unit-tested in
// projectTeam.test.ts without Convex; thin ctx.db wrappers below.

import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdminProfile } from "../helpers";
import { isValidEmail, normalizeEmail } from "./eventRsvps";

// ——————————————————————————————————————————————————————————————
// Stage — TWIN of app/app/lib/stage.ts (STAGES, isStage, stageLabel,
// resolveStage). convex/ cannot import from app/, so the tuple and the
// derivation live here too. Keep both in sync; the frontend copy is the
// one with the unit tests for labels.
// ——————————————————————————————————————————————————————————————

export const STAGES = [
  "planning",
  "raising",
  "forming",
  "working",
  "releasing",
  "completed",
] as const;

export type Stage = (typeof STAGES)[number];

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

/** "forming" reads as Hiring on a paid post (a paid post is a hiring post). */
export function stageLabel(stage: Stage, kind: string): string {
  switch (stage) {
    case "planning":
      return "Planning";
    case "raising":
      return "Raising";
    case "forming":
      return kind === "paid" ? "Hiring" : "Forming team";
    case "working":
      return "Working";
    case "releasing":
      return "Releasing";
    case "completed":
      return "Completed";
  }
}

/** Derive a stage for rows written before `stage` existed (§1): `stage`
 * wins when set; in_progress → working, completed → completed, paid →
 * forming, else planning. */
export function resolveStage(project: { stage?: string; status?: string; kind: string }): Stage {
  if (isStage(project.stage)) return project.stage;
  if (project.status === "in_progress") return "working";
  if (project.status === "completed") return "completed";
  return project.kind === "paid" ? "forming" : "planning";
}

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export type MemberStatus = Doc<"projectMembers">["status"];

export const DAY_MS = 24 * 60 * 60 * 1000;
/** A declined request may be repeated after this long (§2 reuse table). */
export const DECLINED_RETRY_MS = 30 * DAY_MS;
/** Claim links live this long (§2). */
export const CLAIM_TTL_MS = 30 * DAY_MS;

export const REQUEST_DAILY_LIMIT = 10; // per user (§3)
export const INVITE_DAILY_LIMIT_PER_PROJECT = 20; // per project (§3)
export const EMAIL_INVITE_DAILY_LIMIT_PER_LEAD = 10; // per lead (§3)

export const MAX_ROLE_LENGTH = 60;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_NAME_LENGTH = 80;
export const SEARCH_LIMIT = 10;

export type RequestDecision = "ok" | "no-op" | "refused";

/** The "requestToJoin again" column of the §2 row-reuse table. `existing`
 * is the current row's status (undefined = no row yet). A declined request
 * may be repeated once DECLINED_RETRY_MS has passed since it was decided;
 * a declined row with no respondedAt (shouldn't exist) is treated as
 * eligible rather than locking the person out forever. */
export function nextStatusForRequest(
  existing: string | undefined,
  existingRespondedAt: number | undefined,
  now: number,
): RequestDecision {
  switch (existing) {
    case undefined:
    case "withdrawn":
    case "left":
      return "ok";
    case "declined":
      if (existingRespondedAt === undefined) return "ok";
      return now - existingRespondedAt >= DECLINED_RETRY_MS ? "ok" : "refused";
    case "removed":
      return "refused";
    case "pending":
    case "invited":
    case "accepted":
      return "no-op";
    default:
      // An unknown status is a data bug, not a permission — fail closed.
      return "refused";
  }
}

/** The "lead invites again" column of the §2 table: anything not currently
 * live (pending / invited / accepted) can be re-invited. */
export function canLeadReinvite(existing: string | undefined): boolean {
  return existing !== "pending" && existing !== "invited" && existing !== "accepted";
}

/** Rows created inside the trailing window — the §3 limits are all
 * "N per 24h counted over createdAt". Row reuse refreshes createdAt (see
 * the mutations) so a withdrawn-and-resent request still counts. */
export function countInWindow(
  rows: ReadonlyArray<{ createdAt: number }>,
  now: number,
  windowMs: number = DAY_MS,
): number {
  const since = now - windowMs;
  let n = 0;
  for (const row of rows) if (row.createdAt > since) n++;
  return n;
}

/** Stage-change notification rule (§6): fan out only when the stage
 * actually changed AND the previous change is absent or older than 24h. */
export function shouldNotifyStageChange(
  previousStage: string | undefined,
  nextStage: string,
  previousChangedAt: number | undefined,
  now: number,
): boolean {
  if (previousStage === nextStage) return false;
  if (previousChangedAt === undefined) return true;
  return now - previousChangedAt >= DAY_MS;
}

/** emails.ts interpolates heading/body raw into HTML — anything a person
 * typed (name, role, message, title) goes through this first (§4). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ClaimEmailInput {
  leadName: string;
  projectTitle: string;
  role: string;
  message?: string;
}

/** Subject/heading/body for the off-platform credit email. Every
 * interpolated field is escaped; the claim link is the CTA (a path —
 * sendNotificationEmail prefixes SITE_URL the way announcements.ts and
 * waitlist.ts rely on). */
export function buildClaimEmail(input: ClaimEmailInput, token: string): {
  subject: string;
  previewText: string;
  heading: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
} {
  const lead = escapeHtml(input.leadName);
  const title = escapeHtml(input.projectTitle);
  const role = escapeHtml(input.role);
  const note = input.message?.trim() ? `<br><br>"${escapeHtml(input.message.trim())}"` : "";
  return {
    subject: `${input.leadName} credited you on ${input.projectTitle}`,
    previewText: `You're listed as ${input.role} on ${input.projectTitle}.`,
    heading: `${lead} credited you on ${title}`,
    body:
      `${lead} listed you as <strong>${role}</strong> on <strong>${title}</strong> at creatives.exchange.` +
      `${note}<br><br>Claim the credit to put it on your own profile — the link works for 30 days.`,
    ctaText: "Claim your credit",
    ctaUrl: `/claim/${token}`,
  };
}

export function validateRole(role: string): string {
  const trimmed = role.trim();
  if (!trimmed) throw new ConvexError({ code: "invalid_role", reason: "Say what role they'd have." });
  if (trimmed.length > MAX_ROLE_LENGTH) {
    throw new ConvexError({
      code: "invalid_role",
      reason: `Keep the role under ${MAX_ROLE_LENGTH} characters.`,
    });
  }
  return trimmed;
}

export function validateMessage(message: string | undefined): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ConvexError({
      code: "invalid_message",
      reason: `Keep the note under ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }
  return trimmed;
}

export function validateName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) throw new ConvexError({ code: "invalid_name", reason: "Who are you crediting?" });
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ConvexError({
      code: "invalid_name",
      reason: `Keep the name under ${MAX_NAME_LENGTH} characters.`,
    });
  }
  return trimmed;
}

/** Plain case-insensitive substring match on a display name — the same
 * filter profiles.search applies to names, minus everything else. */
export function nameMatches(name: string, q: string): boolean {
  return name.toLowerCase().includes(q);
}

// ——— Client projections ——————————————————————————————————————————
// Everything getTeam returns goes through one of these. They enumerate
// their output keys — no spreading a row — so `email` and `claimToken`
// can never leak (§4). projectTeam.test.ts asserts exactly that.

export interface PersonEntry {
  memberId: Id<"projectMembers">;
  profileId: Id<"profiles"> | null;
  userId: Id<"users"> | null;
  name: string;
  imageUrl: string | null;
  role: string;
  status: MemberStatus;
  message: string | null;
}

export interface CreditEntry {
  memberId: Id<"projectMembers">;
  name: string;
  role: string;
}

export interface InvitedEntry extends PersonEntry {
  /** true for an off-platform credit (no account yet). */
  offPlatform: boolean;
  /** true when a claim link went out by email (the address itself never leaves the server). */
  emailed: boolean;
}

export function toPersonEntry(
  row: Doc<"projectMembers">,
  resolved: { profileId: Id<"profiles"> | null; name?: string; imageUrl: string | null },
): PersonEntry {
  return {
    memberId: row._id,
    profileId: resolved.profileId,
    userId: row.userId ?? null,
    name: resolved.name ?? row.name,
    imageUrl: resolved.imageUrl,
    role: row.role,
    status: row.status,
    message: row.message ?? null,
  };
}

export function toCreditEntry(row: Doc<"projectMembers">): CreditEntry {
  return { memberId: row._id, name: row.name, role: row.role };
}

export function toInvitedEntry(
  row: Doc<"projectMembers">,
  resolved: { profileId: Id<"profiles"> | null; name?: string; imageUrl: string | null },
): InvitedEntry {
  return {
    ...toPersonEntry(row, resolved),
    offPlatform: row.userId === undefined,
    emailed: row.email !== undefined,
  };
}

// ——————————————————————————————————————————————————————————————
// ctx.db helpers
// ——————————————————————————————————————————————————————————————

type Ctx = QueryCtx | MutationCtx;

async function requireUser(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated" });
  return userId;
}

async function getProfile(ctx: Ctx, userId: Id<"users">): Promise<Doc<"profiles"> | null> {
  return ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

// Same resolution messaging.ts uses: stored file first, external URL second.
async function resolveImageUrl(ctx: Ctx, profile: Doc<"profiles"> | null): Promise<string | null> {
  if (!profile) return null;
  if (profile.imageStorageId) return await ctx.storage.getUrl(profile.imageStorageId);
  return profile.imageUrl || null;
}

async function resolvePerson(
  ctx: Ctx,
  userId: Id<"users"> | undefined,
): Promise<{ profileId: Id<"profiles"> | null; name?: string; imageUrl: string | null }> {
  if (!userId) return { profileId: null, imageUrl: null };
  const profile = await getProfile(ctx, userId);
  return {
    profileId: profile?._id ?? null,
    name: profile?.name,
    imageUrl: await resolveImageUrl(ctx, profile),
  };
}

async function requireProject(ctx: Ctx, projectId: Id<"projects">): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError({ code: "not_found", reason: "That project isn't there." });
  return project;
}

/** The lead (projects.userId) — or an operator — may manage the team. */
async function assertLead(ctx: Ctx, project: Doc<"projects">, userId: Id<"users">): Promise<void> {
  if (project.userId === userId) return;
  const profile = await getProfile(ctx, userId);
  if (isAdminProfile(profile)) return;
  throw new ConvexError({ code: "forbidden", reason: "Only the project lead can do that." });
}

// Copied from messaging.ts (module-private there): everyone `userId` has
// blocked plus everyone who has blocked them.
async function getBlockedUserIds(ctx: Ctx, userId: Id<"users">): Promise<Set<Id<"users">>> {
  const blockedByUser = await ctx.db
    .query("blocks")
    .withIndex("by_blockerId", (q) => q.eq("blockerId", userId))
    .collect();
  const blockedUser = await ctx.db
    .query("blocks")
    .withIndex("by_blockedId", (q) => q.eq("blockedId", userId))
    .collect();
  const blockedIds = new Set<Id<"users">>();
  for (const block of blockedByUser) blockedIds.add(block.blockedId);
  for (const block of blockedUser) blockedIds.add(block.blockerId);
  return blockedIds;
}

/** §3 "Blocks": refuse when either direction is blocked. The reason is
 * deliberately vague — a block is never announced to the other side. */
async function assertNotBlocked(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<void> {
  const blocked = await getBlockedUserIds(ctx, a);
  if (blocked.has(b)) {
    throw new ConvexError({ code: "blocked", reason: "That isn't possible right now." });
  }
}

async function findMemberByUser(
  ctx: Ctx,
  projectId: Id<"projects">,
  userId: Id<"users">,
): Promise<Doc<"projectMembers"> | null> {
  return ctx.db
    .query("projectMembers")
    .withIndex("by_projectId_userId", (q) => q.eq("projectId", projectId).eq("userId", userId))
    .first();
}

/** Every row on a project, any status — an index-prefix scan. */
async function listProjectRows(ctx: Ctx, projectId: Id<"projects">): Promise<Doc<"projectMembers">[]> {
  return ctx.db
    .query("projectMembers")
    .withIndex("by_projectId_status", (q) => q.eq("projectId", projectId))
    .collect();
}

/** Off-platform uniqueness (§2): an unclaimed row on this project with the
 * same normalized email. */
function findMemberByEmail(
  rows: Doc<"projectMembers">[],
  email: string,
): Doc<"projectMembers"> | null {
  return rows.find((r) => r.userId === undefined && r.email === email) ?? null;
}

async function notify(
  ctx: MutationCtx,
  n: {
    userId: Id<"users">;
    type: string;
    title: string;
    message: string;
    linkUrl: string;
    relatedUserId: Id<"users">;
  },
): Promise<void> {
  // Same insert shape as follows.ts notifyFollowers / likesDigest.ts.
  await ctx.db.insert("notifications", {
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    linkUrl: n.linkUrl,
    relatedUserId: n.relatedUserId,
    createdAt: Date.now(),
  });
}

function projectLink(projectId: Id<"projects">): string {
  return `/projects/${projectId}`;
}

function withNote(role: string, note: string | undefined): string {
  return note ? `as ${role} — ${note}` : `as ${role}`;
}

/** Field-complete patch for reusing a row: every optional column is set
 * explicitly (undefined clears it in ctx.db.patch) so nothing from the
 * previous life of the row — a stale claim token, an old note — survives. */
function freshRowFields(input: {
  userId: Id<"users"> | undefined;
  name: string;
  email: string | undefined;
  role: string;
  status: MemberStatus;
  invitedByUserId: Id<"users"> | undefined;
  message: string | undefined;
  claimToken: string | undefined;
  claimExpiresAt: number | undefined;
  now: number;
}) {
  return {
    userId: input.userId,
    name: input.name,
    email: input.email,
    role: input.role,
    status: input.status,
    invitedByUserId: input.invitedByUserId,
    message: input.message,
    claimToken: input.claimToken,
    claimExpiresAt: input.claimExpiresAt,
    createdAt: input.now,
    respondedAt: undefined,
  };
}

// ——————————————————————————————————————————————————————————————
// Mutations (§4)
// ——————————————————————————————————————————————————————————————

/** Ask to join / Apply. Free — no capability gate ("money is never the
 * only door"). Upserts `pending` per the §2 reuse table; notifies the lead. */
export const requestToJoin = mutation({
  args: {
    projectId: v.id("projects"),
    role: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const project = await requireProject(ctx, args.projectId);
    if (project.userId === userId) {
      throw new ConvexError({ code: "forbidden", reason: "You lead this project." });
    }
    if (project.status === "archived") {
      throw new ConvexError({ code: "project_archived", reason: "This project is archived." });
    }
    const role = validateRole(args.role);
    const message = validateMessage(args.message);
    await assertNotBlocked(ctx, userId, project.userId);

    const now = Date.now();
    const existing = await findMemberByUser(ctx, args.projectId, userId);
    const decision = nextStatusForRequest(existing?.status, existing?.respondedAt, now);
    if (decision === "no-op") {
      return { ok: true as const, changed: false as const, memberId: existing!._id, status: existing!.status };
    }
    if (decision === "refused") {
      throw new ConvexError({
        code: "cannot_request",
        reason:
          existing?.status === "declined"
            ? "You asked recently — try again in a while."
            : "You can't ask to join this project.",
      });
    }

    // 10 per user per day, counted over createdAt on the person's own
    // requests (rows they weren't invited into).
    const mine = await ctx.db
      .query("projectMembers")
      .withIndex("by_userId_status", (q) => q.eq("userId", userId))
      .collect();
    const recent = mine.filter((r) => r.invitedByUserId === undefined && r._id !== existing?._id);
    if (countInWindow(recent, now) >= REQUEST_DAILY_LIMIT) {
      throw new ConvexError({
        code: "rate_limited",
        reason: "That's enough requests for today — try again tomorrow.",
      });
    }

    const profile = await getProfile(ctx, userId);
    const name = profile?.name || "Someone";
    const fields = freshRowFields({
      userId,
      name,
      email: undefined,
      role,
      status: "pending",
      invitedByUserId: undefined,
      message,
      claimToken: undefined,
      claimExpiresAt: undefined,
      now,
    });
    const memberId = existing
      ? (await ctx.db.patch(existing._id, fields), existing._id)
      : await ctx.db.insert("projectMembers", { projectId: args.projectId, ...fields });

    await notify(ctx, {
      userId: project.userId,
      type: "project_join_request",
      title: `${name} wants to join ${project.title}`,
      message: withNote(role, message),
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const, changed: true as const, memberId, status: "pending" as const };
  },
});

/** Lead updates an accepted member's role. */
export const updateMemberRole = mutation({
  args: { memberId: v.id("projectMembers"), role: v.string() },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    const row = await ctx.db.get(args.memberId);
    if (!row) throw new ConvexError({ code: "not_found", reason: "No such member." });
    const project = await requireProject(ctx, row.projectId);
    await assertLead(ctx, project, actorId);
    const role = validateRole(args.role);
    if (row.role === role) return { ok: true as const, changed: false as const };
    await ctx.db.patch(args.memberId, { role });
    return { ok: true as const, changed: true as const };
  },
});

/** Requester takes back a pending request. No-op unless it is pending. */
export const withdrawRequest = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await findMemberByUser(ctx, args.projectId, userId);
    if (!existing || existing.status !== "pending") {
      return { ok: true as const, changed: false as const };
    }
    await ctx.db.patch(existing._id, { status: "withdrawn", respondedAt: Date.now() });
    return { ok: true as const, changed: true as const };
  },
});

/** Lead adds someone: on platform (`userId`) → `invited` + notification;
 * off platform (`name`, optional `email`) → `invited` credit with a claim
 * token, and one email if an address was given. */
export const inviteMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.optional(v.id("users")),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    const project = await requireProject(ctx, args.projectId);
    await assertLead(ctx, project, actorId);
    if (project.status === "archived") {
      throw new ConvexError({ code: "project_archived", reason: "This project is archived." });
    }
    const role = validateRole(args.role);
    const message = validateMessage(args.message);
    const now = Date.now();
    const rows = await listProjectRows(ctx, args.projectId);

    // 20 per project per day, over every invite row (on- or off-platform).
    const invitesToday = countInWindow(
      rows.filter((r) => r.invitedByUserId !== undefined),
      now,
    );
    if (invitesToday >= INVITE_DAILY_LIMIT_PER_PROJECT) {
      throw new ConvexError({
        code: "rate_limited",
        reason: "That's enough invites for today — try again tomorrow.",
      });
    }

    const actorProfile = await getProfile(ctx, actorId);
    const leadProfile =
      project.userId === actorId ? actorProfile : await getProfile(ctx, project.userId);
    const leadName = leadProfile?.name || "The project lead";

    // ——— On platform ———
    if (args.userId) {
      const targetId = args.userId;
      if (targetId === project.userId) {
        throw new ConvexError({ code: "forbidden", reason: "That's the project lead." });
      }
      const targetProfile = await getProfile(ctx, targetId);
      if (!targetProfile) {
        throw new ConvexError({ code: "not_found", reason: "That person isn't here." });
      }
      await assertNotBlocked(ctx, project.userId, targetId);
      if (actorId !== project.userId) await assertNotBlocked(ctx, actorId, targetId);

      const existing = rows.find((r) => r.userId === targetId) ?? null;
      if (existing && !canLeadReinvite(existing.status)) {
        return { ok: true as const, changed: false as const, memberId: existing._id, status: existing.status, emailed: false };
      }
      const fields = freshRowFields({
        userId: targetId,
        name: targetProfile.name,
        email: undefined,
        role,
        status: "invited",
        invitedByUserId: actorId,
        message,
        claimToken: undefined,
        claimExpiresAt: undefined,
        now,
      });
      const memberId = existing
        ? (await ctx.db.patch(existing._id, fields), existing._id)
        : await ctx.db.insert("projectMembers", { projectId: args.projectId, ...fields });

      await notify(ctx, {
        userId: targetId,
        type: "project_invite",
        title: `${leadName} invited you to ${project.title}`,
        message: withNote(role, message),
        linkUrl: projectLink(project._id),
        relatedUserId: actorId,
      });
      return { ok: true as const, changed: true as const, memberId, status: "invited" as const, emailed: false };
    }

    // ——— Off platform (credit) ———
    const name = validateName(args.name);
    let email: string | undefined;
    if (args.email?.trim()) {
      if (!isValidEmail(args.email)) {
        throw new ConvexError({ code: "invalid_email", reason: "That email doesn't look right." });
      }
      email = normalizeEmail(args.email);
    }

    const existing = email ? findMemberByEmail(rows, email) : null;
    if (existing && !canLeadReinvite(existing.status)) {
      return { ok: true as const, changed: false as const, memberId: existing._id, status: existing.status, emailed: false };
    }

    if (email) {
      // 10 emailed invites per lead per day, over every project.
      const byLead = await ctx.db
        .query("projectMembers")
        .withIndex("by_invitedByUserId", (q) => q.eq("invitedByUserId", actorId))
        .collect();
      const emailed = byLead.filter((r) => r.email !== undefined && r._id !== existing?._id);
      if (countInWindow(emailed, now) >= EMAIL_INVITE_DAILY_LIMIT_PER_LEAD) {
        throw new ConvexError({
          code: "rate_limited",
          reason: "That's enough emailed invites for today — try again tomorrow.",
        });
      }
    }

    const claimToken = crypto.randomUUID();
    const fields = freshRowFields({
      userId: undefined,
      name,
      email,
      role,
      status: "invited",
      invitedByUserId: actorId,
      message,
      claimToken,
      claimExpiresAt: now + CLAIM_TTL_MS,
      now,
    });
    const memberId = existing
      ? (await ctx.db.patch(existing._id, fields), existing._id)
      : await ctx.db.insert("projectMembers", { projectId: args.projectId, ...fields });

    if (email) {
      // Non-users can't go through scheduleNotificationEmail (it takes a
      // userId) — schedule the action directly, as announcements.ts and
      // waitlist.ts do. ctaUrl is a path; the action prefixes SITE_URL.
      await ctx.scheduler.runAfter(0, internal.emails.sendNotificationEmail, {
        to: email,
        ...buildClaimEmail({ leadName, projectTitle: project.title, role, message }, claimToken),
      });
    }
    return { ok: true as const, changed: true as const, memberId, status: "invited" as const, emailed: email !== undefined };
  },
});

/** Invitee answers an on-platform invite. */
export const respondToInvite = mutation({
  args: { projectId: v.id("projects"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await findMemberByUser(ctx, args.projectId, userId);
    if (!existing) throw new ConvexError({ code: "not_found", reason: "No invite to answer." });
    if (existing.status !== "invited") {
      return { ok: true as const, changed: false as const, status: existing.status };
    }
    const project = await requireProject(ctx, args.projectId);
    const status = args.accept ? ("accepted" as const) : ("declined" as const);
    await ctx.db.patch(existing._id, { status, respondedAt: Date.now() });

    const profile = await getProfile(ctx, userId);
    const name = profile?.name || existing.name;
    await notify(ctx, {
      userId: project.userId,
      type: args.accept ? "project_member_joined" : "project_member_declined",
      title: args.accept ? `${name} joined ${project.title}` : `${name} declined ${project.title}`,
      message: existing.role,
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const, changed: true as const, status };
  },
});

/** Lead answers a request. */
export const decideRequest = mutation({
  args: { memberId: v.id("projectMembers"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    const row = await ctx.db.get(args.memberId);
    if (!row) throw new ConvexError({ code: "not_found", reason: "No such request." });
    const project = await requireProject(ctx, row.projectId);
    await assertLead(ctx, project, actorId);
    if (row.status !== "pending") {
      return { ok: true as const, changed: false as const, status: row.status };
    }
    const status = args.accept ? ("accepted" as const) : ("declined" as const);
    await ctx.db.patch(row._id, { status, respondedAt: Date.now() });

    if (row.userId) {
      await notify(ctx, {
        userId: row.userId,
        type: "project_request_decided",
        title: args.accept ? `You're on ${project.title}` : `${project.title} didn't have room`,
        message: `as ${row.role}`,
        linkUrl: projectLink(project._id),
        relatedUserId: actorId,
      });
    }
    return { ok: true as const, changed: true as const, status };
  },
});

/** Lead removes a member — also how a pending invite or an off-platform
 * credit is cancelled (the claim token is cleared so the link dies). Only
 * someone who was actually ON the team (accepted) is told; cancelling an
 * unanswered invite is silent. */
export const removeMember = mutation({
  args: { memberId: v.id("projectMembers") },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    const row = await ctx.db.get(args.memberId);
    if (!row) throw new ConvexError({ code: "not_found", reason: "No such member." });
    const project = await requireProject(ctx, row.projectId);
    await assertLead(ctx, project, actorId);
    if (row.status === "removed") {
      return { ok: true as const, changed: false as const };
    }
    const wasOnTeam = row.status === "accepted";
    await ctx.db.patch(row._id, {
      status: "removed",
      respondedAt: Date.now(),
      claimToken: undefined,
      claimExpiresAt: undefined,
    });
    if (wasOnTeam && row.userId) {
      await notify(ctx, {
        userId: row.userId,
        type: "project_member_removed",
        title: `You were removed from ${project.title}`,
        message: "",
        linkUrl: projectLink(project._id),
        relatedUserId: actorId,
      });
    }
    return { ok: true as const, changed: true as const };
  },
});

/** An accepted member leaves. */
export const leaveProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await findMemberByUser(ctx, args.projectId, userId);
    if (!existing || existing.status !== "accepted") {
      return { ok: true as const, changed: false as const };
    }
    const project = await requireProject(ctx, args.projectId);
    await ctx.db.patch(existing._id, { status: "left", respondedAt: Date.now() });

    const profile = await getProfile(ctx, userId);
    const name = profile?.name || existing.name;
    await notify(ctx, {
      userId: project.userId,
      type: "project_member_left",
      title: `${name} left ${project.title}`,
      message: existing.role,
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const, changed: true as const };
  },
});

/** Signed-in person claims an off-platform credit (§3). The token is a
 * claim credential, not a signup credential — the account already exists.
 *
 * If the claimer already has a row on this project (they asked to join, or
 * were invited on-platform, before the lead credited them by email), the
 * existing row is the one that survives: it is marked accepted with the
 * credit's role and the token row is deleted, so by_projectId_userId stays
 * one-row-per-person. */
export const claimInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const now = Date.now();
    const row = await ctx.db
      .query("projectMembers")
      .withIndex("by_claimToken", (q) => q.eq("claimToken", args.token))
      .first();
    if (
      !row ||
      row.status !== "invited" ||
      row.userId !== undefined ||
      row.claimExpiresAt === undefined ||
      row.claimExpiresAt <= now
    ) {
      throw new ConvexError({
        code: "invalid_claim",
        reason: "That link isn't valid any more — ask the lead to send a new one.",
      });
    }
    const project = await requireProject(ctx, row.projectId);
    if (project.userId === userId) {
      throw new ConvexError({ code: "forbidden", reason: "You lead this project." });
    }
    await assertNotBlocked(ctx, userId, project.userId);

    const profile = await getProfile(ctx, userId);
    const name = profile?.name || row.name;
    const existingMine = await findMemberByUser(ctx, row.projectId, userId);

    let memberId: Id<"projectMembers">;
    if (existingMine) {
      memberId = existingMine._id;
      if (existingMine.status !== "accepted") {
        await ctx.db.patch(existingMine._id, {
          status: "accepted",
          role: row.role,
          name,
          invitedByUserId: row.invitedByUserId,
          respondedAt: now,
        });
      }
      await ctx.db.delete(row._id);
    } else {
      memberId = row._id;
      await ctx.db.patch(row._id, {
        userId,
        name,
        status: "accepted",
        respondedAt: now,
        claimToken: undefined,
        claimExpiresAt: undefined,
      });
    }

    await notify(ctx, {
      userId: project.userId,
      type: "project_member_joined",
      title: `${name} joined ${project.title}`,
      message: row.role,
      linkUrl: projectLink(project._id),
      relatedUserId: userId,
    });
    return { ok: true as const, projectId: project._id, memberId };
  },
});

// ——————————————————————————————————————————————————————————————
// Queries (§4)
// ——————————————————————————————————————————————————————————————

/** Public: what the /claim/:token page shows before (or without) signing
 * in. Never the email. `leadInviteSlug` is the lead's normal signup link. */
export const getClaim = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("projectMembers")
      .withIndex("by_claimToken", (q) => q.eq("claimToken", args.token))
      .first();
    if (
      !row ||
      row.status !== "invited" ||
      row.userId !== undefined ||
      row.claimExpiresAt === undefined ||
      row.claimExpiresAt <= Date.now()
    ) {
      return null;
    }
    const project = await ctx.db.get(row.projectId);
    if (!project) return null;
    const lead = await getProfile(ctx, project.userId);
    return {
      projectId: project._id,
      projectTitle: project.title,
      role: row.role,
      leadName: lead?.name ?? "The project lead",
      leadInviteSlug: lead?.inviteSlug ?? null,
    };
  },
});

/** The Team card. `pending` / `invited` only for the lead (or an
 * operator). Never returns `email` or `claimToken` — every entry goes
 * through toPersonEntry / toCreditEntry / toInvitedEntry. Null when signed
 * out or the project is missing. */
export const getTeam = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const [rows, leadProfile, viewerProfile] = await Promise.all([
      listProjectRows(ctx, args.projectId),
      getProfile(ctx, project.userId),
      project.userId === userId ? Promise.resolve(null) : getProfile(ctx, userId),
    ]);
    const isLead = project.userId === userId || isAdminProfile(viewerProfile);

    const lead = {
      profileId: leadProfile?._id ?? null,
      userId: project.userId,
      name: leadProfile?.name ?? "The project lead",
      imageUrl: await resolveImageUrl(ctx, leadProfile),
    };

    const accepted: PersonEntry[] = [];
    for (const row of rows) {
      if (row.status !== "accepted" || !row.userId) continue;
      accepted.push(toPersonEntry(row, await resolvePerson(ctx, row.userId)));
    }

    const credits: CreditEntry[] = rows
      .filter((r) => r.status === "invited" && r.userId === undefined)
      .map(toCreditEntry);

    const myRow = rows.find((r) => r.userId === userId);
    const mine =
      myRow && (myRow.status === "pending" || myRow.status === "invited" || myRow.status === "accepted")
        ? { memberId: myRow._id, status: myRow.status, role: myRow.role }
        : undefined;

    if (!isLead) return { lead, accepted, credits, mine };

    const pending: PersonEntry[] = [];
    for (const row of rows) {
      if (row.status !== "pending") continue;
      pending.push(toPersonEntry(row, await resolvePerson(ctx, row.userId)));
    }
    const invited: InvitedEntry[] = [];
    for (const row of rows) {
      if (row.status !== "invited") continue;
      invited.push(toInvitedEntry(row, await resolvePerson(ctx, row.userId)));
    }
    return { lead, accepted, credits, mine, pending, invited };
  },
});

/** Public: projects a person leads or is accepted on, for the profile's
 * Projects section. Archived projects excluded; newest project first. */
export const listAffiliations = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return [];

    const [owned, acceptedRows] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
        .collect(),
      ctx.db
        .query("projectMembers")
        .withIndex("by_userId_status", (q) => q.eq("userId", profile.userId).eq("status", "accepted"))
        .collect(),
    ]);

    type Row = { projectId: Id<"projects">; title: string; role: string; stage: Stage; kind: string; createdAt: number };
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const project of owned) {
      if (project.status === "archived") continue;
      seen.add(String(project._id));
      out.push({
        projectId: project._id,
        title: project.title,
        role: "Lead",
        stage: resolveStage(project),
        kind: project.kind,
        createdAt: project.createdAt,
      });
    }
    for (const row of acceptedRows) {
      if (seen.has(String(row.projectId))) continue;
      const project = await ctx.db.get(row.projectId);
      if (!project || project.status === "archived") continue;
      seen.add(String(project._id));
      out.push({
        projectId: project._id,
        title: project.title,
        role: row.role,
        stage: resolveStage(project),
        kind: project.kind,
        createdAt: project.createdAt,
      });
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out.map(({ projectId, title, role, stage, kind }) => ({ projectId, title, role, stage, kind }));
  },
});

/** People picker for on-platform invites: at most 10 name matches, a
 * narrow projection (profiles.search returns whole documents, adminCode
 * included). Excludes the caller. Empty when signed out or `q` is blank. */
export const searchPeopleForInvite = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const q = args.q.trim().toLowerCase();
    if (!q) return [];

    // Same full scan profiles.search does — small directory by design.
    const profiles = await ctx.db.query("profiles").collect();
    const hits = profiles
      .filter((p) => p.userId !== userId && nameMatches(p.name, q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, SEARCH_LIMIT);

    const out: { profileId: Id<"profiles">; userId: Id<"users">; name: string; imageUrl: string | null }[] = [];
    for (const p of hits) {
      out.push({
        profileId: p._id,
        userId: p.userId,
        name: p.name,
        imageUrl: await resolveImageUrl(ctx, p),
      });
    }
    return out;
  },
});
