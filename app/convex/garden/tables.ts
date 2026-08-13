// Tables — ongoing gatherings with a roster (W4, spec §1.5). Operator-created
// in v1 (no self-serve table creation this phase); this file covers browse,
// detail, join/leave, and session RSVP.
//
// ctx typed loosely (`any`) — same reasoning as entitlements.ts / coverage.ts
// / memberships.ts: the generated DataModel predates the Garden tables
// (gardenTables, tableMemberships, tableSessions, sessionRsvps), so a typed
// QueryCtx/MutationCtx would fight `ctx.db.query("gardenTables")` etc. Once
// `npx convex dev` regenerates against the current schema this can tighten.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { can } from "./capabilities";
import type { GardenUser } from "./capabilities";
import { getGardenUser, throwDenial } from "./entitlements";

// ——— Pure core ———

/**
 * The join-permission decision: mode × existing membership × can(). Kept
 * pure (no ctx, no throwing) so it's unit-testable directly and so getTable's
 * viewer.canJoin and joinTable's gate read from the exact same logic — one
 * source of truth for "can this person join this table."
 *
 * table.join.member has no limit/used fields (see capabilities.ts), so
 * mirroring its reason/upgradePath here loses no information relative to
 * calling assertCanPure — the mutation throws the identical denial anatomy.
 */
export interface JoinDecision {
  allowed: boolean;
  alreadyMember?: boolean;
  paymentPending?: boolean;
  reason?: string;
  upgradePath?: string;
}

export function resolveTableJoin(args: {
  mode: string; // "open" | "member" | "cohort"
  alreadyMember: boolean;
  gardenUser: GardenUser;
  priceCents?: number;
}): JoinDecision {
  if (args.alreadyMember) return { allowed: true, alreadyMember: true };

  if (args.mode === "open") return { allowed: true };

  if (args.mode === "member" || args.mode === "cohort") {
    const gate = can(args.gardenUser, "table.join.member");
    if (!gate.allowed) {
      return { allowed: false, reason: gate.reason, upgradePath: gate.upgradePath };
    }
    // Cohort checkout is a WEEK-LATER TODO (Stripe cohort checkout lands
    // later — spec §1.5's cohort pricing is collected via "simple Stripe
    // checkout attached to the cohort"). For now: record the membership
    // immediately so the roster/session access is correct, and surface
    // paymentPending so the client can route to an operator-reconciled
    // checkout step instead of pretending the seat is paid for.
    return { allowed: true, paymentPending: args.mode === "cohort" && !!args.priceCents };
  }

  // Unknown mode — fail closed rather than guess at a gate.
  return {
    allowed: false,
    reason: "This table's join mode isn't set up yet — check back soon.",
  };
}

/** meetingUrl is gated on roster membership (spec §1.5): "a meeting link
 * ...revealed to roster members." Non-members get undefined, never the URL. */
export function visibleMeetingUrl(
  meetingUrl: string | undefined,
  isMember: boolean,
): string | undefined {
  return isMember ? meetingUrl : undefined;
}

// ——— Convex wrappers ———

export const listTables = query({
  args: {},
  handler: async (ctx) => {
    const tables = await ctx.db
      .query("gardenTables")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // A roster count is a fact about the table, not a person — fine to
    // compute eagerly here (unlike names, which stay behind getTable).
    return await Promise.all(
      tables.map(async (t: any) => {
        const roster = await ctx.db
          .query("tableMemberships")
          .withIndex("by_tableId", (q) => q.eq("tableId", t._id))
          .collect();
        return {
          _id: t._id,
          name: t.name,
          slug: t.slug,
          mode: t.mode,
          format: t.format,
          program: t.program,
          cadence: t.cadence,
          blurb: t.blurb,
          photoUrl: t.photoUrl,
          priceCents: t.priceCents,
          memberCount: roster.length,
        };
      }),
    );
  },
});

export const getTable = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("gardenTables")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!table) return null;

    const userId = await getAuthUserId(ctx);

    const [sessions, memberships] = await Promise.all([
      ctx.db
        .query("tableSessions")
        .withIndex("by_tableId_startsAt", (q) =>
          q.eq("tableId", table._id).gte("startsAt", Date.now()),
        )
        .collect(),
      ctx.db
        .query("tableMemberships")
        .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
        .collect(),
    ]);
    sessions.sort((a: any, b: any) => a.startsAt - b.startsAt);

    const isMember = userId != null && memberships.some((m: any) => String(m.userId) === String(userId));

    // Roster names — for everyone, members or not ("it's a community not a
    // secret society," spec instruction). Never email: we only ever select
    // `name` off profiles, so there's nothing to leak by omission.
    const profiles = await Promise.all(
      memberships.map((m: any) =>
        ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", m.userId))
          .unique(),
      ),
    );
    const rosterNames = profiles.filter(Boolean).map((p: any) => p.name);

    let canJoin: { allowed: boolean; reason?: string; upgradePath?: string } = { allowed: true };
    if (userId) {
      const gardenUser = await getGardenUser(ctx, userId);
      const decision = resolveTableJoin({
        mode: table.mode,
        alreadyMember: isMember,
        gardenUser,
        priceCents: table.priceCents,
      });
      canJoin = decision.alreadyMember
        ? { allowed: true }
        : { allowed: decision.allowed, reason: decision.reason, upgradePath: decision.upgradePath };
    }
    // Unauthenticated visitors get the simple "yes, go ahead" shape — real
    // gating happens at join time once we know who they are; we don't
    // pre-compute a denial for someone who hasn't logged in yet.

    return {
      _id: table._id,
      name: table.name,
      slug: table.slug,
      mode: table.mode,
      format: table.format,
      program: table.program,
      cadence: table.cadence,
      blurb: table.blurb,
      photoUrl: table.photoUrl,
      priceCents: table.priceCents,
      meetingUrl: visibleMeetingUrl(table.meetingUrl, isMember),
      roster: rosterNames,
      sessions: sessions.map((s: any) => ({
        _id: s._id,
        title: s.title,
        startsAt: s.startsAt,
        durationMins: s.durationMins,
        meetingUrl: visibleMeetingUrl(s.meetingUrl ?? table.meetingUrl, isMember),
      })),
      viewer: { isMember, canJoin },
    };
  },
});

export const joinTable = mutation({
  args: { tableId: v.id("gardenTables") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const table = await ctx.db.get(args.tableId);
    if (!table) {
      throw new ConvexError({
        code: "not_found",
        reason: "That table isn't there anymore — check the link and try another.",
      });
    }

    const existing = await ctx.db
      .query("tableMemberships")
      .withIndex("by_tableId_userId", (q) => q.eq("tableId", args.tableId).eq("userId", userId))
      .unique();

    const gardenUser = await getGardenUser(ctx, userId);
    const decision = resolveTableJoin({
      mode: table.mode,
      alreadyMember: !!existing,
      gardenUser,
      priceCents: table.priceCents,
    });

    if (decision.alreadyMember) return { alreadyMember: true };

    if (!decision.allowed) {
      // Same denial anatomy assertCanPure would throw for table.join.member —
      // see resolveTableJoin's doc comment for why this is safe to mirror.
      throwDenial("table.join.member", decision);
    }

    await ctx.db.insert("tableMemberships", {
      tableId: args.tableId,
      userId,
      joinedAt: Date.now(),
    });

    if (decision.paymentPending) {
      // WEEK-LATER TODO: wire the cohort's Stripe checkout here (spec §1.5 —
      // "cohort pricing ... collected via simple Stripe checkout attached to
      // the cohort"). Until then the membership above is recorded so the
      // roster/session access is correct, and the operator reconciles
      // payment by hand — this mirrors coverage codes' "never silently
      // strip a seat" posture, just in the other direction (grant first,
      // collect after).
      return { paymentPending: true };
    }
    return { ok: true };
  },
});

export const leaveTable = mutation({
  args: { tableId: v.id("gardenTables") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const existing = await ctx.db
      .query("tableMemberships")
      .withIndex("by_tableId_userId", (q) => q.eq("tableId", args.tableId).eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true };
  },
});

export const rsvpSession = mutation({
  args: {
    sessionId: v.id("tableSessions"),
    status: v.union(v.literal("going"), v.literal("out")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new ConvexError({
        code: "not_found",
        reason: "That session isn't there anymore — check the table for the current schedule.",
      });
    }

    const membership = await ctx.db
      .query("tableMemberships")
      .withIndex("by_tableId_userId", (q) =>
        q.eq("tableId", session.tableId).eq("userId", userId),
      )
      .unique();
    if (!membership) {
      throw new ConvexError({
        code: "not_a_member",
        reason: "RSVPs are for the table's roster — join the table first and you're set.",
      });
    }

    const existingRsvp = await ctx.db
      .query("sessionRsvps")
      .withIndex("by_sessionId_userId", (q) =>
        q.eq("sessionId", args.sessionId).eq("userId", userId),
      )
      .unique();

    if (existingRsvp) {
      await ctx.db.patch(existingRsvp._id, { status: args.status });
    } else {
      await ctx.db.insert("sessionRsvps", {
        sessionId: args.sessionId,
        userId,
        status: args.status,
        createdAt: Date.now(),
      });
    }
    return { ok: true, status: args.status };
  },
});
