import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { FavoriteButton } from "../components/FavoriteButton";
import { SearchInput } from "../components/SearchInput";
import { TagFilterPills } from "../components/TagFilterPills";
import { useFilterState } from "../lib/useFilterState";
import { CommunityContextLine, useCommunityContext } from "../components/CommunityFilter";

const RADIUS_OPTIONS = [
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
] as const;

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  location?: string;
  coordinates?: { lat: number; lng: number };
  wondering: { prompt: string; _id: string; imageUrl: string | null } | null;
};

export default function Search() {
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [radius, setRadius] = useState(25);

  const requestLocation = useCallback(() => {
    if (userPos) { setNearMe(true); return; }
    if (!navigator.geolocation) { setGeoError("Location not supported by your browser"); return; }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMe(true);
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(err.code === 1 ? "Location access denied" : "Could not determine location");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, [userPos]);

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
    let result = profiles;
    if (activeFilters.length > 0) {
      result = result.filter((profile) =>
        activeFilters.some((filter) => profile.interests.includes(filter)),
      );
    }
    if (nearMe && userPos) {
      result = result
        .map((p) => ({
          ...p,
          _distance: p.coordinates
            ? haversineDistance(userPos.lat, userPos.lng, p.coordinates.lat, p.coordinates.lng)
            : Infinity,
        }))
        .filter((p) => p._distance <= radius)
        .sort((a, b) => a._distance - b._distance);
    }
    return result;
  }, [profiles, activeFilters, nearMe, userPos, radius]);

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
        Find creatives by interest, location and see what they're up to
      </p>
      <CommunityContextLine
        selected={community.selected}
        setSelected={community.setSelected}
        communities={community.communities}
        variant="app"
      />

      {/* Search input + Near Me + Filter on same line */}
      <div className="flex gap-3 mb-6">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by name, role, or event..."
          className="flex-1"
        />
        <button
          onClick={() => { nearMe ? setNearMe(false) : requestLocation(); }}
          disabled={geoLoading}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors shrink-0 ${
            nearMe
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          }`}
        >
          <LocationIcon className="w-4 h-4" />
          <span className="font-medium hidden sm:inline">{geoLoading ? "Locating..." : "Near me"}</span>
        </button>
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

      {/* Near me radius selector */}
      {nearMe && (
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400">Within:</span>
          {RADIUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRadius(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                radius === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {geoError && (
        <p className="text-sm text-red-500 mb-4">{geoError}</p>
      )}

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
          <p>{nearMe ? "No nearby profiles found — most people haven't set a precise location yet. Try a wider radius or turn off Near me." : query ? "No results found" : "No creatives to show yet"}</p>
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

function ProfileCard({ profile }: { profile: ProfileResult & { _distance?: number } }) {
  const hasImage = !!profile.imageUrl;
  const distLabel = profile._distance != null && isFinite(profile._distance)
    ? profile._distance < 1 ? "< 1 mi" : `${Math.round(profile._distance)} mi`
    : null;

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
          {distLabel && <span className="text-blue-500 dark:text-blue-400">{distLabel} · </span>}
          {profile.interests.slice(0, 2).join(" · ")}
        </p>
      </div>
      {/* Always visible: hover-reveal has no equivalent on touch screens. */}
      <div className="shrink-0">
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

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
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
