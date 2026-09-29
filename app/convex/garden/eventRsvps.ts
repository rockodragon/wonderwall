// Real event RSVPs — the guest path, spec §1.6: "/events/first-table (and
// event pages generally) replace mailto with a real RSVP: name + email, no
// account required; account holders one-click."
//
// ctx typed loosely (`any`) — same reasoning as tables.ts / entitlements.ts:
// the generated DataModel predates eventRsvps.

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { canSeeEvent } from "./eventVisibility";
import { isCheckoutSessionId, type TicketClaimResult } from "./ticketLink";

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

// ——— Shared insert/dedupe core ———
//
// Both the guest-facing `rsvpToEvent` mutation below and garden/apGifts.ts's
// AP ticket-webhook branch need the exact same "find-by-normalized-email,
// patch-or-insert" behavior — a ticket buyer is just an RSVP with money
// attached, and duplicating this logic in apGifts.ts would let the two
// silently drift (e.g. a fixed dedupe bug applied to only one path). Callers
// that already know the buyer's userId/email (the webhook resolves both from
// the Stripe session) skip straight to this; `rsvpToEvent` resolves them
// first and then calls through.

export interface UpsertRsvpArgs {
  eventId: Id<"events">;
  name: string;
  email: string;
  invitedBy?: string;
  userId?: Id<"users">;
  /** Set by a paid ticket purchase only — a free RSVP never passes these. */
  paidCents?: number;
  stripeRef?: string;
}

export async function upsertEventRsvp(
  ctx: MutationCtx,
  args: UpsertRsvpArgs,
): Promise<{ ok: true; alreadyRsvpd: boolean; rsvpId: Id<"eventRsvps"> }> {
  const existing = await ctx.db
    .query("eventRsvps")
    .withIndex("by_eventId_email", (q) =>
      q.eq("eventId", args.eventId).eq("email", normalizeEmail(args.email)),
    )
    .unique();

  const plan = planRsvp(
    { name: args.name, email: args.email, invitedBy: args.invitedBy, userId: args.userId ? String(args.userId) : undefined },
    existing
      ? {
          name: existing.name,
          email: existing.email,
          invitedBy: existing.invitedBy,
          userId: existing.userId ? String(existing.userId) : undefined,
        }
      : null,
  );

  let rsvpId: Id<"eventRsvps">;
  if (existing) {
    await ctx.db.patch(existing._id, {
      name: plan.patch.name,
      invitedBy: plan.patch.invitedBy,
      userId: (plan.patch.userId as Id<"users"> | undefined) ?? existing.userId,
      // A ticket purchase upgrades a prior free RSVP to paid; never
      // downgrades one that's already paid (undefined args here just means
      // "no new payment info", not "clear the old one").
      ...(args.paidCents !== undefined ? { paidCents: args.paidCents } : {}),
      ...(args.stripeRef !== undefined ? { stripeRef: args.stripeRef } : {}),
    });
    rsvpId = existing._id;
  } else {
    rsvpId = await ctx.db.insert("eventRsvps", {
      eventId: args.eventId,
      userId: args.userId ?? undefined,
      name: plan.patch.name,
      email: plan.normalizedEmail,
      invitedBy: plan.patch.invitedBy,
      paidCents: args.paidCents,
      stripeRef: args.stripeRef,
      createdAt: Date.now(),
    });
  }

  return { ok: true, alreadyRsvpd: plan.alreadyRsvpd, rsvpId };
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
    // A hidden ticketed event reads as missing, same as its page does.
    if (!event || !(await canSeeEvent(ctx, event, await getAuthUserId(ctx)))) {
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

    const result = await upsertEventRsvp(ctx, {
      eventId: args.eventId,
      name,
      email,
      invitedBy: args.invitedBy,
      userId: userId ?? undefined,
    });

    return { ok: true, alreadyRsvpd: result.alreadyRsvpd };
  },
});

/** For the event page's external-ticket card: does the signed-in viewer
 * already have a paid RSVP here (from AP's Payment Link, garden/apGifts.ts)?
 * Guest viewers (no account) resolve to null — we have no way to identify
 * "them" from a query alone, and the `?paid=1` return-from-Stripe notice
 * covers that case instead. `eventRsvps` has no by_eventId_userId index
 * (eventAccess.ts's comment: rosters are small), same collect-and-filter
 * eventAccess.ts already does. */
/** Which RSVP on an event is the viewer's. Their own account's row wins;
 * failing that, a row with no account whose email is one of the viewer's —
 * that's a ticket bought while signed out, then the buyer made an account
 * with the same email. Read-only: nothing is attached to the row, so
 * putting someone else's email on your profile can't take their ticket
 * away from them. */
export function findMyRsvp<R extends { userId?: unknown; email: string }>(
  rows: R[],
  userId: string,
  myEmails: (string | undefined | null)[],
): R | null {
  const own = rows.find((r) => r.userId && String(r.userId) === userId);
  if (own) return own;
  const emails = new Set(
    myEmails.filter((e): e is string => !!e).map(normalizeEmail),
  );
  return rows.find((r) => !r.userId && emails.has(normalizeEmail(r.email))) ?? null;
}

export const getMyRsvpStatus = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const [rows, user] = await Promise.all([
      ctx.db
        .query("eventRsvps")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db.get(userId),
    ]);
    const mine = findMyRsvp(rows, String(userId), [user?.email]);
    if (!mine) return null;

    return { paidCents: mine.paidCents ?? null };
  },
});

export const getEventRsvps = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canSeeEvent(ctx, event, await getAuthUserId(ctx)))) return { count: 0, names: [] };

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

// ——— Claim a ticket by its Stripe checkout session ———
//
// AP's Payment Link redirects back with `?session={CHECKOUT_SESSION_ID}`
// (Stripe fills it in). The webhook saved that same id on the RSVP as
// stripeRef `ap:<session id>` (garden/apGifts.ts), so whoever holds the
// redirect URL — the buyer — can attach the ticket to the account they're
// signed in with, whatever email they paid with. Only an RSVP with no
// account yet is ever claimed; one already on an account stays put.

export { isCheckoutSessionId, type TicketClaimResult } from "./ticketLink";

export function planTicketClaim(
  row: { userId?: unknown } | null,
  userId: string,
): TicketClaimResult {
  if (!row) return "not_found";
  if (!row.userId) return "claimed";
  return String(row.userId) === userId ? "already_yours" : "taken";
}

export const claimTicketBySession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args): Promise<TicketClaimResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to claim a ticket");
    if (!isCheckoutSessionId(args.sessionId)) return "not_found";

    const stripeRef = `ap:${args.sessionId}`;
    const rsvp = await ctx.db
      .query("eventRsvps")
      .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
      .unique();
    const result = planTicketClaim(rsvp, String(userId));
    if (result !== "claimed" || !rsvp) return result;

    await ctx.db.patch(rsvp._id, { userId });
    const contribution = await ctx.db
      .query("grantContributions")
      .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
      .unique();
    if (contribution && !contribution.userId) {
      await ctx.db.patch(contribution._id, { userId });
    }
    return "claimed";
  },
});

/** A paid ticket stands in for an invite (signup.tsx, /signup/<session
 * id>): true while the RSVP bought in that checkout session exists and
 * isn't on an account yet — so one ticket opens one account. */
export const ticketSessionOpensSignup = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    if (!isCheckoutSessionId(args.sessionId)) return false;
    const rsvp = await ctx.db
      .query("eventRsvps")
      .withIndex("by_stripeRef", (q) => q.eq("stripeRef", `ap:${args.sessionId}`))
      .unique();
    return !!rsvp && !rsvp.userId && !!rsvp.paidCents;
  },
});
