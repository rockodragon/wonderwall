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
import { isHidden } from "../moderationRules";
import { communityVisibility } from "./communityVisibility";
import { getAuthUserId } from "@convex-dev/auth/server";
import { canViewTable } from "./tablePolicy";

export interface TicketedEventLike {
  ticketTiers?: unknown[];
  tableId?: Id<"gardenTables">;
  organizerId: Id<"users">;
  /** The tier that counts is the organizer's in this event's community. */
  hostOrgId?: Id<"hostOrgs">;
  /** "hidden" (an admin took it down, moderation.ts) is never public. */
  status?: string;
}

/** Pure part (unit-tested in events.test.ts): true when the event has no
 * ticket tiers, so it needs no membership check at all — always public. */
export function isFreeEvent(
  event: Pick<TicketedEventLike, "ticketTiers">,
): boolean {
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
 * organized it. An event posted into a hidden (test) community also needs
 * the viewer to be able to see that community. Used by the actions that
 * take a raw eventId (apply, RSVP, the attendee list), so knowing a hidden
 * event's id gets you nothing the event page wouldn't. */
export async function canSeeEvent(
  ctx: QueryCtx,
  event: TicketedEventLike,
  viewerId: Id<"users"> | null,
): Promise<boolean> {
  if (event.tableId) {
    const table = await ctx.db.get(event.tableId);
    if (!table || !(await canViewTable(ctx, table, viewerId))) return false;
  }
  if (viewerId && String(event.organizerId) === String(viewerId)) return true;
  // Posted into a hidden (test) community: only admins and its members, so
  // knowing the id gets a stranger nothing (apply, RSVP, the attendee list).
  if (!(await communityVisibility(ctx, viewerId).idVisible(event.hostOrgId)))
    return false;
  return eventVisibilityChecker(ctx)(event);
}

export function eventVisibilityChecker(ctx: QueryCtx) {
  const cache = new Map<string, Promise<boolean>>();
  const tableCache = new Map<string, Promise<boolean>>();
  let viewer: Promise<Id<"users"> | null> | undefined;
  function parentVisible(tableId: Id<"gardenTables">): Promise<boolean> {
    let result = tableCache.get(tableId);
    if (!result) {
      viewer ??= getAuthUserId(ctx);
      result = Promise.all([ctx.db.get(tableId), viewer]).then(
        ([table, userId]) => (table ? canViewTable(ctx, table, userId) : false),
      );
      tableCache.set(tableId, result);
    }
    return result;
  }
  return async function isEventPublic(
    event: TicketedEventLike,
  ): Promise<boolean> {
    if (event.tableId && !(await parentVisible(event.tableId))) return false;
    if (isHidden(event)) return Promise.resolve(false);
    if (isFreeEvent(event)) return Promise.resolve(true);
    const key = `${event.organizerId}:${event.hostOrgId ?? ""}`;
    let result = cache.get(key);
    if (!result) {
      result = (async () => {
        const organizer = await getGardenUser(
          ctx,
          event.organizerId,
          event.hostOrgId,
        );
        return can(organizer, "event.sellTickets").allowed;
      })();
      cache.set(key, result);
    }
    return result;
  };
}
