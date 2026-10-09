// How many people are going to an event, and its limit and waitlist
// (docs/features/event-capacity-waitlist.md). Shared by events.ts and
// garden/eventRsvps.ts; imports nothing that imports either of them.

import { ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findMyRsvp, mergeGuests, summarizeGuests, type GuestInput } from "./eventGuests";

/** How many people are going, counted one way for the list and the detail:
 * accepted applications + RSVPs (each `ticketCount ?? 1`) + paid tickets,
 * one person once (userId, then email), keeping their largest ticket count. */
export function countGoing(input: {
  acceptedApplicantIds: string[];
  rsvps: { userId?: string | null; email?: string | null; ticketCount?: number | null }[];
  paidPurchases: { userId?: string | null; buyerEmail?: string | null }[];
}): number {
  const rows: GuestInput[] = [
    ...input.acceptedApplicantIds.map((id) => ({
      userId: id,
      name: "",
      status: "going" as const,
      addedAt: 0,
    })),
    ...input.rsvps.map((r) => ({
      userId: r.userId ?? null,
      name: "",
      email: r.email ?? null,
      status: "going" as const,
      tickets: r.ticketCount ?? 1,
      addedAt: 0,
    })),
    ...input.paidPurchases.map((p) => ({
      userId: p.userId ?? null,
      name: "",
      email: p.buyerEmail ?? null,
      status: "going" as const,
      addedAt: 0,
    })),
  ];
  return summarizeGuests(mergeGuests(rows)).going;
}

export async function loadGoingCount(ctx: QueryCtx, eventId: Id<"events">): Promise<number> {
  const [applications, rsvps, purchases] = await Promise.all([
    ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("ticketPurchases")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  ]);
  return countGoing({
    acceptedApplicantIds: applications.filter((a) => a.status === "accepted").map((a) => String(a.applicantId)),
    rsvps,
    paidPurchases: purchases.filter((p) => p.status === "paid"),
  });
}

// ——— Limit and waitlist (docs/features/event-capacity-waitlist.md) ———

export const MAX_EVENT_CAPACITY = 100_000;

/** The limit that applies, or null. A Table's event has none: its chairs
 * do that job (garden/tablePolicy.ts). */
export function eventCapacity(e: Pick<Doc<"events">, "capacity" | "tableId">): number | null {
  return !e.tableId && e.capacity && e.capacity > 0 ? e.capacity : null;
}

/** On by default once there's a limit; the host can turn it off. */
export function waitlistOn(e: Pick<Doc<"events">, "capacity" | "tableId" | "waitlist">): boolean {
  return eventCapacity(e) !== null && e.waitlist !== false;
}

/** The form's Limit box: 0 or empty clears it. */
export function normalizeCapacity(n: number | undefined): { capacity?: number; error?: string } {
  if (n === undefined || n === 0) return {};
  if (!Number.isInteger(n) || n < 1 || n > MAX_EVENT_CAPACITY) {
    return { error: `The limit has to be a whole number from 1 to ${MAX_EVENT_CAPACITY.toLocaleString("en-US")}.` };
  }
  return { capacity: n };
}

export const EVENT_FULL = "event_full";

/** No spot for one more person. False with no limit. */
export async function isEventFull(ctx: QueryCtx, event: Doc<"events">): Promise<boolean> {
  const cap = eventCapacity(event);
  if (cap === null) return false;
  return (await loadGoingCount(ctx, event._id)) >= cap;
}

/** Throws the "full" ConvexError the event page turns into the waitlist. */
export async function assertEventHasRoom(ctx: QueryCtx, event: Doc<"events">): Promise<void> {
  if (!(await isEventFull(ctx, event))) return;
  throw new ConvexError({
    code: EVENT_FULL,
    reason: waitlistOn(event) ? "This event is full. Join the waitlist instead." : "This event is full.",
  });
}

/** Whether this person already counts as going: an accepted request, an
 * RSVP (theirs, or one bought with their email), or a paid ticket. Someone
 * going is never refused for a full event, and sees a hidden address. */
export async function isGoing(ctx: QueryCtx, event: Doc<"events">, userId: Id<"users">): Promise<boolean> {
  const [application, rsvps, purchases, user] = await Promise.all([
    ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .filter((q) => q.eq(q.field("applicantId"), userId))
      .first(),
    ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    ctx.db
      .query("ticketPurchases")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    ctx.db.get(userId),
  ]);
  if (application?.status === "accepted") return true;
  if (findMyRsvp(rsvps, String(userId), [user?.email])) return true;
  return purchases.some((p) => p.status === "paid" && p.userId === userId);
}
