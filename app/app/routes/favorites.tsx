import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";

export default function Favorites() {
  const favorites = useQuery(api.favorites.getMyFavorites, {});

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

  const hasProfiles = profiles.length > 0;
  const hasEvents = events.length > 0;
  const isEmpty = !hasProfiles && !hasEvents;

  return (
    <div className="p-6 max-w-4xl mx-auto">
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
        <div className="space-y-8">
          {/* Favorited Profiles with Wonderings */}
          {hasProfiles && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                People ({profiles.length})
              </h2>
              <div className="space-y-3">
                {profiles.map((item) => (
                  <Link
                    key={item.favoriteId}
                    to={`/profile/${item.profile._id}`}
                    className="block p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                        {item.profile.imageUrl ? (
                          <img
                            src={item.profile.imageUrl}
                            alt={item.profile.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-medium text-gray-500">
                            {item.profile.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {item.profile.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {item.profile.jobFunctions.slice(0, 2).join(" • ")}
                        </p>
                        {item.wondering && (
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 italic line-clamp-2">
                            "{item.wondering.prompt}"
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Favorited Events */}
          {hasEvents && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Events ({events.length})
              </h2>
              <div className="space-y-3">
                {events.map((item) => {
                  const isPast = item.event.datetime < Date.now();
                  const isCancelled = item.event.status === "cancelled";

                  return (
                    <Link
                      key={item.favoriteId}
                      to={`/events/${item.event._id}`}
                      className={`block p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors ${
                        isPast || isCancelled ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {item.event.title}
                            </h3>
                            {isCancelled && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                                Cancelled
                              </span>
                            )}
                            {isPast && !isCancelled && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                                Past
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {new Date(item.event.datetime).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                            {item.event.location && ` • ${item.event.location}`}
                          </p>
                          {item.event.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.event.tags
                                .slice(0, 3)
                                .map((tag: string) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs"
                                  >
                                    {tag}
                                  </span>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
