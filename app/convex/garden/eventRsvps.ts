// Real event RSVPs. Spec §1.6 once said "no account required"; the owner
// reversed that: an RSVP needs an account, and the event page's form makes
// one in a single step (code by email or text). Paid tickets still check out
// through Stripe without an account (garden/apGifts.ts). Tables have a
// separate, explicitly configured free guest RSVP endpoint below.
//
// ctx typed loosely (`any`) — same reasoning as tables.ts / entitlements.ts:
// the generated DataModel predates eventRsvps.

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { isEventHost } from "../eventHosts";
import { canSeeEvent } from "./eventVisibility";
import {
  getTableParticipation,
  guestSeatCount,
  guestSeatsFit,
  normalizeTable,
} from "./tablePolicy";
import {
  isCheckoutSessionId,
  TICKET_CLAIM_REFUSED,
  type TicketClaimResult,
} from "./ticketLink";
import { isPayPalPaymentLink, nextTicketState } from "./ticketLink";
import { normalizePhone } from "../phone";
import { eventHasEnded } from "../eventWindow";
import { getCommunityMember, joinTicketCommunity, resolveCommunityJoin, type TicketJoin } from "./communities";
import { findMyRsvp } from "../eventGuests";
import { assertEventHasRoom, isGoing } from "../eventSpots";
import { scheduleNotificationEmail } from "../emailHelpers";
import { escapeHtml } from "../email/template";

// ——— Pure core ———

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** True when this account's verified email is the one Stripe took the
 * payment with. A ticket link's client_reference_id and a checkout session
 * id can both be passed to someone else, so neither proves who paid; this
 * does (garden/apGifts.ts's trustedTicketBuyer, claimTicketBySession). */
export function paidWithVerifiedEmail(
  user: { email?: string; emailVerificationTime?: number } | null | undefined,
  paidWith: string | null | undefined,
): boolean {
  return (
    !!user?.email &&
    !!paidWith &&
    user.emailVerificationTime !== undefined &&
    normalizeEmail(user.email) === normalizeEmail(paidWith)
  );
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
  paidCents?: number;
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

/** Paid total after another purchase on the same RSVP. Each call is a
 * new checkout — the webhook drops replays of one it already applied
 * before it gets here — so amounts add up. */
export function nextPaidCents(existingCents: number | undefined, newCents: number): number {
  return (existingCents ?? 0) + newCents;
}

export interface UpsertRsvpArgs {
  eventId: Id<"events">;
  name: string;
  email: string;
  invitedBy?: string;
  userId?: Id<"users">;
  /** Set by a paid ticket purchase only — a free RSVP never passes these. */
  paidCents?: number;
  stripeRef?: string;
  /** A ticket purchase: how many tickets, and names typed for the others. */
  tickets?: number;
  guestNames?: string | null;
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
      // "no new payment info", not "clear the old one"). A second purchase
      // by the same email adds to the total (nextPaidCents), and the first
      // checkout's stripeRef stays so claiming by that session still works.
      ...(args.paidCents !== undefined
        ? { paidCents: nextPaidCents(existing.paidCents, args.paidCents) }
        : {}),
      ...(args.stripeRef !== undefined && !existing.stripeRef
        ? { stripeRef: args.stripeRef }
        : {}),
      ...(args.tickets !== undefined
        ? nextTicketState(existing, { tickets: args.tickets, guestNames: args.guestNames ?? null })
        : {}),
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
      ...(args.tickets !== undefined
        ? nextTicketState(null, { tickets: args.tickets, guestNames: args.guestNames ?? null })
        : {}),
      createdAt: Date.now(),
    });
  }

  return { ok: true, alreadyRsvpd: plan.alreadyRsvpd, rsvpId };
}

// ——— Convex wrappers ———

/** Name for a new RSVP: what was typed wins, then the profile, then the
 * account. A brand-new account's profile is the placeholder "New User"
 * (auth.ts's afterUserCreatedOrUpdated), which is not a name. */
export function pickRsvpName(
  typed: string | undefined,
  profileName: string | undefined,
  accountName: string | undefined,
): string | undefined {
  for (const candidate of [typed, profileName, accountName]) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed !== "New User") return trimmed;
  }
  return undefined;
}

/** The name and email an account's RSVP goes on the list under: the typed
 * name (else the profile's), and always the account's own email. Throws
 * when either is missing. */
export async function accountRsvpIdentity(
  ctx: MutationCtx,
  userId: Id<"users">,
  typedName: string | undefined,
): Promise<{ name: string; email: string }> {
  const [profile, userDoc] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db.get(userId),
  ]);
  const name = pickRsvpName(typedName, profile?.name, userDoc?.name);
  const email = userDoc?.email?.trim();

  if (!name) {
    throw new ConvexError({
      code: "invalid_rsvp",
      reason: "We need a name to save your spot — add one and try again.",
    });
  }
  if (!email || !isValidEmail(email)) {
    throw new ConvexError({
      code: "invalid_rsvp",
      reason: "Your account needs an email to save a spot. Add one and try again.",
    });
  }
  return { name, email };
}

// Nobody RSVPs without an account (owner's rule): the event page's form signs
// the visitor in with an emailed or texted code first (event.tsx), then calls
// this. The RSVP is tied to the signed-in account and its email — a typed
// email is never trusted, so nobody can put someone else's address on the
// list. (Paid tickets are the exception and don't come through here: they go
// through Stripe and garden/apGifts.ts's upsertEventRsvp.)
export const rsvpToEvent = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    // Accepted and ignored: the account's own email is used. Kept so a page
    // loaded before this change doesn't fail argument validation.
    email: v.optional(v.string()),
    invitedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({
        code: "not_signed_in",
        reason: "Sign in to save your spot.",
      });
    }

    const event = await ctx.db.get(args.eventId);
    // A hidden ticketed event reads as missing, same as its page does.
    if (!event || !(await canSeeEvent(ctx, event, userId))) {
      throw new ConvexError({
        code: "not_found",
        reason: "That event isn't there anymore — check the link and try again.",
      });
    }

    if (event.tableId) {
      const table = await ctx.db.get(event.tableId);
      const participation = table ? await getTableParticipation(ctx, table, userId) : null;
      if (!participation || (!participation.isMember && !participation.isHost)) {
        throw new ConvexError({code: "table_enrollment_required", reason: "Join the Table and complete its requirements first."});
      }
    }

    // Someone already going can press again; anyone else needs a spot.
    if (!(await isGoing(ctx, event, userId))) await assertEventHasRoom(ctx, event);

    const { name, email } = await accountRsvpIdentity(ctx, userId, args.name);

    const result = await upsertEventRsvp(ctx, {
      eventId: args.eventId,
      name,
      email,
      invitedBy: args.invitedBy,
      userId,
    });

    return { ok: true, alreadyRsvpd: result.alreadyRsvpd };
  },
});

// ——— Tickets on the organizer's PayPal link ———
//
// PayPal tells us nothing (garden/ticketLink.ts isPayPalPaymentLink): the
// money goes to the organizer's own PayPal, and its pay link takes no
// reference we could match a payment on. So Get tickets saves the person
// first, on the guest list and (when they agreed) in the event's community,
// and the page then sends them to PayPal. The row says they left for PayPal,
// not that they paid; the organizer's PayPal is the record of that.

export const startPayPalTicket = mutation({
  args: {
    eventId: v.id("events"),
    name: v.optional(v.string()),
    // They saw the line under the button that says getting tickets joins
    // the event's community and agrees to its agreements (ticketCommunityJoin).
    agreed: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ url: string; community: TicketJoin }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError({ code: "not_signed_in", reason: "Sign in to get tickets." });
    }

    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canSeeEvent(ctx, event, userId))) {
      throw new ConvexError({
        code: "not_found",
        reason: "That event isn't there anymore — check the link and try again.",
      });
    }
    const url = event.externalTicketUrl?.trim();
    if (!url || !isPayPalPaymentLink(url) || event.tableId) {
      throw new ConvexError({ code: "not_paypal", reason: "This event doesn't sell tickets on PayPal." });
    }
    if (event.status === "cancelled" || eventHasEnded(event, Date.now())) {
      throw new ConvexError({ code: "closed", reason: "Tickets for this event are closed." });
    }

    if (!(await isGoing(ctx, event, userId))) await assertEventHasRoom(ctx, event);

    const { name, email } = await accountRsvpIdentity(ctx, userId, args.name);
    const { rsvpId } = await upsertEventRsvp(ctx, { eventId: args.eventId, name, email, userId });
    await ctx.db.patch(rsvpId, { paypalOpenedAt: Date.now() });

    const community = await joinTicketCommunity(ctx, userId, event.hostOrgId, args.agreed === true);
    return { url, community };
  },
});

/** The line under Get tickets / Buy tickets (PayPal, a Stripe link, tickets
 * on this site): the community a ticket joins, and whether that's straight
 * in ("join") or a request its hosts approve ("ask"). null when there's
 * nothing to say: no community, a Table's event, already a member, or one a
 * ticket can't get you into. */
export const ticketCommunityJoin = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event?.hostOrgId || event.tableId || !(await canSeeEvent(ctx, event, userId))) return null;
    const org = await ctx.db.get(event.hostOrgId);
    if (!org) return null;
    const existing = userId ? await getCommunityMember(ctx, org._id, userId) : null;
    const decision = resolveCommunityJoin({ community: org, existing });
    if (decision.alreadyMember || !decision.allowed) return null;
    return {
      name: org.name,
      agreements: org.agreements ?? [],
      join: decision.newStatus === "pending" ? ("ask" as const) : ("join" as const),
    };
  },
});

// ——— Can't make it (docs/features/event-capacity-waitlist.md) ———
//
// Takes the viewer off the event: their free RSVP (or PayPal "Sent to
// PayPal" one), their request (pending or accepted), their waitlist spot.
// A paid ticket stays: the money is a record, and the host handles refunds.
// The organizer hears when a spot opens, with how many are waiting.

export const PAID_TICKET_STAYS = "paid_ticket";

export const cancelMyRsvp = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<{ cancelled: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "not_signed_in", reason: "Sign in first." });
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError({ code: "not_found", reason: "That event isn't there anymore." });

    const [rsvps, user, application, waiting] = await Promise.all([
      ctx.db
        .query("eventRsvps")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db.get(userId),
      ctx.db
        .query("eventApplications")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .filter((q) => q.eq(q.field("applicantId"), userId))
        .first(),
      ctx.db
        .query("eventWaitlist")
        .withIndex("by_eventId_userId", (q) => q.eq("eventId", args.eventId).eq("userId", userId))
        .first(),
    ]);
    const rsvp = findMyRsvp(rsvps, String(userId), [user?.email]);
    if (rsvp && (rsvp.paidCents ?? 0) > 0) {
      throw new ConvexError({
        code: PAID_TICKET_STAYS,
        reason: "Paid tickets can't be cancelled here. Ask the host.",
      });
    }

    const wasGoing = !!rsvp || application?.status === "accepted";
    if (rsvp) await ctx.db.delete(rsvp._id);
    if (application) await ctx.db.delete(application._id);
    if (waiting) await ctx.db.delete(waiting._id);
    if (!rsvp && !application && !waiting) return { cancelled: false };

    if (wasGoing && event.organizerId !== userId) {
      const waitingCount = (
        await ctx.db
          .query("eventWaitlist")
          .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
          .collect()
      ).length;
      const who = rsvp?.name || user?.name || "Someone";
      const title = `${who} can't make it to ${event.title}`;
      const message = waitingCount > 0 ? `${waitingCount} on the waitlist.` : "A spot is open.";
      await ctx.db.insert("notifications", {
        userId: event.organizerId,
        type: "event_cant_make_it",
        title,
        message,
        linkUrl: `/events/${args.eventId}?tab=guests`,
        relatedUserId: userId,
        createdAt: Date.now(),
      });
      // They went to the organizer's PayPal: if they paid, the refund is
      // the organizer's to make there, so this one is emailed too.
      if (rsvp?.paypalOpenedAt) {
        await scheduleNotificationEmail(ctx, {
          userId: event.organizerId,
          subject: title,
          previewText: "If they paid on PayPal, refund them there.",
          heading: title,
          body: `<strong>${escapeHtml(who)}</strong> (${escapeHtml(rsvp.email)}) went to your PayPal link for "<strong>${escapeHtml(event.title)}</strong>" and can't make it now. If they paid, refund them in PayPal. ${escapeHtml(message)}`,
          ctaText: "See your guests",
          ctaUrl: `/events/${args.eventId}?tab=guests`,
          category: "activity",
          communityId: event.hostOrgId,
        });
      }
    }
    return { cancelled: true };
  },
});

// ——— Table guest email: opt-in and the stop link ———
//
// A guest has no account, so no email preferences row. Each guest RSVP gets
// its own stop token instead; Table emails to that guest carry it as their
// unsubscribe token (garden/tableNotify.ts). The prefix keeps it apart from
// emailPreferences tokens (32 hex characters), so the existing
// /unsubscribe/:token page and one-click POST route both handle it.

export const GUEST_EMAIL_TOKEN_PREFIX = "table-";

export function newGuestEmailToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    GUEST_EMAIL_TOKEN_PREFIX +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export function isGuestEmailToken(token: string): boolean {
  return token.startsWith(GUEST_EMAIL_TOKEN_PREFIX);
}

/** Every guest (no account) RSVP this address has on the Table's dates. */
async function guestRowsOnTable(
  ctx: MutationCtx,
  tableId: Id<"gardenTables">,
  email: string,
): Promise<Doc<"eventRsvps">[]> {
  const events = await ctx.db
    .query("events")
    .withIndex("by_tableId", (q) => q.eq("tableId", tableId))
    .collect();
  const out: Doc<"eventRsvps">[] = [];
  for (const event of events) {
    const rows = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId_email", (q) =>
        q.eq("eventId", event._id).eq("email", normalizeEmail(email)),
      )
      .collect();
    out.push(...rows.filter((row) => !row.userId));
  }
  return out;
}

/** The guest's latest answer to "Tell me when this Table adds a date"
 * holds for all their RSVPs on the Table. Saying yes again also lifts an
 * earlier stop. */
async function setGuestTableChoice(
  ctx: MutationCtx,
  tableId: Id<"gardenTables">,
  email: string,
  notifyNewDates: boolean,
) {
  for (const row of await guestRowsOnTable(ctx, tableId, email))
    await ctx.db.patch(row._id, {
      notifyNewDates,
      ...(notifyNewDates ? { notifyStoppedAt: undefined } : {}),
    });
}

/** The stop link: no more email about this Table to this guest address.
 * False for a token that isn't a guest token or isn't on file. */
export async function stopGuestEmails(
  ctx: MutationCtx,
  token: string,
): Promise<boolean> {
  if (!isGuestEmailToken(token)) return false;
  const row = await ctx.db
    .query("eventRsvps")
    .withIndex("by_notifyToken", (q) => q.eq("notifyToken", token))
    .first();
  if (!row) return false;
  const event = await ctx.db.get(row.eventId);
  const rows = event?.tableId
    ? await guestRowsOnTable(ctx, event.tableId, row.email)
    : [];
  const now = Date.now();
  for (const id of new Set([row._id, ...rows.map((r) => r._id)]))
    await ctx.db.patch(id, { notifyNewDates: false, notifyStoppedAt: now });
  return true;
}

/** For the stop page: which Table, and whether it's already stopped. The
 * token is the credential; nothing else about the guest is returned. */
export const getGuestEmailStop = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!isGuestEmailToken(args.token)) return null;
    const row = await ctx.db
      .query("eventRsvps")
      .withIndex("by_notifyToken", (q) => q.eq("notifyToken", args.token))
      .first();
    if (!row) return null;
    const event = await ctx.db.get(row.eventId);
    const table = event?.tableId ? await ctx.db.get(event.tableId) : null;
    return {
      tableName: table?.name ?? event?.title ?? "this Table",
      stopped: !!row.notifyStoppedAt,
    };
  },
});

/** Table-specific guest exception: never grants enrollment or roster access.
 * Name and email are required; a phone number is optional (US/Canada, as
 * everywhere else). `notifyNewDates` is the guest's answer to "Tell me when
 * this Table adds a date"; an older page that doesn't send it leaves the
 * answer as it was. */
export const rsvpGuestToTableEvent = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    notifyNewDates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const viewerId = await getAuthUserId(ctx);
    if (
      !event?.tableId ||
      event.status !== "published" ||
      event.datetime <= Date.now() ||
      !(await canSeeEvent(ctx, event, viewerId))
    ) {
      throw new ConvexError({
        code: "not_found",
        reason: "This Event is not accepting guest RSVPs.",
      });
    }
    const table = await ctx.db.get(event.tableId);
    const participation = table
      ? await getTableParticipation(ctx, table, viewerId)
      : null;
    if (!table || !participation?.canGuestRsvp)
      throw new ConvexError({
        code: "guests_not_allowed",
        reason: "This Table requires enrollment.",
      });
    const name = args.name.trim();
    if (
      !name ||
      name.length > 120 ||
      args.email.length > 254 ||
      !isValidEmail(args.email)
    )
      throw new ConvexError({
        code: "invalid_rsvp",
        reason: "Enter your name and a valid email.",
      });
    let phone: string | undefined;
    if (args.phone?.trim()) {
      const parsed = normalizePhone(args.phone);
      if (!parsed.ok)
        throw new ConvexError({
          code: "invalid_phone",
          reason: "Enter a US or Canadian phone number, or leave it blank.",
        });
      phone = parsed.value;
    }
    const rows = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect();
    const existing = rows.find(
      (row) => row.email === normalizeEmail(args.email),
    );
    // A guest cannot overwrite an account-backed participant's identity.
    if (existing?.userId)
      throw new ConvexError({
        code: "account_rsvp",
        reason: "Sign in to manage your existing RSVP.",
      });
    // A guest takes a chair on this Event only: persistent chairs plus the
    // guests already here, not the series' busiest Event (spotsRemaining,
    // which still governs enrollment and checkout).
    if (
      !existing &&
      !guestSeatsFit(
        normalizeTable(table).capacity,
        participation.persistentChairs,
        guestSeatCount(rows),
        1,
      )
    )
      throw new ConvexError({ code: "full", reason: "This Event is full." });
    const result = await upsertEventRsvp(ctx, {
      eventId: event._id,
      name,
      email: args.email,
    });
    // Contact details and the stop token sit on the RSVP; only the Table's
    // hosts read them back (tables.ts getTableGuests). A blank phone on a
    // repeat RSVP keeps the one on file.
    const saved = await ctx.db.get(result.rsvpId);
    await ctx.db.patch(result.rsvpId, {
      ...(phone ? { phone } : {}),
      ...(saved?.notifyToken ? {} : { notifyToken: newGuestEmailToken() }),
    });
    if (args.notifyNewDates !== undefined)
      await setGuestTableChoice(ctx, table._id, args.email, args.notifyNewDates);
    return result;
  },
});

/** For the event page's external-ticket card: does the signed-in viewer
 * already have a paid RSVP here (from AP's Payment Link, garden/apGifts.ts)?
 * Guest viewers (no account) resolve to null — we have no way to identify
 * "them" from a query alone, and the `?paid=1` return-from-Stripe notice
 * covers that case instead. `eventRsvps` has no by_eventId_userId index
 * (eventAccess.ts's comment: rosters are small), same collect-and-filter
 * eventAccess.ts already does. */
// findMyRsvp lives in ../eventGuests (events.ts needs it too, and can't
// import this file without a cycle).
export { findMyRsvp } from "../eventGuests";

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

    return {
      paidCents: mine.paidCents ?? null,
      ticketCount: mine.ticketCount ?? (mine.paidCents ? 1 : null),
    };
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
      if (isEventHost(event, userId)) {
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

    if (event.tableId) {
      const table = await ctx.db.get(event.tableId);
      const viewer = table ? await getTableParticipation(ctx, table, userId) : null;
      if (!viewer?.canSeeRoster) return {count: rows.length, names: []};
      // Only Table hosts see contact details. Participants see first names.
      canViewFull = viewer.isHost;
    }

    return buildRsvpVisibility({
      rows: rows.map((r: any) => ({
        name: r.name,
        email: r.email,
        invitedBy: r.invitedBy,
        createdAt: r.createdAt,
        paidCents: r.paidCents,
      })),
      canViewFull,
    });
  },
});

// ——— A paid ticket for a Table's Event ———
//
// Used by AP's ticket webhook (garden/apGifts.ts) when a ticket is bought,
// and by claimTicketBySession below when a guest ticket is moved onto an
// account afterwards, so both follow one rule.

export type TableTicketDecision =
  | { ok: true; userId?: Id<"users"> }
  | { ok: false; reason: string; tableId?: Id<"gardenTables"> };

/** A ticket for an Event that belongs to a Table follows the Table's rules,
 * the same ones the RSVP endpoints apply:
 *   - an accepted participant (trusted identity, see paidWithVerifiedEmail)
 *     gets their one RSVP on their account. Extra tickets would seat
 *     guests on an account row, outside the guest count, so a participant
 *     buying more than one seat is not honored here;
 *   - anyone else is an external guest: the Table must accept guests
 *     (canGuestRsvp: public, open, free, no membership gate, guests on),
 *     and this Event must have a chair for every ticket (guestSeatsFit).
 * Anything else is refused. `claiming` is the guest RSVP being moved onto
 * an account, left out so the ticket isn't counted against itself. */
export async function decideTableTicket(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  eventDoc: { _id: Id<"events">; tableId: Id<"gardenTables">; status?: string },
  buyer: { userId?: Id<"users">; email: string; tickets: number },
  claiming?: Id<"eventRsvps">,
): Promise<TableTicketDecision> {
  const table = await ctx.db.get(eventDoc.tableId);
  if (!table) return { ok: false, reason: "table_missing" };
  const refuse = (reason: string): TableTicketDecision => ({ ok: false, reason, tableId: table._id });
  if (eventDoc.status !== "published") return refuse("event_unavailable");
  const rows: { _id: Id<"eventRsvps">; userId?: Id<"users">; email: string; ticketCount?: number; paidCents?: number }[] = (
    await ctx.db
      .query("eventRsvps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_eventId", (q: any) => q.eq("eventId", eventDoc._id))
      .collect()
  ).filter((row: { _id: Id<"eventRsvps"> }) => row._id !== claiming);
  const existing = rows.find((row) => row.email === normalizeEmail(buyer.email));
  if (buyer.userId) {
    const participant = await getTableParticipation(ctx, table, buyer.userId);
    if (participant.isMember || participant.isHost) {
      if (existing?.userId && existing.userId !== buyer.userId) return refuse("account_rsvp");
      const held = existing ? (existing.ticketCount ?? (existing.paidCents ? 1 : 0)) : 0;
      return buyer.tickets === 1 && held === 0
        ? { ok: true, userId: buyer.userId }
        : refuse("participant_extra_tickets");
    }
  }
  const guest = await getTableParticipation(ctx, table, null);
  if (!guest.canGuestRsvp) return refuse("guests_not_allowed");
  // Same rule as rsvpGuestToTableEvent: a guest never takes over an
  // account-backed RSVP.
  if (existing?.userId) return refuse("account_rsvp");
  if (!guestSeatsFit(normalizeTable(table).capacity, guest.persistentChairs, guestSeatCount(rows), buyer.tickets))
    return refuse("full");
  return { ok: true };
}

/** Whether a guest ticket for a Table's Event may move onto this account.
 * Holding the checkout session id isn't enough: it's in a URL anyone can be
 * sent. The account must have paid with its own verified email (the RSVP's
 * email is the one Stripe took), hold no other RSVP for this Event, and
 * pass decideTableTicket as a participant taking one seat. Anyone else's
 * ticket stays the guest ticket it was bought as. */
async function tableTicketClaimAllowed(
  ctx: MutationCtx,
  eventDoc: { _id: Id<"events">; tableId: Id<"gardenTables">; status?: string },
  rsvp: { _id: Id<"eventRsvps">; email: string; ticketCount?: number },
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!paidWithVerifiedEmail(user, rsvp.email)) return false;
  const rows = await ctx.db
    .query("eventRsvps")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventDoc._id))
    .collect();
  if (rows.some((row) => row._id !== rsvp._id && row.userId === userId)) return false;
  const decision = await decideTableTicket(
    ctx,
    eventDoc,
    { userId, email: rsvp.email, tickets: rsvp.ticketCount ?? 1 },
    rsvp._id,
  );
  return decision.ok && decision.userId === userId;
}

// ——— Claim a ticket by its Stripe checkout session ———
//
// AP's Payment Link redirects back with `?session={CHECKOUT_SESSION_ID}`
// (Stripe fills it in). The webhook saved that same id on the RSVP as
// stripeRef `ap:<session id>` (garden/apGifts.ts), so whoever holds the
// redirect URL — the buyer — can attach the ticket to the account they're
// signed in with, whatever email they paid with. Only an RSVP with no
// account yet is ever claimed; one already on an account stays put.
// A Table's Event is stricter (tableTicketClaimAllowed above): the ticket
// moves only to an accepted participant who paid with their verified email.

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

    const event = await ctx.db.get(rsvp.eventId);
    if (event?.tableId && !(await tableTicketClaimAllowed(ctx, { ...event, tableId: event.tableId }, rsvp, userId))) {
      throw new ConvexError({
        code: TICKET_CLAIM_REFUSED,
        reason:
          "This ticket stays a guest ticket. It moves to your account only if you're in this Table, paid with your account's email, and bought one seat.",
      });
    }

    await ctx.db.patch(rsvp._id, { userId });
    const contribution = await ctx.db
      .query("grantContributions")
      .withIndex("by_stripeRef", (q) => q.eq("stripeRef", stripeRef))
      .unique();
    if (contribution && !contribution.userId) {
      await ctx.db.patch(contribution._id, { userId });
    }
    // The ticket card said buying joins the event's community; now there's
    // an account to put in it (apGifts.ts joins buyers who had one).
    if (event && !event.tableId) await joinTicketCommunity(ctx, userId, event.hostOrgId, true);
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
