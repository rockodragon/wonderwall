// The single chokepoint for event join/recording URLs.
// docs/gated-event-video-prd.md, "Data model" + "Gating rule".
//
// Every function that can return a meetingUrl or a recordingUrl lives in
// this file, and there are exactly two of them:
//
//   get                  — role-gated (resolveVideoRole), for the event page
//   getPublicJoinTarget  — the /j/{eventId} redirect proxy, PUBLIC EVENTS ONLY
//
// events.list / events.get / events.search are untouched by this feature and
// keep spreading the event document harmlessly, because the URLs were never
// on that document. Adding a third URL-returning function here is an act of
// commission that shows up plainly in review — that's the design (PRD
// Criticism #1, which reverses the first draft's "strip it at three call
// sites" approach).
//
// Convention follows announcements.ts and garden/*: getAuthUserId +
// ConvexError({ code, reason }), NOT events.ts's older auth.getUserId +
// throw new Error.

import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveVideoRole, eventAccessType, type EventVideoRole } from "./eventAccess";
import { visibleMeetingUrl } from "./garden/tables";

const MAX_URL_LENGTH = 2048;

// ——— Pure core ———

/** Organizer-pasted URLs only ever get handed back to a browser as an href
 * or a Location header, so anything but http/https is rejected outright —
 * that keeps `javascript:` and `data:` out of the redirect proxy. */
export function normalizeVideoUrl(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined; // empty string clears the link
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new ConvexError({ code: "invalid_url", reason: "That link is too long." });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConvexError({
      code: "invalid_url",
      reason: "Paste a full link starting with https://",
    });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ConvexError({
      code: "invalid_url",
      reason: "Paste a full link starting with https://",
    });
  }
  return parsed.toString();
}

// ——— Shared internals ———

async function readVideoRow(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<Doc<"eventVideo"> | null> {
  return await ctx.db
    .query("eventVideo")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
}

/** Organizer-only guard, shared by both mutations. */
async function requireOrganizer(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError({ code: "unauthenticated", reason: "Sign in first." });
  }
  const event = await ctx.db.get(eventId);
  if (!event) {
    throw new ConvexError({ code: "not_found", reason: "That event doesn't exist." });
  }
  if (event.organizerId !== userId) {
    throw new ConvexError({
      code: "forbidden",
      reason: "Only the organizer can set this event's video links.",
    });
  }
  return event;
}

async function upsertVideoRow(
  ctx: MutationCtx,
  eventId: Id<"events">,
  patch: Partial<Omit<Doc<"eventVideo">, "_id" | "_creationTime" | "eventId">>,
): Promise<void> {
  const existing = await readVideoRow(ctx, eventId);
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
  } else {
    await ctx.db.insert("eventVideo", { eventId, ...patch, updatedAt: now });
  }
}

// ——— Queries ———

export interface EventVideoView {
  role: EventVideoRole;
  /** Public fact, mirrored from events.hasVideo so the caller needs one query. */
  hasVideo: boolean;
  accessType: "public" | "paid";
  /** Present only for "organizer" and "entitled". */
  meetingUrl?: string;
  recordingUrl?: string;
  recordingPostedAt?: number;
}

/**
 * THE chokepoint. Resolves the viewer's role, then hands back only what that
 * role is allowed to see. Returns null for a missing event.
 */
export const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventVideoView | null> => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const userId = await getAuthUserId(ctx);
    const role = await resolveVideoRole(ctx, event, userId);

    const base = {
      role,
      hasVideo: event.hasVideo === true,
      accessType: eventAccessType(event),
    };
    if (role === "none") return base;

    const row = await readVideoRow(ctx, args.eventId);
    if (!row) return base;

    // Reuse the existing strip-for-ineligible-viewers helper rather than
    // writing a fourth copy of it (PRD Criticism #8). A cancelled event has
    // no live room to send anyone to — same rule the /j/ proxy applies — but
    // the organizer still sees what they pasted, because that string is the
    // contents of their own input field.
    const canJoin = role === "organizer" || event.status !== "cancelled";
    return {
      ...base,
      meetingUrl: visibleMeetingUrl(row.meetingUrl, canJoin),
      recordingUrl: row.recordingUrl,
      recordingPostedAt: row.recordingPostedAt,
    };
  },
});

/**
 * Redirect target for the /j/{eventId} Cloudflare Pages Function.
 *
 * The proxy runs with no user session, so it cannot resolve a role — which
 * is exactly why this path refuses to answer for anything but a live public
 * event. For a public event the join link is not secret (PRD "The join
 * proxy": "a *stable* link, not a *secret* one — /j/{eventId} is guessable
 * from the public event ID, so for free events it grants exactly what the
 * event page already grants"). For a paid event it returns null and the
 * proxy falls back to the event page, where the entitlement check happens.
 *
 * eventId is v.string(), not v.id(): the proxy forwards whatever is in the
 * URL path, and a malformed id must produce a clean null rather than an
 * argument-validation error.
 */
export const getPublicJoinTarget = query({
  args: { eventId: v.string() },
  handler: async (ctx, args): Promise<{ meetingUrl: string } | null> => {
    const eventId = ctx.db.normalizeId("events", args.eventId);
    if (!eventId) return null;

    const event = await ctx.db.get(eventId);
    if (!event) return null;
    if (event.status === "cancelled") return null;
    // Never resolve a link for a paid event from an unauthenticated path.
    if (eventAccessType(event) === "paid") return null;

    const row = await readVideoRow(ctx, eventId);
    if (!row?.meetingUrl) return null;
    return { meetingUrl: row.meetingUrl };
  },
});

// ——— Mutations ———

/**
 * Organizer pastes (or clears) the live join link. Also flips the PUBLIC
 * events.hasVideo flag so the event page can say "this event has a room"
 * without anyone having to fetch the URL to find out.
 */
export const setEventVideo = mutation({
  args: {
    eventId: v.id("events"),
    meetingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx, args.eventId);
    const meetingUrl = normalizeVideoUrl(args.meetingUrl);

    await upsertVideoRow(ctx, args.eventId, { meetingUrl });
    await ctx.db.patch(args.eventId, {
      hasVideo: meetingUrl !== undefined,
      updatedAt: Date.now(),
    });
    return { hasVideo: meetingUrl !== undefined };
  },
});

/**
 * Organizer posts the replay link afterwards. There is no completion signal
 * to hang this on — nothing in the codebase ever writes status:"completed"
 * (PRD Criticism #4) — so this is deliberately callable at any time.
 */
export const postEventRecording = mutation({
  args: {
    eventId: v.id("events"),
    recordingUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrganizer(ctx, args.eventId);
    const recordingUrl = normalizeVideoUrl(args.recordingUrl);

    await upsertVideoRow(ctx, args.eventId, {
      recordingUrl,
      recordingPostedAt: recordingUrl ? Date.now() : undefined,
    });
    return { posted: recordingUrl !== undefined };
  },
});
