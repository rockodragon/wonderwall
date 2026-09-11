// Grant proposals: a creative's ask TO the Grant Fund. Until this file, the
// `pool.propose` capability (garden/capabilities.ts) had zero consumers —
// every grant on /fund/:slug was entered by hand by an operator
// (garden/allocations.ts's recordAllocation). This is the front door:
// submitProposal is the first real caller of assertCanPure("pool.propose"),
// decideProposal is how an operator turns an ask into a decision, and a real
// payout is still recorded as its own `allocations` row (this table is the
// request/review record, never the public ledger).
//
// House style (garden/projectTeam.ts, the most recently written module
// here): a pure core at the top — validation, the one-open-ask rule, and the
// client projections that enumerate their output keys so `operatorNote`
// (internal only) can never leak to a non-operator — unit-tested without
// Convex in grantProposals.test.ts; thin ctx.db wrappers below.

import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isAdminProfile } from "../helpers";
import { can } from "./capabilities";
import { assertCanPure, getGardenUser } from "./entitlements";

// ——————————————————————————————————————————————————————————————
// Pure core
// ——————————————————————————————————————————————————————————————

export type ProposalStatus = Doc<"grantProposals">["status"];

export const MAX_TITLE_LENGTH = 120;
export const MAX_SUMMARY_LENGTH = 2000;
/** Floor on an ask — same "give at least $5" floor the pool-contribution
 * flow (fund.$slug.tsx's AddToPoolPanel) uses for money moving the other
 * way, so the two lanes read as one consistent minimum. */
export const MIN_AMOUNT_CENTS = 500;

/** Statuses that still represent an open ask — the one-open-ask rule and
 * withdraw/decide both key off this set. */
const OPEN_STATUSES: ReadonlySet<ProposalStatus> = new Set(["submitted", "under_review"]);

export function isOpenProposalStatus(status: string): boolean {
  return OPEN_STATUSES.has(status as ProposalStatus);
}

/** "One open ask at a time" (task spec): true when `rows` (a proposer's own
 * rows, any fund) already has a submitted/under_review row for `hostOrgId`.
 * Pure so submitProposal's check is unit-testable without Convex — mirrors
 * projectTeam.ts's reuse-before-insert shape (read the index, decide in a
 * pure function, then write). */
export function hasOpenProposal(
  rows: ReadonlyArray<{ hostOrgId: unknown; status: string }>,
  hostOrgId: unknown,
): boolean {
  return rows.some((r) => String(r.hostOrgId) === String(hostOrgId) && isOpenProposalStatus(r.status));
}

export function validateProposalTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ConvexError({ code: "invalid_title", reason: "Give the proposal a title." });
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ConvexError({
      code: "invalid_title",
      reason: `Keep the title under ${MAX_TITLE_LENGTH} characters.`,
    });
  }
  return trimmed;
}

export function validateProposalSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) {
    throw new ConvexError({ code: "invalid_summary", reason: "Say what the grant is for." });
  }
  if (trimmed.length > MAX_SUMMARY_LENGTH) {
    throw new ConvexError({
      code: "invalid_summary",
      reason: `Keep the summary under ${MAX_SUMMARY_LENGTH} characters.`,
    });
  }
  return trimmed;
}

/** Amounts are entered in cents; must be a positive whole number at or
 * above the $5 floor — same integer rule allocations.ts's
 * isValidAmountCents uses, tightened with a floor since this is a request
 * a person types in, not an operator-entered ledger amount. */
export function isValidProposalAmountCents(amountCents: number): boolean {
  return Number.isInteger(amountCents) && amountCents >= MIN_AMOUNT_CENTS;
}

// ——— Client projections ——————————————————————————————————————————
// Everything the two list queries return goes through one of these. They
// enumerate their output keys — no spreading a row — so `operatorNote` can
// never leak to the proposer's own list. grantProposals.test.ts asserts
// exactly that.

export interface MyProposalEntry {
  proposalId: Id<"grantProposals">;
  hostOrgId: Id<"hostOrgs">;
  projectId: Id<"projects"> | null;
  title: string;
  summary: string;
  amountCents: number;
  status: ProposalStatus;
  createdAt: number;
  decidedAt: number | null;
}

/** The proposer's own view — never `operatorNote`, never `decidedByUserId`
 * (an internal reviewer identity the proposer has no reason to see). */
export function toMyProposalEntry(row: Doc<"grantProposals">): MyProposalEntry {
  return {
    proposalId: row._id,
    hostOrgId: row.hostOrgId,
    projectId: row.projectId ?? null,
    title: row.title,
    summary: row.summary,
    amountCents: row.amountCents,
    status: row.status,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt ?? null,
  };
}

export interface ReviewProposalEntry {
  proposalId: Id<"grantProposals">;
  hostOrgId: Id<"hostOrgs">;
  projectId: Id<"projects"> | null;
  proposerProfileId: Id<"profiles"> | null;
  proposerName: string;
  title: string;
  summary: string;
  amountCents: number;
  status: ProposalStatus;
  operatorNote: string | null;
  createdAt: number;
  decidedAt: number | null;
}

/** The operator's review view — the only projection that includes
 * `operatorNote` (it's the internal note operators leave each other). */
export function toReviewProposalEntry(
  row: Doc<"grantProposals">,
  proposer: { profileId: Id<"profiles"> | null; name: string },
): ReviewProposalEntry {
  return {
    proposalId: row._id,
    hostOrgId: row.hostOrgId,
    projectId: row.projectId ?? null,
    proposerProfileId: proposer.profileId,
    proposerName: proposer.name,
    title: row.title,
    summary: row.summary,
    amountCents: row.amountCents,
    status: row.status,
    operatorNote: row.operatorNote ?? null,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt ?? null,
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
    .unique();
}

async function requireOperator(ctx: Ctx, userId: Id<"users">): Promise<void> {
  const profile = await getProfile(ctx, userId);
  if (!isAdminProfile(profile)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "Grant proposals are reviewed by operators. This account doesn't have that access.",
    });
  }
}

function fundLink(slug: string): string {
  return `/fund/${slug}`;
}

// ——————————————————————————————————————————————————————————————
// Mutations
// ——————————————————————————————————————————————————————————————

/** Propose to a fund. First real consumer of `pool.propose` — gated through
 * the exact same assertCanPure(getGardenUser(...), "pool.propose") path
 * every other capability-gated mutation in this codebase uses, so a denial
 * here carries the identical anatomy (reason/upgradePath) the client's
 * DenialPanel already knows how to render. */
export const submitProposal = mutation({
  args: {
    hostOrgId: v.id("hostOrgs"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    summary: v.string(),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const gardenUser = await getGardenUser(ctx, userId);
    assertCanPure(gardenUser, "pool.propose");

    const title = validateProposalTitle(args.title);
    const summary = validateProposalSummary(args.summary);
    if (!isValidProposalAmountCents(args.amountCents)) {
      throw new ConvexError({
        code: "invalid_amount",
        reason: `Ask for at least $${(MIN_AMOUNT_CENTS / 100).toFixed(0)}, in whole cents.`,
      });
    }

    const hostOrg = await ctx.db.get(args.hostOrgId);
    if (!hostOrg) {
      throw new ConvexError({ code: "unknown_fund", reason: "That fund isn't set up here." });
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) {
        throw new ConvexError({ code: "not_found", reason: "That project isn't there." });
      }
      if (project.userId !== userId) {
        throw new ConvexError({
          code: "forbidden",
          reason: "You can only attach a proposal to a project you lead.",
        });
      }
    }

    // One open ask at a time (task spec): read by_userId_status before
    // insert, the way projectTeam.ts enforces its own uniqueness rules.
    const mine = await ctx.db
      .query("grantProposals")
      .withIndex("by_userId_status", (q) => q.eq("userId", userId))
      .collect();
    if (hasOpenProposal(mine, args.hostOrgId)) {
      throw new ConvexError({
        code: "open_proposal_exists",
        reason: "You already have an open proposal to this fund. Withdraw it before sending another.",
      });
    }

    const now = Date.now();
    const proposalId = await ctx.db.insert("grantProposals", {
      userId,
      hostOrgId: args.hostOrgId,
      projectId: args.projectId,
      title,
      summary,
      amountCents: args.amountCents,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    });
    return { proposalId };
  },
});

/** Proposer takes back an open ask. No-op (not an error) once it's already
 * past submitted/under_review — same "no-op, not refused" shape
 * projectTeam.ts's withdrawRequest uses for the identical situation. */
export const withdrawProposal = mutation({
  args: { proposalId: v.id("grantProposals") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await ctx.db.get(args.proposalId);
    if (!row) throw new ConvexError({ code: "not_found", reason: "That proposal isn't there." });
    if (row.userId !== userId) {
      throw new ConvexError({ code: "forbidden", reason: "Only the proposer can withdraw this." });
    }
    if (!isOpenProposalStatus(row.status)) {
      return { ok: true as const, changed: false as const, status: row.status as ProposalStatus };
    }
    await ctx.db.patch(row._id, { status: "withdrawn", updatedAt: Date.now() });
    return { ok: true as const, changed: true as const, status: "withdrawn" as const };
  },
});

/** Operator decides an open proposal. Sets approved/declined + decidedBy/
 * decidedAt, and notifies the proposer (follows.ts's notifyFollowers /
 * projectTeam.ts's notify insert shape) — linking to the fund page, since
 * that's where a resulting allocation will actually be published. Does NOT
 * itself record an allocation: pairing an approval with a real payout is a
 * separate operator step (recordAllocation), which is how allocationId
 * gets set on this row. */
export const decideProposal = mutation({
  args: {
    proposalId: v.id("grantProposals"),
    approve: v.boolean(),
    operatorNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    await requireOperator(ctx, actorId);

    const row = await ctx.db.get(args.proposalId);
    if (!row) throw new ConvexError({ code: "not_found", reason: "That proposal isn't there." });
    if (!isOpenProposalStatus(row.status)) {
      throw new ConvexError({
        code: "already_decided",
        reason: "This proposal was already decided.",
      });
    }

    const status = args.approve ? ("approved" as const) : ("declined" as const);
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status,
      decidedByUserId: actorId,
      decidedAt: now,
      operatorNote: args.operatorNote,
      updatedAt: now,
    });

    const hostOrg = await ctx.db.get(row.hostOrgId);
    await ctx.db.insert("notifications", {
      userId: row.userId,
      type: "grant_proposal_decided",
      title: args.approve ? "Your grant proposal was approved" : "Your grant proposal wasn't approved",
      message: row.title,
      linkUrl: hostOrg ? fundLink(hostOrg.slug) : undefined,
      relatedUserId: actorId,
      createdAt: now,
    });

    return { ok: true as const, status };
  },
});

// ——————————————————————————————————————————————————————————————
// Queries
// ——————————————————————————————————————————————————————————————

/** The signed-in caller's own proposals, newest first, optionally scoped to
 * one fund. Never `operatorNote` — every row goes through
 * toMyProposalEntry. Empty (not an error) when signed out. */
export const listMyProposals = query({
  args: { hostOrgId: v.optional(v.id("hostOrgs")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("grantProposals")
      .withIndex("by_userId_status", (q) => q.eq("userId", userId))
      .collect();
    const scoped = args.hostOrgId
      ? rows.filter((r) => String(r.hostOrgId) === String(args.hostOrgId))
      : rows;
    scoped.sort((a, b) => b.createdAt - a.createdAt);
    return scoped.map(toMyProposalEntry);
  },
});

/** Operator review queue for one fund, optionally filtered to one status.
 * Includes operatorNote and the resolved proposer name/profileId — this is
 * the one query allowed to. Newest first. */
export const listProposalsForReview = query({
  args: {
    hostOrgId: v.id("hostOrgs"),
    status: v.optional(
      v.union(
        v.literal("submitted"),
        v.literal("under_review"),
        v.literal("approved"),
        v.literal("declined"),
        v.literal("withdrawn"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const actorId = await requireUser(ctx);
    await requireOperator(ctx, actorId);

    const status = args.status;
    const rows = await ctx.db
      .query("grantProposals")
      .withIndex("by_hostOrgId_status", (q) =>
        status ? q.eq("hostOrgId", args.hostOrgId).eq("status", status) : q.eq("hostOrgId", args.hostOrgId),
      )
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);

    const out: ReviewProposalEntry[] = [];
    for (const row of rows) {
      const proposerProfile = await getProfile(ctx, row.userId);
      out.push(
        toReviewProposalEntry(row, {
          profileId: proposerProfile?._id ?? null,
          name: proposerProfile?.name || "Someone",
        }),
      );
    }
    return out;
  },
});

/** Can the signed-in caller propose to this fund right now, and what's its
 * id? Powers fund.$slug.tsx's "Propose a grant" section — both the denial
 * anatomy (reason + upgradePath, verbatim) the same way tables.ts's getTable
 * embeds `viewer.canJoin`, and the hostOrgId the form/list queries need,
 * since getFundPage (allocations.ts, which this file doesn't own) resolves
 * the same slug but never returns the raw id. `pool.propose` itself doesn't
 * vary by fund, only by membership level — resolving the slug is the only
 * reason this takes an argument. Unknown slug: hostOrgId null, not allowed.
 * Signed out: hostOrgId resolved, allowed false, no reason — the client
 * shows a plain sign-in prompt instead of this denial. */
export const getProposeAccess = query({
  args: { hostOrgSlug: v.string() },
  handler: async (ctx, args) => {
    const hostOrg = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.hostOrgSlug))
      .unique();
    if (!hostOrg) return { hostOrgId: null, allowed: false as const };

    const userId = await getAuthUserId(ctx);
    if (!userId) return { hostOrgId: hostOrg._id, allowed: false as const };

    const gardenUser = await getGardenUser(ctx, userId);
    const result = can(gardenUser, "pool.propose");
    return {
      hostOrgId: hostOrg._id,
      allowed: result.allowed,
      reason: result.reason,
      upgradePath: result.upgradePath,
    };
  },
});

/** The signed-in caller's own non-archived projects, for the proposal
 * form's optional project picker — a narrow projection (id + title only),
 * same reasoning as operator.ts's listProjectsForAllocation. */
export const listMyProjectsForProposal = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return projects
      .filter((p) => p.status !== "archived")
      .map((p) => ({ projectId: p._id, title: p.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});
