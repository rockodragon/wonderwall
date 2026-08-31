// Operator console (October concierge ops, docs/phase-1b/spec.md) — until
// self-serve ships, operators (profile.isAdmin) hand-create tables,
// sessions, and coverage codes, and record AP fund allocations by hand.
// This file covers the write paths tables.ts/coverage.ts don't (creation,
// not join/redeem) plus the single read-model /admin/garden runs on.
//
// House style, same as allocations.ts/coverage.ts: pure core (validation)
// unit-tested without Convex in operator.test.ts; thin ctx.db wrappers
// below. Every mutation/query here is operator-gated via isAdminProfile
// (helpers.ts) — mirrors allocations.recordAllocation's inline check
// rather than requireAdmin, since we need the profile row either way to
// resolve who's asking.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import { isAdminProfile } from "../helpers";

// ——————————————————————————————————————————————————————————————
// Pure core — validation only, no ctx. Unit-tested in operator.test.ts.
// ——————————————————————————————————————————————————————————————

/** Table/session slugs: lowercase letters, numbers, hyphens — the same
 * shape stories.ts's slugifyTitle produces, but operator-typed by hand
 * here rather than generated, so we validate instead of generate. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** Coverage codes are entered by hand and matched case-insensitively at
 * redemption (coverage.ts uppercases on lookup) — normalize once here so
 * what's stored is what's compared. */
export function normalizeCoverageCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSeats(seats: number): boolean {
  return Number.isInteger(seats) && seats > 0;
}

export function isValidPriceCents(priceCents: number): boolean {
  return Number.isInteger(priceCents) && priceCents >= 0;
}

export function isValidDurationMins(mins: number): boolean {
  return Number.isInteger(mins) && mins > 0;
}

/** datetime-local input ("2026-08-20T19:00") -> epoch ms, or null when it
 * doesn't parse — the mutation turns null into the warm "pick a real
 * date/time" error rather than inserting NaN. */
export function parseStartsAtMs(iso: string): number | null {
  if (!iso.trim()) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ——————————————————————————————————————————————————————————————
// Convex wrappers
// ——————————————————————————————————————————————————————————————

/** Every export in this file is an operator tool — resolve + gate the
 * caller once, shared by queries and mutations alike. */
async function requireOperator(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError({ code: "unauthenticated" });

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!isAdminProfile(profile)) {
    throw new ConvexError({
      code: "forbidden",
      reason: "This is an operator tool — this account doesn't have that access.",
    });
  }
  return userId;
}

export const createTable = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    hostOrgSlug: v.string(),
    mode: v.union(v.literal("open"), v.literal("member"), v.literal("cohort")),
    format: v.optional(v.string()),
    program: v.optional(v.string()),
    cadence: v.optional(v.string()),
    blurb: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    meetingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOperator(ctx);

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "invalid_name", reason: "Give the table a name." });
    }

    const slug = args.slug.trim().toLowerCase();
    if (!isValidSlug(slug)) {
      throw new ConvexError({
        code: "invalid_slug",
        reason: 'Slugs are lowercase letters, numbers, and hyphens only — try something like "tuesday-critique".',
      });
    }

    if (args.priceCents !== undefined && !isValidPriceCents(args.priceCents)) {
      throw new ConvexError({
        code: "invalid_price",
        reason: "Price must be a positive whole number of cents, or leave it blank for a free table.",
      });
    }

    const hostOrg = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.hostOrgSlug))
      .unique();
    if (!hostOrg) {
      throw new ConvexError({
        code: "unknown_host_org",
        reason: `No host org found for "${args.hostOrgSlug}" — check the slug.`,
      });
    }

    const existing = await ctx.db
      .query("gardenTables")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "slug_taken",
        reason: `A table already uses the slug "${slug}" — pick another.`,
      });
    }

    const id = await ctx.db.insert("gardenTables", {
      name,
      slug,
      hostOrgId: hostOrg._id,
      mode: args.mode,
      format: args.format,
      program: args.program,
      cadence: args.cadence,
      blurb: args.blurb,
      priceCents: args.priceCents,
      meetingUrl: args.meetingUrl,
      status: "active",
      createdAt: Date.now(),
    });
    return { tableId: id };
  },
});

export const addSession = mutation({
  args: {
    tableSlug: v.string(),
    startsAtISO: v.string(),
    durationMins: v.optional(v.number()),
    meetingUrl: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOperator(ctx);

    const startsAt = parseStartsAtMs(args.startsAtISO);
    if (startsAt === null) {
      throw new ConvexError({
        code: "invalid_datetime",
        reason: "That date/time didn't parse — pick it from the calendar field.",
      });
    }

    if (args.durationMins !== undefined && !isValidDurationMins(args.durationMins)) {
      throw new ConvexError({
        code: "invalid_duration",
        reason: "Duration must be a positive number of minutes.",
      });
    }

    const table = await ctx.db
      .query("gardenTables")
      .withIndex("by_slug", (q) => q.eq("slug", args.tableSlug))
      .unique();
    if (!table) {
      throw new ConvexError({
        code: "unknown_table",
        reason: `No table found for "${args.tableSlug}" — check the slug.`,
      });
    }

    const id = await ctx.db.insert("tableSessions", {
      tableId: table._id,
      title: args.title,
      startsAt,
      durationMins: args.durationMins,
      meetingUrl: args.meetingUrl,
      createdAt: Date.now(),
    });
    return { sessionId: id };
  },
});

export const createCoverageCode = mutation({
  args: {
    code: v.string(),
    seats: v.number(),
    hostOrgSlug: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOperator(ctx);

    const code = normalizeCoverageCode(args.code);
    if (!code) {
      throw new ConvexError({
        code: "invalid_code",
        reason: 'Give the code a name — something like "GRACE-FALL".',
      });
    }

    if (!isValidSeats(args.seats)) {
      throw new ConvexError({
        code: "invalid_seats",
        reason: "Seats must be a positive whole number.",
      });
    }

    const hostOrg = await ctx.db
      .query("hostOrgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.hostOrgSlug))
      .unique();
    if (!hostOrg) {
      throw new ConvexError({
        code: "unknown_host_org",
        reason: `No host org found for "${args.hostOrgSlug}" — check the slug.`,
      });
    }

    const existing = await ctx.db
      .query("coverageCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "code_taken",
        reason: `The code "${code}" is already in use — pick another.`,
      });
    }

    // Stripe wiring lands later (D2 follow-up) — "manual" marks codes an
    // operator entered by hand, ahead of a real church subscription.
    const stripeSubscriptionId = args.stripeSubscriptionId?.trim() || "manual";

    const id = await ctx.db.insert("coverageCodes", {
      hostOrgId: hostOrg._id,
      code,
      seats: args.seats,
      stripeSubscriptionId,
      status: "active",
      createdAt: Date.now(),
    });
    return { codeId: id };
  },
});

/** Everything the panel needs in one shot — the read half of the operator
 * console. Collects small operator-scale tables directly (no pagination:
 * October concierge volume, not open enrollment) and denormalizes names/
 * counts so the client never has to join. */
export const listOperatorData = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);

    const [hostOrgs, tables, coverageCodes, allocations] = await Promise.all([
      ctx.db.query("hostOrgs").collect(),
      ctx.db.query("gardenTables").collect(),
      ctx.db.query("coverageCodes").collect(),
      ctx.db.query("allocations").collect(),
    ]);

    const hostOrgById = new Map(hostOrgs.map((o) => [String(o._id), o]));

    const now = Date.now();
    const upcomingSessions: {
      _id: Id<"tableSessions">;
      tableName: string;
      tableSlug: string;
      title?: string;
      startsAt: number;
      durationMins?: number;
      meetingUrl?: string;
    }[] = [];

    const tablesWithCounts = await Promise.all(
      tables.map(async (t) => {
        const sessions = await ctx.db
          .query("tableSessions")
          .withIndex("by_tableId_startsAt", (q) => q.eq("tableId", t._id))
          .collect();
        const roster = await ctx.db
          .query("tableMemberships")
          .withIndex("by_tableId", (q) => q.eq("tableId", t._id))
          .collect();

        for (const s of sessions) {
          if (s.startsAt >= now) {
            upcomingSessions.push({
              _id: s._id,
              tableName: t.name,
              tableSlug: t.slug,
              title: s.title,
              startsAt: s.startsAt,
              durationMins: s.durationMins,
              meetingUrl: s.meetingUrl,
            });
          }
        }

        return {
          _id: t._id,
          name: t.name,
          slug: t.slug,
          mode: t.mode,
          status: t.status,
          hostOrgName: hostOrgById.get(String(t.hostOrgId))?.name ?? "Unknown host",
          sessionCount: sessions.length,
          rosterCount: roster.length,
        };
      }),
    );
    upcomingSessions.sort((a, b) => a.startsAt - b.startsAt);

    const coverageCodesWithCounts = await Promise.all(
      coverageCodes.map(async (c) => {
        const redemptions = await ctx.db
          .query("coverageRedemptions")
          .withIndex("by_codeId", (q) => q.eq("codeId", c._id))
          .collect();
        return {
          _id: c._id,
          code: c.code,
          seats: c.seats,
          redeemed: redemptions.length,
          status: c.status,
          hostOrgName: hostOrgById.get(String(c.hostOrgId))?.name ?? "Unknown host",
          createdAt: c.createdAt,
        };
      }),
    );

    const projectIds = [
      ...new Set(
        allocations
          .map((a) => a.projectId)
          .filter((id): id is Id<"projects"> => id !== undefined),
      ),
    ];
    const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
    const projectTitleById = new Map<string, string>();
    for (const p of projects) {
      if (p) projectTitleById.set(String(p._id), p.title);
    }

    const recentAllocations = [...allocations]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((a) => ({
        _id: a._id,
        hostOrgName: hostOrgById.get(String(a.hostOrgId))?.name ?? "Unknown host",
        recipientName: a.recipientName,
        amountCents: a.amountCents,
        period: a.period,
        note: a.note,
        projectTitle: a.projectId ? projectTitleById.get(String(a.projectId)) : undefined,
        createdAt: a.createdAt,
      }));

    return {
      hostOrgs: hostOrgs
        .map((o) => ({ _id: o._id, name: o.name, slug: o.slug }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      tables: tablesWithCounts.sort((a, b) => a.name.localeCompare(b.name)),
      upcomingSessions,
      coverageCodes: coverageCodesWithCounts.sort((a, b) => b.createdAt - a.createdAt),
      recentAllocations,
    };
  },
});

/** Small, standalone from listOperatorData so the allocations form's
 * project select can populate without paying for the whole panel's read
 * (tables/coverage/allocations) on every keystroke re-render. */
// Same non-archived/non-pending visible set as garden/projects.ts's
// listProjects — a completed project may still have pending allocations to
// pay out, so "active"-only would hide it from the operator too early.
const VISIBLE_STATUSES = new Set(["active", "in_progress", "completed"]);

export const listProjectsForAllocation = query({
  args: {},
  handler: async (ctx) => {
    await requireOperator(ctx);
    const projects = await ctx.db.query("projects").collect();
    return projects
      .filter((p) => VISIBLE_STATUSES.has(p.status))
      .map((p) => ({ _id: p._id, title: p.title, kind: p.kind }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});
