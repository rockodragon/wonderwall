import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
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

export default function Search() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | undefined>();

  const profiles = useQuery(api.profiles.search, {
    query: query || undefined,
    jobFunction: activeFilter,
  });

  // Sort profiles so those with images come first (they get featured tiles)
  const sortedProfiles = profiles
    ? [...profiles].sort((a, b) => {
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
          placeholder="Search by name, skills, or bio..."
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

function BentoGrid({ profiles }: { profiles: Doc<"profiles">[] }) {
  // Assign tile sizes based on profile completeness
  const getTileSize = (
    profile: Doc<"profiles">,
    index: number,
  ): "large" | "medium" | "small" => {
    const hasImage = !!profile.imageUrl;
    const hasBio = !!profile.bio;

    // First few profiles with images get large tiles
    if (hasImage && index < 2) return "large";
    // Profiles with images or bio get medium tiles
    if (hasImage || hasBio) return "medium";
    // Others get small tiles
    return "small";
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[180px]">
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
  profile: Doc<"profiles">;
  size: "large" | "medium" | "small";
}) {
  const sizeClasses = {
    large: "col-span-2 row-span-2",
    medium: "col-span-1 row-span-2 md:col-span-1",
    small: "col-span-1 row-span-1",
  };

  const hasImage = !!profile.imageUrl;

  if (size === "large" && hasImage) {
    return (
      <Link
        to={`/profile/${profile._id}`}
        className={`${sizeClasses[size]} group relative overflow-hidden rounded-3xl bg-gray-100 dark:bg-gray-800`}
      >
        <img
          src={profile.imageUrl}
          alt={profile.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <FavoriteButton
            targetType="profile"
            targetId={profile._id}
            size="sm"
          />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h3 className="text-2xl font-bold text-white mb-1">{profile.name}</h3>
          <p className="text-white/80 text-sm mb-2">
            {profile.jobFunctions.join(" • ")}
          </p>
          {profile.bio && (
            <p className="text-white/70 text-sm line-clamp-2">{profile.bio}</p>
          )}
          {profile.location && (
            <p className="text-white/60 text-xs mt-2 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
              {profile.location}
            </p>
          )}
        </div>
      </Link>
    );
  }

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
          <>
            <div className="h-1/2 overflow-hidden">
              <img
                src={profile.imageUrl}
                alt={profile.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="p-4 h-1/2 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {profile.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                  {profile.jobFunctions.slice(0, 2).join(" • ")}
                </p>
              </div>
              {profile.bio && (
                <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3">
                  {profile.bio}
                </p>
              )}
              {profile.location && (
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-auto">
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {profile.location}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="p-5 h-full flex flex-col">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold mb-4">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {profile.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {profile.jobFunctions.slice(0, 2).join(" • ")}
            </p>
            {profile.bio && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 line-clamp-4 flex-1">
                {profile.bio}
              </p>
            )}
            {profile.location && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-auto pt-2">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                    clipRule="evenodd"
                  />
                </svg>
                {profile.location}
              </p>
            )}
          </div>
        )}
      </Link>
    );
  }

  // Small tile
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
