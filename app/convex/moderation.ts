// Admin moderation for projects and events: hide, unhide, delete. The UI is
// the ⋮ menu an admin sees in the top-right of /projects/:id and
// /events/:id (components/AdminMenu.tsx) and the Hidden list on /admin.
// The rules — what hidden means, what blocks a delete — are pure, in
// moderationRules.ts.
//
// Delete is permanent and takes the row's own children with it: team,
// roles, tiers, updates, attached pieces, RSVPs, applications, favorites,
// announcements, an event's eventCoHosts rows and uploaded files.
// Notifications that link to it stay; both pages already read a missing row
// as "isn't here anymore". It refuses when money is on record
// (deleteBlocker).

import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { syncCoHosts } from "./eventHosts";
import { requireAdminCtx } from "./helpers";
import { HIDDEN_STATUS, deleteBlocker, isHidden, restoredStatus } from "./moderationRules";
import { orphanedStorageIds } from "./garden/richText";

async function deleteFile(ctx: MutationCtx, id: Id<"_storage"> | undefined) {
  if (!id) return;
  // Best-effort, as events.update treats the same delete: a file already
  // gone must not fail the whole delete.
  try {
    await ctx.storage.delete(id);
  } catch {
    // already gone
  }
}

async function deleteAnnouncements(
  ctx: MutationCtx,
  targetType: "project" | "event",
  targetId: string,
) {
  const sends = await ctx.db
    .query("announcements")
    .withIndex("by_target_createdAt", (q) => q.eq("targetType", targetType).eq("targetId", targetId))
    .collect();
  for (const send of sends) {
    const recipients = await ctx.db
      .query("announcementRecipients")
      .withIndex("by_announcementId_deliveredAt", (q) => q.eq("announcementId", send._id))
      .collect();
    for (const r of recipients) await ctx.db.delete(r._id);
    await ctx.db.delete(send._id);
  }
}

async function deleteAll(ctx: MutationCtx, rows: { _id: Id<any> }[]) {
  for (const row of rows) await ctx.db.delete(row._id);
}

// ——— Projects ———

export const setProjectHidden = mutation({
  args: { projectId: v.id("projects"), hidden: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdminCtx(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError({ code: "not_found", reason: "That project is already gone." });
    if (args.hidden === isHidden(project)) return { ok: true, changed: false };

    const now = Date.now();
    await ctx.db.patch(
      args.projectId,
      args.hidden
        ? { status: HIDDEN_STATUS, statusBeforeHidden: project.status, hiddenAt: now, updatedAt: now }
        : {
            status: restoredStatus(project, "active"),
            statusBeforeHidden: undefined,
            hiddenAt: undefined,
            updatedAt: now,
          },
    );
    return { ok: true, changed: true };
  },
});

export const deleteProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAdminCtx(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) return { ok: true, deleted: false };
    const projectId = args.projectId;

    const [support, backingPayments, allocations, grantProposals, projectGifts] = await Promise.all([
      ctx.db.query("projectSupport").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("backingPayments").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("allocations").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("grantProposals").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("memberGifts").withIndex("by_status", (q) => q.eq("status", "project")).collect(),
    ]);
    // A "pending" financial row is an abandoned or in-flight checkout —
    // counted nowhere (garden/support.ts's startBacking) — so only a
    // confirmed one is money on record.
    const confirmedBacking = support.filter(
      (s) => s.type.startsWith("financial_") && s.status === "confirmed",
    );
    const blocker = deleteBlocker("project", {
      "confirmed backing": confirmedBacking.length,
      "backing payment": backingPayments.length,
      "fund allocation": allocations.length,
      "grant proposal": grantProposals.length,
      "member gift": projectGifts.filter((g) => String(g.projectId) === String(projectId)).length,
    });
    if (blocker) throw new ConvexError({ code: "has_money", reason: blocker });

    const [pieces, members, roles, tiers, updates, series, slots] = await Promise.all([
      ctx.db.query("artifacts").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("projectMembers").withIndex("by_projectId_status", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("projectRoles").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("patronTiers").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("storyUpdates").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("gigSeries").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).collect(),
      ctx.db.query("gigSlots").withIndex("by_projectId_startsAt", (q) => q.eq("projectId", projectId)).collect(),
    ]);

    // A shared piece IS its project (docs/features/project-ia.md) — left
    // behind it would be a /works/:id redirecting to nothing.
    for (const piece of pieces) {
      await deleteFile(ctx, piece.mediaStorageId);
      const embedding = await ctx.db
        .query("embeddings")
        .withIndex("by_entity", (q) => q.eq("entityType", "artifact").eq("entityId", piece._id))
        .first();
      if (embedding) await ctx.db.delete(embedding._id);
      await ctx.db.delete(piece._id);
    }
    for (const s of series) {
      const responses = await ctx.db
        .query("gigResponses")
        .withIndex("by_seriesId_userId", (q) => q.eq("seriesId", s._id))
        .collect();
      await deleteAll(ctx, responses);
    }
    // Photos dropped into a rich body: the same orphan sweep an edit that
    // removes one does (updateProject, stories.ts), with nothing kept.
    for (const doc of [project.body, ...updates.map((u) => u.bodyDoc)]) {
      for (const id of orphanedStorageIds(doc, undefined)) await deleteFile(ctx, id as Id<"_storage">);
    }
    await deleteAll(ctx, [...slots, ...series, ...members, ...roles, ...tiers, ...updates, ...support]);
    await deleteAnnouncements(ctx, "project", projectId);

    await deleteFile(ctx, project.photoStorageId);
    await deleteFile(ctx, project.mediaPreviewStorageId);
    await ctx.db.delete(projectId);
    return { ok: true, deleted: true };
  },
});

// ——— Events ———

export const setEventHidden = mutation({
  args: { eventId: v.id("events"), hidden: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdminCtx(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError({ code: "not_found", reason: "That event is already gone." });
    if (args.hidden === isHidden(event)) return { ok: true, changed: false };

    const now = Date.now();
    await ctx.db.patch(
      args.eventId,
      args.hidden
        ? { status: HIDDEN_STATUS, statusBeforeHidden: event.status, hiddenAt: now, updatedAt: now }
        : {
            status: restoredStatus(event, "published"),
            statusBeforeHidden: undefined,
            hiddenAt: undefined,
            updatedAt: now,
          },
    );
    return { ok: true, changed: true };
  },
});

export const deleteEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdminCtx(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return { ok: true, deleted: false };
    const eventId = args.eventId;

    const [purchases, rsvps] = await Promise.all([
      ctx.db.query("ticketPurchases").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      ctx.db.query("eventRsvps").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
    ]);
    // Refunded purchases count too: a refund is bookkeeping on a sale that
    // happened. A paid external ticket lands as an RSVP (garden/apGifts.ts).
    const blocker = deleteBlocker("event", {
      "ticket sale": purchases.length,
      "paid ticket": rsvps.filter((r) => (r.paidCents ?? 0) > 0 || !!r.stripeRef).length,
    });
    if (blocker) throw new ConvexError({ code: "has_money", reason: blocker });

    const [video, applications, favorites] = await Promise.all([
      ctx.db.query("eventVideo").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      ctx.db.query("eventApplications").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
      ctx.db
        .query("favorites")
        .withIndex("by_target", (q) => q.eq("targetType", "event").eq("targetId", eventId))
        .collect(),
    ]);
    await deleteAll(ctx, [...video, ...applications, ...favorites, ...rsvps]);
    await deleteAnnouncements(ctx, "event", eventId);
    // Synced to no co-hosts: its eventCoHosts rows go with it.
    await syncCoHosts(ctx, eventId, []);

    await deleteFile(ctx, event.coverImageStorageId);
    await deleteFile(ctx, event.mediaPreviewStorageId);
    for (const id of event.imageStorageIds ?? []) await deleteFile(ctx, id);
    await ctx.db.delete(eventId);
    return { ok: true, deleted: true };
  },
});

// ——— /admin's Hidden list ———

async function ownerName(ctx: QueryCtx, userId: Id<"users">) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return profile?.name ?? "Someone";
}

/** Everything an admin has hidden, newest hide first — the way back to a
 * hidden page, since no browse surface lists it any more. */
export const listHidden = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminCtx(ctx);
    const [passion, paid, events] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_kind_status", (q) => q.eq("kind", "passion").eq("status", HIDDEN_STATUS))
        .collect(),
      ctx.db
        .query("projects")
        .withIndex("by_kind_status", (q) => q.eq("kind", "paid").eq("status", HIDDEN_STATUS))
        .collect(),
      ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", HIDDEN_STATUS)).collect(),
    ]);
    const newestFirst = (a: { hiddenAt?: number }, b: { hiddenAt?: number }) =>
      (b.hiddenAt ?? 0) - (a.hiddenAt ?? 0);
    return {
      projects: await Promise.all(
        [...passion, ...paid].sort(newestFirst).map(async (p) => ({
          _id: p._id,
          title: p.title,
          ownerName: await ownerName(ctx, p.userId),
          hiddenAt: p.hiddenAt ?? null,
        })),
      ),
      events: await Promise.all(
        events.sort(newestFirst).map(async (e) => ({
          _id: e._id,
          title: e.title,
          ownerName: await ownerName(ctx, e.organizerId),
          datetime: e.datetime,
          hiddenAt: e.hiddenAt ?? null,
        })),
      ),
    };
  },
});
