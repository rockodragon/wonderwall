import { Link } from "react-router";
import { FavoriteButton } from "./FavoriteButton";

// The one event card. Both /events (routes/events.tsx) and the Events section
// of /favorites (routes/favorites.tsx) render this — favorites used to carry a
// verbatim copy of the pre-garden card (a five-way saturated rainbow keyed off
// list index), so the same event showed two different faces depending on which
// page you were standing on. Any future event list should import this rather
// than grow a third copy.
//
// Fallback cover treatment for an event with no uploaded image. Everything
// here stays inside the ink family — the previous version picked one of five
// saturated gradients (blue/purple/emerald/orange/cyan), which read as loud
// next to Projects and Classes and, worse, was keyed off the card's INDEX in
// the list, so a card changed color whenever the grid was filtered, searched,
// or a new event pushed it along. These are keyed off the event id instead, so
// a card keeps the same face for as long as the event exists — and, now that
// the component is shared, the same face on both pages.
const COVER_FALLBACKS = [
  "linear-gradient(140deg, #201f1c 0%, #131312 100%)",
  "linear-gradient(140deg, #1b1d1b 0%, #121212 100%)",
  "linear-gradient(140deg, #1e1d21 0%, #121213 100%)",
  "linear-gradient(140deg, #1d1f20 0%, #121212 100%)",
];

function coverFallback(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COVER_FALLBACKS[Math.abs(hash) % COVER_FALLBACKS.length];
}

// Chip styles, matched to routes/projects.tsx's Paid/Passion badge: the
// exceptional state gets the citron tint, the default state stays neutral.
const CHIP_ACCENT = {
  backgroundColor: "rgba(215,242,90,0.14)",
  color: "var(--garden-citron)",
} as const;
const CHIP_NEUTRAL = {
  backgroundColor: "rgba(198,198,190,0.1)",
  color: "var(--garden-body)",
} as const;

// The fields the card draws. The two callers hand it genuinely different
// shapes, and the optionality below is the honest record of that — it is not
// defensive typing:
//
//   api.events.list        spreads the whole event doc, so description /
//                          accessType / priceCents are all present.
//   api.favorites          projects a narrow subset (convex/favorites.ts:157)
//     .getMyFavorites      that omits those three. On /favorites the
//                          description paragraph and the price simply don't
//                          render — widening that projection is a Convex
//                          change, deliberately out of scope here.
//
// Everything that decides the card's SHAPE — cover, title, badge, date,
// location, tags, attendee count — is present in both, which is why one
// component can serve both pages.
export type EventCardEvent = {
  _id: string;
  title: string;
  datetime: number;
  location?: string | null;
  tags: string[];
  requiresApproval: boolean;
  coverImageUrl?: string | null;
  attendeeCount?: number;
  description?: string | null;
  accessType?: string;
  priceCents?: number;
  /** Public "this event has an online room" flag (convex/schema.ts). It is a
   * boolean by design and carries no URL — the join and recording links live
   * in the separate eventVideo table and never reach a list payload
   * (docs/gated-event-video-prd.md). Absent from the favorites projection,
   * same as description/accessType/priceCents above. */
  hasVideo?: boolean;
};

export function EventCard({
  event,
  dimmed = false,
  videoBadge = false,
}: {
  event: EventCardEvent;
  /**
   * Knock the card back to 60%. /events lists only upcoming published events
   * so it never needs this; /favorites can hold an event that has since
   * passed or been cancelled, and the caller owns that rule because it is the
   * caller that has `status` and a reason to care. Keeping the Date.now()
   * comparison out of here also keeps a time-dependent value out of the
   * shared render path.
   */
  dimmed?: boolean;
  /**
   * Show the "Video" chip when the event has an online room. Off by default
   * and turned on only by the Past tab, where it is the thing a browser is
   * actually looking for — a session that happened online may have a
   * recording waiting on the event page. It cannot promise one: hasVideo
   * tracks the join link, and nothing forces an organizer to post a replay
   * (PRD Criticism #4). The chip says a room existed; the event page is
   * where you find out whether the recording did.
   */
  videoBadge?: boolean;
}) {
  const priceCents =
    event.accessType === "paid" && (event.priceCents ?? 0) > 0
      ? (event.priceCents as number)
      : null;

  // Date only, no time: this renders during SSR as well as on the client, and
  // a timezone-sensitive time string is the kind of thing that hydrates
  // differently on the server. The detail page carries the start time.
  const dateLabel = new Date(event.datetime).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      to={`/events/${event._id}`}
      className={`block h-full${dimmed ? " opacity-60" : ""}`}
    >
      <div
        className="group rounded-2xl overflow-hidden border h-full flex flex-col transition-colors"
        style={{
          borderColor: "var(--garden-hairline)",
          backgroundColor: "var(--garden-ink-raised)",
        }}
      >
        <div
          className="relative aspect-[16/10] overflow-hidden flex items-center justify-center"
          style={{
            background: event.coverImageUrl
              ? "var(--garden-ink)"
              : coverFallback(event._id),
          }}
        >
          {event.coverImageUrl ? (
            <img
              src={event.coverImageUrl}
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <svg
              className="w-10 h-10"
              style={{ color: "var(--garden-hairline-raised)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton targetType="event" targetId={event._id} size="sm" />
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3
              className="font-semibold line-clamp-2 break-words"
              style={{
                color: "var(--garden-paper)",
                fontFamily: "var(--garden-font-display)",
              }}
            >
              {event.title}
            </h3>
            <span
              className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em]"
              style={{
                fontFamily: "var(--garden-font-mono)",
                ...(event.requiresApproval ? CHIP_ACCENT : CHIP_NEUTRAL),
              }}
            >
              {event.requiresApproval ? "Apply" : "Open"}
            </span>
          </div>

          {/* When and where lead the metadata — for an event they're the
              defining facts, not trailing detail the way a project's
              location is. */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2"
            style={{ color: "var(--garden-body)" }}
          >
            <span className="flex items-center gap-1">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {dateLabel}
            </span>
            {event.location && (
              <span className="flex items-center gap-1 min-w-0">
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                </svg>
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </div>

          {event.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {event.tags.slice(0, 3).map((tag: string) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    fontFamily: "var(--garden-font-body)",
                    backgroundColor: "rgba(198,198,190,0.1)",
                    color: "var(--garden-muted)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* break-words: a pasted URL in a description is one unbroken token
              and pushes past the card edge without it. */}
          {event.description && (
            <p
              className="text-sm line-clamp-2 mb-3 break-words"
              style={{ color: "var(--garden-muted)" }}
            >
              {event.description}
            </p>
          )}

          <div
            className="mt-auto flex items-center justify-between gap-2 pt-3"
            style={{ borderTop: "1px solid var(--garden-hairline)" }}
          >
            <span className="text-xs" style={{ color: "var(--garden-muted)" }}>
              {(event.attendeeCount ?? 0) > 0
                ? `${event.attendeeCount} going`
                : "Be the first to join"}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {videoBadge && event.hasVideo && (
                <span
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    fontFamily: "var(--garden-font-body)",
                    ...CHIP_NEUTRAL,
                  }}
                  title="This session ran online — check the event page for a recording"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Video
                </span>
              )}
              {priceCents !== null && (
                <span
                  className="shrink-0 text-sm font-semibold"
                  style={{
                    fontFamily: "var(--garden-font-mono)",
                    color: "var(--garden-citron)",
                  }}
                >
                  ${(priceCents / 100).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
