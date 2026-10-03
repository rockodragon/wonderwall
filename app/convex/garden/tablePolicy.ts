import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getGardenUser } from "./entitlements";
import { communityVisibility } from "./communityVisibility";

export function normalizeTable(table: Doc<"gardenTables">) {
  return {
    scheduleType: table.scheduleType ?? (table.cadence ? "series" : "one_time"),
    pricingType:
      table.pricingType ?? ((table.priceCents ?? 0) > 0 ? "fixed" : "free"),
    priceCents: table.priceCents ?? 0,
    currency: table.currency ?? "usd",
    membershipRequired:
      table.membershipRequired ?? ["member", "cohort"].includes(table.mode),
    access: table.access ?? "open",
    visibility: table.visibility ?? "public",
    allowsExternalGuests: table.allowsExternalGuests ?? false,
    capacity: table.capacity,
  };
}

/** A paid entitlement must belong to this exact community. Never fall back
 * to another community's subscription for unassociated Tables. */
export async function hasTableCommunityMembership(
  ctx: QueryCtx,
  userId: Id<"users">,
  hostOrgId?: Id<"hostOrgs">,
): Promise<boolean> {
  if (!hostOrgId) return false;
  const org = await ctx.db.get(hostOrgId);
  if (
    !org ||
    org.kind !== "community" ||
    (org.status && org.status !== "active")
  )
    return false;
  const member = await ctx.db
    .query("communityMembers")
    .withIndex("by_hostOrgId_userId", (q) =>
      q.eq("hostOrgId", hostOrgId).eq("userId", userId),
    )
    .unique();
  if (!member || member.status !== "active") return false;
  const viewer = await getGardenUser(ctx, userId, hostOrgId);
  return ["seat", "five", "host"].includes(viewer.level);
}

export function isActiveEnrollment(
  table: Doc<"gardenTables">,
  membership: Doc<"tableMemberships"> | null | undefined,
  communityEligible: boolean,
): boolean {
  if (!membership || (membership.status ?? "active") !== "active") return false;
  const policy = normalizeTable(table);
  if (policy.membershipRequired && !communityEligible) return false;
  if (
    policy.pricingType === "fixed" &&
    membership.paymentStatus !== "confirmed"
  )
    return false;
  return true;
}

export type TableAction =
  | "join"
  | "checkout"
  | "request"
  | "joined"
  | "sign_in"
  | "membership_required"
  | "full"
  | "closed"
  | "unavailable";

export async function getTableParticipation(
  ctx: QueryCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users"> | null,
  options: { excludeHoldId?: Id<"tableCheckoutHolds"> } = {},
) {
  const policy = normalizeTable(table);
  const memberships = await ctx.db
    .query("tableMemberships")
    .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
    .collect();
  const membership = userId
    ? (memberships.find((m) => m.userId === userId) ?? null)
    : null;
  const isHost =
    !!userId &&
    (table.hostUserId === userId || (table.coHostIds ?? []).includes(userId));
  const communityEligible =
    !!userId &&
    (await hasTableCommunityMembership(ctx, userId, table.hostOrgId));
  const isMember = isActiveEnrollment(table, membership, communityEligible);
  const active = memberships.filter(
    (m) =>
      (m.status ?? "active") === "active" &&
      (policy.pricingType !== "fixed" || m.paymentStatus === "confirmed") &&
      !["host", "co_host"].includes(m.role ?? "participant"),
  );
  const holds = await ctx.db
    .query("tableCheckoutHolds")
    .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
    .collect();
  const held = holds.filter(
    (h) =>
      h._id !== options.excludeHoldId &&
      h.userId !== userId &&
      ["pending", "held"].includes(h.status) &&
      h.expiresAt > Date.now(),
  ).length;
  // An enrolled person reserves a chair across the Table's Events. Guests
  // reserve chairs per occurrence, so the busiest upcoming Event determines
  // the room still available for new persistent enrollment. Never sum guest
  // RSVPs across a series: those seats are on different dates.
  let guestReservations = 0;
  if (policy.capacity != null) {
    const now = Date.now();
    const events = await ctx.db
      .query("events")
      .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
      .collect();
    const upcoming = events.filter(
      (event) =>
        event.status === "published" && (event.endTime ?? event.datetime) > now,
    );
    const counts = await Promise.all(
      upcoming.map(async (event) => {
        const rsvps = await ctx.db
          .query("eventRsvps")
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .collect();
        return rsvps
          .filter((rsvp) => !rsvp.userId)
          .reduce((count, rsvp) => count + (rsvp.ticketCount ?? 1), 0);
      }),
    );
    guestReservations = Math.max(0, ...counts);
  }
  const memberCount = active.length;
  const spotsRemaining =
    policy.capacity == null
      ? null
      : Math.max(0, policy.capacity - memberCount - held - guestReservations);
  let action: TableAction = "join";
  let reason: string | undefined;
  const visible = await communityVisibility(ctx, userId).idVisible(
    table.hostOrgId,
  );
  if (!visible || table.status !== "active" || table.pausedAt) {
    action = "unavailable";
    reason = "This Table is currently unavailable.";
  } else if (!userId) action = "sign_in";
  else if (isMember || isHost) action = "joined";
  else if (policy.membershipRequired && !communityEligible) {
    action = "membership_required";
    reason = "Membership in this Table's community is required.";
  } else if (membership?.status === "removed") {
    action = "closed";
    reason = "Your participation was removed by the host.";
  } else if (
    table.enrollmentClosed ||
    (policy.access === "invite" && membership?.status !== "active")
  ) {
    action = "closed";
    reason = "Enrollment is by invitation.";
  } else if (spotsRemaining === 0) {
    action = "full";
    reason = "All chairs are taken.";
  } else if (policy.access === "approval" && membership?.status !== "active") {
    action = "request";
    reason =
      membership?.status === "pending"
        ? "Your request is awaiting the host."
        : "The host approves new participants.";
  } else if (
    policy.pricingType === "fixed" &&
    membership?.paymentStatus !== "confirmed"
  )
    action = "checkout";
  return {
    membership,
    isMember,
    isHost,
    communityEligible,
    action,
    reason,
    memberCount,
    spotsRemaining,
    guestReservations,
    canSeeRoster: visible && !!(isMember || isHost),
    canGuestRsvp:
      visible &&
      table.status === "active" &&
      !table.pausedAt &&
      !table.enrollmentClosed &&
      policy.visibility === "public" &&
      policy.allowsExternalGuests &&
      policy.access === "open" &&
      !policy.membershipRequired &&
      policy.pricingType === "free",
  };
}

export async function canViewTable(
  ctx: QueryCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users"> | null,
): Promise<boolean> {
  if (!(await communityVisibility(ctx, userId).idVisible(table.hostOrgId)))
    return false;
  if (
    normalizeTable(table).visibility === "public" &&
    table.status === "active" &&
    !table.pausedAt
  )
    return true;
  const viewer = await getTableParticipation(ctx, table, userId);
  return viewer.isHost || viewer.isMember;
}
