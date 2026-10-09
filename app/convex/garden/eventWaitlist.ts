// The waitlist for a full event (docs/features/event-capacity-waitlist.md).
// Luma's model: people join when it's full, the host lets them in from the
// Guests tab, nothing moves up on its own. Each person has an account, same
// rule as an RSVP. Leaving is eventRsvps.ts cancelMyRsvp ("Can't make it").

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isEventHost } from "../eventHosts";
import { canSeeEvent } from "./eventVisibility";
import { eventHasEnded } from "../eventWindow";
import { isEventFull, isGoing, waitlistOn } from "../eventSpots";
import { accountRsvpIdentity, upsertEventRsvp } from "./eventRsvps";
import { isPayPalPaymentLink } from "./ticketLink";
import { scheduleNotificationEmail } from "../emailHelpers";
import { escapeHtml } from "../email/template";

export type WaitlistJoin = "waiting" | "going";

export const joinWaitlist = mutation({
  args: { eventId: v.id("events"), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<WaitlistJoin> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "not_signed_in", reason: "Sign in to join the waitlist." });

    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canSeeEvent(ctx, event, userId))) {
      throw new ConvexError({ code: "not_found", reason: "That event isn't there anymore." });
    }
    if (event.status !== "published" || eventHasEnded(event, Date.now())) {
      throw new ConvexError({ code: "closed", reason: "This event isn't taking anyone new." });
    }
    if (!waitlistOn(event)) {
      throw new ConvexError({ code: "no_waitlist", reason: "This event has no waitlist." });
    }
    if (await isGoing(ctx, event, userId)) return "going";
    // A spot opened since the page loaded: take it the usual way instead.
    if (!(await isEventFull(ctx, event))) {
      throw new ConvexError({ code: "not_full", reason: "A spot just opened. Refresh the page to get in." });
    }

    const existing = await ctx.db
      .query("eventWaitlist")
      .withIndex("by_eventId_userId", (q) => q.eq("eventId", args.eventId).eq("userId", userId))
      .first();
    if (existing) return "waiting";

    const { name, email } = await accountRsvpIdentity(ctx, userId, args.name);
    await ctx.db.insert("eventWaitlist", {
      eventId: args.eventId,
      userId,
      name,
      email,
      createdAt: Date.now(),
    });
    return "waiting";
  },
});

async function requireHostOfEntry(
  ctx: MutationCtx,
  entryId: Id<"eventWaitlist">,
): Promise<{ entry: Doc<"eventWaitlist">; event: Doc<"events">; hostId: Id<"users"> }> {
  const hostId = await getAuthUserId(ctx);
  if (!hostId) throw new ConvexError({ code: "not_signed_in", reason: "Sign in first." });
  const entry = await ctx.db.get(entryId);
  if (!entry) throw new ConvexError({ code: "not_found", reason: "They're no longer on the waitlist." });
  const event = await ctx.db.get(entry.eventId);
  if (!event || !isEventHost(event, hostId)) {
    throw new ConvexError({ code: "not_authorized", reason: "Only the event's hosts can do that." });
  }
  return { entry, event, hostId };
}

/** Let in: an RSVP on their account, the waitlist row gone, and a note to
 * them. A host may go past the limit; that's their call. */
export const admitFromWaitlist = mutation({
  args: { entryId: v.id("eventWaitlist") },
  handler: async (ctx, args) => {
    const { entry, event, hostId } = await requireHostOfEntry(ctx, args.entryId);
    await upsertEventRsvp(ctx, { eventId: entry.eventId, userId: entry.userId, name: entry.name, email: entry.email });
    await ctx.db.delete(entry._id);

    const payPal = isPayPalPaymentLink(event.externalTicketUrl);
    const title = `You're in: ${event.title}`;
    const message = payPal ? "A spot opened. Pay on PayPal from the event page." : "A spot opened. See you there.";
    const linkUrl = `/events/${event._id}`;
    await ctx.db.insert("notifications", {
      userId: entry.userId,
      type: "event_waitlist_admitted",
      title,
      message,
      linkUrl,
      relatedUserId: hostId,
      createdAt: Date.now(),
    });
    await scheduleNotificationEmail(ctx, {
      userId: entry.userId,
      subject: title,
      previewText: message,
      heading: title,
      body: `A spot opened for "<strong>${escapeHtml(event.title)}</strong>" and you're on the list.${
        payPal ? " Pay on PayPal from the event page to finish." : ""
      }`,
      ctaText: payPal ? "Pay on PayPal" : "See the event",
      ctaUrl: linkUrl,
      // Their own spot, not an update they could have opted out of.
      category: "transactional",
      communityId: event.hostOrgId,
    });
    return { ok: true };
  },
});

export const removeFromWaitlist = mutation({
  args: { entryId: v.id("eventWaitlist") },
  handler: async (ctx, args) => {
    const { entry } = await requireHostOfEntry(ctx, args.entryId);
    await ctx.db.delete(entry._id);
    return { ok: true };
  },
});

/** The Guests tab's Waitlist: oldest first. Hosts only; emails included. */
export const getWaitlist = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!userId || !event || !isEventHost(event, userId)) return [];
    const rows = await ctx.db
      .query("eventWaitlist")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({ _id: r._id, name: r.name, email: r.email, createdAt: r.createdAt }));
  },
});
