import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { FavoriteButton } from "../components/FavoriteButton";
import { SearchInput } from "../components/SearchInput";
import { TagFilterPills } from "../components/TagFilterPills";
import { useFilterState } from "../lib/useFilterState";
import { CommunityContextLine, useCommunityContext } from "../components/CommunityFilter";

// Derived directly from the canonical INTERESTS list so this can never
// drift from it again (it previously did — see git history). Label and
// value are the same singular string, matching how Projects' `#Tag` pills
// already render these values.
const FILTERS = INTERESTS.map((fn) => ({ label: fn, value: fn }));

type ProfileResult = {
  _id: string;
  name: string;
  imageUrl?: string;
  interests: string[];
  wondering: { prompt: string; _id: string; imageUrl: string | null } | null;
};

export default function Search() {
  const [filterExpanded, setFilterExpanded] = useState(false);

  const {
    query,
    debouncedQuery,
    setQuery,
    tags: activeFilters,
    toggleTag,
    clearTags,
  } = useFilterState({ tagsParam: "interests" });

  // Get filter label for button
  const filterLabel =
    activeFilters.length === 0
      ? "All"
      : activeFilters.length === 1
        ? FILTERS.find((f) => f.value === activeFilters[0])?.label || "1 filter"
        : `${activeFilters.length} filters`;

  // Text-based search for profiles (includes name, bio, interests).
  // No interest is passed server-side — at friend-group scale the whole
  // multi-select filter runs client-side below, same as Events/Projects.
  // Community context (community-ux.md §2): People is segmented like every
  // other browse page — the switcher's community scopes who shows up here.
  const community = useCommunityContext();
  const communitySlug = community.selected === "all" ? undefined : community.selected;

  const profiles = useQuery(api.profiles.search, {
    query: debouncedQuery || undefined,
    communitySlug,
  }) as ProfileResult[] | undefined;

  const filteredProfiles = useMemo(() => {
    if (!profiles) return profiles;
    if (activeFilters.length === 0) return profiles;
    return profiles.filter((profile) =>
      activeFilters.some((filter) => profile.interests.includes(filter)),
    );
  }, [profiles, activeFilters]);

  // Search events when there's a query
  const events = useQuery(
    api.events.search,
    debouncedQuery ? { query: debouncedQuery, communitySlug } : "skip",
  );

  const loading = profiles === undefined;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        People
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        Find creatives by what they do
      </p>
      <CommunityContextLine
        selected={community.selected}
        setSelected={community.setSelected}
        communities={community.communities}
        variant="app"
      />

      {/* Search input + Filter on same line */}
      <div className="flex gap-3 mb-6">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name, role, or event..."
          className="flex-1"
        />
        <button
          onClick={() => setFilterExpanded(!filterExpanded)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors shrink-0 ${
            activeFilters.length > 0
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          }`}
        >
          <FilterIcon className="w-4 h-4" />
          <span className="font-medium hidden sm:inline">{filterLabel}</span>
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${filterExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Filter accordion content */}
      {filterExpanded && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <TagFilterPills
            options={FILTERS}
            active={activeFilters}
            onToggle={toggleTag}
            onClear={clearTags}
          />
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : filteredProfiles?.length === 0 && (!events || events.length === 0) ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>{query ? "No results found" : "No creatives to show yet"}</p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Events section - show when searching */}
          {events && events.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Events
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {events.map((event: any) => (
                  <EventCard key={event._id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* People */}
          {filteredProfiles && filteredProfiles.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {query ? "People" : "Creatives"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProfiles.map((profile) => (
                  <ProfileCard key={profile._id} profile={profile} />
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: ProfileResult }) {
  const hasImage = !!profile.imageUrl;

  return (
    <Link
      to={`/profile/${profile._id}`}
      className="group flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
    >
      {hasImage ? (
        <img
          src={profile.imageUrl}
          alt={profile.name}
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white font-bold shrink-0">
          {profile.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
          {profile.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {profile.interests.slice(0, 2).join(" • ")}
        </p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <FavoriteButton targetType="profile" targetId={profile._id} size="sm" />
      </div>
    </Link>
  );
}

function EventCard({ event }: { event: any }) {
  const date = new Date(event.datetime);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      to={`/events/${event._id}`}
      className="group block overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
    >
      {/* Cover image */}
      <div className="aspect-[16/9] bg-gray-100 dark:bg-gray-700 relative overflow-hidden">
        {event.coverImageUrl ? (
          <img
            src={event.coverImageUrl}
            alt={event.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${
              event.coverColor === "purple"
                ? "from-purple-400 to-pink-500"
                : event.coverColor === "green"
                  ? "from-green-400 to-emerald-500"
                  : event.coverColor === "orange"
                    ? "from-orange-400 to-red-500"
                    : "from-blue-400 to-indigo-500"
            }`}
          />
        )}
        <div className="absolute top-3 left-3 bg-white dark:bg-gray-900 rounded-lg px-2 py-1">
          <span className="text-xs font-semibold text-gray-900 dark:text-white">
            {formattedDate}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
          {event.title}
        </h3>
        {event.location && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
            {event.location}
          </p>
        )}
        {event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {event.tags.slice(0, 3).map((tag: string) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}
