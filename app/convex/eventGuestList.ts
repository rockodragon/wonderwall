// The host's guest list and who each guest is. One row per person
// (eventGuests.ts mergeGuests) from applications, RSVPs and paid tickets,
// each with a role for the mix on the Guests tab: creatives, patrons,
// partners, churches, hosts. The role is a host's pick, else what a buyer
// answered after paying, else the guest's profile (eventGuests.ts
// roleFromProfile). Also who in the event's community hasn't got a ticket
// yet, so a host short on patrons knows whom to ask.

import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  guestKeyOf,
  guestTagKeys,
  isGuestRole,
  isTaggableGuestKey,
  mergeGuests,
  roleFromProfile,
  SELF_GUEST_ROLES,
  type GuestInput,
  type GuestRole,
  type GuestRow,
} from "./eventGuests";
import { hostOf, isEventHost, requireEventHost } from "./eventHosts";
import { getProfileByUserId, isAdmin } from "./helpers";
import { getUserEmail } from "./emailHelpers";
import { userIdsAtChurch } from "./organizations";
import { activeMembersOfCommunity, getCommunityMember } from "./garden/communityLookup";
import { blockedUserIds } from "./blocks";
import { profileImageUrl } from "./images";
import { hasRealName } from "./names";
import { isCheckoutSessionId } from "./garden/ticketLink";
import { rsvpByTicketSession } from "./garden/eventRsvps";

type Ctx = QueryCtx | MutationCtx;

/** Everyone on the event: applications, RSVPs and paid tickets, merged. */
export async function loadGuests(ctx: Ctx, eventId: Id<"events">): Promise<GuestRow[]> {
  const inputs: GuestInput[] = [];

  const applications = await ctx.db
    .query("eventApplications")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const app of applications) {
    const profile = await getProfileByUserId(ctx, app.applicantId);
    inputs.push({
      userId: String(app.applicantId),
      applicationId: String(app._id),
      message: app.message ?? null,
      name: profile?.name ?? "Anonymous",
      email: await getUserEmail(ctx, app.applicantId),
      status: app.status === "accepted" ? "going" : app.status === "declined" ? "declined" : "pending",
      addedAt: app.createdAt,
    });
  }

  const rsvps = await ctx.db
    .query("eventRsvps")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const r of rsvps) {
    inputs.push({
      userId: r.userId ? String(r.userId) : null,
      name: r.name,
      email: r.email,
      status: "going",
      paidCents: r.paidCents ?? null,
      tickets: r.ticketCount ?? 1,
      guestNames: r.guestNames ?? null,
      sentToPayPal: !!r.paypalOpenedAt,
      addedAt: r.createdAt,
    });
  }

  const purchases = await ctx.db
    .query("ticketPurchases")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const p of purchases) {
    if (p.status !== "paid") continue;
    let name = p.buyerEmail ?? "Ticket buyer";
    let email = p.buyerEmail ?? null;
    if (p.userId) {
      const profile = await getProfileByUserId(ctx, p.userId);
      if (profile?.name) name = profile.name;
      email = email ?? (await getUserEmail(ctx, p.userId));
    }
    inputs.push({
      userId: p.userId ? String(p.userId) : null,
      name,
      email,
      status: "going",
      paidCents: p.amountCents,
      addedAt: p.createdAt,
    });
  }

  return mergeGuests(inputs);
}

/** The events a person is on, from the same three places loadGuests reads:
 * requests to join, RSVPs and paid tickets. By account only: an RSVP or a
 * ticket with an email and no account isn't linked to anyone. "going"
 * keeps what the Guests tab counts as going (an accepted request, an RSVP,
 * a paid ticket); "any" adds requests still waiting or declined. */
export async function guestEventIds(
  ctx: Ctx,
  userId: Id<"users">,
  which: "going" | "any",
): Promise<Set<Id<"events">>> {
  const eventIds = new Set<Id<"events">>();
  for (const a of await ctx.db
    .query("eventApplications")
    .withIndex("by_applicantId", (q) => q.eq("applicantId", userId))
    .collect()) {
    if (which === "any" || a.status === "accepted") eventIds.add(a.eventId);
  }
  for (const r of await ctx.db
    .query("eventRsvps")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect()) {
    eventIds.add(r.eventId);
  }
  for (const p of await ctx.db
    .query("ticketPurchases")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect()) {
    if (p.status === "paid") eventIds.add(p.eventId);
  }
  return eventIds;
}

/** Each row with its role: a host's pick, else the guest's own answer,
 * else the event's hosts are hosts, else what their profile says. */
export async function withGuestRoles(ctx: Ctx, event: Doc<"events">, rows: GuestRow[]): Promise<GuestRow[]> {
  const tags = await ctx.db
    .query("eventGuestRoles")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  const tagOf = new Map<string, Doc<"eventGuestRoles">>();
  for (const t of tags) tagOf.set(t.guestKey, t);

  const userIds = rows.filter((r) => r.userId).map((r) => r.userId as Id<"users">);
  const atChurch = await userIdsAtChurch(ctx, userIds);

  return Promise.all(
    rows.map(async (row) => {
      const found = guestTagKeys(row)
        .map((k) => tagOf.get(k))
        .filter((t): t is Doc<"eventGuestRoles"> => !!t && isGuestRole(t.role));
      const tag = found.find((t) => t.source === "host") ?? found[0];
      let role: GuestRole;
      if (tag) role = tag.role as GuestRole;
      else if (row.userId && isEventHost(event, row.userId)) role = "host";
      else if (row.userId) {
        const profile = await getProfileByUserId(ctx, row.userId as Id<"users">);
        role = roleFromProfile(profile, atChurch.has(row.userId));
      } else role = "unknown";
      return { ...row, role };
    }),
  );
}

async function saveRole(
  ctx: MutationCtx,
  eventId: Id<"events">,
  guestKey: string,
  role: GuestRole,
  source: "host" | "guest",
) {
  const existing = await ctx.db
    .query("eventGuestRoles")
    .withIndex("by_eventId_guestKey", (q) => q.eq("eventId", eventId).eq("guestKey", guestKey))
    .unique();
  // A guest's answer never replaces a host's pick.
  if (existing?.source === "host" && source === "guest") return;
  if (existing) await ctx.db.patch(existing._id, { role, source, updatedAt: Date.now() });
  else await ctx.db.insert("eventGuestRoles", { eventId, guestKey, role, source, updatedAt: Date.now() });
}

/** A host says who a guest is, from the role menu on the Guests tab. */
export const setGuestRole = mutation({
  args: { eventId: v.id("events"), guestKey: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    await requireEventHost(ctx, args.eventId);
    if (!isGuestRole(args.role)) {
      throw new ConvexError({ code: "invalid_role", reason: "Pick a role from the list." });
    }
    if (!isTaggableGuestKey(args.guestKey)) {
      throw new ConvexError({ code: "invalid_guest", reason: "That guest can't be tagged." });
    }
    await saveRole(ctx, args.eventId, args.guestKey, args.role, "host");
  },
});

/** "Which are you?" on the event page after paying through the ticket's
 * Stripe link. No account needed: the checkout session id on the return
 * address is the buyer's proof (rsvpByTicketSession), and it only reaches
 * their own ticket. "not_yet" while Stripe's webhook hasn't saved the
 * ticket; the page asks again. */
export const answerTicketRole = mutation({
  args: { sessionId: v.string(), role: v.string() },
  handler: async (ctx, args): Promise<"saved" | "not_yet"> => {
    if (!isCheckoutSessionId(args.sessionId)) {
      throw new ConvexError({ code: "invalid_session", reason: "We couldn't find that ticket." });
    }
    if (!(SELF_GUEST_ROLES as readonly string[]).includes(args.role)) {
      throw new ConvexError({ code: "invalid_role", reason: "Pick one of the choices." });
    }
    const rsvp = await rsvpByTicketSession(ctx, args.sessionId);
    if (!rsvp) return "not_yet";
    const guestKey = guestKeyOf({ userId: rsvp.userId ? String(rsvp.userId) : null, email: rsvp.email });
    if (!guestKey) return "saved";
    await saveRole(ctx, rsvp.eventId, guestKey, args.role as GuestRole, "guest");
    return "saved";
  },
});

const INVITE_ORDER: GuestRole[] = ["church", "partner", "patron", "creative"];
const MAX_INVITE_SUGGESTIONS = 200;

/** People in the event's community who aren't on the list yet, with their
 * role: whom a host can still ask. Only for a host who is an active member
 * of that community (or an admin): the same people a member sees on its
 * member list, never to a co-host from outside it. Skips anyone on the
 * list in any state (matched by account or email: a ticket bought signed
 * out is email only), the event's hosts, anyone blocked either way,
 * profiles with no name yet, and people whose profile doesn't say who they
 * are. */
export const getInviteSuggestions = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const host = await hostOf(ctx, args.eventId);
    const hostOrgId = host?.event.hostOrgId;
    if (!host || !hostOrgId) return [];
    const { event, userId: me } = host;
    const membership = await getCommunityMember(ctx, hostOrgId, me);
    if (membership?.status !== "active" && !(await isAdmin(ctx, me))) return [];

    const guests = await loadGuests(ctx, event._id);
    const guestUsers = new Set(guests.map((g) => g.userId).filter(Boolean));
    const guestEmails = new Set(guests.map((g) => g.email).filter(Boolean)); // lowercased by mergeGuests
    const blocked = await blockedUserIds(ctx, me);
    const members = [];
    for (const m of await activeMembersOfCommunity(ctx, hostOrgId)) {
      if (isEventHost(event, m.userId) || blocked.has(m.userId) || guestUsers.has(String(m.userId))) continue;
      const email = (await getUserEmail(ctx, m.userId))?.trim().toLowerCase();
      if (email && guestEmails.has(email)) continue;
      members.push(m);
    }
    const atChurch = await userIdsAtChurch(
      ctx,
      members.map((m) => m.userId),
    );

    const out: { userId: Id<"users">; profileId: Id<"profiles">; name: string; imageUrl: string | null; role: GuestRole }[] = [];
    for (const m of members) {
      const profile = await getProfileByUserId(ctx, m.userId);
      if (!profile || !hasRealName(profile.name)) continue;
      const role = roleFromProfile(profile, atChurch.has(String(m.userId)));
      if (role === "unknown") continue;
      out.push({
        userId: m.userId,
        profileId: profile._id,
        name: profile.name,
        imageUrl: await profileImageUrl(ctx, profile),
        role,
      });
    }
    out.sort((a, b) => INVITE_ORDER.indexOf(a.role) - INVITE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
    return out.slice(0, MAX_INVITE_SUGGESTIONS);
  },
});
