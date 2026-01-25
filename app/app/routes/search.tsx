import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { FavoriteButton } from "../components/FavoriteButton";

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
  const [activeFilter, setActiveFilter] = useState<string | undefined>();
  const [semanticResults, setSemanticResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const searchAction = useAction(api.embeddings.search);
  const searchResultDetails = useQuery(
    api.embeddings.getSearchResultDetails,
    semanticResults ? { results: semanticResults } : "skip",
  );

  // Use basic query for filters-only, semantic search when there's a query
  const profiles = useQuery(
    api.profiles.search,
    !debouncedQuery ? { jobFunction: activeFilter } : "skip",
  ) as ProfileWithWondering[] | undefined;

  // Perform semantic search when query changes
  useEffect(() => {
    if (!debouncedQuery) {
      setSemanticResults(null);
      return;
    }

    setSearching(true);
    searchAction({ query: debouncedQuery, limit: 30 })
      .then((results) => {
        setSemanticResults(results);
      })
      .catch(console.error)
      .finally(() => setSearching(false));
  }, [debouncedQuery, searchAction]);

  // Combine results based on mode
  const isSemanticMode = !!debouncedQuery;
  const loading = isSemanticMode
    ? searching || (semanticResults && !searchResultDetails)
    : profiles === undefined;

  // Extract profiles from semantic results
  const semanticProfiles =
    searchResultDetails
      ?.filter((r: any) => r.type === "profile")
      .map((r: any) => ({
        ...r.data,
        wondering: null,
        score: r.score,
      })) || [];

  // Split into profiles with wonderings and without
  const displayProfiles = isSemanticMode ? semanticProfiles : profiles;
  const profilesWithWonderings =
    displayProfiles?.filter((p: any) => p.wondering) || [];
  const profilesWithoutWonderings =
    displayProfiles?.filter((p: any) => !p.wondering) || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Discover
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Find creatives by what they do, think, or create
      </p>

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
          placeholder="Search by name, role, or interests..."
          className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
        />
        {searching && (
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
          </div>
        )}
      </div>

      {/* Filters - only show when not searching */}
      {!isSemanticMode && (
        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map((filter) => (
            <FilterChip
              key={filter.label}
              label={filter.label}
              active={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
            />
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : !displayProfiles || displayProfiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>{query ? "No results found" : "No creatives to show yet"}</p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Wonder Cards - Primary Section */}
          {profilesWithWonderings.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                What people are wondering
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profilesWithWonderings.map((profile) => (
                  <WonderCard key={profile._id} profile={profile} />
                ))}
              </div>
            </section>
          )}

          {/* Profiles without wonderings */}
          {profilesWithoutWonderings.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                More creatives
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {profilesWithoutWonderings.map((profile) => (
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

function WonderCard({ profile }: { profile: ProfileWithWondering }) {
  const wondering = profile.wondering!;

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
        {/* Wonder prompt - hero text */}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white text-xl md:text-2xl font-medium text-center leading-relaxed px-2">
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
