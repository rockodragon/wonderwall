import { v } from "convex/values";
import { escapeHtml } from "./email/template";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { scheduleNotificationEmail } from "./emailHelpers";
import { assertCommunityMember } from "./garden/communities";
import { formatFollowedEventDate, notifyFollowers } from "./follows";
import { canonicalMediaUrl, schedulePreviewFetch } from "./linkPreview";
import { mergeGuests, summarizeGuests, type GuestInput } from "./eventGuests";
import { getUserEmail } from "./emailHelpers";
import { isEventHost, planAddCoHost, planRemoveCoHost, planDisplayHosts } from "./eventHosts";
import { canSeeEvent, eventVisibilityChecker, isFreeEvent } from "./garden/eventVisibility";
import { hostUserIdsForOrg, primaryOrgByUserId } from "./organizations";

// ——— Pure validation helpers (unit-tested in events.test.ts) ———

/** Optional end time must land strictly after the start. Returns null when
 * valid, otherwise the user-facing error message. */
export function validateEndTime(
  datetime: number,
  endTime: number | undefined,
): string | null {
  if (endTime === undefined) return null;
  if (endTime <= datetime) return "End time must be after the start time";
  return null;
}

export interface TicketTierInput {
  name: string;
  priceCents: number;
  description?: string;
  quantity?: number;
}

export const MAX_TICKET_TIERS = 10;

/** Validates + normalizes a ticket tier list (trims strings, drops empty
 * descriptions). Returns { tiers } on success or { error } with a
 * user-facing message. An empty array normalizes to undefined — an event
 * with no tiers stores no field at all. */
export function normalizeTicketTiers(
  tiers: TicketTierInput[] | undefined,
): { tiers?: TicketTierInput[]; error?: string } {
  if (!tiers || tiers.length === 0) return { tiers: undefined };
  if (tiers.length > MAX_TICKET_TIERS) {
    return { error: `At most ${MAX_TICKET_TIERS} ticket tiers are allowed` };
  }

  const normalized: TicketTierInput[] = [];
  const seenNames = new Set<string>();
  for (const tier of tiers) {
    const name = tier.name.trim();
    if (!name) return { error: "Every ticket tier needs a name" };
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      return { error: `Duplicate ticket tier name "${name}"` };
    }
    seenNames.add(nameKey);

    // Stripe's minimum charge is $0.50 — enforce it here so checkout can't
    // fail later on a tier that was always unchargeable.
    if (!Number.isInteger(tier.priceCents) || tier.priceCents < 50) {
      return {
        error: `Ticket tier "${name}" needs a price of at least $0.50`,
      };
    }
    if (
      tier.quantity !== undefined &&
      (!Number.isInteger(tier.quantity) || tier.quantity < 1)
    ) {
      return {
        error: `Ticket tier "${name}" has an invalid quantity cap`,
      };
    }

    const description = tier.description?.trim();
    normalized.push({
      name,
      priceCents: tier.priceCents,
      description: description || undefined,
      quantity: tier.quantity,
    });
  }
  return { tiers: normalized };
}

const ticketTiersValidator = v.optional(
  v.array(
    v.object({
      name: v.string(),
      priceCents: v.number(),
      description: v.optional(v.string()),
      quantity: v.optional(v.number()),
    }),
  ),
);

// ——— External ticketing (schema.ts's events.externalTicketUrl comment) ———

const STRIPE_PAYMENT_LINK_HOST = "buy.stripe.com";

export interface ExternalTicketInput {
  url?: string;
  priceCents?: number;
}

export interface ExternalTicketResult {
  externalTicketUrl?: string;
  externalTicketPriceCents?: number;
  error?: string;
}

/** Validates + normalizes the external-ticket fields together, since a
 * price with no link is meaningless: an empty/absent url clears BOTH
 * fields, regardless of what priceCents was. The url must be a Stripe
 * Payment Link — nothing else, because AP's webhook (garden/apGifts.ts)
 * is the only thing watching for a purchase to come back, and it only
 * knows how to read a checkout.session event off that one Stripe account. */
export function normalizeExternalTicket(
  input: ExternalTicketInput,
): ExternalTicketResult {
  const trimmed = input.url?.trim();
  if (!trimmed) return {};

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "Use a Stripe Payment Link (buy.stripe.com/…)." };
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== STRIPE_PAYMENT_LINK_HOST) {
    return { error: "Use a Stripe Payment Link (buy.stripe.com/…)." };
  }

  if (
    input.priceCents !== undefined &&
    (!Number.isInteger(input.priceCents) || input.priceCents <= 0)
  ) {
    return { error: "Ticket price must be a whole number of cents greater than zero" };
  }

  return { externalTicketUrl: trimmed, externalTicketPriceCents: input.priceCents };
}

// Ticket-gated visibility (isFreeEvent / eventVisibilityChecker) lives in
// garden/eventVisibility.ts — re-exported here so existing/expected imports
// from "./events" keep working, and so events.test.ts can test the pure
// part alongside this file's other pure helpers.
export { isFreeEvent, eventVisibilityChecker } from "./garden/eventVisibility";

// Batches hostOrgs lookups for a set of events into a single Map keyed by
// hostOrgId string — never one ctx.db.get per event (several events can
// share a community). Used by both `list` and `get`.
async function resolveCommunities(
  ctx: { db: { get: (id: Id<"hostOrgs">) => Promise<{ name: string; slug: string } | null> } },
  hostOrgIds: (Id<"hostOrgs"> | undefined)[],
): Promise<Map<string, { name: string; slug: string }>> {
  const distinct = [...new Set(hostOrgIds.filter((id): id is Id<"hostOrgs"> => !!id))];
  const orgs = await Promise.all(distinct.map((id) => ctx.db.get(id)));
  const out = new Map<string, { name: string; slug: string }>();
  distinct.forEach((id, i) => {
    const org = orgs[i];
    if (org) out.set(String(id), { name: org.name, slug: org.slug });
  });
  return out;
}

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

async function loadGoingCount(ctx: QueryCtx, eventId: Id<"events">): Promise<number> {
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

type HostOrg = { orgName?: string; orgUrl?: string; orgSlug?: string };

/** The organization a host's name shows with: their primary organization
 * (docs/features/organizations.md), else the old free-text field from
 * before the backfill — which has no page, so no slug. */
async function hostOrg(ctx: QueryCtx, profile: Doc<"profiles"> | null): Promise<HostOrg> {
  if (!profile) return {};
  const org = await primaryOrgByUserId(ctx, profile.userId);
  if (org) return { orgName: org.name, orgUrl: org.websiteUrl, orgSlug: org.slug };
  return { orgName: profile.orgName?.trim() || undefined, orgUrl: profile.orgUrl || undefined };
}

type LoadedHost = { name: string; profileId?: Id<"profiles">; exact?: boolean } & HostOrg;

/** The hosts the host chose to show, in their order. An org that was
 * deleted or a user without a profile is skipped. */
async function loadDisplayHosts(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<(LoadedHost & { kind: "user" | "org"; refId: string; imageUrl: string | null })[] | null> {
  if (!event.displayHosts || event.displayHosts.length === 0) return null;
  const out: (LoadedHost & { kind: "user" | "org"; refId: string; imageUrl: string | null })[] = [];
  for (const d of event.displayHosts) {
    if (d.kind === "org") {
      const o = await ctx.db.get(d.organizationId);
      if (!o) continue;
      const logo = o.logoStorageId ? await ctx.storage.getUrl(o.logoStorageId) : null;
      out.push({
        kind: "org",
        refId: String(o._id),
        name: "",
        orgName: o.name,
        orgUrl: o.websiteUrl ?? undefined,
        orgSlug: o.slug,
        imageUrl: logo,
        exact: true,
      });
    } else {
      const p = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", d.userId))
        .first();
      if (!p) continue;
      const img = p.imageStorageId ? await ctx.storage.getUrl(p.imageStorageId) : p.imageUrl || null;
      out.push({ kind: "user", refId: String(d.userId), name: p.name, profileId: p._id, imageUrl: img, exact: true });
    }
  }
  return out;
}

/** What "Hosted by" shows: the host's own list when they set one, else the
 * organizer then co-hosts, each with their organization. */
async function loadHosts(ctx: QueryCtx, event: Doc<"events">): Promise<LoadedHost[]> {
  const chosen = await loadDisplayHosts(ctx, event);
  if (chosen) return chosen.map(({ kind: _k, refId: _r, imageUrl: _i, ...h }) => h);
  const ids = [event.organizerId, ...(event.coHostIds ?? [])];
  const out: LoadedHost[] = [];
  for (const id of ids) {
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", id))
      .first();
    if (!p) continue;
    out.push({ name: p.name, profileId: p._id, ...(await hostOrg(ctx, p)) });
  }
  return out;
}

export const list = query({
  args: {
    status: v.optional(v.string()),
    upcoming: v.optional(v.boolean()),
    // The archive: events whose start time has passed, newest first. Off by
    // default, so every existing caller keeps the chronological upcoming
    // list it already gets. Still a public browse surface spreading the
    // event doc — which stays safe because the join and recording URLs were
    // never on that document (docs/gated-event-video-prd.md, Criticism #1).
    // The only video fact here is events.hasVideo, a public boolean.
    past: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db.query("events").collect();

    // Filter by status
    if (args.status) {
      events = events.filter((e) => e.status === args.status);
    } else {
      // Default: show published events
      events = events.filter((e) => e.status === "published");
    }

    // Filter to upcoming only
    if (args.upcoming) {
      const now = Date.now();
      events = events.filter((e) => e.datetime > now);
    }

    if (args.past) {
      const now = Date.now();
      events = events.filter((e) => e.datetime <= now);
    }

    // A ticketed event stays off every public browse surface until its
    // organizer can sell tickets (see eventVisibilityChecker above).
    const isPublic = eventVisibilityChecker(ctx);
    const visibility = await Promise.all(events.map((e) => isPublic(e)));
    events = events.filter((_, i) => visibility[i]);

    // Sort by date — the archive reads newest-first, everything else reads
    // next-up-first.
    events.sort((a, b) => (args.past ? b.datetime - a.datetime : a.datetime - b.datetime));

    return await toCardEvents(ctx, events);
  },
});

/** What EventCard draws for each event: cover, going count, hosts, community. */
async function toCardEvents(ctx: QueryCtx, events: Doc<"events">[]) {
  const communityById = await resolveCommunities(ctx, events.map((e) => e.hostOrgId));

  return await Promise.all(
    events.map(async (event) => {
      let coverImageUrl: string | null = null;

      // Try cover image first
      if (event.coverImageStorageId) {
        coverImageUrl = await ctx.storage.getUrl(event.coverImageStorageId);
      }
      // Fall back to first gallery image
      else if (event.imageStorageIds && event.imageStorageIds.length > 0) {
        coverImageUrl = await ctx.storage.getUrl(event.imageStorageIds[0]);
      }

      const [attendeeCount, hosts] = await Promise.all([
        loadGoingCount(ctx, event._id),
        loadHosts(ctx, event),
      ]);

      return {
        ...event,
        coverImageUrl,
        attendeeCount,
        hosts,
        community: event.hostOrgId ? (communityById.get(String(event.hostOrgId)) ?? null) : null,
      };
    }),
  );
}

/**
 * An organization's events (/orgs/:slug): published events whose organizer
 * or a co-host has this organization first — the same rule that puts its
 * name in "Hosted by". Upcoming soonest first; past newest first, a few.
 */
export const listForOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const hostIds = await hostUserIdsForOrg(ctx, organizationId);
    if (hostIds.size === 0) return { upcoming: [], past: [] };
    const isPublic = eventVisibilityChecker(ctx);
    const now = Date.now();
    const mine: Doc<"events">[] = [];
    for (const e of await ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", "published")).collect()) {
      const hosted = hostIds.has(String(e.organizerId)) || (e.coHostIds ?? []).some((id) => hostIds.has(String(id)));
      if (hosted && (await isPublic(e))) mine.push(e);
    }
    const upcoming = mine.filter((e) => e.datetime > now).sort((a, b) => a.datetime - b.datetime);
    const past = mine
      .filter((e) => e.datetime <= now)
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 6);
    return { upcoming: await toCardEvents(ctx, upcoming), past: await toCardEvents(ctx, past) };
  },
});

export const getMyEvents = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("events")
      .withIndex("by_organizerId", (q) => q.eq("organizerId", userId))
      .collect();
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const userId = await auth.getUserId(ctx);
    const isOrganizer = userId === event.organizerId;
    const isHost = isEventHost(event, userId);
    const isPublic = await eventVisibilityChecker(ctx)(event);
    // A ticketed event whose organizer can't sell tickets is not-found to
    // everyone except the organizer (same anatomy as a missing event, so a
    // hidden event can't be distinguished from one that never existed).
    if (!isPublic && !isHost) return null;

    // Get organizer profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", event.organizerId))
      .first();

    // Resolve organizer image URL
    let organizerImageUrl = profile?.imageUrl || null;
    if (profile?.imageStorageId) {
      organizerImageUrl = await ctx.storage.getUrl(profile.imageStorageId);
    }

    // Resolve cover image URL
    const coverImageUrl = event.coverImageStorageId
      ? await ctx.storage.getUrl(event.coverImageStorageId)
      : null;

    // Resolve gallery image URLs
    const galleryImageUrls = event.imageStorageIds
      ? await Promise.all(
          event.imageStorageIds.map((id) => ctx.storage.getUrl(id)),
        )
      : [];

    // Get application count
    const applications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Check if current user has applied
    const userApplication = userId
      ? applications.find((a) => a.applicantId === userId)
      : null;

    // Paid tickets sold per tier (only fetched when the event has tiers) —
    // lets the client disable a capped tier's buy button when sold out.
    const ticketsSoldByTier: Record<string, number> = {};
    if (event.ticketTiers && event.ticketTiers.length > 0) {
      const purchases = await ctx.db
        .query("ticketPurchases")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect();
      for (const purchase of purchases) {
        if (purchase.status !== "paid") continue;
        ticketsSoldByTier[purchase.tierName] =
          (ticketsSoldByTier[purchase.tierName] ?? 0) + 1;
      }
    }

    const community = event.hostOrgId
      ? (await resolveCommunities(ctx, [event.hostOrgId])).get(String(event.hostOrgId)) ?? null
      : null;

    const goingCount = await loadGoingCount(ctx, args.eventId);

    const coHosts: ({
      userId: Id<"users">;
      name: string;
      imageUrl: string | null;
      profileId: Id<"profiles"> | null;
    } & HostOrg)[] = [];
    for (const coId of event.coHostIds ?? []) {
      const p = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", coId))
        .first();
      let img = p?.imageUrl || null;
      if (p?.imageStorageId) img = await ctx.storage.getUrl(p.imageStorageId);
      coHosts.push({
        userId: coId,
        name: p?.name ?? "Someone",
        ...(await hostOrg(ctx, p ?? null)),
        imageUrl: img,
        profileId: p?._id ?? null,
      });
    }

    const chosenHosts = await loadDisplayHosts(ctx, event);

    return {
      ...event,
      coHosts,
      // Who "Hosted by" shows when the host set the list; null = default.
      shownHosts: chosenHosts
        ? chosenHosts.map(({ kind: _k, refId: _r, imageUrl: _i, ...h }) => h)
        : null,
      // The editor's rows (host view only).
      displayHostRows: isHost && chosenHosts ? chosenHosts.map((h) => ({ kind: h.kind, refId: h.refId, name: h.orgName ?? h.name, imageUrl: h.imageUrl })) : [],
      isHost,
      ticketsSoldByTier,
      coverImageUrl,
      galleryImageUrls: galleryImageUrls.filter(Boolean) as string[],
      organizer: profile
        ? {
            name: profile.name,
            ...(await hostOrg(ctx, profile)),
            imageUrl: organizerImageUrl,
            profileId: profile._id,
          }
        : null,
      applicationCount: applications.length,
      goingCount,
      userApplication,
      isOrganizer,
      // Lets the organizer's own view show the "only you can see this"
      // notice; never true for anyone else, since a non-public event
      // already returned null above.
      hiddenUntilMembership: isOrganizer && !isPublic,
      community,
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    datetime: v.number(),
    endTime: v.optional(v.number()),
    ticketTiers: ticketTiersValidator,
    externalTicketUrl: v.optional(v.string()),
    externalTicketPriceCents: v.optional(v.number()),
    location: v.optional(v.string()),
    locationType: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()),
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
    // The community this event is posted INTO (optional — content stays
    // owned by the organizer, this only tags it; community-groups.md §0).
    hostOrgId: v.optional(v.id("hostOrgs")),
    // A pasted Instagram, TikTok, YouTube or Vimeo link in place of a cover
    // image (docs/features/creator-media-cross-post.md). Stored the way every
    // table stores one — see canonicalMediaUrl in convex/linkPreview.ts.
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const endTimeError = validateEndTime(args.datetime, args.endTime);
    if (endTimeError) throw new Error(endTimeError);

    const { tiers, error: tiersError } = normalizeTicketTiers(args.ticketTiers);
    if (tiersError) throw new Error(tiersError);

    const {
      externalTicketUrl,
      externalTicketPriceCents,
      error: ticketLinkError,
    } = normalizeExternalTicket({
      url: args.externalTicketUrl,
      priceCents: args.externalTicketPriceCents,
    });
    if (ticketLinkError) throw new Error(ticketLinkError);

    const mediaUrl = canonicalMediaUrl(args.mediaUrl);

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    const now = Date.now();
    const title = args.title.trim();

    const eventId = await ctx.db.insert("events", {
      organizerId: userId,
      title,
      description: args.description.trim(),
      datetime: args.datetime,
      endTime: args.endTime,
      ticketTiers: tiers,
      externalTicketUrl,
      externalTicketPriceCents,
      location: args.location?.trim(),
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      tags: args.tags,
      requiresApproval: args.requiresApproval,
      hostOrgId: args.hostOrgId,
      mediaUrl,
      status: "published",
      createdAt: now,
      updatedAt: now,
    });

    // The still cards show for the link. Only Instagram and TikTok need a
    // fetch (a no-op for the rest), and it runs off the request so create
    // returns at once; convex/linkPreview.ts patches the row when it lands.
    await schedulePreviewFetch(ctx, "event", eventId, mediaUrl);

    // Following fan-out (docs/features/following.md §1 #6): events are born
    // `published`, so create is the moment. Same linkUrl convention as the
    // event_application notification in `apply` below. `userId` is the
    // organizer's users id — notifyFollowers hops to the profile id that
    // follows are actually keyed on, and returns 0 (never throws) when the
    // organizer has no profile.
    const organizerProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const organizerName = organizerProfile?.name || "Someone";
    // Skip the fan-out when the new event is ticketed and not public yet —
    // followers would get a link to a page that 404s for them until the
    // organizer becomes a member (product rule, 2026-09-27).
    const isPublic = await eventVisibilityChecker(ctx)({
      ticketTiers: tiers,
      organizerId: userId,
    });
    if (isPublic) {
      await notifyFollowers(ctx, userId, {
        type: "followed_created_event",
        title: `${organizerName} is hosting ${title}`,
        message: formatFollowedEventDate(args.datetime),
        linkUrl: `/events/${eventId}`,
      });
    }

    return eventId;
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.string(),
    description: v.string(),
    datetime: v.number(),
    endTime: v.optional(v.number()),
    ticketTiers: ticketTiersValidator,
    externalTicketUrl: v.optional(v.string()),
    externalTicketPriceCents: v.optional(v.number()),
    location: v.optional(v.string()),
    locationType: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        stateCode: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
      }),
    ),
    coordinates: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      }),
    ),
    placeId: v.optional(v.string()),
    tags: v.array(v.string()),
    requiresApproval: v.boolean(),
    hostOrgId: v.optional(v.id("hostOrgs")),
    // Convex validators don't accept `null` through v.optional — pass this
    // instead to remove an already-set hostOrgId. See createPassionProject's
    // hostOrgId comment for what this field means.
    clearCommunity: v.optional(v.boolean()),
    // The pasted media link (see create). Left out = untouched, so a caller
    // that doesn't know the field can't wipe it; an empty string clears it —
    // the same v.optional-takes-no-null reason clearCommunity exists.
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (!isEventHost(event, userId)) throw new Error("Not authorized");

    const endTimeError = validateEndTime(args.datetime, args.endTime);
    if (endTimeError) throw new Error(endTimeError);

    const { tiers, error: tiersError } = normalizeTicketTiers(args.ticketTiers);
    if (tiersError) throw new Error(tiersError);

    const {
      externalTicketUrl,
      externalTicketPriceCents,
      error: ticketLinkError,
    } = normalizeExternalTicket({
      url: args.externalTicketUrl,
      priceCents: args.externalTicketPriceCents,
    });
    if (ticketLinkError) throw new Error(ticketLinkError);

    if (args.hostOrgId) {
      await assertCommunityMember(ctx, args.hostOrgId, userId);
    }

    // A changed or cleared link takes its still with it: the file is deleted
    // rather than left orphaned in storage, and both preview columns are
    // cleared in the same patch so a card never shows the old reel's picture
    // over the new link while the new fetch (Instagram/TikTok) is in flight.
    let mediaPatch: Pick<
      Doc<"events">,
      "mediaUrl" | "mediaPreviewUrl" | "mediaPreviewStorageId"
    > = {};
    let fetchMediaUrl: string | undefined;
    if (args.mediaUrl !== undefined) {
      const mediaUrl = canonicalMediaUrl(args.mediaUrl);
      if (mediaUrl !== event.mediaUrl) {
        if (event.mediaPreviewStorageId) {
          // Best-effort, as garden/projects.ts's updateProject treats the same
          // delete: a file already gone must not fail the whole edit.
          try {
            await ctx.storage.delete(event.mediaPreviewStorageId);
          } catch {
            // already gone
          }
        }
        mediaPatch = { mediaUrl, mediaPreviewUrl: undefined, mediaPreviewStorageId: undefined };
        fetchMediaUrl = mediaUrl;
      }
    }

    // venueAddress (deprecated, schema.ts) is deliberately left out of this
    // patch — not read from args, not written as undefined — so an old
    // event that still has one keeps it untouched across edits instead of
    // having it silently cleared.
    await ctx.db.patch(args.eventId, {
      title: args.title.trim(),
      description: args.description.trim(),
      datetime: args.datetime,
      endTime: args.endTime,
      // Tickets are the organizer's: a co-host's save keeps them as they
      // were, so a co-host can't point the ticket link at their own Stripe.
      ...(event.organizerId === userId
        ? { ticketTiers: tiers, externalTicketUrl, externalTicketPriceCents }
        : {}),
      location: args.location?.trim(),
      locationType: args.locationType,
      address: args.address,
      coordinates: args.coordinates,
      placeId: args.placeId,
      tags: args.tags,
      requiresApproval: args.requiresApproval,
      hostOrgId: args.clearCommunity ? undefined : (args.hostOrgId ?? event.hostOrgId),
      ...mediaPatch,
      updatedAt: Date.now(),
    });

    await schedulePreviewFetch(ctx, "event", args.eventId, fetchMediaUrl);
  },
});

export const cancel = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (event.organizerId !== userId) throw new Error("Not authorized");

    await ctx.db.patch(args.eventId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
  },
});

async function requireOrganizerOf(ctx: MutationCtx, eventId: Id<"events">) {
  const userId = await auth.getUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");
  if (event.organizerId !== userId) throw new Error("Only the organizer can change co-hosts");
  return event;
}

export const addCoHost = mutation({
  args: { eventId: v.id("events"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const event = await requireOrganizerOf(ctx, args.eventId);
    const plan = planAddCoHost(event, String(args.userId));
    if (!plan.ok) {
      throw new Error(
        plan.reason === "is_organizer"
          ? "The organizer is already a host"
          : plan.reason === "duplicate"
            ? "Already a co-host"
            : "An event can have at most 10 co-hosts",
      );
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    await ctx.db.patch(args.eventId, {
      coHostIds: plan.coHostIds as Id<"users">[],
      updatedAt: Date.now(),
    });
  },
});

export const removeCoHost = mutation({
  args: { eventId: v.id("events"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const event = await requireOrganizerOf(ctx, args.eventId);
    const plan = planRemoveCoHost(event, String(args.userId));
    if (!plan.ok) throw new Error("Not a co-host");
    await ctx.db.patch(args.eventId, {
      coHostIds: plan.coHostIds as Id<"users">[],
      updatedAt: Date.now(),
    });
  },
});

export const apply = mutation({
  args: {
    eventId: v.id("events"),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const event = await ctx.db.get(args.eventId);
    // A hidden ticketed event reads as missing, same as its page does.
    if (!event || !(await canSeeEvent(ctx, event, userId))) throw new Error("Event not found");
    if (event.status !== "published")
      throw new Error("Event is not accepting applications");

    // Check if already applied
    const existing = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("applicantId"), userId))
      .first();

    if (existing) throw new Error("Already applied");

    const now = Date.now();

    const applicationId = await ctx.db.insert("eventApplications", {
      eventId: args.eventId,
      applicantId: userId,
      message: args.message?.trim(),
      status: event.requiresApproval ? "pending" : "accepted",
      createdAt: now,
      updatedAt: now,
    });

    // Notify the event organizer
    if (event.organizerId !== userId) {
      const applicantProfile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      const applicantName = applicantProfile?.name || "Someone";
      await ctx.db.insert("notifications", {
        userId: event.organizerId,
        type: "event_application",
        title: `${applicantName} applied to your event`,
        message: event.title,
        linkUrl: `/events/${args.eventId}`,
        relatedUserId: userId,
        createdAt: now,
      });

      await scheduleNotificationEmail(ctx, {
        userId: event.organizerId,
        subject: `${applicantName} applied to "${event.title}"`,
        previewText: `Someone applied to your event`,
        heading: "New event application",
        body: `<strong>${escapeHtml(applicantName)}</strong> applied to your event "<strong>${escapeHtml(event.title)}</strong>".`,
        ctaText: "View Application",
        ctaUrl: `/events/${args.eventId}`,
        category: "activity",
      });
    }

    return applicationId;
  },
});

export const getApplications = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const event = await ctx.db.get(args.eventId);
    if (!event || !isEventHost(event, userId)) return [];

    const applications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();

    // Get applicant profiles
    const withProfiles = await Promise.all(
      applications.map(async (app) => {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", app.applicantId))
          .first();
        return {
          ...app,
          applicant: profile
            ? {
                name: profile.name,
                imageUrl: profile.imageUrl,
                bio: profile.bio,
              }
            : null,
        };
      }),
    );

    return withProfiles;
  },
});

// Host-only guest list: applications, RSVPs and paid tickets, one row per
// person. Emails are host-visible only (same rule as getEventRsvps).
export const getGuestList = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];
    const event = await ctx.db.get(args.eventId);
    if (!event || !isEventHost(event, userId)) return [];

    const inputs: GuestInput[] = [];

    const applications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const app of applications) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", app.applicantId))
        .first();
      inputs.push({
        userId: String(app.applicantId),
        applicationId: String(app._id),
        name: profile?.name ?? "Anonymous",
        email: await getUserEmail(ctx, app.applicantId),
        status:
          app.status === "accepted" ? "going" : app.status === "declined" ? "declined" : "pending",
        addedAt: app.createdAt,
      });
    }

    const rsvps = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
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
        addedAt: r.createdAt,
      });
    }

    const purchases = await ctx.db
      .query("ticketPurchases")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const p of purchases) {
      if (p.status !== "paid") continue;
      let name = p.buyerEmail ?? "Ticket buyer";
      let email = p.buyerEmail ?? null;
      if (p.userId) {
        const profile = await ctx.db
          .query("profiles")
          .withIndex("by_userId", (q) => q.eq("userId", p.userId!))
          .first();
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
  },
});

export const updateApplicationStatus = mutation({
  args: {
    applicationId: v.id("eventApplications"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const application = await ctx.db.get(args.applicationId);
    if (!application) throw new Error("Application not found");

    const event = await ctx.db.get(application.eventId);
    if (!event || !isEventHost(event, userId)) {
      throw new Error("Not authorized");
    }

    if (!["pending", "accepted", "declined"].includes(args.status)) {
      throw new Error("Invalid status");
    }

    await ctx.db.patch(args.applicationId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** "Jordan Baptiste Vega" → "Jordan V." — a guest with no account, on a
 * public list. */
export function publicGuestName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Guest";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export const getAttendees = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const viewerId = await auth.getUserId(ctx);
    if (!event || !(await canSeeEvent(ctx, event, viewerId))) return [];
    const acceptedApplications = await ctx.db
      .query("eventApplications")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .filter((q) => q.eq(q.field("status"), "accepted"))
      .collect();

    async function member(userId: Id<"users">) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      let imageUrl = profile?.imageUrl || null;
      if (profile?.imageStorageId) {
        imageUrl = await ctx.storage.getUrl(profile.imageStorageId);
      }
      return { profileId: profile?._id || null, name: profile?.name || "Anonymous", imageUrl };
    }

    const attendees = await Promise.all(
      acceptedApplications.map(async (app) => ({
        key: String(app._id),
        userId: app.applicantId as Id<"users"> | null,
        ...(await member(app.applicantId)),
        message: app.message || null,
        joinedAt: app.createdAt,
        // Tickets beyond their own — shown as "+2", never the names.
        extraTickets: 0,
      })),
    );

    // Ticket buyers and RSVPs are going too (the host's Guests tab already
    // lists them). Public, so name and photo only — never an email; a guest
    // with no account shows as "First L.".
    const seen = new Set(attendees.map((a) => String(a.userId)));
    const rsvps = await ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .collect();
    const purchases = (
      await ctx.db
        .query("ticketPurchases")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect()
    ).filter((p) => p.status === "paid");
    const extra = [
      ...rsvps.map((r) => ({
        key: String(r._id),
        userId: r.userId ?? null,
        name: r.name,
        at: r.createdAt,
        extra: Math.max(0, (r.ticketCount ?? 1) - 1),
      })),
      ...purchases
        .filter((p) => p.userId)
        .map((p) => ({ key: String(p._id), userId: p.userId ?? null, name: "", at: p._creationTime, extra: 0 })),
    ];
    for (const row of extra) {
      if (row.userId) {
        if (seen.has(String(row.userId))) {
          const already = attendees.find((a) => String(a.userId) === String(row.userId));
          if (already) already.extraTickets = Math.max(already.extraTickets, row.extra);
          continue;
        }
        seen.add(String(row.userId));
        attendees.push({
          key: row.key,
          userId: row.userId,
          ...(await member(row.userId)),
          message: null,
          joinedAt: row.at,
          extraTickets: row.extra,
        });
      } else {
        attendees.push({
          key: row.key,
          userId: null,
          profileId: null,
          name: publicGuestName(row.name),
          imageUrl: null,
          message: null,
          joinedAt: row.at,
          extraTickets: row.extra,
        });
      }
    }

    // Signed out: the count only. Same rows, so the page can say "N going",
    // but no names, photos or profile links.
    if (!viewerId) {
      return attendees.map((a) => ({
        key: a.key,
        userId: null,
        profileId: null,
        name: "",
        imageUrl: null,
        message: null,
        joinedAt: a.joinedAt,
        extraTickets: a.extraTickets, // counts toward "N going"; no names
      }));
    }
    return attendees;
  },
});

// Search events by title, description, location, tags
export const search = query({
  args: {
    query: v.string(),
    // Community context (docs/features/community-ux.md §2): only events
    // posted into that community. Unknown slug → nothing (fail closed).
    communitySlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const q = args.query.toLowerCase();

    // Get published, upcoming events
    const now = Date.now();
    let events = await ctx.db.query("events").collect();
    events = events.filter((e) => e.status === "published" && e.datetime > now);

    if (args.communitySlug) {
      const org = await ctx.db
        .query("hostOrgs")
        .withIndex("by_slug", (q) => q.eq("slug", args.communitySlug!))
        .unique();
      if (!org) return [];
      events = events.filter((e) => e.hostOrgId && String(e.hostOrgId) === String(org._id));
    }

    // Filter by search query
    const filtered = events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );

    // Sort by date
    filtered.sort((a, b) => a.datetime - b.datetime);

    // A ticketed event stays off search until its organizer can sell
    // tickets. Checked before the slice so a page of hidden events can't
    // starve out visible results.
    const isPublic = eventVisibilityChecker(ctx);
    const visibility = await Promise.all(filtered.map((e) => isPublic(e)));
    const visible = filtered.filter((_, i) => visibility[i]);

    // Resolve cover images
    const eventsWithImages = await Promise.all(
      visible.slice(0, 20).map(async (event) => {
        let coverImageUrl: string | null = null;

        if (event.coverImageStorageId) {
          coverImageUrl = await ctx.storage.getUrl(event.coverImageStorageId);
        } else if (event.imageStorageIds && event.imageStorageIds.length > 0) {
          coverImageUrl = await ctx.storage.getUrl(event.imageStorageIds[0]);
        }

        return {
          ...event,
          coverImageUrl,
        };
      }),
    );

    return eventsWithImages;
  },
});

// ——— Ticket checkout support ———

// Read by garden/stripe.ts's createTicketCheckout action ("use node" —
// actions have no ctx.db, so they call this via ctx.runQuery). Returns
// everything the action needs to validate + price the Checkout Session.
export const getEventForTicketCheckout = internalQuery({
  args: { eventId: v.id("events"), tierName: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    // A ticketed event whose organizer can't sell tickets refuses checkout
    // the same way a deleted event does ("isn't there anymore" —
    // createTicketCheckout in garden/stripe.ts).
    if (!(await eventVisibilityChecker(ctx)(event))) return null;

    const tier =
      event.ticketTiers?.find((t) => t.name === args.tierName) ?? null;

    // Sold count only matters for capped tiers.
    let sold = 0;
    if (tier?.quantity !== undefined) {
      const purchases = await ctx.db
        .query("ticketPurchases")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect();
      sold = purchases.filter(
        (p) => p.status === "paid" && p.tierName === args.tierName,
      ).length;
    }

    // The beneficiary org, if the event names one — garden/ticketRouting.ts
    // turns this into a Stripe destination (or a refusal).
    const beneficiaryOrg = event.beneficiaryHostOrgId
      ? await ctx.db.get(event.beneficiaryHostOrgId)
      : null;

    return {
      title: event.title,
      status: event.status,
      datetime: event.datetime,
      tier,
      sold,
      beneficiaryHostOrgId: event.beneficiaryHostOrgId ?? null,
      beneficiary: beneficiaryOrg
        ? {
            name: beneficiaryOrg.name,
            stripeConnectAccountId: beneficiaryOrg.stripeConnectAccountId,
            taxStatus: beneficiaryOrg.taxStatus,
          }
        : null,
    };
  },
});


/** Choose who "Hosted by" shows and in what order — people and/or
 * organizations. Any host can set it; an empty list goes back to the default. */
export const setDisplayHosts = mutation({
  args: {
    eventId: v.id("events"),
    hosts: v.array(
      v.union(
        v.object({ kind: v.literal("user"), id: v.id("users") }),
        v.object({ kind: v.literal("org"), id: v.id("organizations") }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new Error("Event not found");
    if (!isEventHost(event, userId)) throw new Error("Only a host can change who is shown as host");
    const plan = planDisplayHosts(args.hosts.map((h) => ({ kind: h.kind, id: String(h.id) })));
    if (!plan.ok) {
      throw new Error(plan.reason === "full" ? "Show at most 10 hosts" : "Each host can be listed once");
    }
    await ctx.db.patch(args.eventId, {
      displayHosts:
        args.hosts.length === 0
          ? undefined
          : args.hosts.map((h) =>
              h.kind === "user"
                ? { kind: "user" as const, userId: h.id as Id<"users"> }
                : { kind: "org" as const, organizationId: h.id as Id<"organizations"> },
            ),
      updatedAt: Date.now(),
    });
  },
});
