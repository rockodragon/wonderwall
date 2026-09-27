// Ticket-gated event visibility — shared by convex/events.ts and every other
// module that lists events publicly (e.g. garden/communities.ts's community
// page). Lives here, not in events.ts, so those callers don't have to import
// events.ts (which itself imports garden/communities.ts, among others) and
// create a module cycle.
//
// Product rule (Rick, 2026-09-27, final): anyone signed in can post an
// event, including one with paid ticket tiers. A ticketed event (non-empty
// normalized ticketTiers) is public only while its organizer can sell
// tickets (a paid membership level, or a partner listing) — see
// "event.sellTickets" in garden/capabilities.ts. A free event (no tiers)
// is public as soon as it's posted, for any account. This is computed at
// read time, never stored, so a lapsed membership re-hides a ticketed
// event automatically.

import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { can } from "./capabilities";
import { getGardenUser } from "./entitlements";

export interface TicketedEventLike {
  ticketTiers?: unknown[];
  organizerId: Id<"users">;
}

/** Pure part (unit-tested in events.test.ts): true when the event has no
 * ticket tiers, so it needs no membership check at all — always public. */
export function isFreeEvent(event: Pick<TicketedEventLike, "ticketTiers">): boolean {
  return !event.ticketTiers || event.ticketTiers.length === 0;
}

/**
 * Per-query-call visibility checker. Memoizes the organizer's
 * event.sellTickets check by organizerId (a Map), so a list of N events by
 * a handful of organizers does one lookup per organizer, not one per
 * event. Build one of these per query/handler invocation with
 * `eventVisibilityChecker(ctx)` and reuse it across every event in that
 * call.
 */
/** True when `viewerId` may act on this event: it's public, or they
 * organized it. Used by the actions that take a raw eventId (apply, RSVP,
 * the attendee list), so knowing a hidden event's id gets you nothing the
 * event page wouldn't. */
export async function canSeeEvent(
  ctx: QueryCtx,
  event: TicketedEventLike,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (viewerId && String(event.organizerId) === String(viewerId)) return true;
  return eventVisibilityChecker(ctx)(event);
}

export function eventVisibilityChecker(ctx: QueryCtx) {
  const cache = new Map<string, Promise<boolean>>();
  return function isEventPublic(event: TicketedEventLike): Promise<boolean> {
    if (isFreeEvent(event)) return Promise.resolve(true);
    const key = String(event.organizerId);
    let result = cache.get(key);
    if (!result) {
      result = (async () => {
        const organizer = await getGardenUser(ctx, event.organizerId);
        return can(organizer, "event.sellTickets").allowed;
      })();
      cache.set(key, result);
    }
    return result;
  };
}
