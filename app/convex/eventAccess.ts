// Who may be shown an event's join/recording URL.
// docs/gated-event-video-prd.md, "Gating rule".
//
// This module holds the rule only — no Convex functions live here. The one
// query that may ever return a URL is in convex/eventVideo.ts, and it calls
// resolveVideoRole first. Keeping the rule in its own file means the paid
// branch below can be read and reviewed on its own terms before any UI
// drives it.
//
// Honest framing (PRD Criticism #2 and #3): for a public event this returns
// "entitled" for literally everyone, including anonymous visitors. It gates
// the *display* of a string, not access to a video, and the UI must not
// imply a check happened. It becomes a real gate only when the paid path
// lands — and the PRD's build order says that trigger pulls LiveKit forward
// rather than shipping honor-system gating on a forwardable link.

import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type EventVideoRole = "organizer" | "entitled" | "none";

/** Absent accessType means public — free events predate this feature and
 * must keep working without a backfill. */
export function eventAccessType(event: Pick<Doc<"events">, "accessType">): "public" | "paid" {
  return event.accessType === "paid" ? "paid" : "public";
}

export async function resolveVideoRole(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
  userId: Id<"users"> | null,
): Promise<EventVideoRole> {
  if (userId && event.organizerId === userId) return "organizer";

  // Public event → anyone. Not a gate; see the module comment.
  if (eventAccessType(event) === "public") return "entitled";

  // ——— Paid path ———
  // Written now, exercised by nothing this pass (PRD "Build order": the
  // fields land, the flow doesn't). It is here so the rule is complete and
  // reviewable in one place rather than being re-derived under deadline.
  //
  // Both attendance paths must be unioned. Events with requiresApproval
  // route attendance through eventApplications, NOT eventRsvps — checking
  // only RSVPs would lock out every approved applicant. This mirrors
  // announcements.ts resolveAudience's "event" case, which already unions
  // the same two tables for the same reason.
  if (!userId) return "none";

  const [acceptedApplication, rsvps] = await Promise.all([
    ctx.db
      .query("eventApplications")
      .withIndex("by_eventId_status", (q) =>
        q.eq("eventId", event._id).eq("status", "accepted"),
      )
      .filter((q) => q.eq(q.field("applicantId"), userId))
      .first(),
    // eventRsvps has no by_userId index and rosters are small; collect and
    // filter in memory rather than adding an index for a path with no UI.
    ctx.db
      .query("eventRsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
  ]);

  if (acceptedApplication) return "entitled";

  // Only an organizer-set paymentStatus counts. "An RSVP row exists" is
  // worthless as a credential — rsvpToEvent takes any name + email with no
  // auth at all (PRD Criticism #3).
  const paid = rsvps.some(
    (rsvp) => rsvp.userId === userId && rsvp.paymentStatus === "confirmed",
  );
  return paid ? "entitled" : "none";
}
