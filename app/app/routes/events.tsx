import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { CreateEventModal } from "../components/CreateEventModal";
import { EventCard } from "../components/EventCard";
import { SearchInput } from "../components/SearchInput";
import { TagFilterPills } from "../components/TagFilterPills";
import { useFilterState } from "../lib/useFilterState";
import { EVENT_TAGS } from "../constants/eventTags";

// The card itself lives in components/EventCard.tsx — /favorites renders the
// same component, so the treatment can only be changed in one place.

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
