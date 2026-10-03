import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireAdminCtx } from "../helpers";
import { syncCoHosts } from "../eventHosts";
import { isPayableClassPayment } from "./payouts";

export type MigrationResult = {
  sourceId: string;
  action: "created" | "exists" | "skipped";
  targetId?: string;
  reason?: string;
};

/** No title matching. The immutable original ID establishes identity. */
export function offeringTableFields(offering: Doc<"offerings">) {
  const paid =
    (offering.priceCents ?? 0) > 0 || !!offering.externalPaymentLinkUrl;
  return {
    name: offering.title,
    slug: `legacy-offering-${offering._id}`,
    hostOrgId: offering.hostOrgId,
    hostUserId: offering.userId,
    mode: "open",
    format: offering.format,
    cadence: offering.cadence,
    blurb: offering.description,
    description: offering.description,
    photoUrl: offering.photoUrl,
    priceCents: offering.priceCents ?? 0,
    pricingType: paid ? ("fixed" as const) : ("free" as const),
    currency: "usd",
    scheduleType:
      (offering.isRecurring ?? !!offering.cadence)
        ? ("series" as const)
        : ("one_time" as const),
    membershipRequired: false,
    access: "open" as const,
    visibility: "public" as const,
    allowsExternalGuests: false,
    sourceOfferingId: offering._id,
    pausedAt: offering.pausedAt,
    pausedByUserId: offering.pausedBy,
    pausedReason: offering.pausedReason,
    externalPaymentLinkUrl: offering.externalPaymentLinkUrl,
    status: offering.status,
    createdAt: offering.createdAt,
    updatedAt: offering.updatedAt,
  };
}

/** A confirmed external signup is not evidence money moved. */
export function signupEnrollmentFields(
  offering: Doc<"offerings">,
  signup: Doc<"offeringSignups">,
  payment: Doc<"classPayments"> | null,
) {
  const verifiedPayment =
    payment && isPayableClassPayment(payment) ? payment : null;
  const paid =
    (offering.priceCents ?? 0) > 0 || !!offering.externalPaymentLinkUrl;
  const paymentStatus = verifiedPayment
    ? "confirmed"
    : paid
      ? offering.externalPaymentLinkUrl && signup.status === "confirmed"
        ? "external_unverified"
        : "pending"
      : "not_required";
  const active = !!verifiedPayment || (!paid && signup.status === "confirmed");
  return {
    userId: signup.userId,
    role: "participant",
    status: active ? "active" : "pending",
    paymentStatus,
    paidCents: verifiedPayment?.grossCents,
    currency: "usd",
    stripeCheckoutSessionId: verifiedPayment?.stripeRef,
    joinedAt: signup.createdAt,
    sourceSignupId: signup._id,
  };
}

async function migrateOffering(
  ctx: MutationCtx,
  offering: Doc<"offerings">,
  dryRun: boolean,
): Promise<MigrationResult> {
  const existing = await ctx.db
    .query("gardenTables")
    .withIndex("by_sourceOfferingId", (q) =>
      q.eq("sourceOfferingId", offering._id),
    )
    .unique();
  const tableId =
    existing?._id ??
    (dryRun
      ? null
      : await ctx.db.insert("gardenTables", {
          ...offeringTableFields(offering),
          photoUrl: offering.photoStorageId
            ? ((await ctx.storage.getUrl(offering.photoStorageId)) ??
              offering.photoUrl)
            : offering.photoUrl,
        }));
  // Free-text cadence never creates a dated occurrence. Only a stored,
  // finite startDate can be carried across without guessing.
  if (
    tableId &&
    Number.isFinite(offering.startDate) &&
    (offering.startDate ?? 0) > 0
  ) {
    const previous = await ctx.db
      .query("events")
      .withIndex("by_sourceOfferingId", (q) =>
        q.eq("sourceOfferingId", offering._id),
      )
      .unique();
    if (!previous && !dryRun)
      await ctx.db.insert("events", {
        tableId,
        sourceOfferingId: offering._id,
        organizerId: offering.userId,
        title: offering.title,
        description: offering.description ?? "",
        datetime: offering.startDate!,
        endTime:
          offering.endDate && offering.endDate > offering.startDate!
            ? offering.endDate
            : undefined,
        location: offering.location,
        locationType: offering.locationType,
        address: offering.address,
        coordinates: offering.coordinates,
        placeId: offering.placeId,
        tags: offering.interests ?? [],
        requiresApproval: false,
        status:
          offering.pausedAt || offering.status !== "active"
            ? "draft"
            : "published",
        accessType: (offering.priceCents ?? 0) > 0 ? "paid" : "public",
        priceCents: offering.priceCents,
        hostOrgId: offering.hostOrgId,
        coverImageStorageId: offering.photoStorageId,
        createdAt: offering.createdAt,
        updatedAt: offering.updatedAt,
      });
  }
  return {
    sourceId: offering._id,
    action: existing ? "exists" : "created",
    targetId: tableId ?? undefined,
    reason: !offering.startDate
      ? "Cadence retained; no dated Event fabricated."
      : undefined,
  };
}

async function migrateSession(
  ctx: MutationCtx,
  session: Doc<"tableSessions">,
  dryRun: boolean,
): Promise<MigrationResult> {
  const existing = await ctx.db
    .query("events")
    .withIndex("by_sourceSessionId", (q) =>
      q.eq("sourceSessionId", session._id),
    )
    .unique();
  if (existing)
    return { sourceId: session._id, action: "exists", targetId: existing._id };
  const table = await ctx.db.get(session.tableId);
  if (!table?.hostUserId)
    return {
      sourceId: session._id,
      action: "skipped",
      reason: "Host identity must be resolved by an operator.",
    };
  if (!Number.isFinite(session.startsAt) || session.startsAt <= 0)
    return {
      sourceId: session._id,
      action: "skipped",
      reason: "No reliable occurrence timestamp.",
    };
  if (dryRun) return { sourceId: session._id, action: "created" };
  const meetingUrl = session.meetingUrl ?? table.meetingUrl;
  const eventId = await ctx.db.insert("events", {
    tableId: table._id,
    sourceSessionId: session._id,
    organizerId: table.hostUserId,
    coHostIds: table.coHostIds,
    title: session.title ?? table.name,
    description: table.description ?? table.blurb ?? "",
    datetime: session.startsAt,
    endTime:
      session.durationMins && session.durationMins > 0
        ? session.startsAt + session.durationMins * 60_000
        : undefined,
    tags: [],
    requiresApproval: false,
    status:
      table.status === "active" && !table.pausedAt ? "published" : "draft",
    locationType: meetingUrl ? "online" : "tbd",
    accessType: (table.priceCents ?? 0) > 0 ? "paid" : "public",
    priceCents: table.priceCents,
    hostOrgId: table.hostOrgId,
    hasVideo: !!meetingUrl,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  });
  await syncCoHosts(ctx, eventId, table.coHostIds ?? []);
  if (meetingUrl)
    await ctx.db.insert("eventVideo", {
      eventId,
      meetingUrl,
      updatedAt: Date.now(),
    });
  return { sourceId: session._id, action: "created", targetId: eventId };
}

async function migrateSignup(
  ctx: MutationCtx,
  signup: Doc<"offeringSignups">,
  dryRun: boolean,
): Promise<MigrationResult> {
  const table = await ctx.db
    .query("gardenTables")
    .withIndex("by_sourceOfferingId", (q) =>
      q.eq("sourceOfferingId", signup.offeringId),
    )
    .unique();
  if (!table)
    return {
      sourceId: signup._id,
      action: "skipped",
      reason: "Migrate the source Offering first.",
    };
  const existing = await ctx.db
    .query("tableMemberships")
    .withIndex("by_tableId_userId", (q) =>
      q.eq("tableId", table._id).eq("userId", signup.userId),
    )
    .unique();
  if (existing)
    return {
      sourceId: signup._id,
      action: existing.sourceSignupId === signup._id ? "exists" : "skipped",
      targetId: existing._id,
      reason:
        existing.sourceSignupId === signup._id
          ? undefined
          : "Existing enrollment retained; operator review required.",
    };
  const offering = await ctx.db.get(signup.offeringId);
  if (!offering)
    return {
      sourceId: signup._id,
      action: "skipped",
      reason: "Source Offering no longer exists.",
    };
  const payments = await ctx.db
    .query("classPayments")
    .withIndex("by_offeringId", (q) => q.eq("offeringId", signup.offeringId))
    .collect();
  const payment =
    payments
      .filter(
        (row) =>
          row.buyerUserId === signup.userId && isPayableClassPayment(row),
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
  const fields = signupEnrollmentFields(offering, signup, payment);
  if (dryRun)
    return {
      sourceId: signup._id,
      action: "created",
      reason: `Enrollment: ${fields.status}; payment: ${fields.paymentStatus}.`,
    };
  const membershipId = await ctx.db.insert("tableMemberships", {
    tableId: table._id,
    ...fields,
    updatedAt: Date.now(),
  });
  await ctx.db.insert("tableMembershipHistory", {
    tableId: table._id,
    userId: signup.userId,
    status: fields.status,
    createdAt: signup.createdAt,
  });
  return {
    sourceId: signup._id,
    action: "created",
    targetId: membershipId,
    reason: `Payment: ${fields.paymentStatus}.`,
  };
}

async function migrateRsvp(
  ctx: MutationCtx,
  rsvp: Doc<"sessionRsvps">,
  dryRun: boolean,
): Promise<MigrationResult> {
  if (rsvp.status !== "going")
    return {
      sourceId: rsvp._id,
      action: "skipped",
      reason: "Out intent retained on original RSVP; never attendance.",
    };
  const event = await ctx.db
    .query("events")
    .withIndex("by_sourceSessionId", (q) =>
      q.eq("sourceSessionId", rsvp.sessionId),
    )
    .unique();
  if (!event)
    return {
      sourceId: rsvp._id,
      action: "skipped",
      reason: "Migrate the source Session first.",
    };
  const previous = await ctx.db
    .query("eventRsvps")
    .withIndex("by_sourceSessionRsvpId", (q) =>
      q.eq("sourceSessionRsvpId", rsvp._id),
    )
    .unique();
  if (previous)
    return { sourceId: rsvp._id, action: "exists", targetId: previous._id };
  const [profile, user, userRsvps] = await Promise.all([
    ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", rsvp.userId))
      .unique(),
    ctx.db.get(rsvp.userId),
    ctx.db
      .query("eventRsvps")
      .withIndex("by_userId", (q) => q.eq("userId", rsvp.userId))
      .collect(),
  ]);
  const current = userRsvps.find((row) => row.eventId === event._id);
  if (current) {
    if (!dryRun)
      await ctx.db.patch(current._id, { sourceSessionRsvpId: rsvp._id });
    return { sourceId: rsvp._id, action: "exists", targetId: current._id };
  }
  if (!user?.email)
    return {
      sourceId: rsvp._id,
      action: "skipped",
      reason: "Account email unavailable; original RSVP retained.",
    };
  if (dryRun) return { sourceId: rsvp._id, action: "created" };
  const eventRsvpId = await ctx.db.insert("eventRsvps", {
    eventId: event._id,
    sourceSessionRsvpId: rsvp._id,
    userId: rsvp.userId,
    name: profile?.name ?? user.name ?? "Participant",
    email: user.email,
    createdAt: rsvp.createdAt,
  });
  return { sourceId: rsvp._id, action: "created", targetId: eventRsvpId };
}

/** Operator-run, bounded and resumable. Defaults to dry-run. Source rows,
 * original URLs, reports and payment references are never deleted. Run
 * offerings -> signups and sessions -> rsvps, using each returned cursor. */
export const migrateBatch = mutation({
  args: {
    phase: v.union(
      v.literal("offerings"),
      v.literal("sessions"),
      v.literal("signups"),
      v.literal("rsvps"),
    ),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdminCtx(ctx);
    const opts = {
      cursor: args.cursor ?? null,
      numItems: Math.min(100, Math.max(1, Math.floor(args.limit ?? 25))),
    };
    const dryRun = args.dryRun !== false;
    let results: MigrationResult[];
    let continueCursor: string;
    let isDone: boolean;
    if (args.phase === "offerings") {
      const page = await ctx.db.query("offerings").paginate(opts);
      results = [];
      for (const row of page.page)
        results.push(await migrateOffering(ctx, row, dryRun));
      ({ continueCursor, isDone } = page);
    } else if (args.phase === "sessions") {
      const page = await ctx.db.query("tableSessions").paginate(opts);
      results = [];
      for (const row of page.page)
        results.push(await migrateSession(ctx, row, dryRun));
      ({ continueCursor, isDone } = page);
    } else if (args.phase === "signups") {
      const page = await ctx.db.query("offeringSignups").paginate(opts);
      results = [];
      for (const row of page.page)
        results.push(await migrateSignup(ctx, row, dryRun));
      ({ continueCursor, isDone } = page);
    } else {
      const page = await ctx.db.query("sessionRsvps").paginate(opts);
      results = [];
      for (const row of page.page)
        results.push(await migrateRsvp(ctx, row, dryRun));
      ({ continueCursor, isDone } = page);
    }
    return { phase: args.phase, dryRun, continueCursor, isDone, results };
  },
});
