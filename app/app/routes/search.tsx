import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { FavoriteButton } from "../components/FavoriteButton";

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
  wondering: { prompt: string; _id: string } | null;
};

export default function Search() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | undefined>();

  const profiles = useQuery(api.profiles.search, {
    query: query || undefined,
    jobFunction: activeFilter,
  }) as ProfileWithWondering[] | undefined;

  // Sort profiles: those with wonderings first, then those with images
  const sortedProfiles = profiles
    ? [...profiles].sort((a, b) => {
        // Profiles with wondering come first
        if (a.wondering && !b.wondering) return -1;
        if (!a.wondering && b.wondering) return 1;
        // Then profiles with images
        if (a.imageUrl && !b.imageUrl) return -1;
        if (!a.imageUrl && b.imageUrl) return 1;
        return 0;
      })
    : undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Discover
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Find Christian creatives to connect with
      </p>

      {/* Search input */}
      <div className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or skills..."
          className="w-full px-4 py-3 pl-12 border border-gray-300 dark:border-gray-700 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
        />
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
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

      {/* Filters */}
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

      {/* Bento Grid Results */}
      {sortedProfiles === undefined ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : sortedProfiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>{query ? "No results found" : "No creatives to show yet"}</p>
        </div>
      ) : (
        <BentoGrid profiles={sortedProfiles} />
      )}
    </div>
  );
}

function BentoGrid({ profiles }: { profiles: ProfileWithWondering[] }) {
  // Assign tile sizes based on wondering and image
  const getTileSize = (
    profile: ProfileWithWondering,
    index: number,
  ): "large" | "medium" | "small" => {
    const hasImage = !!profile.imageUrl;
    const hasWondering = !!profile.wondering;

    // Profiles with wondering get large tiles (first 2) or medium
    if (hasWondering && index < 2) return "large";
    if (hasWondering) return "medium";
    // Profiles with images get medium tiles
    if (hasImage) return "medium";
    // Others get small tiles
    return "small";
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[140px]">
      {profiles.map((profile, index) => {
        const size = getTileSize(profile, index);
        return <ProfileTile key={profile._id} profile={profile} size={size} />;
      })}
    </div>
  );
}

function ProfileTile({
  profile,
  size,
}: {
  profile: ProfileWithWondering;
  size: "large" | "medium" | "small";
}) {
  const sizeClasses = {
    large: "col-span-2 row-span-2",
    medium: "col-span-1 row-span-2",
    small: "col-span-1 row-span-1",
  };

  const hasImage = !!profile.imageUrl;
  const hasWondering = !!profile.wondering;

  // Large tile - for profiles with wondering and image
  if (size === "large") {
    return (
      <Link
        to={`/profile/${profile._id}`}
        className={`${sizeClasses[size]} group relative overflow-hidden rounded-3xl bg-gray-100 dark:bg-gray-800`}
      >
        {hasImage ? (
          <img
            src={profile.imageUrl}
            alt={profile.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <FavoriteButton
            targetType="profile"
            targetId={profile._id}
            size="sm"
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3 className="text-2xl font-bold text-white mb-1">{profile.name}</h3>
          <p className="text-white/70 text-sm mb-3">
            {profile.jobFunctions.slice(0, 3).join(" • ")}
          </p>
          {hasWondering && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20">
              <p className="text-xs text-white/60 mb-1">Wondering...</p>
              <p className="text-white text-sm line-clamp-2">
                "{profile.wondering!.prompt}"
              </p>
            </div>
          )}
        </div>
      </Link>
    );
  }

  // Medium tile - for profiles with wondering or image
  if (size === "medium") {
    return (
      <Link
        to={`/profile/${profile._id}`}
        className={`${sizeClasses[size]} group relative overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300`}
      >
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <FavoriteButton
            targetType="profile"
            targetId={profile._id}
            size="sm"
          />
        </div>
        {hasImage ? (
          <div className="h-2/5 overflow-hidden">
            <img
              src={profile.imageUrl}
              alt={profile.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="h-2/5 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
            <span className="text-4xl font-bold text-white">
              {profile.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="p-4 h-3/5 flex flex-col">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {profile.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {profile.jobFunctions.slice(0, 2).join(" • ")}
          </p>
          {hasWondering && (
            <div className="mt-auto pt-2">
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-2">
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mb-0.5">
                  Wondering...
                </p>
                <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                  "{profile.wondering!.prompt}"
                </p>
              </div>
            </div>
          )}
        </div>
      </Link>
    );
  }

  // Small tile - compact view
  return (
    <Link
      to={`/profile/${profile._id}`}
      className={`${sizeClasses[size]} group flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors`}
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
