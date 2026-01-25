import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { CreateEventModal } from "../components/CreateEventModal";
import { FavoriteButton } from "../components/FavoriteButton";
import { InviteCTA } from "../components/InviteCTA";

const EVENT_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-red-600",
  "from-cyan-500 to-blue-600",
];

type FilterTab = "all" | "favorites";

export default function Events() {
  const events = useQuery(api.events.list, { upcoming: true });
  const favorites = useQuery(api.favorites.getMyFavorites, {});
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // Get favorited event IDs
  const favoriteEventIds = new Set(
    favorites?.events
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => e.event._id) || [],
  );

  // Filter events based on active tab
  const filteredEvents =
    activeTab === "favorites"
      ? events?.filter((e) => favoriteEventIds.has(e._id))
      : events;

  // Get gradient based on event index
  const getGradient = (index: number) =>
    EVENT_GRADIENTS[index % EVENT_GRADIENTS.length];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Events
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Discover and join community gatherings
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Create Event
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          All Events
        </button>
        <button
          onClick={() => setActiveTab("favorites")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === "favorites"
              ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          Favorites
          {favoriteEventIds.size > 0 && (
            <span className="text-xs">({favoriteEventIds.size})</span>
          )}
        </button>
      </div>

      {filteredEvents === undefined ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-lg font-medium mb-2">
            {activeTab === "favorites"
              ? "No favorited events"
              : "No upcoming events"}
          </p>
          <p>
            {activeTab === "favorites"
              ? "Heart an event to save it here"
              : "Be the first to create an event for the community"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.map((event, index) => {
            const isFavorited = favoriteEventIds.has(event._id);
            const gradient = getGradient(index);

            return (
              <Link
                key={event._id}
                to={`/events/${event._id}`}
                className="group relative block rounded-2xl overflow-hidden aspect-[4/3]"
              >
                {/* Background */}
                {event.coverImageUrl ? (
                  <img
                    src={event.coverImageUrl}
                    alt={event.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${gradient}`}
                  />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

                {/* Favorite button */}
                <div className="absolute top-3 right-3 z-10">
                  <FavoriteButton
                    targetType="event"
                    targetId={event._id}
                    size="sm"
                  />
                </div>

                {/* Status badge */}
                <div className="absolute top-3 left-3">
                  {event.requiresApproval ? (
                    <span className="px-2 py-1 bg-amber-500/90 text-white text-xs font-medium rounded-lg">
                      Apply
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-green-500/90 text-white text-xs font-medium rounded-lg">
                      Open
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="absolute inset-0 p-4 flex flex-col justify-end">
                  <h3 className="text-white font-semibold text-lg line-clamp-2 mb-1">
                    {event.title}
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
                      {new Date(event.datetime).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {event.location && (
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
                        <span className="truncate">{event.location}</span>
                      </span>
                    )}
                  </div>

                  {/* Tags and attendees */}
                  <div className="flex items-center justify-between mt-3">
                    {event.tags.length > 0 ? (
                      <div className="flex gap-1 flex-wrap">
                        {event.tags.slice(0, 2).map((tag) => (
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

                    {event.attendeeCount > 0 && (
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
                        {event.attendeeCount} going
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Invite CTA */}
      <div className="mt-12 max-w-md">
        <InviteCTA variant="events" />
      </div>

      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
