import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { FavoriteButton } from "../components/FavoriteButton";
import { InviteCTA } from "../components/InviteCTA";
import { CreateWonderingComposer } from "../components/CreateWonderingComposer";

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

const FILTERS = [
  { label: "All", value: undefined },
  { label: "Designers", value: "Designer" },
  { label: "Writers", value: "Writer" },
  { label: "Musicians", value: "Musician" },
  { label: "Filmmakers", value: "Filmmaker" },
  { label: "Developers", value: "Developer" },
  { label: "Photographers", value: "Photographer" },
  { label: "Illustrators", value: "Illustrator" },
  { label: "Animators", value: "Animator" },
  { label: "Producers", value: "Producer" },
  { label: "Pastors", value: "Pastor" },
  { label: "Leaders", value: "Leader" },
  { label: "Roadies", value: "Roadie" },
  { label: "Teachers", value: "Teacher" },
  { label: "Speakers", value: "Speaker" },
  { label: "Worship Leaders", value: "Worship Leader" },
  { label: "Sound Engineers", value: "Sound Engineer" },
  { label: "Dancers", value: "Dancer" },
  { label: "Actors", value: "Actor" },
  { label: "Poets", value: "Poet" },
  { label: "Craftsmen", value: "Craftsman" },
];

type ProfileWithWondering = {
  _id: string;
  name: string;
  imageUrl?: string;
  jobFunctions: string[];
  wondering: { prompt: string; _id: string; imageUrl: string | null } | null;
};

export default function Search() {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [filterExpanded, setFilterExpanded] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  // Toggle a filter on/off
  function toggleFilter(value: string | undefined) {
    if (!value) {
      // "All" clears all filters
      setActiveFilters([]);
      return;
    }
    setActiveFilters((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value],
    );
  }

  // Get filter label for button
  const filterLabel =
    activeFilters.length === 0
      ? "All"
      : activeFilters.length === 1
        ? FILTERS.find((f) => f.value === activeFilters[0])?.label || "1 filter"
        : `${activeFilters.length} filters`;

  // Text-based search for profiles (includes name, bio, job functions, wonderings)
  // Pass first filter for now (API would need update to support multiple)
  const profiles = useQuery(api.profiles.search, {
    query: debouncedQuery || undefined,
    jobFunction: activeFilters[0],
  }) as ProfileWithWondering[] | undefined;

  // Client-side filter for additional filters
  const filteredProfiles = profiles?.filter((profile) => {
    if (activeFilters.length <= 1) return true;
    // Check if profile has ANY of the selected job functions
    return activeFilters.some((filter) =>
      profile.jobFunctions.includes(filter),
    );
  });

  // Search events when there's a query
  const events = useQuery(
    api.events.search,
    debouncedQuery ? { query: debouncedQuery } : "skip",
  );

  const loading = profiles === undefined;

  // Split filtered profiles into with wonderings and without
  const filteredProfilesWithWonderings =
    filteredProfiles?.filter((p) => p.wondering) || [];
  const filteredProfilesWithoutWonderings =
    filteredProfiles?.filter((p) => !p.wondering) || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Discover
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Find creatives by what they do, think, or create
      </p>

      {/* Create Wondering Composer */}
      <div className="mb-6">
        <CreateWonderingComposer />
      </div>

      {/* Search input */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, role, wondering, or event..."
          className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
        />
      </div>

      {/* Filter accordion */}
      <div className="mb-8">
        <button
          onClick={() => setFilterExpanded(!filterExpanded)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors ${
            activeFilters.length > 0
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          }`}
        >
          <FilterIcon className="w-4 h-4" />
          <span className="font-medium">{filterLabel}</span>
          <ChevronDownIcon
            className={`w-4 h-4 transition-transform ${filterExpanded ? "rotate-180" : ""}`}
          />
        </button>

        {/* Accordion content */}
        {filterExpanded && (
          <div className="mt-3 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="flex flex-wrap gap-2">
              {/* Clear all button */}
              <button
                onClick={() => setActiveFilters([])}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeFilters.length === 0
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                All
              </button>
              {FILTERS.filter((f) => f.value).map((filter) => (
                <button
                  key={filter.label}
                  onClick={() => toggleFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeFilters.includes(filter.value!)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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

          {/* Wonder Cards - Primary Section */}
          {filteredProfilesWithWonderings.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                What people are wondering
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AboutWonderCard />
                {filteredProfilesWithWonderings.map((profile) => (
                  <WonderCard key={profile._id} profile={profile} />
                ))}
              </div>
            </section>
          )}

          {/* Profiles without wonderings */}
          {filteredProfilesWithoutWonderings.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {query ? "People" : "More creatives"}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProfilesWithoutWonderings.map((profile) => (
                  <ProfileCard key={profile._id} profile={profile} />
                ))}
              </div>
            </section>
          )}

          {/* Invite CTA */}
          <div className="mt-8 max-w-md">
            <InviteCTA variant="discover" />
          </div>
        </div>
      )}
    </div>
  );
}

// Get text size class based on prompt length for optimal readability
function getWonderTextStyle(prompt: string): {
  sizeClass: string;
  fontClass: string;
} {
  const len = prompt.length;

  // Size based on length - aim for 40-75% of card space
  let sizeClass: string;
  if (len < 40) {
    sizeClass = "text-2xl md:text-3xl";
  } else if (len < 80) {
    sizeClass = "text-xl md:text-2xl";
  } else if (len < 150) {
    sizeClass = "text-lg md:text-xl";
  } else {
    sizeClass = "text-base md:text-lg";
  }

  // Alternate font styles based on prompt characteristics
  // Use serif for questions, italic for reflective prompts
  const isQuestion = prompt.includes("?");
  const fontClass = isQuestion ? "font-serif italic" : "font-medium";

  return { sizeClass, fontClass };
}

function AboutWonderCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl aspect-[4/5] bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">?</span>
          <span className="text-white/80 text-sm font-medium uppercase tracking-wider">
            About Wondering
          </span>
        </div>

        {/* Main content */}
        <div className="space-y-4">
          <h3 className="text-white text-xl font-bold leading-tight">
            One thought at a time.
          </h3>
          <p className="text-white/80 text-sm leading-relaxed">
            Wonderings are thoughtful questions you're pondering. Not a feed of
            hot takes. Your one current thought is enough to spark connection.
          </p>
          <p className="text-white/60 text-xs italic">
            "Seek and you will find."
          </p>
        </div>

        {/* Footer badge */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <span className="text-white/70 text-sm">Seek, don't scroll</span>
        </div>
      </div>
    </div>
  );
}

function WonderCard({ profile }: { profile: ProfileWithWondering }) {
  // Safety check - prevents crash during data refetch timing issues
  if (!profile.wondering) return null;
  const wondering = profile.wondering;
  const { sizeClass, fontClass } = getWonderTextStyle(wondering.prompt);

  // Use wondering image, or profile image, or gradient
  const hasWonderingImage = !!wondering.imageUrl;
  const hasProfileImage = !!profile.imageUrl;

  return (
    <Link
      to={`/profile/${profile._id}`}
      className="group relative block overflow-hidden rounded-2xl aspect-[4/5] bg-gray-100 dark:bg-gray-800"
    >
      {/* Background */}
      {hasWonderingImage ? (
        <img
          src={wondering.imageUrl!}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : hasProfileImage ? (
        <img
          src={profile.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      {/* Favorite button */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <FavoriteButton targetType="profile" targetId={profile._id} size="sm" />
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-5">
        {/* Wonder prompt - hero text with variable sizing */}
        <div className="flex-1 flex items-center justify-center">
          <p
            className={`text-white ${sizeClass} ${fontClass} text-center leading-relaxed px-2`}
          >
            "{wondering.prompt}"
          </p>
        </div>

        {/* Profile info - lower left */}
        <div className="flex items-center gap-2">
          {hasProfileImage ? (
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-8 h-8 rounded-full object-cover border border-white/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-white/90 text-sm font-medium">
            {profile.name}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProfileCard({ profile }: { profile: ProfileWithWondering }) {
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
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
          {profile.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
          {profile.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {profile.jobFunctions.slice(0, 2).join(" • ")}
        </p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <FavoriteButton targetType="profile" targetId={profile._id} size="sm" />
      </div>
    </Link>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
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
