import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { CreateEventModal } from "../components/CreateEventModal";
import { FavoriteButton } from "../components/FavoriteButton";
import { SearchInput } from "../components/SearchInput";
import { TagFilterPills } from "../components/TagFilterPills";
import { useFilterState } from "../lib/useFilterState";
import { EVENT_TAGS } from "../constants/eventTags";

// Fallback cover treatment for an event with no uploaded image. Everything
// here stays inside the ink family — the previous version picked one of five
// saturated gradients (blue/purple/emerald/orange/cyan), which read as loud
// next to Projects and Classes and, worse, was keyed off the card's INDEX in
// the list, so a card changed color whenever the grid was filtered, searched,
// or a new event pushed it along. These are keyed off the event id instead, so
// a card keeps the same face for as long as the event exists.
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

type FilterTab = "all" | "favorites";

export default function Events() {
  const {
    query: searchQuery,
    debouncedQuery,
    setQuery: setSearchQuery,
    tags: tagFilters,
    toggleTag,
    clearTags,
    searchParams,
    setSearchParams,
  } = useFilterState({ tagsParam: "tags" });

  const activeTab: FilterTab =
    searchParams.get("tab") === "favorites" ? "favorites" : "all";

  function setActiveTab(tab: FilterTab) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (tab === "favorites") params.set("tab", tab);
      else params.delete("tab");
      return params;
    });
  }

  const allEvents = useQuery(api.events.list, { upcoming: true });
  const favorites = useQuery(api.favorites.getMyFavorites, {});
  const [showCreate, setShowCreate] = useState(false);

  // Fixed canonical list (same one the create form offers), not derived from
  // which events currently happen to be tagged — a dynamic list disappears
  // entirely whenever nothing's been tagged yet, hiding the filter row.
  const tagOptions = useMemo(
    () => EVENT_TAGS.map((tag) => ({ label: tag, value: tag })),
    [],
  );

  // Client-side search filtering
  const events = useMemo(() => {
    if (!allEvents) return undefined;
    const q = debouncedQuery.trim().toLowerCase();
    let list = allEvents;
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.location && e.location.toLowerCase().includes(q)) ||
          e.tags.some((t: string) => t.toLowerCase().includes(q)),
      );
    }
    if (tagFilters.length > 0) {
      list = list.filter((e) => e.tags.some((t: string) => tagFilters.includes(t)));
    }
    return list;
  }, [allEvents, debouncedQuery, tagFilters]);

  // Get favorited event IDs
  const favoriteEventIds = new Set(
    favorites?.events
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => e.event._id) || [],
  );

  // Filter events based on active tab
  const filteredEvents =
    activeTab === "favorites"
      ? events?.filter((e) => favoriteEventIds.has(e._id))
      : events;

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Events
        </h1>
        <p className="text-[var(--garden-body)] mb-6">
          Discover and join community gatherings.
        </p>

        {/* SearchInput and TagFilterPills below are shared with /search
            (People) and are deliberately left on the older neutral styling —
            restyling them here would change a surface outside this page. */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search events by name, location, or tag..."
          className="mb-4"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("all")}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium uppercase tracking-[0.06em] whitespace-nowrap transition-colors"
              style={{
                fontFamily: "var(--garden-font-body)",
                backgroundColor:
                  activeTab === "all" ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                color: activeTab === "all" ? "var(--garden-ink)" : "var(--garden-muted)",
              }}
            >
              All events
            </button>
            <button
              onClick={() => setActiveTab("favorites")}
              className="px-3 py-1.5 rounded-lg text-[13px] font-medium uppercase tracking-[0.06em] whitespace-nowrap transition-colors flex items-center gap-1.5"
              style={{
                fontFamily: "var(--garden-font-body)",
                backgroundColor:
                  activeTab === "favorites"
                    ? "var(--garden-citron)"
                    : "var(--garden-ink-raised)",
                color:
                  activeTab === "favorites" ? "var(--garden-ink)" : "var(--garden-muted)",
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              Favorites
              {favoriteEventIds.size > 0 && <span>({favoriteEventIds.size})</span>}
            </button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={{
              fontFamily: "var(--garden-font-body)",
              backgroundColor: "var(--garden-citron)",
              color: "var(--garden-ink)",
            }}
          >
            + Create event
          </button>
        </div>

        {tagOptions.length > 0 && (
          <TagFilterPills
            options={tagOptions}
            active={tagFilters}
            onToggle={toggleTag}
            onClear={clearTags}
            className="mb-6"
          />
        )}

        {filteredEvents === undefined ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{
                borderColor: "var(--garden-citron)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--garden-muted)" }}>
            <p className="text-lg font-medium mb-1" style={{ color: "var(--garden-body)" }}>
              {activeTab === "favorites"
                ? "No favorited events"
                : "No upcoming events"}
            </p>
            <p className="text-sm">
              {activeTab === "favorites"
                ? "Heart an event to save it here"
                : "Be the first to create an event for the community"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((event) => (
              <EventCard key={event._id} event={event} />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function EventCard({ event }: { event: any }) {
  const priceCents =
    event.accessType === "paid" && event.priceCents > 0 ? event.priceCents : null;

  // Date only, no time: this renders during SSR as well as on the client, and
  // a timezone-sensitive time string is the kind of thing that hydrates
  // differently on the server. The detail page carries the start time.
  const dateLabel = new Date(event.datetime).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Link to={`/events/${event._id}`} className="block h-full">
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
              {event.attendeeCount > 0
                ? `${event.attendeeCount} going`
                : "Be the first to join"}
            </span>
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
    </Link>
  );
}
