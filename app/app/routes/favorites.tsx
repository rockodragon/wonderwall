import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { FavoriteButton } from "../components/FavoriteButton";

const EVENT_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-red-600",
  "from-cyan-500 to-blue-600",
];

type FavoriteProfileItem = {
  favoriteId: string;
  favoritedAt: number;
  profile: {
    _id: string;
    name: string;
    imageUrl?: string | null;
    jobFunctions: string[];
  };
  wondering: {
    _id: string;
    prompt: string;
    imageUrl?: string | null;
  } | null;
};

type FavoriteEventItem = {
  favoriteId: string;
  favoritedAt: number;
  event: {
    _id: string;
    title: string;
    datetime: number;
    location?: string | null;
    tags: string[];
    status: string;
    requiresApproval: boolean;
    coverImageUrl?: string | null;
    attendeeCount?: number;
  };
};

type FavoritesData = {
  profiles: (FavoriteProfileItem | null)[];
  events: (FavoriteEventItem | null)[];
};

export default function Favorites() {
  const favorites = useQuery(api.favorites.getMyFavorites, {}) as
    | FavoritesData
    | undefined;

  if (favorites === undefined) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Favorites
        </h1>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      </div>
    );
  }

  // Filter out null values and get typed arrays
  const profiles = favorites.profiles.filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  const events = favorites.events.filter(
    (e): e is NonNullable<typeof e> => e !== null,
  );

  const profilesWithWonderings = profiles.filter(
    (
      p,
    ): p is FavoriteProfileItem & {
      wondering: NonNullable<FavoriteProfileItem["wondering"]>;
    } => Boolean(p.wondering),
  );
  const profilesWithoutWonderings = profiles.filter((p) => !p.wondering);

  const hasProfiles = profiles.length > 0;
  const hasEvents = events.length > 0;
  const isEmpty = !hasProfiles && !hasEvents;

  const getGradient = (index: number) =>
    EVENT_GRADIENTS[index % EVENT_GRADIENTS.length];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Favorites
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        People and events you've saved
      </p>

      {isEmpty ? (
        <div className="text-center py-12">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
            No favorites yet
          </p>
          <p className="text-gray-400 dark:text-gray-500">
            Tap the heart on profiles and events to save them here
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {hasProfiles && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                People ({profiles.length})
              </h2>

              {profilesWithWonderings.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                  {profilesWithWonderings.map((item) => (
                    <FavoriteWonderCard
                      key={item.favoriteId}
                      item={item}
                    />
                  ))}
                </div>
              )}

              {profilesWithoutWonderings.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {profilesWithoutWonderings.map((item) => (
                    <FavoriteProfileCard
                      key={item.favoriteId}
                      item={item}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {hasEvents && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Events ({events.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {events.map((item, index) => (
                  <FavoriteEventCard
                    key={item.favoriteId}
                    item={item}
                    gradient={getGradient(index)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function FavoriteWonderCard({
  item,
}: {
  item: FavoriteProfileItem & { wondering: NonNullable<FavoriteProfileItem["wondering"]> };
}) {
  const hasWonderingImage = !!item.wondering.imageUrl;
  const hasProfileImage = !!item.profile.imageUrl;

  return (
    <Link
      to={`/profile/${item.profile._id}`}
      className="group relative block overflow-hidden rounded-2xl aspect-[4/5] bg-gray-100 dark:bg-gray-800"
    >
      {hasWonderingImage ? (
        <img
          src={item.wondering.imageUrl as string}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500" />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <FavoriteButton
          targetType="profile"
          targetId={item.profile._id}
          size="sm"
        />
      </div>

      <div className="absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white text-xl md:text-2xl font-medium text-center leading-relaxed px-2">
            "{item.wondering.prompt}"
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasProfileImage ? (
            <img
              src={item.profile.imageUrl as string}
              alt={item.profile.name}
              className="w-8 h-8 rounded-full object-cover border border-white/30"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium">
              {item.profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-white/90 text-sm font-medium">
            {item.profile.name}
          </span>
        </div>
      </div>
    </Link>
  );
}

function FavoriteProfileCard({
  item,
}: {
  item: FavoriteProfileItem;
}) {
  const hasImage = !!item.profile.imageUrl;

  return (
    <Link
      to={`/profile/${item.profile._id}`}
      className="group flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
    >
      {hasImage ? (
        <img
          src={item.profile.imageUrl as string}
          alt={item.profile.name}
          className="w-12 h-12 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
          {item.profile.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-gray-900 dark:text-white truncate text-sm">
          {item.profile.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {item.profile.jobFunctions.slice(0, 2).join(" • ")}
        </p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <FavoriteButton
          targetType="profile"
          targetId={item.profile._id}
          size="sm"
        />
      </div>
    </Link>
  );
}

function FavoriteEventCard({
  item,
  gradient,
}: {
  item: FavoriteEventItem;
  gradient: string;
}) {
  const isPast = item.event.datetime < Date.now();
  const isCancelled = item.event.status === "cancelled";

  return (
    <Link
      key={item.favoriteId}
      to={`/events/${item.event._id}`}
      className={`group relative block rounded-2xl overflow-hidden aspect-[4/3] ${
        isPast || isCancelled ? "opacity-60" : ""
      }`}
    >
      {item.event.coverImageUrl ? (
        <img
          src={item.event.coverImageUrl}
          alt={item.event.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

      <div className="absolute top-3 right-3 z-10">
        <FavoriteButton
          targetType="event"
          targetId={item.event._id}
          size="sm"
        />
      </div>

      <div className="absolute top-3 left-3">
        {item.event.requiresApproval ? (
          <span className="px-2 py-1 bg-amber-500/90 text-white text-xs font-medium rounded-lg">
            Apply
          </span>
        ) : (
          <span className="px-2 py-1 bg-green-500/90 text-white text-xs font-medium rounded-lg">
            Open
          </span>
        )}
      </div>

      <div className="absolute inset-0 p-4 flex flex-col justify-end">
        <h3 className="text-white font-semibold text-lg line-clamp-2 mb-1">
          {item.event.title}
        </h3>

        <div className="flex items-center gap-3 text-white/80 text-sm">
          <span className="flex items-center gap-1">
            <svg
              className="w-4 h-4"
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
            {new Date(item.event.datetime).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
          {item.event.location && (
            <span className="flex items-center gap-1 truncate">
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
              <span className="truncate">{item.event.location}</span>
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          {item.event.tags.length > 0 ? (
            <div className="flex gap-1 flex-wrap">
              {item.event.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <div />
          )}

          {!!item.event.attendeeCount && item.event.attendeeCount > 0 && (
            <div className="flex items-center gap-1 text-white/80 text-xs">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {item.event.attendeeCount} going
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
