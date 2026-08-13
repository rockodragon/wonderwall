// Real event RSVPs — the guest path, spec §1.6: "/events/first-table (and
// event pages generally) replace mailto with a real RSVP: name + email, no
// account required; account holders one-click."
//
// ctx typed loosely (`any`) — same reasoning as tables.ts / entitlements.ts:
// the generated DataModel predates eventRsvps.

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ——— Pure core ———

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export interface ExistingRsvp {
  name: string;
  email: string;
  invitedBy?: string;
  userId?: string;
}

export interface RsvpInput {
  name: string;
  email: string;
  invitedBy?: string;
  userId?: string;
}

export interface RsvpPlan {
  normalizedEmail: string;
  /** true when this email already has an RSVP on this event — the write
   * becomes an update (name/invitedBy/userId refresh) instead of a new row. */
  alreadyRsvpd: boolean;
  patch: { name: string; invitedBy?: string; userId?: string };
}

/**
 * Dedupe key is (eventId, lowercased+trimmed email) — the caller looks up
 * `existing` by that normalized email before calling this. A repeat RSVP
 * updates name/invitedBy/userId rather than duplicating the row; a field
 * omitted on the repeat keeps whatever was already on file (e.g. a returning
 * guest who doesn't re-supply the "bring someone" provenance keeps the
 * original invitedBy; a guest who signs in on a repeat visit gets userId
 * attached without needing to re-type anything).
 */
export function planRsvp(input: RsvpInput, existing: ExistingRsvp | null): RsvpPlan {
  return {
    normalizedEmail: normalizeEmail(input.email),
    alreadyRsvpd: existing !== null,
    patch: {
      name: input.name.trim(),
      invitedBy: input.invitedBy ?? existing?.invitedBy,
      userId: input.userId ?? existing?.userId,
    },
  };
}

export interface RsvpRow {
  name: string;
  email: string;
  invitedBy?: string;
  createdAt?: number;
}

/** organizer/admin see the full list (name + email + provenance); everyone
 * else gets a count and first names only — enough to feel the room, not
 * enough to scrape an email list off a public event page. */
export function buildRsvpVisibility(args: { rows: RsvpRow[]; canViewFull: boolean }):
  | { count: number; rsvps: RsvpRow[] }
  | { count: number; names: string[] } {
  if (args.canViewFull) {
    return { count: args.rows.length, rsvps: args.rows };
  }
  return { count: args.rows.length, names: args.rows.map((r) => firstName(r.name)) };
}

function firstName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "A guest";
  return trimmed.split(/\s+/)[0];
}

// ——— Convex wrappers ———

export const rsvpToEvent = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    invitedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({
        code: "not_found",
        reason: "That event isn't there anymore — check the link and try again.",
      });
    }

    // Auth is optional (spec: "no account required; account holders
    // one-click") — when signed in and the caller omits name/email, fill
    // them in from the profile/account instead of asking twice.
    const userId = await getAuthUserId(ctx);
    let name = args.name?.trim();
    let email = args.email?.trim();
    if (userId && (!name || !email)) {
      const [profile, userDoc] = await Promise.all([
        ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique(),
        ctx.db.get(userId),
      ]);
      if (!name) name = profile?.name ?? userDoc?.name;
      if (!email) email = userDoc?.email;
    }

    if (!name) {
      throw new ConvexError({
        code: "invalid_rsvp",
        reason: "We need a name to save your spot — add one and try again.",
      });
    }
    if (!email || !isValidEmail(email)) {
      throw new ConvexError({
        code: "invalid_rsvp",
        reason: "That email doesn't look right — double check it and try again.",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const existing = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId_email", (q) =>
        q.eq("eventId", args.eventId).eq("email", normalizedEmail),
      )
      .unique();

    const plan = planRsvp(
      { name, email, invitedBy: args.invitedBy, userId: userId ?? undefined },
      existing
        ? {
            name: existing.name,
            email: existing.email,
            invitedBy: existing.invitedBy,
            userId: existing.userId ? String(existing.userId) : undefined,
          }
        : null,
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: plan.patch.name,
        invitedBy: plan.patch.invitedBy,
        userId: (plan.patch.userId as Id<"users"> | undefined) ?? existing.userId,
      });
    } else {
      await ctx.db.insert("eventRsvps", {
        eventId: args.eventId,
        userId: userId ?? undefined,
        name: plan.patch.name,
        email: plan.normalizedEmail,
        invitedBy: plan.patch.invitedBy,
        createdAt: Date.now(),
      });
    }

    return { ok: true, alreadyRsvpd: plan.alreadyRsvpd };
  },
});

export const getEventRsvps = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return { count: 0, names: [] };

    const userId = await getAuthUserId(ctx);
    let canViewFull = false;
    if (userId) {
      if (String(event.organizerId) === String(userId)) {
        canViewFull = true;
      } else {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique();
        canViewFull = profile?.isAdmin === true;
      }
    }

    const rows = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();

    return buildRsvpVisibility({
      rows: rows.map((r: any) => ({
        name: r.name,
        email: r.email,
        invitedBy: r.invitedBy,
        createdAt: r.createdAt,
      })),
      canViewFull,
    });
  },
});
