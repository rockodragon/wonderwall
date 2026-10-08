// Platform-wide Tables use persistent enrollment and canonical Event occurrences.
// Legacy modes/sessions remain readable during the additive migration.

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import { can } from "./capabilities";
import type { GardenUser } from "./capabilities";
import { getGardenUser, throwDenial } from "./entitlements";
import { COMMUNITY_KIND } from "./communities";
import { communityVisibility } from "./communityVisibility";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { assertCommunityMember } from "./communities";
import {
  normalizeTable,
  getTableParticipation,
  canViewTable,
  hasTableCommunityMembership,
  isActiveEnrollment,
} from "./tablePolicy";
import { syncCoHosts } from "../eventHosts";
import { eventHasStarted } from "../eventWindow";
import { primaryOrgByUserId } from "../organizations";
import { MIN_CLASS_PRICE_CENTS, MAX_CLASS_PRICE_CENTS } from "./stripeHandlers";
import {
  inviteToRunAgain,
  notifyHostsOfJoin,
  notifyNewDate,
  notifyRemoved,
  notifyRequestAccepted,
} from "./tableNotify";

/** Batches hostOrgs lookups into one Map keyed by hostOrgId string — every
 * gardenTables row has a hostOrgId (it's required, unlike projects/events/
 * offerings), but only communities (kind COMMUNITY_KIND) are ever surfaced
 * as `community` — the platform org itself is never listed. */
async function resolveCommunities(
  ctx: {
    db: {
      get: (
        id: Id<"hostOrgs">,
      ) => Promise<{ kind: string; name: string; slug: string } | null>;
    };
  },
  hostOrgIds: (Id<"hostOrgs"> | undefined)[],
): Promise<Map<string, { name: string; slug: string }>> {
  const distinct = [
    ...new Set(hostOrgIds.filter((id): id is Id<"hostOrgs"> => !!id)),
  ];
  const orgs = await Promise.all(distinct.map((id) => ctx.db.get(id)));
  const out = new Map<string, { name: string; slug: string }>();
  distinct.forEach((id, i) => {
    const org = orgs[i];
    if (org && org.kind === COMMUNITY_KIND)
      out.set(String(id), { name: org.name, slug: org.slug });
  });
  return out;
}

// ——— Pure core ———

/** Legacy mode adapter kept for compatibility with older consumers.
 * Canonical reads and writes share getTableParticipation in tablePolicy.ts.
 * This adapter never grants payment-backed access on its own. */
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
      return {
        allowed: false,
        reason: gate.reason,
        upgradePath: gate.upgradePath,
      };
    }
    // Legacy mode adapter retained for old callers. Canonical handlers use
    // getTableParticipation, which requires confirmed payment before access.
    return {
      allowed: true,
      paymentPending: args.mode === "cohort" && !!args.priceCents,
    };
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

// Canonical public projections. Never expose enrollment rows or contact details.
/** The cover: an uploaded picture (4:5, from the cover picker), else the
 * older pasted address. */
async function tablePhotoUrl(ctx: QueryCtx, table: Doc<"gardenTables">) {
  if (table.photoStorageId) {
    const url = await ctx.storage.getUrl(table.photoStorageId);
    if (url) return url;
  }
  return table.photoUrl;
}

async function tableSummary(
  ctx: QueryCtx,
  table: Doc<"gardenTables">,
  userId: Id<"users"> | null,
) {
  const [viewer, events, sessions, community, profile] = await Promise.all([
    getTableParticipation(ctx, table, userId),
    ctx.db
      .query("events")
      .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
      .collect(),
    ctx.db
      .query("tableSessions")
      .withIndex("by_tableId_startsAt", (q) => q.eq("tableId", table._id))
      .collect(),
    resolveCommunities(ctx, [table.hostOrgId]),
    table.hostUserId
      ? ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", table.hostUserId!))
          .unique()
      : null,
  ]);
  const occurrences = events
    .filter((e) => e.status === "published")
    .sort((a, b) => a.datetime - b.datetime);
  const nextEvent =
    occurrences.find((e) => (e.endTime ?? e.datetime) >= Date.now()) ?? null;
  const legacyNext = sessions
    .filter((s) => s.startsAt >= Date.now())
    .sort((a, b) => a.startsAt - b.startsAt)[0];
  const { membership: _private, ...publicViewer } = viewer;
  const imageUrl = profile
    ? profile.imageStorageId
      ? await ctx.storage.getUrl(profile.imageStorageId)
      : profile.imageUrl || null
    : null;
  const primaryOrg = profile
    ? await primaryOrgByUserId(ctx, profile.userId)
    : null;
  const communityHost = community.get(String(table.hostOrgId)) ?? null;
  const hostName = profile?.name ?? communityHost?.name ?? "Community host";
  return {
    _id: table._id,
    name: table.name,
    slug: table.slug,
    mode: table.mode,
    format: table.format,
    topic: table.topic ?? table.format,
    program: table.program,
    cadence: table.cadence,
    blurb: table.blurb,
    photoUrl: await tablePhotoUrl(ctx, table),
    ...normalizeTable(table),
    hostRoleLabel: table.hostRoleLabel ?? "Hosted by",
    hostLabel: table.hostRoleLabel ?? "Hosted by",
    hostName,
    host: {
      name: hostName,
      userId: table.hostUserId,
      profileId: profile?._id,
      imageUrl,
      href: profile
        ? `/profile/${profile._id}`
        : communityHost
          ? `/communities/${communityHost.slug}`
          : undefined,
      orgName: primaryOrg?.name,
      orgSlug: primaryOrg?.slug,
      orgHref: primaryOrg ? `/orgs/${primaryOrg.slug}` : undefined,
    },
    memberCount: viewer.memberCount,
    spotsRemaining: viewer.spotsRemaining,
    eventCount: occurrences.length || sessions.length,
    nextEvent: nextEvent
      ? {
          _id: nextEvent._id,
          id: nextEvent._id,
          title: nextEvent.title,
          datetime: nextEvent.datetime,
          endTime: nextEvent.endTime,
          location: nextEvent.location,
          locationType: nextEvent.locationType,
        }
      : null,
    nextEventAt: nextEvent?.datetime ?? legacyNext?.startsAt,
    isOnline:
      nextEvent?.locationType === "online" ||
      (!nextEvent && !!table.meetingUrl),
    location: nextEvent?.location,
    community: communityHost,
    viewer: {
      ...publicViewer,
      canJoin: {
        allowed: ["join", "request", "checkout", "joined"].includes(
          viewer.action,
        ),
        reason: viewer.reason,
      },
    },
  };
}

export const listTables = query({
  args: { hostOrgId: v.optional(v.id("hostOrgs")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const tables = await ctx.db
      .query("gardenTables")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const visible = await communityVisibility(ctx, userId).filter(tables);
    const publicTables = visible.filter(
      (t) =>
        normalizeTable(t).visibility === "public" &&
        !t.pausedAt &&
        (!args.hostOrgId || t.hostOrgId === args.hostOrgId),
    );
    return await Promise.all(
      publicTables.map((t) => tableSummary(ctx, t, userId)),
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
    const userId = await getAuthUserId(ctx);
    if (!table || !(await canViewTable(ctx, table, userId))) return null;
    const summary = await tableSummary(ctx, table, userId);
    const events = await ctx.db
      .query("events")
      .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
      .collect();
    const sessions = await ctx.db
      .query("tableSessions")
      .withIndex("by_tableId_startsAt", (q) => q.eq("tableId", table._id))
      .collect();
    let roster: string[] = [];
    let rosterProfiles: {
      userId: Id<"users">;
      profileId: Id<"profiles">;
      name: string;
      slug?: string;
    }[] = [];
    if (summary.viewer.canSeeRoster) {
      const rows = await ctx.db
        .query("tableMemberships")
        .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
        .collect();
      const activeRows = rows.filter(
        (m) =>
          (m.status ?? "active") === "active" &&
          (summary.pricingType !== "fixed" ||
            m.paymentStatus === "confirmed" ||
            ["host", "co_host"].includes(m.role ?? "")),
      );
      const eligible = await Promise.all(
        activeRows.map(
          async (m) =>
            !summary.membershipRequired ||
            ["host", "co_host"].includes(m.role ?? "") ||
            (await hasTableCommunityMembership(ctx, m.userId, table.hostOrgId)),
        ),
      );
      const profiles = await Promise.all(
        activeRows
          .filter((_, i) => eligible[i])
          .map((m) =>
            ctx.db
              .query("profiles")
              .withIndex("by_userId", (q) => q.eq("userId", m.userId))
              .unique(),
          ),
      );
      rosterProfiles = profiles
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({
          userId: p.userId,
          profileId: p._id,
          name: p.name,
          slug: p.inviteSlug,
        }));
      roster = rosterProfiles.map((p) => p.name);
    }
    // A host who can't add dates sees why instead of a form that refuses.
    const addDates =
      summary.viewer.isHost && userId
        ? await addDatesDenial(ctx, userId, table.hostOrgId)
        : null;
    return {
      ...summary,
      addDatesBlocked: addDates?.reason ?? null,
      description: table.description ?? table.blurb ?? "",
      externalPaymentLinkUrl: table.externalPaymentLinkUrl,
      roster,
      rosterProfiles,
      meetingUrl: visibleMeetingUrl(
        table.meetingUrl,
        summary.viewer.canSeeRoster,
      ),
      events: events
        .filter((e) => summary.viewer.isHost || e.status === "published")
        .sort((a, b) => a.datetime - b.datetime)
        .map((e) => ({
          _id: e._id,
          title: e.title,
          datetime: e.datetime,
          endTime: e.endTime,
          location: e.location,
          locationType: e.locationType,
          status: e.status,
        })),
      sessions: sessions
        .sort((a, b) => a.startsAt - b.startsAt)
        .map((s) => ({
          _id: s._id,
          title: s.title,
          startsAt: s.startsAt,
          durationMins: s.durationMins,
          meetingUrl: visibleMeetingUrl(
            s.meetingUrl ?? table.meetingUrl,
            summary.viewer.canSeeRoster,
          ),
        })),
    };
  },
});

export async function transitionMembership(
  ctx: MutationCtx,
  tableId: Id<"gardenTables">,
  userId: Id<"users">,
  patch: Partial<
    Pick<
      Doc<"tableMemberships">,
      | "status"
      | "role"
      | "paymentStatus"
      | "paidCents"
      | "currency"
      | "stripeCheckoutSessionId"
      | "leftAt"
    >
  >,
  recordedByUserId = userId,
) {
  const existing = await ctx.db
    .query("tableMemberships")
    .withIndex("by_tableId_userId", (q) =>
      q.eq("tableId", tableId).eq("userId", userId),
    )
    .unique();
  const now = Date.now();
  const nextStatus = patch.status ?? existing?.status ?? "active";
  if (existing) await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
  else
    await ctx.db.insert("tableMemberships", {
      tableId,
      userId,
      joinedAt: now,
      ...patch,
      updatedAt: now,
    });
  if (!existing || (existing.status ?? "active") !== nextStatus)
    await ctx.db.insert("tableMembershipHistory", {
      tableId,
      userId,
      status: nextStatus,
      previousStatus: existing?.status ?? (existing ? "active" : undefined),
      recordedByUserId,
      createdAt: now,
    });
}

export const joinTable = mutation({
  args: { tableId: v.id("gardenTables") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const table = await ctx.db.get(args.tableId);
    if (!table || !(await canViewTable(ctx, table, userId)))
      throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, table, userId);
    if (viewer.isMember || viewer.isHost)
      return { alreadyMember: true, action: "joined" };
    if (viewer.action === "checkout")
      return { paymentPending: true, action: "checkout" };
    if (viewer.action === "request") {
      if (viewer.membership?.status !== "pending") {
        await transitionMembership(ctx, table._id, userId, {
          status: "pending",
          role: "participant",
          paymentStatus:
            normalizeTable(table).pricingType === "free"
              ? "not_required"
              : "pending",
        });
        await notifyHostsOfJoin(ctx, table, userId, "asked");
      }
      return { ok: true, action: "request" };
    }
    if (viewer.action !== "join")
      throw new ConvexError({ code: viewer.action, reason: viewer.reason });
    await transitionMembership(ctx, table._id, userId, {
      status: "active",
      role: "participant",
      paymentStatus:
        viewer.membership?.paymentStatus === "confirmed"
          ? "confirmed"
          : "not_required",
      leftAt: undefined,
    });
    await notifyHostsOfJoin(ctx, table, userId, "joined");
    return { ok: true, action: "joined" };
  },
});

export const leaveTable = mutation({
  args: { tableId: v.id("gardenTables") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const existing = await ctx.db
      .query("tableMemberships")
      .withIndex("by_tableId_userId", (q) =>
        q.eq("tableId", args.tableId).eq("userId", userId),
      )
      .unique();
    // Leaving ends your own chair or your own request. A host's removal is
    // not yours to change: turning it into "left" would let joinTable seat
    // you again. Only a host (manageEnrollment accept) restores it.
    if (existing && ["active", "pending"].includes(existing.status ?? "active"))
      await transitionMembership(ctx, args.tableId, userId, {
        status: "left",
        leftAt: Date.now(),
      });
    return { ok: true };
  },
});

export const listMyTables = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("tableMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const hosted = await ctx.db
      .query("gardenTables")
      .withIndex("by_hostUserId", (q) => q.eq("hostUserId", userId))
      .collect();
    const joined = await Promise.all(
      memberships
        .filter(
          (m) => (m.status ?? "active") === "active" || m.status === "pending",
        )
        .map((m) => ctx.db.get(m.tableId)),
    );
    const distinct = new Map(
      [...hosted, ...joined.filter((t): t is NonNullable<typeof t> => !!t)].map(
        (t) => [t._id, t],
      ),
    );
    const tables = [];
    for (const table of distinct.values())
      if (await canViewTable(ctx, table, userId))
        tables.push(await tableSummary(ctx, table, userId));
    return tables;
  },
});

/** Participation relationships are disclosed only to that person or other
 * accepted participants in the same Table, never to anonymous profiles. */
export const listTablesForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (!viewerId) return [];
    const memberships = await ctx.db
      .query("tableMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const rows = [];
    for (const m of memberships) {
      if ((m.status ?? "active") !== "active") continue;
      const table = await ctx.db.get(m.tableId);
      if (!table || !(await canViewTable(ctx, table, viewerId))) continue;
      const viewer = await getTableParticipation(ctx, table, viewerId);
      if (viewerId !== args.userId) {
        const targetEligible = await hasTableCommunityMembership(
          ctx,
          args.userId,
          table.hostOrgId,
        );
        if (
          !viewer.canSeeRoster ||
          !isActiveEnrollment(table, m, targetEligible)
        )
          continue;
      }
      const summary = await tableSummary(ctx, table, viewerId);
      rows.push({ ...summary, roster: summary.memberCount });
    }
    return rows;
  },
});

export const getCreatorPolicy = query({
  args: { hostOrgId: v.optional(v.id("hostOrgs")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId)
      return {
        signedIn: false,
        canCreateFreeOneTime: false,
        canCreatePaidOrSeries: false,
        communities: [],
      };
    const rows = await ctx.db
      .query("communityMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const communities = [];
    for (const row of rows) {
      if (row.status !== "active") continue;
      const org = await ctx.db.get(row.hostOrgId);
      if (
        !org ||
        org.kind !== "community" ||
        (org.status && org.status !== "active")
      )
        continue;
      communities.push({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        canHostPaidOrSeries: await hasTableCommunityMembership(
          ctx,
          userId,
          org._id,
        ),
      });
    }
    return {
      signedIn: true,
      canCreateFreeOneTime: true,
      canCreatePaidOrSeries: args.hostOrgId
        ? communities.some(
            (c) => c._id === args.hostOrgId && c.canHostPaidOrSeries,
          )
        : false,
      communities,
    };
  },
});

type TableOccurrence = {
  title: string;
  datetime: number;
  endTime?: number;
  location?: string;
  locationType?: string;
};
function validateTableOccurrence(event: TableOccurrence) {
  if (
    !event.title.trim() ||
    event.title.length > 200 ||
    !Number.isFinite(event.datetime) ||
    event.datetime <= Date.now() ||
    (event.endTime !== undefined &&
      (!Number.isFinite(event.endTime) || event.endTime <= event.datetime))
  ) {
    throw new ConvexError({
      code: "invalid_event",
      reason:
        "Each Event needs a title and future date with an end after its start.",
    });
  }
  if (
    event.locationType &&
    !["online", "venue", "city", "zip", "tbd"].includes(event.locationType)
  )
    throw new ConvexError({ code: "invalid_location" });
}

async function insertTableOccurrence(
  ctx: MutationCtx,
  table: Doc<"gardenTables">,
  event: TableOccurrence,
  userId: Id<"users">,
) {
  const now = Date.now();
  const eventId = await ctx.db.insert("events", {
    ...event,
    title: event.title.trim(),
    tableId: table._id,
    organizerId: table.hostUserId ?? userId,
    coHostIds: table.coHostIds,
    description: table.description ?? table.blurb ?? "",
    hostOrgId: table.hostOrgId,
    // Each date wears the Table's cover on its event card and page.
    ...(table.photoStorageId ? { coverImageStorageId: table.photoStorageId } : {}),
    tags: [],
    // The Table's access rule is applied once, at enrollment. Event apply
    // and RSVP already require an accepted participant, so copying the
    // Table's approval onto each Event only asked them a second time.
    requiresApproval: false,
    status: "published",
    createdAt: now,
    updatedAt: now,
  });
  await syncCoHosts(ctx, eventId, table.coHostIds ?? []);
  return eventId;
}

const occurrenceValidator = v.object({
  title: v.string(),
  datetime: v.number(),
  endTime: v.optional(v.number()),
  location: v.optional(v.string()),
  locationType: v.optional(v.string()),
});

type NewTable = {
  name: string;
  slug?: string;
  hostOrgId?: Id<"hostOrgs">;
  format?: string;
  description: string;
  scheduleType: "one_time" | "series";
  membershipRequired: boolean;
  access: "open" | "approval" | "invite";
  allowsExternalGuests: boolean;
  pricingType: "free" | "fixed";
  priceCents?: number;
  capacity?: number;
  hostRoleLabel?: string;
  photoUrl?: string;
  photoStorageId?: Id<"_storage">;
  events: TableOccurrence[];
};

/** Every creation rule lives here, so createTable and runTableAgain can't
 * drift: who may charge or run a series, guest policy, capacity, price,
 * dates. `userId` becomes the host. */
async function createTableFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: NewTable,
  extra: { previousTableId?: Id<"gardenTables"> } = {},
) {
  if (
    !args.name.trim() ||
    args.name.length > 120 ||
    !args.description.trim() ||
    args.description.length > 10000
  )
    throw new ConvexError({
      code: "invalid_table",
      reason: "Add a Table name and description.",
    });
  if (
    args.events.length < 1 ||
    args.events.length > 24 ||
    (args.scheduleType === "one_time" && args.events.length !== 1)
  )
    throw new ConvexError({
      code: "invalid_schedule",
      reason: "A one-time Table has one Event; a series has up to 24.",
    });
  if (
    args.capacity !== undefined &&
    (!Number.isInteger(args.capacity) ||
      args.capacity < 1 ||
      args.capacity > 1000)
  )
    throw new ConvexError({ code: "invalid_capacity" });
  const price = args.priceCents ?? 0;
  if (
    !Number.isInteger(price) ||
    price < 0 ||
    price > MAX_CLASS_PRICE_CENTS ||
    (args.pricingType === "fixed" && price < MIN_CLASS_PRICE_CENTS) ||
    (args.pricingType === "free" && price !== 0)
  )
    throw new ConvexError({
      code: "invalid_price",
      reason: "Choose free or a fixed price of at least $1.00.",
    });
  if (args.hostOrgId)
    await assertCommunityMember(ctx, args.hostOrgId, userId);
  if (
    (args.pricingType === "fixed" || args.scheduleType === "series") &&
    !(await hasTableCommunityMembership(ctx, userId, args.hostOrgId))
  )
    throw new ConvexError({
      code: "hosting_membership_required",
      reason:
        "Join this community's paid membership to host paid Tables or a series.",
    });
  if (args.membershipRequired && !args.hostOrgId)
    throw new ConvexError({ code: "community_required" });
  if (
    args.allowsExternalGuests &&
    (args.membershipRequired ||
      args.access !== "open" ||
      args.pricingType !== "free")
  )
    throw new ConvexError({
      code: "invalid_guest_policy",
      reason: "External guest RSVPs are available for open free Tables.",
    });
  for (const event of args.events) validateTableOccurrence(event);
  const base = (args.slug ?? args.name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base) throw new ConvexError({ code: "invalid_slug" });
  let slug = base;
  for (
    let n = 2;
    await ctx.db
      .query("gardenTables")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    n++
  )
    slug = `${base}-${n}`;
  const now = Date.now();
  const tableId = await ctx.db.insert("gardenTables", {
    name: args.name.trim(),
    slug,
    hostOrgId: args.hostOrgId,
    hostUserId: userId,
    mode: args.membershipRequired ? "member" : "open",
    format: args.format,
    description: args.description.trim(),
    blurb: args.description.trim().slice(0, 240),
    photoUrl: args.photoUrl,
    ...(args.photoStorageId ? { photoStorageId: args.photoStorageId } : {}),
    scheduleType: args.scheduleType,
    membershipRequired: args.membershipRequired,
    access: args.access,
    visibility: args.access === "invite" ? "unlisted" : "public",
    allowsExternalGuests: args.allowsExternalGuests,
    pricingType: args.pricingType,
    priceCents: price,
    currency: "usd",
    capacity: args.capacity,
    hostRoleLabel: args.hostRoleLabel ?? "Hosted by",
    ...(extra.previousTableId ? { previousTableId: extra.previousTableId } : {}),
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const table = await ctx.db.get(tableId);
  if (!table) throw new Error("Table was not saved.");
  const eventIds = [];
  for (const event of args.events)
    eventIds.push(await insertTableOccurrence(ctx, table, event, userId));
  await transitionMembership(ctx, tableId, userId, {
    status: "active",
    role: "host",
    paymentStatus: "not_required",
  });
  return { tableId, slug, eventIds };
}

export const createTable = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    hostOrgId: v.optional(v.id("hostOrgs")),
    format: v.optional(v.string()),
    description: v.string(),
    scheduleType: v.union(v.literal("one_time"), v.literal("series")),
    membershipRequired: v.boolean(),
    access: v.union(
      v.literal("open"),
      v.literal("approval"),
      v.literal("invite"),
    ),
    allowsExternalGuests: v.boolean(),
    pricingType: v.union(v.literal("free"), v.literal("fixed")),
    priceCents: v.optional(v.number()),
    capacity: v.optional(v.number()),
    hostRoleLabel: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    events: v.array(occurrenceValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    return await createTableFor(ctx, userId, args);
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
    if (!session) throw new ConvexError({ code: "not_found" });
    const table = await ctx.db.get(session.tableId);
    if (!table || !(await canViewTable(ctx, table, userId)))
      throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, table, userId);
    if (!viewer.isMember && !viewer.isHost)
      throw new ConvexError({
        code: "not_a_member",
        reason: "Join the Table and complete its requirements first.",
      });
    const existing = await ctx.db
      .query("sessionRsvps")
      .withIndex("by_sessionId_userId", (q) =>
        q.eq("sessionId", args.sessionId).eq("userId", userId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { status: args.status });
    else
      await ctx.db.insert("sessionRsvps", {
        sessionId: args.sessionId,
        userId,
        status: args.status,
        createdAt: Date.now(),
      });
    return { ok: true, status: args.status };
  },
});

export const manageEnrollment = mutation({
  args: {
    tableId: v.id("gardenTables"),
    userId: v.id("users"),
    decision: v.union(v.literal("accept"), v.literal("remove")),
  },
  handler: async (ctx, args) => {
    const actor = await getAuthUserId(ctx);
    if (!actor) throw new ConvexError({ code: "unauthenticated" });
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError({ code: "not_found" });
    const host = await getTableParticipation(ctx, table, actor);
    if (!host.isHost) throw new ConvexError({ code: "forbidden" });
    if (table.hostUserId === args.userId)
      throw new ConvexError({ code: "cannot_remove_owner" });
    const participant = await getTableParticipation(ctx, table, args.userId);
    if (args.decision === "remove") {
      const was = participant.membership?.status ?? "active";
      if (participant.membership)
        await transitionMembership(
          ctx,
          table._id,
          args.userId,
          { status: "removed" },
          actor,
        );
      // Only someone who was in, or waiting, hears about it.
      if (participant.membership && ["active", "pending"].includes(was))
        await notifyRemoved(
          ctx,
          table,
          args.userId,
          was === "pending" ? "declined" : "removed",
          actor,
        );
      return { ok: true };
    }
    if (
      normalizeTable(table).membershipRequired &&
      !participant.communityEligible
    )
      throw new ConvexError({ code: "membership_required" });
    if (participant.spotsRemaining === 0 && !participant.isMember)
      throw new ConvexError({ code: "full" });
    // Only an answer to a request is news to them; restoring a removed
    // chair or re-accepting an active one sends nothing.
    const answeringRequest = participant.membership?.status === "pending";
    // Approval accepts the application; payment remains a separate gate.
    await transitionMembership(
      ctx,
      table._id,
      args.userId,
      {
        status: "active",
        role: "participant",
        paymentStatus:
          normalizeTable(table).pricingType === "free"
            ? "not_required"
            : (participant.membership?.paymentStatus ?? "pending"),
      },
      actor,
    );
    if (answeringRequest)
      await notifyRequestAccepted(ctx, table, args.userId, actor);
    return { ok: true };
  },
});

export const recordAttendance = mutation({
  args: {
    eventId: v.id("events"),
    userId: v.id("users"),
    status: v.union(v.literal("attended"), v.literal("absent")),
  },
  handler: async (ctx, args) => {
    const actor = await getAuthUserId(ctx);
    if (!actor) throw new ConvexError({ code: "unauthenticated" });
    const event = await ctx.db.get(args.eventId);
    if (!event?.tableId) throw new ConvexError({ code: "not_found" });
    const table = await ctx.db.get(event.tableId);
    if (!table) throw new ConvexError({ code: "not_found" });
    const host = await getTableParticipation(ctx, table, actor);
    if (!host.isHost) throw new ConvexError({ code: "forbidden" });
    if (!eventHasStarted(event, Date.now()))
      throw new ConvexError({
        code: "not_started",
        reason: "You can mark who came once the date starts.",
      });
    const participant = await getTableParticipation(ctx, table, args.userId);
    if (!participant.isMember && !participant.isHost)
      throw new ConvexError({ code: "not_a_member" });
    const existing = await ctx.db
      .query("tableAttendance")
      .withIndex("by_eventId_userId", (q) =>
        q.eq("eventId", args.eventId).eq("userId", args.userId),
      )
      .unique();
    const data = {
      status: args.status,
      recordedByUserId: actor,
      recordedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, data);
    else
      await ctx.db.insert("tableAttendance", {
        ...data,
        eventId: args.eventId,
        tableId: table._id,
        userId: args.userId,
      });
    return { ok: true };
  },
});

export const getHostRoster = query({
  args: { tableId: v.id("gardenTables") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, table, userId);
    if (!viewer.isHost) throw new ConvexError({ code: "forbidden" });
    const memberships = await ctx.db
      .query("tableMemberships")
      .withIndex("by_tableId", (q) => q.eq("tableId", args.tableId))
      .collect();
    return await Promise.all(
      memberships.map(async (m) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", m.userId))
          .unique();
        return {
          userId: m.userId,
          name: profile?.name ?? "Participant",
          status: m.status ?? "active",
          role: m.role ?? "participant",
          paymentStatus: m.paymentStatus ?? "not_required",
        };
      }),
    );
  },
});

export const getAttendance = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const event = await ctx.db.get(args.eventId);
    if (!event?.tableId) throw new ConvexError({ code: "not_found" });
    const table = await ctx.db.get(event.tableId);
    if (!table) throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, table, userId);
    if (!viewer.isHost) throw new ConvexError({ code: "forbidden" });
    return await ctx.db
      .query("tableAttendance")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

export const getTableForOffering = query({
  args: { offeringId: v.id("offerings") },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("gardenTables")
      .withIndex("by_sourceOfferingId", (q) =>
        q.eq("sourceOfferingId", args.offeringId),
      )
      .unique();
    const userId = await getAuthUserId(ctx);
    return table && (await canViewTable(ctx, table, userId))
      ? { slug: table.slug }
      : null;
  },
});

/** More than one date is a series, and a series takes paid or covered
 * membership in the Table's own community — the rule createTable applies
 * (hasTableCommunityMembership). Null when this person may add dates. */
async function addDatesDenial(
  ctx: QueryCtx,
  userId: Id<"users">,
  hostOrgId: Id<"hostOrgs"> | undefined,
): Promise<{ code: string; reason: string } | null> {
  if (await hasTableCommunityMembership(ctx, userId, hostOrgId)) return null;
  const org = hostOrgId ? await ctx.db.get(hostOrgId) : null;
  if (
    !org ||
    org.kind !== COMMUNITY_KIND ||
    (org.status && org.status !== "active")
  )
    return {
      code: "community_required",
      reason:
        "Adding more dates takes community membership, and this Table isn't in a community.",
    };
  return {
    code: "hosting_membership_required",
    reason: `Adding more dates takes ${membershipName(org.name)} membership.`,
  };
}

/** A community's name as it reads before "membership": "The Garden" →
 * "Garden membership", not "The Garden membership". */
export function membershipName(name: string): string {
  return name.trim().replace(/^the\s+/i, "") || name.trim();
}

/** A host adds a date. A one-time Table becomes a series; everyone already
 * at the Table stays in. The people at the Table and guests who asked are
 * emailed (garden/tableNotify.ts). */
export const addTableEvent = mutation({
  args: { tableId: v.id("gardenTables"), event: occurrenceValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, table, userId);
    if (!viewer.isHost) throw new ConvexError({ code: "forbidden" });
    if (table.status !== "active" || table.pausedAt)
      throw new ConvexError({
        code: "unavailable",
        reason: "This Table isn't open right now, so it can't get new dates.",
      });
    const denial = await addDatesDenial(ctx, userId, table.hostOrgId);
    if (denial) throw new ConvexError(denial);
    const events = await ctx.db
      .query("events")
      .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
      .collect();
    if (events.length >= 24)
      throw new ConvexError({
        code: "schedule_limit",
        reason: "A Table can have up to 24 dates.",
      });
    validateTableOccurrence(args.event);
    const eventId = await insertTableOccurrence(
      ctx,
      table,
      args.event,
      userId,
    );
    if (table.scheduleType !== "series")
      await ctx.db.patch(table._id, {
        scheduleType: "series",
        updatedAt: Date.now(),
      });
    const notified = await notifyNewDate(ctx, table, eventId, userId);
    return { eventId, scheduleType: "series" as const, notified };
  },
});

/** "Run it again": a new Table with this one's title, description, photo,
 * community, access, guest setting, capacity and price, and the first date
 * the host picks. The same creation rules as createTable apply (a paid
 * Table still takes membership). The old Table's people are invited by
 * email (tableNotify.ts runAgainInvitees) — never enrolled. */
export const runTableAgain = mutation({
  args: { tableId: v.id("gardenTables"), event: occurrenceValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const old = await ctx.db.get(args.tableId);
    if (!old) throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, old, userId);
    if (!viewer.isHost) throw new ConvexError({ code: "forbidden" });
    if (old.status !== "active" || old.pausedAt)
      throw new ConvexError({
        code: "unavailable",
        reason: "This Table isn't open right now, so it can't run again.",
      });
    const policy = normalizeTable(old);
    // An invitation-only Table is unlisted and can't be joined from a link,
    // so an emailed invite would lead nowhere.
    if (policy.access === "invite")
      throw new ConvexError({
        code: "invite_only",
        reason: "Run it again works for open Tables and Tables you approve.",
      });
    const created = await createTableFor(
      ctx,
      userId,
      {
        name: old.name,
        hostOrgId: old.hostOrgId,
        format: old.format,
        description: old.description || old.blurb || old.name,
        scheduleType: "one_time",
        membershipRequired: policy.membershipRequired,
        access: policy.access,
        allowsExternalGuests: policy.allowsExternalGuests,
        pricingType: policy.pricingType,
        priceCents: policy.pricingType === "fixed" ? policy.priceCents : 0,
        capacity: policy.capacity,
        hostRoleLabel: old.hostRoleLabel,
        photoUrl: old.photoUrl,
        photoStorageId: old.photoStorageId,
        events: [args.event],
      },
      { previousTableId: old._id },
    );
    const table = await ctx.db.get(created.tableId);
    if (!table) throw new Error("Table was not saved.");
    const invited = await inviteToRunAgain(
      ctx,
      old,
      table,
      created.eventIds[0],
      userId,
    );
    return { ...created, invited };
  },
});

/** Guests (no account) who RSVP'd to this Table's dates, with the contact
 * details they gave. Hosts and co-hosts only; never part of getTable or any
 * roster. */
export const getTableGuests = query({
  args: { tableId: v.id("gardenTables") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError({ code: "unauthenticated" });
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new ConvexError({ code: "not_found" });
    const viewer = await getTableParticipation(ctx, table, userId);
    if (!viewer.isHost) throw new ConvexError({ code: "forbidden" });
    const events = (
      await ctx.db
        .query("events")
        .withIndex("by_tableId", (q) => q.eq("tableId", table._id))
        .collect()
    ).sort((a, b) => a.datetime - b.datetime);
    const guests = [];
    for (const event of events) {
      const rows = await ctx.db
        .query("eventRsvps")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .collect();
      for (const row of rows) {
        if (row.userId) continue;
        guests.push({
          rsvpId: row._id,
          eventId: event._id,
          eventTitle: event.title,
          datetime: event.datetime,
          name: row.name,
          email: row.email,
          phone: row.phone,
          wantsNewDates: row.notifyNewDates === true && !row.notifyStoppedAt,
        });
      }
    }
    return guests;
  },
});
