import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";

const FILTERS = [
  { label: "All", value: undefined },
  { label: "Designers", value: "Designer" },
  { label: "Writers", value: "Writer" },
  { label: "Musicians", value: "Musician" },
  { label: "Filmmakers", value: "Filmmaker" },
  { label: "Developers", value: "Developer" },
];

export default function Search() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | undefined>();

  const profiles = useQuery(api.profiles.search, {
    query: query || undefined,
    jobFunction: activeFilter,
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Discover
      </h1>

      {/* Search input */}
      <div className="relative mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, skills, or what they're wondering..."
          className="w-full px-4 py-3 pl-12 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
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

      {/* Results */}
      {profiles === undefined ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>
            {query
              ? "No results found"
              : "Start typing to discover Christian creatives"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <Link
              key={profile._id}
              to={`/profile/${profile._id}`}
              className="block p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  {profile.imageUrl ? (
                    <img
                      src={profile.imageUrl}
                      alt={profile.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-medium text-gray-500">
                      {profile.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-white truncate">
                    {profile.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {profile.jobFunctions.join(" • ")}
                    {profile.location && ` • ${profile.location}`}
                  </p>
                  {profile.bio && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                      {profile.bio}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
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
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
}
