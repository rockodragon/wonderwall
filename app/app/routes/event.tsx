// /events/:eventId — the canonical event page, and PUBLIC for a signed-out
// guest holding a calendar invite (eventRsvps.userId is optional by
// design): the join link, the recording, "add to calendar" and the RSVP
// all live here. Gating it dead-ended exactly the person holding the
// invite — docs/gated-event-video-prd.md.
//
// It lives inside the _app.tsx layout (routes.ts) with every other route,
// but routes/_app.tsx exempts /events/:eventId from its redirect-to-/login
// effect via its public-path matcher — the same mechanism /communities
// uses — so the shell (wordmark, sidebar, mobile nav) still renders for a
// guest instead of leaving this page with no chrome. /events itself (the
// browse list) stays gated, which is why the back link below still branches
// on isGuest rather than pointing straight at /events.
//
// So this file has two audiences. The rule for the logged-out one:
//
//   • Every Convex query it calls is already anonymous-safe and returns a
//     sensible empty answer rather than throwing — events.get (isOrganizer
//     false, userApplication null), events.getAttendees (fully public),
//     eventVideo.get (resolveVideoRole returns "entitled" for a public
//     event, so the Join button and recording DO render for a guest).
//   • Every organizer control hangs off event.isOrganizer, which the server
//     derives — a guest can never see one.
//   • Anything whose mutation requires auth is hidden, never rendered dead:
//     Apply/Join (events.apply throws "Not authenticated") is replaced by
//     the guest RSVP, and the favorite button is dropped.
//   • Links into auth-gated routes (/profile/:id, /events) are rendered as
//     plain text or repointed, so a guest never gets bounced to /login.
//
// Nothing below changes what an authenticated user sees; every new branch
// is strictly !isAuthenticated.

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { normalizePhone } from "../../convex/phone";
import { LocationMapCard } from "../components/LocationMapCard";
import { ImageFill } from "../components/ImageFill";
import { CoverFrame } from "../components/CoverFrame";
import { useCoverPick } from "../lib/useCoverPick";
import { uploadToStorage } from "../lib/uploadFile";
import { isWideCover, useImageAspect } from "../lib/useImageAspect";
import { useBack } from "../lib/useBack";
import { YOUTUBE_LIVE_LABEL, YOUTUBE_LIVE_URL } from "../constants/broadcast";
import { FavoriteButton } from "../components/FavoriteButton";
import { ShareButton } from "../components/ShareButton";
import { ShowcaseContent, SHOWCASE_EVENT_ID } from "../components/ShowcaseContent";
import { hostLabels } from "../lib/eventHosts";
import { CreateEventModal } from "../components/CreateEventModal";
import type { TicketTier } from "../components/TicketTierEditor";
import { AnnouncementComposer } from "../components/AnnouncementComposer";
import { AdminMenu, HiddenNotice } from "../components/AdminMenu";
import { AddToCalendar } from "../components/AddToCalendar";
import { EmbedPlayer } from "../components/EmbedPlayer";
import { joinProxyUrl } from "../lib/eventCalendar";
import { codeRequestParams } from "../lib/oauthHost";
import { toEmbedUrl } from "../lib/videoEmbed";
import { buildTicketLink, isCheckoutSessionId } from "../../convex/garden/ticketLink";
import { claimPendingTickets, stashTicketSession } from "../lib/pendingTicket";
import { setPendingIntent } from "../lib/pendingIntent";
import { guestsToCsv, summarizeGuests, formatDollars } from "../../convex/eventGuests";
import { PAGE_WIDTH } from "../lib/pageWidth";
import { eventHasEnded } from "../../convex/eventWindow";

const COVER_COLORS = [
  { name: "Blue", value: "blue", gradient: "from-blue-500 to-blue-600" },
  {
    name: "Purple",
    value: "purple",
    gradient: "from-purple-500 to-purple-600",
  },
  { name: "Pink", value: "pink", gradient: "from-pink-500 to-pink-600" },
  { name: "Green", value: "green", gradient: "from-green-500 to-green-600" },
  {
    name: "Orange",
    value: "orange",
    gradient: "from-orange-500 to-orange-600",
  },
];

/** Header date/time. Without an end time this matches the original
    single-timestamp rendering; with one it collapses to a range like
    "Fri, Nov 6 · 6:00–9:00 PM" (start's meridiem dropped when it matches
    the end's), or spells out both sides when the event crosses midnight. */
function formatEventDateTime(start: number, end?: number): string {
  const startDate = new Date(start);
  if (!end) {
    return startDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const endDate = new Date(end);
  const dayOpts = {
    weekday: "short",
    month: "short",
    day: "numeric",
  } as const;
  const timeOpts = { hour: "numeric", minute: "2-digit" } as const;
  const startDay = startDate.toLocaleDateString("en-US", dayOpts);
  const startTime = startDate.toLocaleTimeString("en-US", timeOpts);
  const endTime = endDate.toLocaleTimeString("en-US", timeOpts);

  if (startDate.toDateString() !== endDate.toDateString()) {
    const endDay = endDate.toLocaleDateString("en-US", dayOpts);
    return `${startDay}, ${startTime} – ${endDay}, ${endTime}`;
  }

  // "6:00 PM" / "9:00 PM" → "6:00–9:00 PM"; mixed meridiems keep both.
  const sameMeridiem = startTime.slice(-2) === endTime.slice(-2);
  const startShort = sameMeridiem ? startTime.slice(0, -3) : startTime;
  return `${startDay} · ${startShort}–${endTime}`;
}

function formatTierPrice(priceCents: number): string {
  const dollars = priceCents / 100;
  return `$${priceCents % 100 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/** Back to wherever they came from (a profile, an org, Today), else the
 *  events list (Rick, 2026-10-01) — rendered in every state of this page
 *  (loading, not-found, loaded), so there's always a way out. /events itself
 *  stays inside the auth-gated layout (routes.ts), so a guest who arrived
 *  cold is sent to the guest-facing browse page instead of a link that
 *  would bounce them to /login via _app.tsx's redirect. */
function EventsBackLink({ isGuest }: { isGuest: boolean }) {
  const back = useBack(isGuest ? "/garden/events" : "/events");
  return (
    <Link {...back} className="text-blue-600 hover:text-blue-500 text-sm font-medium">
      ← Back
    </Link>
  );
}

type EventTab = "details" | "going" | "guests" | "setup" | "hosts";

export default function EventDetail() {
  const { eventId } = useParams();
  // isLoading is true only while Convex resolves the stored token. Treating
  // that window as "logged out" would flash the guest RSVP at a signed-in
  // user, so both flags are read and the guest UI waits for a settled answer.
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const isGuest = !authLoading && !isAuthenticated;
  const event = useQuery(
    api.events.get,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const applyToEvent = useMutation(api.events.apply);
  const cancelEvent = useMutation(api.events.cancel);
  const applications = useQuery(
    api.events.getApplications,
    eventId && event?.isHost
      ? { eventId: eventId as Id<"events"> }
      : "skip",
  );
  const updateStatus = useMutation(api.events.updateApplicationStatus);
  const attendees = useQuery(
    api.events.getAttendees,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );

  const [message, setMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  // Held here rather than inside the card so the desktop and mobile render
  // sites stay in sync — the same reason `message`/`showApplyForm` above are
  // parent state and not local to each button.
  const rsvp = useGuestRsvp(eventId as Id<"events"> | undefined);

  async function handleCancelEvent() {
    if (!eventId) return;
    if (
      !confirm(
        "Are you sure you want to cancel this event? This cannot be undone.",
      )
    )
      return;

    setCancelling(true);
    try {
      await cancelEvent({ eventId: eventId as Id<"events"> });
    } catch (err) {
      console.error("Cancel failed:", err);
      alert("Failed to cancel event. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  // The cover's shape picks the header: a poster beside the title, or a
  // banner above it. Measured before the early returns (hooks).
  const coverRatio = useImageAspect(
    event ? event.coverImageUrl || event.galleryImageUrls?.[0] : null,
  );

  if (event === undefined) {
    return (
      <div className={`p-6 ${PAGE_WIDTH.list} mx-auto`}>
        <EventsBackLink isGuest={isGuest} />
        <div className="animate-pulse mt-4">
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl mb-6" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-8" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className={`p-6 ${PAGE_WIDTH.list} mx-auto`}>
        <EventsBackLink isGuest={isGuest} />
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">Event not found</p>
        </div>
      </div>
    );
  }

  async function handleJoin() {
    if (!eventId) return;
    setJoining(true);
    try {
      await applyToEvent({
        eventId: eventId as Id<"events">,
        message: message || undefined,
      });
      setShowJoinForm(false);
      setMessage("");
    } finally {
      setJoining(false);
    }
  }

  async function handleApply() {
    if (!eventId) return;
    setApplying(true);
    try {
      await applyToEvent({
        eventId: eventId as Id<"events">,
        message: message || undefined,
      });
      setShowApplyForm(false);
      setMessage("");
    } finally {
      setApplying(false);
    }
  }

  async function handleUpdateStatus(
    applicationId: Id<"eventApplications">,
    status: string,
  ) {
    await updateStatus({ applicationId, status });
  }

  // Two different "past"s (Rick, 2026-10-07: people couldn't join late).
  // Started: ticket sales (the server refuses them after the start) and Add
  // to calendar stop. Ended (convex/eventWindow.ts, three hours when there's
  // no end time): joining, RSVP and Apply stop, and the page says it ended.
  const now = Date.now();
  const hasStarted = event.datetime < now;
  const isPast = eventHasEnded(event, now);
  // AP's own Stripe Payment Link (garden/apGifts.ts). When set, the ticket
  // card takes the join button's place, above the video section.
  const ticketUrl =
    event.externalTicketUrl && !isPast ? event.externalTicketUrl : null;
  const cancelled = event.status === "cancelled";
  // events.apply throws "Not authenticated", so the Apply/Join buttons are
  // for signed-in visitors only. A guest gets showGuestRsvp instead — never
  // a button that would reject on click.
  const canApply =
    !isPast && !event.userApplication && !event.isOrganizer && isAuthenticated;
  const isHost = !!(event.isHost ?? event.isOrganizer);
  const tabs: { id: EventTab; label: string }[] = isHost
    ? [
        { id: "details", label: "Details" },
        { id: "going", label: "Who's going" },
        { id: "guests", label: "Guests" },
        { id: "setup", label: "Setup" },
        { id: "hosts", label: "Hosts" },
      ]
    : [
        { id: "details", label: "Details" },
        { id: "going", label: "Who's going" },
      ];
  const rawTab = searchParams.get("tab");
  const tab: EventTab = tabs.some((t) => t.id === rawTab) ? (rawTab as EventTab) : "details";
  function selectTab(next: EventTab) {
    // Keep other params (paid, session) — the ticket flows read them.
    const params = new URLSearchParams(searchParams);
    if (next === "details") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }
  const showGuestRsvp = isGuest && !isPast && !cancelled;

  // Get gradient class for cover color
  const coverGradient =
    COVER_COLORS.find((c) => c.value === event.coverColor)?.gradient ||
    "from-blue-500 to-purple-600";

  // Use cover image, or first gallery image, or gradient
  const bannerImageUrl =
    event.coverImageUrl ||
    (event.galleryImageUrls && event.galleryImageUrls[0]);

  // A pasted Instagram, TikTok, YouTube or Vimeo link plays here, in the
  // platform's own player (docs/features/creator-media-cross-post.md). An
  // uploaded image stays the banner and the player sits directly under it;
  // with no image the player is the first thing on the page and the title
  // block drops below it, off the overlay — text can't sit on an iframe.
  // This is the event's own media, public by design; the gated join and
  // recording links are a different thing (EventVideoSection below).
  const mediaEmbed = toEmbedUrl(event.mediaUrl);
  const playerIsHero = !!mediaEmbed && !bannerImageUrl;
  const poster = !!bannerImageUrl && !isWideCover(coverRatio);

  return (
    <div className={`${PAGE_WIDTH.list} mx-auto`}>
      {/* Garden design tokens — this file is otherwise plain Tailwind, but
          the shared AnnouncementComposer (see "Organizer: message
          attendees" below) is styled with --garden-* tokens to match
          routes/projects.tsx and routes/offerings.tsx, so it needs the
          same stylesheet those files load. */}
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />

      {/* Back link, above the hero — the wordmark/sidebar/sign-in chrome
          around this page now comes from _app.tsx itself (guest included,
          via its public-path matcher), so this file only needs the one
          thing it's still responsible for: a way back to the list. An
          admin also gets the moderation ⋮ (AdminMenu) on the right. */}
      <div className="px-6 pt-4 flex items-center justify-between gap-3">
        <EventsBackLink isGuest={isGuest} />
        <AdminMenu target={{ kind: "event", id: event._id }} title={event.title} hidden={event.hiddenByAdmin} />
      </div>

      {/* Only hosts and admins ever get a hidden event back (events.get). */}
      {event.hiddenByAdmin && (
        <div className="px-6 pt-4">
          <HiddenNotice kind="event" />
        </div>
      )}

      {/* Ticketed events stay hidden from everyone but their organizer
          until the organizer can sell tickets (product rule, 2026-09-27).
          Only the organizer's own view ever sees hiddenUntilMembership. */}
      {event.hiddenUntilMembership && (
        <div className="px-6 pt-4">
          <div
            className="rounded-xl px-4 py-3"
            style={{
              backgroundColor: "var(--garden-ink-raised)",
              border: "1px solid var(--garden-hairline-raised)",
            }}
          >
            <p style={{ color: "var(--garden-paper)", fontSize: 15, margin: 0 }}>
              Only you can see this. Selling tickets takes membership.{" "}
              <Link
                to="/join"
                style={{ color: "var(--garden-citron)", fontWeight: 600 }}
              >
                Become a member and it goes live →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Cover Image — or the player, when a pasted link stands in for one */}
      {playerIsHero && mediaEmbed && (
        <div className="px-6 pt-6">
          <EmbedPlayer embed={mediaEmbed} title={event.title} />
        </div>
      )}
      {/* A 4:5 cover is a poster (docs/features/cover-4x5.md): full width
          on a phone (capped at ~70vh) with the title below; from md up it
          sits left of the title. A wide cover — an old landscape one, or a
          flyer kept whole — stays the full-width banner above the title,
          shown whole (ImageFill), as does the gradient when there's none.
          Posters carry their own type, so the title never sits on top. */}
      <div className={poster ? "md:flex md:items-start md:gap-8 md:px-6 md:pt-5" : undefined}>
        {poster && bannerImageUrl ? (
          <div className="pt-3 md:pt-0 md:w-80 md:shrink-0">
            <CoverFrame
              src={bannerImageUrl}
              alt={event.title}
              className="mx-auto max-w-[min(100%,56vh)] md:max-w-none md:rounded-2xl"
            />
          </div>
        ) : (
          !playerIsHero && (
            <div className="relative h-56 md:h-72 overflow-hidden">
              {bannerImageUrl ? (
                <ImageFill src={bannerImageUrl} alt={event.title} />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${coverGradient}`} />
              )}
            </div>
          )
        )}
        <div className={poster ? "min-w-0 flex-1 px-6 pt-5 md:px-0 md:pt-0" : "px-6 pt-5"}>
          <div className="flex items-center gap-3 mb-2">
            <h1
              className={`text-2xl md:text-3xl font-bold ${
                "text-gray-900 dark:text-white"
              }`}
            >
              {event.title}
            </h1>
            {isHost && (
              <>
                <button
                  onClick={() => setShowEditForm(true)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  Edit
                </button>
                {event.isOrganizer && event.status !== "cancelled" && !event.hiddenByAdmin && (
                  <div className="relative">
                    <button
                      onClick={() => setShowOptions((v) => !v)}
                      aria-label="More options"
                      aria-expanded={showOptions}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                        "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                    {showOptions && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowOptions(false)}
                        />
                        <div className="absolute left-0 top-full mt-1 z-20 min-w-40 rounded-lg py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg">
                          <button
                            onClick={() => {
                              setShowOptions(false);
                              handleCancelEvent();
                            }}
                            disabled={cancelling}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                          >
                            {cancelling ? "Cancelling..." : "Cancel event"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div
            className={`flex flex-wrap items-center gap-4 text-sm ${
              "text-gray-600 dark:text-gray-400"
            }`}
          >
            <span className="flex items-center gap-1">
              <svg
                className="w-4 h-4"
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
              {formatEventDateTime(event.datetime, event.endTime)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <svg
                  className="w-4 h-4"
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* The player under an uploaded cover (the no-cover case is above) */}
      {mediaEmbed && !playerIsHero && (
        <div className="px-6 pt-6">
          <EmbedPlayer embed={mediaEmbed} title={event.title} />
        </div>
      )}

      <div className="p-6 overflow-x-hidden">
        {/* Tab bar. Scrolls sideways on a narrow screen; the page doesn't. */}
        <div
          role="tablist"
          aria-label="Event sections"
          className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700 mb-6 -mx-6 px-6"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={`shrink-0 whitespace-nowrap px-3 py-2.5 text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-blue-500 text-gray-900 dark:text-white"
                  : "border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "details" && (
        <>
        {/* Tags and Actions Row */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {event.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* favorites.toggle throws "Not authenticated" — a guest gets no
                button rather than one that rejects on click. Share is pure
                client-side (navigator.share / clipboard), so it stays. */}
            {!isGuest && (
              <FavoriteButton targetType="event" targetId={event._id} />
            )}
            <ShareButton type="event" title={event.title} size="sm" />
          </div>
        </div>

        {/* Organizer, Description, and Join Button */}
        <div className="flex flex-col md:flex-row md:gap-8 mb-8">
          {/* Left: Organizer and Description */}
          <div className="flex-1">
            {/* Hosts: organizer first, then co-hosts. An organization links
                to its page here (/orgs/:slug, public) — never out to its
                website; one from before the backfill has no page yet and
                shows as plain text. /profile/:id is inside the auth-gated
                layout, so a guest gets plain person names. */}
            {event.organizer && (
              <p className="mb-4 text-[15px] text-gray-700 dark:text-gray-200">
                Hosted by{" "}
                {hostLabels(
                  event.shownHosts ?? [event.organizer, ...(event.coHosts ?? [])],
                ).map((h, idx) => (
                  <span key={`${h.primary}-${idx}`}>
                    {idx > 0 && ", "}
                    {h.orgSlug ? (
                      <Link
                        to={`/orgs/${h.orgSlug}`}
                        className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {h.primary}
                      </Link>
                    ) : h.profileId && !isGuest && !h.person ? (
                      <Link
                        to={`/profile/${h.profileId}`}
                        className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {h.primary}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-900 dark:text-white">{h.primary}</span>
                    )}
                    {h.person && (
                      <span className="text-gray-600 dark:text-gray-300">
                        {" ("}
                        {h.profileId && !isGuest ? (
                          <Link
                            to={`/profile/${h.profileId}`}
                            className="hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {h.person}
                          </Link>
                        ) : (
                          h.person
                        )}
                        {")"}
                      </span>
                    )}
                  </span>
                ))}
              </p>
            )}

            {/* Description */}
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
                {event.description}
              </p>
            </div>

            {event._id === SHOWCASE_EVENT_ID && (
              <div
                className="garden-root rounded-2xl mt-6 px-5 pb-8"
                style={{ background: "var(--g-ink)" }}
              >
                <ShowcaseContent embedded />
              </div>
            )}
          </div>

          {/* Right: Join Button (desktop) — or the ticket card, when the
              event sells through a Payment Link */}
          <div
            className={`hidden md:block flex-shrink-0 ${ticketUrl ? "w-72" : "w-56"}`}
          >
            {ticketUrl ? (
              <ExternalTicketCard
                eventId={event._id}
                url={ticketUrl}
                priceCents={event.externalTicketPriceCents}
              />
            ) : rsvp.active && !cancelled ? (
              <GuestRsvpCard rsvp={rsvp} />
            ) : isPast ? (
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Event ended
                </p>
              </div>
            ) : event.userApplication ? (
              <div
                className={`p-3 rounded-xl text-center ${
                  event.userApplication.status === "accepted"
                    ? "bg-green-50 dark:bg-green-900/20"
                    : event.userApplication.status === "declined"
                      ? "bg-red-50 dark:bg-red-900/20"
                      : "bg-blue-50 dark:bg-blue-900/20"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    event.userApplication.status === "accepted"
                      ? "text-green-700 dark:text-green-300"
                      : event.userApplication.status === "declined"
                        ? "text-red-700 dark:text-red-300"
                        : "text-blue-700 dark:text-blue-300"
                  }`}
                >
                  {event.userApplication.status === "accepted"
                    ? "You're in!"
                    : event.userApplication.status === "declined"
                      ? "Declined"
                      : "Pending"}
                </p>
              </div>
            ) : canApply ? (
              event.requiresApproval ? (
                showApplyForm ? (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-3 text-sm">
                      Apply to attend
                    </h3>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Why you'd like to attend..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3 text-sm"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleApply}
                        disabled={applying}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
                      >
                        {applying ? "Applying..." : "Submit"}
                      </button>
                      <button
                        onClick={() => setShowApplyForm(false)}
                        className="py-2 text-gray-600 dark:text-gray-400 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowApplyForm(true)}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                  >
                    Apply to Attend
                  </button>
                )
              ) : showJoinForm ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3 text-sm">
                    Join this event
                  </h3>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Share why you're excited! (optional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3 text-sm"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleJoin}
                      disabled={joining}
                      className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      {joining ? "Joining..." : "Join"}
                    </button>
                    <button
                      onClick={() => {
                        setShowJoinForm(false);
                        setMessage("");
                      }}
                      className="py-2 text-gray-600 dark:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowJoinForm(true)}
                  className="w-full py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                >
                  Join Event
                </button>
              )
            ) : showGuestRsvp ? (
              <GuestRsvpCard rsvp={rsvp} />
            ) : null}
          </div>
        </div>

        {/* Video: join link + recording (docs/gated-event-video-prd.md).
            The URLs live in the separate eventVideo table and arrive only
            through api.eventVideo.get, which resolves a role first — they
            are never on the event document this page already has. */}
        {ticketUrl && <TicketSessionClaimer />}
        {ticketUrl && (
          <div className="md:hidden mb-8">
            <ExternalTicketCard
              eventId={event._id}
              url={ticketUrl}
              priceCents={event.externalTicketPriceCents}
            />
          </div>
        )}

        <EventVideoSection
          eventId={event._id}
          title={event.title}
          datetime={event.datetime}
          cancelled={cancelled}
          mode="details"
        />

        {/* Add to calendar — the invite carries /j/{eventId}, not the room */}
        {!hasStarted && !cancelled && (
          <AddToCalendar
            className="mb-8"
            event={{
              eventId: event._id,
              title: event.title,
              description: event.description,
              datetime: event.datetime,
              location: event.location,
              updatedAt: event.updatedAt,
            }}
          />
        )}

        {/* Gallery Images - show first for visual appeal */}
        {event.galleryImageUrls &&
          event.galleryImageUrls.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Photos
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {event.galleryImageUrls.map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                  >
                    <ImageFill src={url} alt="" />
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Mobile Join Button - between description/gallery and location.
            A ticketed event shows its ticket card above the video instead. */}
        <div className={ticketUrl ? "hidden" : "md:hidden mb-8"}>
          {rsvp.active && !cancelled ? (
            <GuestRsvpCard rsvp={rsvp} />
          ) : isPast ? (
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl text-center">
              <p className="text-gray-500 dark:text-gray-400">
                This event has ended
              </p>
            </div>
          ) : event.userApplication ? (
            <div
              className={`p-4 rounded-xl ${
                event.userApplication.status === "accepted"
                  ? "bg-green-50 dark:bg-green-900/20"
                  : event.userApplication.status === "declined"
                    ? "bg-red-50 dark:bg-red-900/20"
                    : "bg-blue-50 dark:bg-blue-900/20"
              }`}
            >
              <p
                className={`font-medium ${
                  event.userApplication.status === "accepted"
                    ? "text-green-700 dark:text-green-300"
                    : event.userApplication.status === "declined"
                      ? "text-red-700 dark:text-red-300"
                      : "text-blue-700 dark:text-blue-300"
                }`}
              >
                {event.userApplication.status === "accepted"
                  ? "You're in! See you there."
                  : event.userApplication.status === "declined"
                    ? "Your application was declined"
                    : "Your application is pending approval"}
              </p>
            </div>
          ) : canApply ? (
            event.requiresApproval ? (
              showApplyForm ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                    Apply to attend
                  </h3>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell the organizer why you'd like to attend..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applying ? "Applying..." : "Submit Application"}
                    </button>
                    <button
                      onClick={() => setShowApplyForm(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowApplyForm(true)}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  Apply to Attend
                </button>
              )
            ) : showJoinForm ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                  Join this event
                </h3>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share why you're excited to attend! (optional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {joining ? "Joining..." : "Join Event"}
                  </button>
                  <button
                    onClick={() => {
                      setShowJoinForm(false);
                      setMessage("");
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowJoinForm(true)}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                Join Event
              </button>
            )
          ) : showGuestRsvp ? (
            <GuestRsvpCard rsvp={rsvp} />
          ) : null}
        </div>

        {/* Tickets */}
        {event.ticketTiers && event.ticketTiers.length > 0 && (
          <TicketsCard
            eventId={event._id}
            tiers={event.ticketTiers}
            soldByTier={event.ticketsSoldByTier}
            isPast={hasStarted}
          />
        )}

        {/* Location Map */}
        {event.location && event.locationType !== "online" && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Location
            </h3>
            <LocationMapCard
              location={event.location}
              coordinates={event.coordinates ?? undefined}
            />
          </div>
        )}

        </>
        )}

        {/* Attendees - Partiful style grid */}
        {tab === "going" && (!attendees || attendees.length === 0) && (
          <p className="text-[15px] text-gray-700 dark:text-gray-200">
            {attendees ? "No one yet." : "Loading..."}
          </p>
        )}
        {tab === "going" && isGuest && attendees && attendees.length > 0 && (
          <p className="text-[15px] text-gray-700 dark:text-gray-200 mb-8">
            {attendees.reduce((n, a) => n + 1 + a.extraTickets, 0)} going.{" "}
            <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
              Sign in to see who
            </Link>
          </p>
        )}
        {tab === "going" && !isGuest && attendees && attendees.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Going ({attendees.reduce((n, a) => n + 1 + a.extraTickets, 0)})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attendees.map((attendee) => (
                <div
                  key={attendee.key}
                  className="flex items-center gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
                >
                  {/* Same reason as the organizer above: no /profile links
                      for a guest, who can't reach that route. */}
                  {attendee.profileId && !isGuest ? (
                    <Link
                      to={`/profile/${attendee.profileId}`}
                      className="flex-shrink-0"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-gray-900">
                        {attendee.imageUrl ? (
                          <img
                            src={attendee.imageUrl}
                            alt={attendee.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-medium text-gray-500">
                            {attendee.name.charAt(0)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-gray-900">
                      <span className="text-xs font-medium text-gray-500">
                        {attendee.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {attendee.profileId && !isGuest ? (
                      <Link
                        to={`/profile/${attendee.profileId}`}
                        className="block text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      >
                        {attendee.name}
                      </Link>
                    ) : (
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">
                        {attendee.name}
                      </span>
                    )}
                    {attendee.extraTickets > 0 && (
                      <span className="block text-[12px] text-gray-600 dark:text-gray-300">
                        +{attendee.extraTickets} {attendee.extraTickets === 1 ? "guest" : "guests"}
                      </span>
                    )}
                    {attendee.message && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {attendee.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "guests" && isHost && (
          <GuestsPanel eventId={event._id} title={event.title} />
        )}

        {tab === "setup" && isHost && (
          <div>
            <div className="mb-8">
              <button
                onClick={() => setShowEditForm(true)}
                className="px-4 py-2 rounded-lg text-[13.5px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Edit event details
              </button>
            </div>
            <EventVideoSection
              eventId={event._id}
              title={event.title}
              datetime={event.datetime}
              cancelled={cancelled}
              mode="setup"
            />
            <EventImageManager eventId={event._id} event={event} />
          </div>
        )}

        {tab === "hosts" && isHost && (
          <HostsPanel
            eventId={event._id}
            organizer={event.organizer}
            coHosts={event.coHosts ?? []}
            organizerUserId={event.organizerId}
            savedShown={event.displayHostRows ?? []}
            isOrganizer={!!event.isOrganizer}
            isGuest={isGuest}
          />
        )}
      </div>

      {/* Edit Form Modal */}
      {showEditForm && (
        <CreateEventModal
          edit={{
            eventId: event._id,
            canEditTickets: !!event.isOrganizer,
            coverImageUrl: event.coverImageUrl,
            initialValues: {
            title: event.title,
            description: event.description,
            datetime: event.datetime,
            endTime: event.endTime,
            location: event.location,
            ticketTiers: event.ticketTiers,
            externalTicketUrl: event.externalTicketUrl,
            externalTicketPriceCents: event.externalTicketPriceCents,
            locationType: event.locationType,
            address: event.address,
            coordinates: event.coordinates,
            placeId: event.placeId,
            tags: event.tags,
            requiresApproval: event.requiresApproval,
            mediaUrl: event.mediaUrl,
            hostOrgId: event.hostOrgId,
            },
          }}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// RSVP for a signed-out visitor — the counterpart to Apply/Join above.
//
// Nobody RSVPs without an account (owner's rule), so this is a one-step
// sign-up: name + email (or phone), a 6-digit code, and the code signs them
// in (creating the account if needed) and saves the RSVP. Codes come from
// convex/auth.ts's "email-otp" and "phone" providers; the RSVP itself is
// garden/eventRsvps.ts's rsvpToEvent, which needs the signed-in account.
// Paid tickets don't come through here (ExternalTicketCard, Stripe).
// ——————————————————————————————————————————————————————————————

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rsvpErrorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | string | undefined;
    if (typeof data === "string" && data) return data;
    if (data && typeof data === "object" && data.reason) return data.reason;
  }
  return "Something went wrong — try again.";
}

function isNotSignedInError(err: unknown): boolean {
  return (
    err instanceof ConvexError &&
    typeof err.data === "object" &&
    err.data !== null &&
    (err.data as { code?: string }).code === "not_signed_in"
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function useGuestRsvp(eventId: Id<"events"> | undefined) {
  const { signIn } = useAuthActions();
  // The code sign-in resolves before the Convex client is sending the new
  // token, so saving waits until the client reports it's authenticated.
  const { isAuthenticated } = useConvexAuth();
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const rsvpToEvent = useMutation(api.garden.eventRsvps.rsvpToEvent);
  const fillMissingBasics = useMutation(api.profiles.fillMissingBasics);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // "Use my phone instead": the code goes by text, and the email field
  // stays because every account needs an email.
  const [usePhone, setUsePhone] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"details" | "code" | "done">("details");
  // The address the code went to, as shown on step 2 and sent back with it.
  const [sentTo, setSentTo] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ alreadyRsvpd: boolean } | null>(null);

  const trimmedName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const valid =
    trimmedName.length > 0 &&
    EMAIL_RE.test(cleanEmail) &&
    (!usePhone || phone.trim().length > 0);
  const codeValid = /^\d{6}$/.test(code.trim());

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!eventId || submitting) return;
    if (!trimmedName) return setError("Add your name.");
    if (!EMAIL_RE.test(cleanEmail)) return setError("Add an email we can reach you at.");

    let destination = cleanEmail;
    let phoneValue = "";
    if (usePhone) {
      const normalized = normalizePhone(phone);
      if (!normalized.ok) return setError(normalized.reason);
      phoneValue = normalized.value;
      destination = phoneValue;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (usePhone) await signIn("phone", { phone: phoneValue, ...codeRequestParams() });
      else await signIn("email-otp", { email: cleanEmail, ...codeRequestParams() });
      setSentTo(destination);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(
        err instanceof ConvexError
          ? rsvpErrorMessage(err)
          : "Couldn't send a code. Check it and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function saveRsvp() {
    if (!eventId) return;
    // Wait (up to ~8s) for the client to be sending the new sign-in.
    for (let i = 0; i < 80 && !isAuthenticatedRef.current; i++) await sleep(100);
    // Then retry briefly on "not signed in" in case the server lags a beat.
    for (let attempt = 0; ; attempt++) {
      try {
        // Only fills a blank name / missing email; never overwrites a
        // returning member's profile (unlike upsertProfile).
        await fillMissingBasics({ name: trimmedName, email: cleanEmail });
        const res = await rsvpToEvent({ eventId, name: trimmedName });
        setDone({ alreadyRsvpd: res.alreadyRsvpd });
        setStep("done");
        return;
      } catch (err) {
        const notReady =
          isNotSignedInError(err) ||
          (err instanceof Error && err.message.includes("Not authenticated"));
        if (notReady && attempt < 6) {
          await sleep(500);
          continue;
        }
        throw err;
      }
    }
  }

  async function confirm(e?: FormEvent) {
    e?.preventDefault();
    if (!eventId || submitting || !codeValid) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!signedIn) {
        try {
          if (usePhone) await signIn("phone", { phone: sentTo, code: code.trim() });
          else await signIn("email-otp", { email: sentTo, code: code.trim() });
        } catch {
          setError("That code didn't work. Check it and try again, or send a new one.");
          return;
        }
        setSignedIn(true);
      }
      await saveRsvp();
    } catch (err) {
      // Signed in but the RSVP didn't save: the code is spent, so the button
      // retries just the save.
      setError(rsvpErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function changeAddress() {
    setStep("details");
    setCode("");
    setError(null);
  }

  return {
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    usePhone,
    setUsePhone,
    code,
    setCode,
    step,
    sentTo,
    submitting,
    error,
    done,
    valid,
    codeValid,
    // True once the visitor is past step 1. From then on the card stays put
    // even though the page now sees a signed-in viewer.
    active: step !== "details",
    sendCode,
    confirm,
    changeAddress,
  };
}

type GuestRsvpState = ReturnType<typeof useGuestRsvp>;

const GUEST_INPUT_CLASS =
  "w-full px-3 py-2 border border-gray-400 dark:border-gray-600 rounded-lg " +
  "focus:ring-2 focus:ring-green-500 focus:border-transparent " +
  "bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";

const GUEST_LINK_CLASS =
  "text-sm text-gray-900 dark:text-gray-100 underline underline-offset-2 hover:no-underline";

/** Rendered twice (desktop rail + mobile block), same as the Join button it
 *  stands in for. State lives in the parent so the two stay in sync. */
function GuestRsvpCard({ rsvp }: { rsvp: GuestRsvpState }) {
  if (rsvp.step === "done" && rsvp.done) {
    return (
      <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20">
        <p className="font-medium text-green-900 dark:text-green-100">
          You're in
        </p>
        <p className="mt-1 text-sm text-green-900 dark:text-green-100">
          {rsvp.done.alreadyRsvpd
            ? "You were already on the list. Your spot is saved."
            : "Your spot is saved to your account. We'll email you the details."}
        </p>
      </div>
    );
  }

  if (rsvp.step === "code") {
    return (
      <form
        onSubmit={rsvp.confirm}
        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
      >
        <h3 className="font-medium text-gray-900 dark:text-white text-sm">
          Enter your code
        </h3>
        <p className="mt-1 mb-3 text-sm text-gray-800 dark:text-gray-200">
          We sent a code to {rsvp.sentTo}.
        </p>
        <input
          className={GUEST_INPUT_CLASS}
          value={rsvp.code}
          onChange={(e) => rsvp.setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit code"
          aria-label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
        />
        <button
          type="submit"
          disabled={!rsvp.codeValid || rsvp.submitting}
          className="mt-3 w-full py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {rsvp.submitting ? "Saving…" : "Confirm my seat"}
        </button>
        {rsvp.error && (
          <p className="mt-2 text-sm text-red-800 dark:text-red-200">
            {rsvp.error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => void rsvp.sendCode()}
            disabled={rsvp.submitting}
            className={GUEST_LINK_CLASS}
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={rsvp.changeAddress}
            className={GUEST_LINK_CLASS}
          >
            {rsvp.usePhone ? "Change phone" : "Change email"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={rsvp.sendCode}
      className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
    >
      <h3 className="font-medium text-gray-900 dark:text-white text-sm">
        RSVP
      </h3>
      <p className="mt-1 mb-3 text-sm text-gray-800 dark:text-gray-200">
        We'll send you a code. Entering it makes your account and saves your
        spot.
      </p>
      <input
        className={GUEST_INPUT_CLASS}
        value={rsvp.name}
        onChange={(e) => rsvp.setName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        autoComplete="name"
      />
      <div className="mt-2">
        <input
          className={GUEST_INPUT_CLASS}
          type="email"
          value={rsvp.email}
          onChange={(e) => rsvp.setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Your email"
          autoComplete="email"
        />
      </div>
      {rsvp.usePhone && (
        <div className="mt-2">
          <input
            className={GUEST_INPUT_CLASS}
            type="tel"
            value={rsvp.phone}
            onChange={(e) => rsvp.setPhone(e.target.value)}
            placeholder="Mobile number"
            aria-label="Your mobile number"
            autoComplete="tel"
          />
        </div>
      )}
      <button
        type="submit"
        disabled={!rsvp.valid || rsvp.submitting}
        className="mt-3 w-full py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {rsvp.submitting ? "Sending…" : "Send my code"}
      </button>
      <button
        type="button"
        onClick={() => rsvp.setUsePhone(!rsvp.usePhone)}
        className={`mt-3 ${GUEST_LINK_CLASS}`}
      >
        {rsvp.usePhone ? "Use my email instead" : "Use my phone instead"}
      </button>
      {/* Members sign in the usual way: a code sign-in on a password
          account replaces the password, and a phone-only member would get
          a second account. After sign-in they come back here (pendingIntent). */}
      <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
        Already have an account?{" "}
        <Link
          to="/login"
          onClick={() => setPendingIntent(window.location.pathname)}
          className={GUEST_LINK_CLASS}
        >
          Sign in
        </Link>
      </p>
      {rsvp.error && (
        <p className="mt-2 text-sm text-red-800 dark:text-red-200">
          {rsvp.error}
        </p>
      )}
    </form>
  );
}

// ——————————————————————————————————————————————————————————————
// Video section — docs/gated-event-video-prd.md.
//
// api.eventVideo.get is the single query in the codebase that may return a
// meeting or recording URL, and it resolves the viewer's role before it
// does. This component renders whatever came back; it makes no access
// decision of its own, and there is nothing to strip here because a role
// that isn't allowed to see a URL never receives one.
//
// Free/public events only this pass (PRD "Build order"): every viewer of a
// public event resolves to "entitled", so the Join button below is shown to
// everyone. That is not a gate and the copy must not imply one (Criticism
// #3). The "none" branch exists only for the paid path, which no UI drives.
// ——————————————————————————————————————————————————————————————

const DAY_MS = 24 * 60 * 60 * 1000;

// A YouTube or Vimeo link plays inline; everything else keeps the link-out
// button. That split is not a preference — Zoom and Meet send frame-ancestors
// headers, so framing them renders a silent empty box. app/lib/videoEmbed.ts
// makes the call and fails closed to "not embeddable".
//
// Embedding changes nothing about WHO holds a URL. The string handed to the
// iframe is the same one api.eventVideo.get already decided this viewer may
// have; a viewer who resolves to "none" never reaches this code with a URL in
// hand, because there is no URL in the payload to reach it with.
const EMBED_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";

function VideoPlayer({ embedUrl, title }: { embedUrl: string; title: string }) {
  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-black">
      <iframe
        src={embedUrl}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow={EMBED_ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/** Secondary escape hatch under an embed — some people want the provider's
 * own tab (chat, quality controls, casting), and the embed shouldn't be the
 * only way in. */
function OpenInNewTab({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:underline"
    >
      {children}
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  );
}

function EventVideoSection({
  eventId,
  title,
  datetime,
  cancelled,
  mode,
}: {
  eventId: Id<"events">;
  title: string;
  datetime: number;
  cancelled: boolean;
  /** "setup" = host inputs only; "details" = the player, for whoever has a
   * playable link or recording (hosts included). */
  mode: "details" | "setup";
}) {
  const video = useQuery(api.eventVideo.get, { eventId });

  if (!video) return null;
  if (mode === "setup") {
    if (video.role !== "organizer") return null;
    return (
      <OrganizerVideoManager
        eventId={eventId}
        meetingUrl={video.meetingUrl}
        recordingUrl={video.recordingUrl}
      />
    );
  }
  if (video.role !== "entitled" && video.role !== "organizer") return null;

  // The room stays reachable through the end of the day after the event —
  // sessions run long, and nothing in the codebase ever marks an event
  // "completed" to tell us otherwise (PRD Criticism #4).
  const roomIsLive = !cancelled && Date.now() < datetime + DAY_MS;
  const showJoin = roomIsLive && !!video.meetingUrl;
  // The "Live" badge waits for the start time (Rick, 2026-10-01): the join
  // link is shown ahead of time so people can find it, but nothing is live
  // until the event starts.
  const hasStarted = Date.now() >= datetime;

  // The live room wins the frame while it's live; the recording only takes it
  // once the room is done, which is also the only time the heading says
  // "Recording". A link that can't be framed leaves its branch null and the
  // original button renders instead.
  const liveEmbed = showJoin ? toEmbedUrl(video.meetingUrl) : null;
  const recordingEmbed = showJoin ? null : toEmbedUrl(video.recordingUrl);

  if (!showJoin && !video.recordingUrl) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {showJoin ? "Join online" : "Recording"}
        </h3>
        {liveEmbed && hasStarted && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600 text-white text-[12px] font-semibold uppercase tracking-[0.08em]">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            Live
          </span>
        )}
      </div>

      {liveEmbed ? (
        <div>
          <VideoPlayer embedUrl={liveEmbed.embedUrl} title={`${title} — live`} />
          {/* The proxy, never the raw URL — the redirect target can change
              without invalidating anything already handed out. */}
          <OpenInNewTab href={`/j/${eventId}`}>Open the room in a new tab</OpenInNewTab>
        </div>
      ) : recordingEmbed && video.recordingUrl ? (
        <div>
          <VideoPlayer
            embedUrl={recordingEmbed.embedUrl}
            title={`${title} — recording`}
          />
          <OpenInNewTab href={video.recordingUrl}>
            Open the recording in a new tab
          </OpenInNewTab>
        </div>
      ) : null}

      {/* Buttons for whatever didn't get framed: a Zoom/Meet room, and the
          recording whenever the live room is holding the frame. */}
      <div className="flex flex-wrap gap-2">
        {showJoin && !liveEmbed && (
          <a
            href={`/j/${eventId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Join the room
          </a>
        )}
        {video.recordingUrl && !recordingEmbed && (
          <a
            href={video.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Watch the recording
          </a>
        )}
      </div>
    </div>
  );
}

function OrganizerVideoManager({
  eventId,
  meetingUrl,
  recordingUrl,
}: {
  eventId: Id<"events">;
  meetingUrl?: string;
  recordingUrl?: string;
}) {
  const setEventVideo = useMutation(api.eventVideo.setEventVideo);
  const postEventRecording = useMutation(api.eventVideo.postEventRecording);

  return (
    <div
      className="mb-8 rounded-2xl border p-4"
      style={{
        borderColor: "var(--garden-hairline)",
        backgroundColor: "var(--garden-ink-raised)",
      }}
    >
      <h3
        className="font-semibold mb-1"
        style={{
          color: "var(--garden-paper)",
          fontFamily: "var(--garden-font-display)",
        }}
      >
        Video
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--garden-dim)" }}>
        Run the session wherever you already do — YouTube Live, Zoom, Meet.
        Attendees see a Join button that points at{" "}
        <code className="text-xs">
          {joinProxyUrl(eventId).replace(/^https?:\/\//, "")}
        </code>
        , so you can repaste the link any time without breaking calendar
        invites.
      </p>
      <p className="text-sm mb-4" style={{ color: "var(--garden-dim)" }}>
        A YouTube or Vimeo link plays right here on the event page. Zoom, Meet
        and anything else open in a new tab — they refuse to be embedded.
      </p>

      <VideoLinkField
        label="Join link"
        placeholder="https://zoom.us/j/… or https://youtube.com/live/…"
        initialValue={meetingUrl ?? ""}
        savedLabel="Join link saved"
        onSave={(value) => setEventVideo({ eventId, meetingUrl: value })}
        suggestion={{
          label: YOUTUBE_LIVE_LABEL,
          value: YOUTUBE_LIVE_URL,
          // The channel's /live URL always resolves to whatever is streaming
          // right now, so it can be set weeks ahead and never needs repasting
          // when a broadcast is rescheduled or recreated.
          hint: "Always points at whatever the channel is streaming — set it now, it won't go stale.",
        }}
      />

      <div className="mt-4">
        <VideoLinkField
          label="Recording link"
          placeholder="Paste the replay link after the session"
          initialValue={recordingUrl ?? ""}
          savedLabel="Recording posted"
          onSave={(value) => postEventRecording({ eventId, recordingUrl: value })}
        />
      </div>

      <p className="mt-4 text-xs" style={{ color: "var(--garden-dim)" }}>
        This is a public event, so anyone on the event page can open the link.
        It is a convenience, not a gate.
      </p>
    </div>
  );
}

function VideoLinkField({
  label,
  placeholder,
  initialValue,
  savedLabel,
  onSave,
  suggestion,
}: {
  label: string;
  placeholder: string;
  initialValue: string;
  savedLabel: string;
  onSave: (value: string) => Promise<unknown>;
  /** One-click default. Fills the field but does not save — the organizer
   * still reviews and hits Save, same as a pasted link. */
  suggestion?: { label: string; value: string; hint?: string };
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Reset when the server value changes underneath an untouched field.
  const [lastInitial, setLastInitial] = useState(initialValue);
  if (lastInitial !== initialValue) {
    setLastInitial(initialValue);
    setValue(initialValue);
  }

  const dirty = value.trim() !== initialValue.trim();

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(value.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(videoErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label
        className="block text-sm font-medium mb-1.5"
        style={{ color: "var(--garden-paper)" }}
      >
        {label}
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {suggestion && value.trim() !== suggestion.value && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setValue(suggestion.value)}
            className="text-xs font-medium underline underline-offset-2"
            style={{ color: "var(--garden-citron)" }}
          >
            {suggestion.label}
          </button>
          {suggestion.hint && (
            <span className="ml-2 text-xs" style={{ color: "var(--garden-dim)" }}>
              {suggestion.hint}
            </span>
          )}
        </div>
      )}
      {error && (
        <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {saved && !error && (
        <p className="mt-1.5 text-sm text-green-700 dark:text-green-300">
          {savedLabel}
        </p>
      )}
    </div>
  );
}

function videoErrorMessage(err: unknown): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "reason" in data) {
    return String((data as { reason: unknown }).reason);
  }
  return "Something went wrong — try again.";
}

/** "Tickets" card — one row per paid tier, each with its own Stripe Checkout
    buy button (one-time payment; recorded by the webhook into
    ticketPurchases). Free RSVPs/applications work unchanged alongside. */
function TicketsCard({
  eventId,
  tiers,
  soldByTier,
  isPast,
}: {
  eventId: Id<"events">;
  tiers: TicketTier[];
  soldByTier?: Record<string, number>;
  isPast: boolean;
}) {
  const createTicketCheckout = useAction(api.garden.stripe.createTicketCheckout);
  const [buyingTier, setBuyingTier] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleBuy(tierName: string) {
    setError("");
    setBuyingTier(tierName);
    try {
      const { url } = await createTicketCheckout({ eventId, tierName });
      window.location.href = url;
    } catch (err) {
      console.error("Ticket checkout failed:", err);
      setError("Couldn't start checkout. Please try again.");
      setBuyingTier(null);
    }
  }

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Tickets
      </h3>
      {error && (
        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}
      <div className="space-y-2">
        {tiers.map((tier) => {
          const sold = soldByTier?.[tier.name] ?? 0;
          const soldOut = tier.quantity !== undefined && sold >= tier.quantity;
          return (
            <div
              key={tier.name}
              className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">
                  {tier.name}{" "}
                  <span className="text-gray-500 dark:text-gray-400 font-normal">
                    · {formatTierPrice(tier.priceCents)}
                  </span>
                </p>
                {tier.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {tier.description}
                  </p>
                )}
                {tier.quantity !== undefined && !soldOut && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {tier.quantity - sold} left
                  </p>
                )}
              </div>
              {isPast ? null : soldOut ? (
                <span className="flex-shrink-0 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-lg text-sm font-medium">
                  Sold out
                </span>
              ) : (
                <button
                  onClick={() => handleBuy(tier.name)}
                  disabled={buyingTier !== null}
                  className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {buyingTier === tier.name
                    ? "Redirecting..."
                    : `Buy ${formatTierPrice(tier.priceCents)}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// External ticket card — sells through an AP Payment Link instead of the
// platform's own checkout (garden/apGifts.ts). The link carries the
// signed-in viewer's userId/email when known (buildTicketLink) so AP's
// webhook can add them to the event without asking them to type anything
// on Stripe's page; a guest just gets a plain link and RSVPs by whatever
// email they enter at checkout. Opens in the same tab — the Payment Link's
// own "After payment" redirect (set in the Stripe dashboard, see
// docs/phase-1b/stripe-runbook.md) brings them back here with `?paid=1`.
// ——————————————————————————————————————————————————————————————

// Back from Stripe with ?session=<checkout session id>: remember it, and
// once signed in hand it to claimTicketBySession so the ticket lands on
// this account whatever email was used to pay. The webhook can arrive a
// few seconds after the redirect, so a not-yet-saved ticket is retried
// for about half a minute (and again on the next signed-in page load —
// see _app.tsx).
function TicketSessionClaimer() {
  const { isAuthenticated } = useConvexAuth();
  const claim = useMutation(api.garden.eventRsvps.claimTicketBySession);
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  useEffect(() => {
    if (sessionId) stashTicketSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let tries = 0;
    async function run() {
      const waiting = await claimPendingTickets(claim);
      tries += 1;
      if (waiting && !cancelled && tries < 10) setTimeout(run, 3000);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, claim]);

  return null;
}

function ExternalTicketCard({
  eventId,
  url,
  priceCents,
}: {
  eventId: Id<"events">;
  url: string;
  priceCents?: number;
}) {
  const profile = useQuery(api.profiles.getMyProfile);
  const myRsvp = useQuery(api.garden.eventRsvps.getMyRsvpStatus, { eventId });
  const { isAuthenticated } = useConvexAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get("paid") === "1";

  const cardStyle = {
    backgroundColor: "var(--garden-ink-raised)",
    border: "1px solid var(--garden-hairline-raised)",
  };

  if (myRsvp?.paidCents) {
    return (
      <div className="p-5 rounded-xl" style={cardStyle}>
        <p style={{ color: "var(--garden-citron)", fontSize: 17, fontWeight: 600, margin: 0 }}>
          You're in
        </p>
        <p style={{ color: "var(--garden-body)", fontSize: 14, margin: "4px 0 0" }}>
          {myRsvp.ticketCount && myRsvp.ticketCount > 1
            ? `${myRsvp.ticketCount} tickets confirmed. See you there.`
            : "Ticket confirmed. See you there."}
        </p>
      </div>
    );
  }

  const href = buildTicketLink(url, eventId, {
    userId: profile?.userId ? String(profile.userId) : undefined,
    email: profile?.email ?? undefined,
  });

  return (
    <div className="p-5 rounded-xl" style={cardStyle}>
      {justPaid && !isAuthenticated ? (
        <>
          <p style={{ color: "var(--garden-citron)", fontSize: 17, fontWeight: 600, margin: 0 }}>
            You're in
          </p>
          <p style={{ color: "var(--garden-body)", fontSize: 14, margin: "4px 0 16px" }}>
            Payment received. Stripe is emailing your receipt.
          </p>
          <button
            type="button"
            onClick={() => {
              setPendingIntent(`/events/${eventId}`);
              // The ticket stands in for an invite (signup.tsx).
              const session = searchParams.get("session");
              navigate(isCheckoutSessionId(session) ? `/signup/${session}` : "/signup");
            }}
            className="block w-full text-center rounded-lg transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--garden-citron)",
              color: "#141414",
              fontSize: 15,
              fontWeight: 700,
              padding: "12px 16px",
            }}
          >
            Make an account to see who's going
          </button>
        </>
      ) : justPaid ? (
        <p style={{ color: "var(--garden-paper)", fontSize: 15, margin: 0 }}>
          Payment received. Your ticket will show here within a minute.
        </p>
      ) : (
        <>
          <p style={{ color: "var(--garden-dim)", fontSize: 13, margin: 0 }}>
            Admission
          </p>
          {priceCents ? (
            <p
              style={{
                color: "var(--garden-paper)",
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1.1,
                margin: "2px 0 16px",
              }}
            >
              {formatTierPrice(priceCents)}
            </p>
          ) : (
            <div style={{ height: 12 }} />
          )}
          <a
            href={href}
            className="block w-full text-center rounded-lg transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "var(--garden-citron)",
              color: "#141414",
              fontSize: 16,
              fontWeight: 700,
              padding: "14px 16px",
            }}
          >
            Buy tickets
          </a>
          <p style={{ color: "var(--garden-dim)", fontSize: 13, margin: "10px 0 0" }}>
            Secure checkout with Stripe.
          </p>
        </>
      )}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Host tabs: Guests and Hosts.
// ——————————————————————————————————————————————————————————————

type GuestFilter = "going" | "pending" | "declined";

function GuestsPanel({ eventId, title }: { eventId: Id<"events">; title: string }) {
  const guests = useQuery(api.events.getGuestList, { eventId });
  const setStatus = useMutation(api.events.updateApplicationStatus);
  const [filter, setFilter] = useState<GuestFilter>("going");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (guests === undefined) {
    return <p className="text-[15px] text-gray-700 dark:text-gray-200">Loading...</p>;
  }

  const summary = summarizeGuests(guests);
  const by = (s: GuestFilter) => guests.filter((g) => g.status === s);
  const shown = by(filter);
  const tabs: { id: GuestFilter; label: string }[] = [
    { id: "going", label: `Going ${summary.going}` },
    { id: "pending", label: `Waiting for approval ${by("pending").length}` },
    { id: "declined", label: `Not going ${by("declined").length}` },
  ];

  function downloadCsv() {
    if (!guests) return;
    const blob = new Blob([guestsToCsv(guests)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}-guests.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function decide(applicationId: string, status: "accepted" | "declined") {
    setBusyId(applicationId);
    try {
      await setStatus({ applicationId: applicationId as Id<"eventApplications">, status });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-[15px] font-medium text-gray-900 dark:text-white">
          {summary.paid} paid · {formatDollars(summary.collectedCents)} collected
        </p>
        <button
          onClick={downloadCsv}
          disabled={guests.length === 0}
          className="px-4 py-2 rounded-lg text-[13.5px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Download CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={filter === t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-full text-[13.5px] font-medium ${
              filter === t.id
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-[15px] text-gray-700 dark:text-gray-200 mb-8">
          {filter === "going" ? "No one yet." : "No one here."}
        </p>
      ) : (
        <ul className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 mb-8">
          {shown.map((g) => (
            <li key={g.key} className="px-3 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] text-gray-900 dark:text-white">
                  {g.name}
                  {g.tickets > 1 && (
                    <span className="ml-2 text-[13.5px] text-gray-700 dark:text-gray-200">
                      +{g.tickets - 1} {g.tickets === 2 ? "guest" : "guests"}
                    </span>
                  )}
                </p>
                <p className="text-[13.5px] text-gray-700 dark:text-gray-200 break-all">
                  {g.email || "No email"}
                  {" · "}
                  {g.paidCents != null && g.paidCents > 0 ? `Paid ${formatDollars(g.paidCents)}` : "Free"}
                  {" · "}
                  {new Date(g.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
                {g.guestNames && (
                  <p className="text-[13.5px] text-gray-700 dark:text-gray-200">With {g.guestNames}</p>
                )}
              </div>
              {g.applicationId && filter !== "going" && (
                <div className="flex gap-2">
                  {filter === "pending" && (
                    <button
                      disabled={busyId === g.applicationId}
                      onClick={() => decide(g.applicationId!, "accepted")}
                      className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {filter === "pending" && (
                    <button
                      disabled={busyId === g.applicationId}
                      onClick={() => decide(g.applicationId!, "declined")}
                      className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  )}
                  {filter === "declined" && (
                    <button
                      disabled={busyId === g.applicationId}
                      onClick={() => decide(g.applicationId!, "accepted")}
                      className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AnnouncementComposer targetType="event" targetId={eventId} heading="Message attendees" />
    </div>
  );
}

function PersonAvatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <span className="w-9 h-9 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{name.charAt(0)}</span>
      )}
    </span>
  );
}

function HostsPanel({
  eventId,
  organizer,
  coHosts,
  organizerUserId,
  savedShown,
  isOrganizer,
  isGuest,
}: {
  eventId: Id<"events">;
  organizer: { name: string; imageUrl: string | null; profileId: Id<"profiles"> } | null;
  coHosts: { userId: Id<"users">; name: string; imageUrl: string | null; profileId: Id<"profiles"> | null }[];
  organizerUserId: Id<"users">;
  savedShown: { kind: "user" | "org"; refId: string; name: string; imageUrl: string | null }[];
  isOrganizer: boolean;
  isGuest: boolean;
}) {
  const addCoHost = useMutation(api.events.addCoHost);
  const removeCoHost = useMutation(api.events.removeCoHost);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useQuery(
    api.garden.projectTeam.searchPeopleForInvite,
    isOrganizer && q.trim() ? { q } : "skip",
  );
  const existing = new Set(coHosts.map((c) => String(c.userId)));
  const hits = (results ?? []).filter((r) => !existing.has(String(r.userId))).slice(0, 8);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /s, "").split("\n")[0] : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    ...(organizer
      ? [{ userId: null as Id<"users"> | null, name: organizer.name, imageUrl: organizer.imageUrl, profileId: organizer.profileId as Id<"profiles"> | null, role: "Organizer" }]
      : []),
    ...coHosts.map((c) => ({ ...c, userId: c.userId as Id<"users"> | null, role: "Co-host" })),
  ];

  return (
    <div>
      <p className="text-[15px] text-gray-700 dark:text-gray-200 mb-4">
        Co-hosts can edit the event and see the guest list. Only the organizer can cancel it.
      </p>

      <ul className="mb-6 space-y-2">
        {rows.map((r) => (
          <li
            key={r.userId ?? "organizer"}
            className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
          >
            <PersonAvatar name={r.name} imageUrl={r.imageUrl} />
            <div className="flex-1 min-w-0">
              {r.profileId && !isGuest ? (
                <Link
                  to={`/profile/${r.profileId}`}
                  className="block text-[15px] font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate"
                >
                  {r.name}
                </Link>
              ) : (
                <span className="block text-[15px] font-medium text-gray-900 dark:text-white truncate">
                  {r.name}
                </span>
              )}
              <span className="text-[13px] text-gray-600 dark:text-gray-300">{r.role}</span>
            </div>
            {isOrganizer && r.userId && (
              <button
                disabled={busy}
                onClick={() => run(() => removeCoHost({ eventId, userId: r.userId! }))}
                className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOrganizer && (
        <div>
          <label htmlFor="cohost-search" className="block text-[15px] font-medium text-gray-900 dark:text-white mb-2">
            Add a co-host
          </label>
          <input
            id="cohost-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-900 dark:text-white text-[15px]"
          />
          {error && <p className="mt-2 text-[14px] text-red-600 dark:text-red-400">{error}</p>}
          {q.trim() && results !== undefined && hits.length === 0 && (
            <p className="mt-2 text-[14px] text-gray-700 dark:text-gray-200">No one found.</p>
          )}
          {hits.length > 0 && (
            <ul className="mt-2 space-y-2">
              {hits.map((h) => (
                <li key={h.userId} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <PersonAvatar name={h.name} imageUrl={h.imageUrl} />
                  <span className="flex-1 min-w-0 truncate text-[15px] text-gray-900 dark:text-white">{h.name}</span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await addCoHost({ eventId, userId: h.userId });
                        setQ("");
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ShownHostsEditor
        eventId={eventId}
        organizer={organizer}
        organizerUserId={organizerUserId}
        coHosts={coHosts}
        savedShown={savedShown}
      />
    </div>
  );
}

type ShownRow = { kind: "user" | "org"; refId: string; name: string; imageUrl: string | null };

/** Who "Hosted by" shows, and in what order: people and/or organizations.
 * Any host can set it. Display only; it changes no one's access. */
function ShownHostsEditor({
  eventId,
  organizer,
  organizerUserId,
  coHosts,
  savedShown,
}: {
  eventId: Id<"events">;
  organizer: { name: string; imageUrl: string | null } | null;
  organizerUserId: Id<"users">;
  coHosts: { userId: Id<"users">; name: string; imageUrl: string | null }[];
  savedShown: ShownRow[];
}) {
  const setDisplayHosts = useMutation(api.events.setDisplayHosts);
  const defaults: ShownRow[] = [
    ...(organizer ? [{ kind: "user" as const, refId: String(organizerUserId), name: organizer.name, imageUrl: organizer.imageUrl }] : []),
    ...coHosts.map((c) => ({ kind: "user" as const, refId: String(c.userId), name: c.name, imageUrl: c.imageUrl })),
  ];
  const custom = savedShown.length > 0;
  const [rows, setRows] = useState<ShownRow[]>(custom ? savedShown : defaults);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const people = useQuery(api.garden.projectTeam.searchPeopleForInvite, q.trim() ? { q } : "skip");
  const orgs = useQuery(api.organizations.search, q.trim() ? { q } : "skip");
  const has = (kind: string, id: string) => rows.some((r) => r.kind === kind && r.refId === id);
  const personHits = (people ?? []).filter((r) => !has("user", String(r.userId))).slice(0, 5);
  const orgHits = (orgs ?? []).filter((o) => !has("org", String(o._id))).slice(0, 5);

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    setSaved(false);
  }
  function add(r: ShownRow) {
    setRows([...rows, r]);
    setQ("");
    setSaved(false);
  }
  async function save(list: ShownRow[]) {
    setBusy(true);
    setError(null);
    try {
      await setDisplayHosts({
        eventId,
        hosts: list.map((r) =>
          r.kind === "user"
            ? { kind: "user" as const, id: r.refId as Id<"users"> }
            : { kind: "org" as const, id: r.refId as Id<"organizations"> },
        ),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*Uncaught Error: /s, "").split("\n")[0] : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "px-2.5 py-1 rounded-lg text-[13.5px] font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40";

  return (
    <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800">
      <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white mb-1">Shown as host</h3>
      <p className="text-[15px] text-gray-700 dark:text-gray-200 mb-4">
        {custom
          ? "This is who the event page and cards show, in this order."
          : "Right now the page shows the organizer, then co-hosts. Change the list to choose who shows and in what order."}
      </p>
      <ul className="space-y-2 mb-4">
        {rows.map((r, i) => (
          <li key={`${r.kind}-${r.refId}`} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
            <PersonAvatar name={r.name} imageUrl={r.imageUrl} />
            <div className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium text-gray-900 dark:text-white truncate">{r.name}</span>
              <span className="text-[13px] text-gray-600 dark:text-gray-300">
                {r.kind === "org" ? "Organization" : "Person"}
              </span>
            </div>
            <button className={btn} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r.name} up`}>
              ↑
            </button>
            <button
              className={btn}
              disabled={busy || i === rows.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${r.name} down`}
            >
              ↓
            </button>
            <button
              className={`${btn} !text-red-600 dark:!text-red-400`}
              disabled={busy}
              onClick={() => {
                setRows(rows.filter((_, k) => k !== i));
                setSaved(false);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <label htmlFor="shown-host-search" className="block text-[15px] font-medium text-gray-900 dark:text-white mb-2">
        Add a person or organization
      </label>
      <input
        id="shown-host-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg dark:bg-gray-900 dark:text-white text-[15px]"
      />
      {q.trim() && (personHits.length > 0 || orgHits.length > 0) && (
        <ul className="mt-2 space-y-2">
          {orgHits.map((o) => (
            <li key={`o-${o._id}`} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <PersonAvatar name={o.name} imageUrl={o.logoUrl} />
              <span className="flex-1 min-w-0 truncate text-[15px] text-gray-900 dark:text-white">
                {o.name} <span className="text-[13px] text-gray-600 dark:text-gray-300">Organization</span>
              </span>
              <button
                className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => add({ kind: "org", refId: String(o._id), name: o.name, imageUrl: o.logoUrl })}
              >
                Add
              </button>
            </li>
          ))}
          {personHits.map((h) => (
            <li key={`u-${h.userId}`} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <PersonAvatar name={h.name} imageUrl={h.imageUrl} />
              <span className="flex-1 min-w-0 truncate text-[15px] text-gray-900 dark:text-white">{h.name}</span>
              <button
                className="px-3 py-1.5 rounded-lg text-[13.5px] font-medium bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => add({ kind: "user", refId: String(h.userId), name: h.name, imageUrl: h.imageUrl })}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && people !== undefined && orgs !== undefined && personHits.length === 0 && orgHits.length === 0 && (
        <p className="mt-2 text-[14px] text-gray-700 dark:text-gray-200">No one found.</p>
      )}

      {error && <p className="mt-3 text-[14px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={busy || rows.length === 0}
          onClick={() => save(rows)}
          className="px-4 py-2 rounded-lg text-[13.5px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
        {custom && (
          <button
            disabled={busy}
            onClick={async () => {
              await save([]);
              setRows(defaults);
            }}
            className={btn}
          >
            Back to default
          </button>
        )}
        {saved && <span className="text-[14px] text-gray-700 dark:text-gray-200">Saved.</span>}
      </div>
    </div>
  );
}

function EventImageManager({
  eventId,
  event,
}: {
  eventId: Id<"events">;
  event: {
    coverImageUrl?: string | null;
    coverColor?: string;
    galleryImageUrls?: string[];
    imageStorageIds?: Id<"_storage">[];
  };
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveEventCoverImage = useMutation(api.files.saveEventCoverImage);
  const deleteEventCoverImage = useMutation(api.files.deleteEventCoverImage);
  const addEventGalleryImage = useMutation(api.files.addEventGalleryImage);
  const removeEventGalleryImage = useMutation(
    api.files.removeEventGalleryImage,
  );
  const updateEventCoverColor = useMutation(api.files.updateEventCoverColor);

  const [uploading, setUploading] = useState<"cover" | "gallery" | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // The hook checks the file (image, up to 20MB), frames it 4:5 and hands
  // back a small JPEG; we upload that.
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverPick = useCoverPick(async (blob) => {
    setUploading("cover");
    setCoverError(null);
    try {
      const storageId = await uploadToStorage(generateUploadUrl, blob);
      await saveEventCoverImage({ eventId, storageId });
    } catch (err) {
      console.error("Upload error:", err);
      setCoverError("Failed to upload image. Please try again.");
    } finally {
      setUploading(null);
    }
  });

  function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverError(null);
    coverPick.pick(file);
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setUploading("gallery");
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();
      await addEventGalleryImage({ eventId, storageId });
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(null);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  async function handleRemoveGalleryImage(storageId: Id<"_storage">) {
    if (!confirm("Remove this image?")) return;
    try {
      await removeEventGalleryImage({ eventId, storageId });
    } catch (err) {
      console.error("Remove error:", err);
    }
  }

  const galleryCount = event.galleryImageUrls?.length || 0;
  const canAddMoreGallery = galleryCount < 3;

  return (
    <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Event Images
      </h2>

      {/* Cover Image */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Cover Image
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
          Portrait 4:5 works best (1080 × 1350).
        </p>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverUpload}
          className="hidden"
        />
        {coverPick.picker}
        <div className="flex items-start gap-4">
          {event.coverImageUrl && (
            <CoverFrame
              src={event.coverImageUrl}
              alt="Current cover"
              className="w-32 shrink-0 rounded-lg"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploading === "cover" || coverPick.busy}
                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {uploading === "cover" || coverPick.busy
                  ? "Uploading..."
                  : event.coverImageUrl
                    ? "Change Cover"
                    : "Add Cover"}
              </button>
              {event.coverImageUrl && (
                <button
                  onClick={() => deleteEventCoverImage({ eventId })}
                  className="px-3 py-1.5 text-red-600 hover:text-red-500 text-sm font-medium"
                >
                  Remove
                </button>
              )}
            </div>
            {(coverPick.error || coverError) && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                {coverPick.error || coverError}
              </p>
            )}
          </div>
        </div>

        {/* Cover Color (shown when no cover image) */}
        {!event.coverImageUrl && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Or choose a color:
            </p>
            <div className="flex gap-2">
              {COVER_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() =>
                    updateEventCoverColor({ eventId, color: color.value })
                  }
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${color.gradient} ${
                    event.coverColor === color.value
                      ? "ring-2 ring-offset-2 ring-blue-500"
                      : ""
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Gallery Images */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Gallery ({galleryCount}/3)
        </h3>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleGalleryUpload}
          className="hidden"
        />

        <div className="grid grid-cols-3 gap-2 mb-3">
          {event.galleryImageUrls?.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 group"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => {
                  const storageId = event.imageStorageIds?.[i];
                  if (storageId) handleRemoveGalleryImage(storageId);
                }}
                className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          ))}
          {canAddMoreGallery && (
            <button
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading === "gallery"}
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              {uploading === "gallery" ? (
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent" />
              ) : (
                <svg
                  className="w-8 h-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add up to 3 photos to showcase your event
        </p>
      </div>
    </div>
  );
}

const EVENT_TAGS = [
  "Workshop",
  "Meetup",
  "Conference",
  "Networking",
  "Creative",
  "Music",
  "Film",
  "Art",
  "Writing",
  "Tech",
  "Worship",
  "Bible Study",
  "Fellowship",
  "Reading",
];
