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
  wondering: { prompt: string; _id: string; imageUrl: string | null } | null;
};

export default function Search() {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | undefined>();

  const profiles = useQuery(api.profiles.search, {
    query: query || undefined,
    jobFunction: activeFilter,
  }) as ProfileWithWondering[] | undefined;

  // Split into profiles with wonderings and without
  const profilesWithWonderings = profiles?.filter((p) => p.wondering) || [];
  const profilesWithoutWonderings = profiles?.filter((p) => !p.wondering) || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Discover
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        What the community is thinking about
      </p>

      {/* Search input - hidden until enabled */}

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
