import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FavoriteButton } from "../components/FavoriteButton";
import {
  LocationAutocomplete,
  type LocationSuggestion,
} from "../components/LocationAutocomplete";
import { ShareButton } from "../components/ShareButton";

const COVER_COLORS = [
  { name: "Blue", value: "blue", gradient: "from-blue-500 to-blue-600" },
  {
    name: "Purple",
    value: "purple",
    gradient: "from-purple-500 to-purple-600",
  },
  { name: "Pink", value: "pink", gradient: "from-pink-500 to-pink-600" },
  { name: "Green", value: "green", gradient: "from-green-500 to-green-600" },
  {
    name: "Orange",
    value: "orange",
    gradient: "from-orange-500 to-orange-600",
  },
];

export default function EventDetail() {
  const { eventId } = useParams();
  const event = useQuery(
    api.events.get,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
  const applyToEvent = useMutation(api.events.apply);
  const cancelEvent = useMutation(api.events.cancel);
  const applications = useQuery(
    api.events.getApplications,
    eventId && event?.isOrganizer
      ? { eventId: eventId as Id<"events"> }
      : "skip",
  );
  const updateStatus = useMutation(api.events.updateApplicationStatus);
  const attendees = useQuery(
    api.events.getAttendees,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );

  const [message, setMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleCancelEvent() {
    if (!eventId) return;
    if (
      !confirm(
        "Are you sure you want to cancel this event? This cannot be undone.",
      )
    )
      return;

    setCancelling(true);
    try {
      await cancelEvent({ eventId: eventId as Id<"events"> });
    } catch (err) {
      console.error("Cancel failed:", err);
      alert("Failed to cancel event. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  if (event === undefined) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-2xl mb-6" />
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-8" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Event not found</p>
      </div>
    );
  }

  async function handleJoin() {
    if (!eventId) return;
    setJoining(true);
    try {
      await applyToEvent({
        eventId: eventId as Id<"events">,
        message: message || undefined,
      });
      setShowJoinForm(false);
      setMessage("");
    } finally {
      setJoining(false);
    }
  }

  async function handleApply() {
    if (!eventId) return;
    setApplying(true);
    try {
      await applyToEvent({
        eventId: eventId as Id<"events">,
        message: message || undefined,
      });
      setShowApplyForm(false);
      setMessage("");
    } finally {
      setApplying(false);
    }
  }

  async function handleUpdateStatus(
    applicationId: Id<"eventApplications">,
    status: string,
  ) {
    await updateStatus({ applicationId, status });
  }

  const isPast = event.datetime < Date.now();
  const canApply = !isPast && !event.userApplication && !event.isOrganizer;

  // Get gradient class for cover color
  const coverGradient =
    COVER_COLORS.find((c) => c.value === event.coverColor)?.gradient ||
    "from-blue-500 to-purple-600";

  // Use cover image, or first gallery image, or gradient
  const bannerImageUrl =
    event.coverImageUrl ||
    (event.galleryImageUrls && event.galleryImageUrls[0]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Cover Image */}
      <div className="relative h-56 md:h-72 overflow-hidden">
        {bannerImageUrl ? (
          <img
            src={bannerImageUrl}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${coverGradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              {event.title}
            </h1>
            {event.isOrganizer && (
              <>
                <button
                  onClick={() => setShowEditForm(true)}
                  className="px-3 py-1 bg-white/20 backdrop-blur-sm text-white rounded-lg text-sm font-medium hover:bg-white/30 transition-colors"
                >
                  Edit
                </button>
                {event.status !== "cancelled" && (
                  <button
                    onClick={handleCancelEvent}
                    disabled={cancelling}
                    className="px-3 py-1 bg-red-500/80 backdrop-blur-sm text-white rounded-lg text-sm font-medium hover:bg-red-600/80 transition-colors disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Event"}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-white/80 text-sm">
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
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {event.location && (
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
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Tags and Actions Row */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {event.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <FavoriteButton targetType="event" targetId={event._id} />
            <ShareButton type="event" title={event.title} size="sm" />
          </div>
        </div>

        {/* Organizer, Description, and Join Button */}
        <div className="flex flex-col md:flex-row md:gap-8 mb-8">
          {/* Left: Organizer and Description */}
          <div className="flex-1">
            {/* Organizer */}
            {event.organizer && (
              <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                <span>Organized by </span>
                {event.organizer.profileId ? (
                  <Link
                    to={`/profile/${event.organizer.profileId}`}
                    className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <span className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center overflow-hidden">
                      {event.organizer.imageUrl ? (
                        <img
                          src={event.organizer.imageUrl}
                          alt={event.organizer.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-medium text-gray-500">
                          {event.organizer.name.charAt(0)}
                        </span>
                      )}
                    </span>
                    {event.organizer.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center overflow-hidden">
                      {event.organizer.imageUrl ? (
                        <img
                          src={event.organizer.imageUrl}
                          alt={event.organizer.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-medium text-gray-500">
                          {event.organizer.name.charAt(0)}
                        </span>
                      )}
                    </span>
                    {event.organizer.name}
                  </span>
                )}
              </div>
            )}

            {/* Description */}
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {event.description}
              </p>
            </div>
          </div>

          {/* Right: Join Button (desktop) */}
          <div className="hidden md:block flex-shrink-0 w-56">
            {isPast ? (
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Event ended
                </p>
              </div>
            ) : event.userApplication ? (
              <div
                className={`p-3 rounded-xl text-center ${
                  event.userApplication.status === "accepted"
                    ? "bg-green-50 dark:bg-green-900/20"
                    : event.userApplication.status === "declined"
                      ? "bg-red-50 dark:bg-red-900/20"
                      : "bg-blue-50 dark:bg-blue-900/20"
                }`}
              >
                <p
                  className={`text-sm font-medium ${
                    event.userApplication.status === "accepted"
                      ? "text-green-700 dark:text-green-300"
                      : event.userApplication.status === "declined"
                        ? "text-red-700 dark:text-red-300"
                        : "text-blue-700 dark:text-blue-300"
                  }`}
                >
                  {event.userApplication.status === "accepted"
                    ? "You're in!"
                    : event.userApplication.status === "declined"
                      ? "Declined"
                      : "Pending"}
                </p>
              </div>
            ) : canApply ? (
              event.requiresApproval ? (
                showApplyForm ? (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-3 text-sm">
                      Apply to attend
                    </h3>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Why you'd like to attend..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3 text-sm"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleApply}
                        disabled={applying}
                        className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 text-sm"
                      >
                        {applying ? "Applying..." : "Submit"}
                      </button>
                      <button
                        onClick={() => setShowApplyForm(false)}
                        className="py-2 text-gray-600 dark:text-gray-400 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowApplyForm(true)}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                  >
                    Apply to Attend
                  </button>
                )
              ) : showJoinForm ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3 text-sm">
                    Join this event
                  </h3>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Share why you're excited! (optional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3 text-sm"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleJoin}
                      disabled={joining}
                      className="w-full py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      {joining ? "Joining..." : "Join"}
                    </button>
                    <button
                      onClick={() => {
                        setShowJoinForm(false);
                        setMessage("");
                      }}
                      className="py-2 text-gray-600 dark:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowJoinForm(true)}
                  className="w-full py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                >
                  Join Event
                </button>
              )
            ) : null}
          </div>
        </div>

        {/* Gallery Images - show first for visual appeal */}
        {!event.isOrganizer &&
          event.galleryImageUrls &&
          event.galleryImageUrls.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Photos
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {event.galleryImageUrls.map((url, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Mobile Join Button - between description/gallery and location */}
        <div className="md:hidden mb-8">
          {isPast ? (
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl text-center">
              <p className="text-gray-500 dark:text-gray-400">
                This event has ended
              </p>
            </div>
          ) : event.userApplication ? (
            <div
              className={`p-4 rounded-xl ${
                event.userApplication.status === "accepted"
                  ? "bg-green-50 dark:bg-green-900/20"
                  : event.userApplication.status === "declined"
                    ? "bg-red-50 dark:bg-red-900/20"
                    : "bg-blue-50 dark:bg-blue-900/20"
              }`}
            >
              <p
                className={`font-medium ${
                  event.userApplication.status === "accepted"
                    ? "text-green-700 dark:text-green-300"
                    : event.userApplication.status === "declined"
                      ? "text-red-700 dark:text-red-300"
                      : "text-blue-700 dark:text-blue-300"
                }`}
              >
                {event.userApplication.status === "accepted"
                  ? "You're in! See you there."
                  : event.userApplication.status === "declined"
                    ? "Your application was declined"
                    : "Your application is pending approval"}
              </p>
            </div>
          ) : canApply ? (
            event.requiresApproval ? (
              showApplyForm ? (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                    Apply to attend
                  </h3>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell the organizer why you'd like to attend..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applying ? "Applying..." : "Submit Application"}
                    </button>
                    <button
                      onClick={() => setShowApplyForm(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowApplyForm(true)}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
                >
                  Apply to Attend
                </button>
              )
            ) : showJoinForm ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                  Join this event
                </h3>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share why you're excited to attend! (optional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {joining ? "Joining..." : "Join Event"}
                  </button>
                  <button
                    onClick={() => {
                      setShowJoinForm(false);
                      setMessage("");
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowJoinForm(true)}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                Join Event
              </button>
            )
          ) : null}
        </div>

        {/* Location Map */}
        {event.location && event.locationType !== "online" && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Location
            </h3>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden hover:opacity-90 transition-opacity max-w-[300px]"
            >
              <img
                src={
                  event.coordinates
                    ? `https://maps.googleapis.com/maps/api/staticmap?center=${event.coordinates.lat},${event.coordinates.lng}&zoom=15&size=400x400&scale=2&markers=color:red%7C${event.coordinates.lat},${event.coordinates.lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
                    : `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(event.location)}&zoom=15&size=400x400&scale=2&markers=color:red%7C${encodeURIComponent(event.location)}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
                }
                alt={event.location}
                className="w-full aspect-square object-cover bg-gray-200 dark:bg-gray-700"
              />
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mr-2">
                  {event.location}
                </p>
                <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 flex-shrink-0">
                  Open in Maps
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </span>
              </div>
            </a>
          </div>
        )}

        {/* Attendees - Partiful style grid */}
        {attendees && attendees.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Going ({attendees.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attendees.map((attendee) => (
                <div
                  key={attendee.applicationId}
                  className="flex items-center gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
                >
                  {attendee.profileId ? (
                    <Link
                      to={`/profile/${attendee.profileId}`}
                      className="flex-shrink-0"
                    >
                      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-gray-900">
                        {attendee.imageUrl ? (
                          <img
                            src={attendee.imageUrl}
                            alt={attendee.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-medium text-gray-500">
                            {attendee.name.charAt(0)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-gray-900">
                      <span className="text-xs font-medium text-gray-500">
                        {attendee.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {attendee.profileId ? (
                      <Link
                        to={`/profile/${attendee.profileId}`}
                        className="block text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      >
                        {attendee.name}
                      </Link>
                    ) : (
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">
                        {attendee.name}
                      </span>
                    )}
                    {attendee.message && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {attendee.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Organizer image management */}
        {event.isOrganizer && (
          <EventImageManager eventId={event._id} event={event} />
        )}

        {/* Back link */}
        <div className="mt-8">
          <Link
            to="/events"
            className="text-blue-600 hover:text-blue-500 text-sm font-medium"
          >
            ← Back to events
          </Link>
        </div>
      </div>

      {/* Edit Form Modal */}
      {showEditForm && (
        <EditEventModal
          eventId={event._id}
          initialValues={{
            title: event.title,
            description: event.description,
            datetime: event.datetime,
            location: event.location,
            tags: event.tags,
            requiresApproval: event.requiresApproval,
          }}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </div>
  );
}

function EventImageManager({
  eventId,
  event,
}: {
  eventId: Id<"events">;
  event: {
    coverImageUrl?: string | null;
    coverColor?: string;
    galleryImageUrls?: string[];
    imageStorageIds?: Id<"_storage">[];
  };
}) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveEventCoverImage = useMutation(api.files.saveEventCoverImage);
  const deleteEventCoverImage = useMutation(api.files.deleteEventCoverImage);
  const addEventGalleryImage = useMutation(api.files.addEventGalleryImage);
  const removeEventGalleryImage = useMutation(
    api.files.removeEventGalleryImage,
  );
  const updateEventCoverColor = useMutation(api.files.updateEventCoverColor);

  const [uploading, setUploading] = useState<"cover" | "gallery" | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setUploading("cover");
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();
      await saveEventCoverImage({ eventId, storageId });
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be less than 5MB");
      return;
    }

    setUploading("gallery");
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");

      const { storageId } = await result.json();
      await addEventGalleryImage({ eventId, storageId });
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setUploading(null);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  async function handleRemoveGalleryImage(storageId: Id<"_storage">) {
    if (!confirm("Remove this image?")) return;
    try {
      await removeEventGalleryImage({ eventId, storageId });
    } catch (err) {
      console.error("Remove error:", err);
    }
  }

  const galleryCount = event.galleryImageUrls?.length || 0;
  const canAddMoreGallery = galleryCount < 3;

  return (
    <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Event Images
      </h2>

      {/* Cover Image */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Cover Image
        </h3>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverUpload}
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploading === "cover"}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {uploading === "cover"
              ? "Uploading..."
              : event.coverImageUrl
                ? "Change Cover"
                : "Add Cover"}
          </button>
          {event.coverImageUrl && (
            <button
              onClick={() => deleteEventCoverImage({ eventId })}
              className="px-3 py-1.5 text-red-600 hover:text-red-500 text-sm font-medium"
            >
              Remove
            </button>
          )}
        </div>

        {/* Cover Color (shown when no cover image) */}
        {!event.coverImageUrl && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Or choose a color:
            </p>
            <div className="flex gap-2">
              {COVER_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() =>
                    updateEventCoverColor({ eventId, color: color.value })
                  }
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${color.gradient} ${
                    event.coverColor === color.value
                      ? "ring-2 ring-offset-2 ring-blue-500"
                      : ""
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Gallery Images */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Gallery ({galleryCount}/3)
        </h3>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleGalleryUpload}
          className="hidden"
        />

        <div className="grid grid-cols-3 gap-2 mb-3">
          {event.galleryImageUrls?.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 group"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => {
                  const storageId = event.imageStorageIds?.[i];
                  if (storageId) handleRemoveGalleryImage(storageId);
                }}
                className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          ))}
          {canAddMoreGallery && (
            <button
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading === "gallery"}
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 disabled:opacity-50"
            >
              {uploading === "gallery" ? (
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent" />
              ) : (
                <svg
                  className="w-8 h-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add up to 3 photos to showcase your event
        </p>
      </div>
    </div>
  );
}

const EVENT_TAGS = [
  "Workshop",
  "Meetup",
  "Conference",
  "Networking",
  "Creative",
  "Music",
  "Film",
  "Art",
  "Writing",
  "Tech",
  "Worship",
  "Bible Study",
  "Fellowship",
  "Reading",
];

function EditEventModal({
  eventId,
  initialValues,
  onClose,
}: {
  eventId: Id<"events">;
  initialValues: {
    title: string;
    description: string;
    datetime: number;
    location?: string;
    tags: string[];
    requiresApproval: boolean;
  };
  onClose: () => void;
}) {
  const updateEvent = useMutation(api.events.update);

  // Parse datetime into date and time strings
  const initialDate = new Date(initialValues.datetime);
  const dateStr = initialDate.toISOString().split("T")[0];
  const timeStr = initialDate.toTimeString().slice(0, 5);

  const [title, setTitle] = useState(initialValues.title);
  const [description, setDescription] = useState(initialValues.description);
  const [date, setDate] = useState(dateStr);
  const [time, setTime] = useState(timeStr);
  const [location, setLocation] = useState(initialValues.location || "");
  const [selectedLocation, setSelectedLocation] =
    useState<LocationSuggestion | null>(null);
  const [tags, setTags] = useState<string[]>(initialValues.tags);
  const [requiresApproval, setRequiresApproval] = useState(
    initialValues.requiresApproval,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Handle location selection from autocomplete
  function handleLocationSelect(suggestion: LocationSuggestion) {
    setSelectedLocation(suggestion);
  }

  // Clear selected location if user manually edits
  function handleLocationChange(value: string) {
    setLocation(value);
    if (
      !value ||
      (selectedLocation && !value.includes(selectedLocation.displayName))
    ) {
      setSelectedLocation(null);
    }
  }

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim() || !description.trim() || !date || !time) {
      setError("Please fill in all required fields");
      return;
    }

    const datetime = new Date(`${date}T${time}`).getTime();

    setSaving(true);
    try {
      await updateEvent({
        eventId,
        title,
        description,
        datetime,
        location: location || undefined,
        locationType: selectedLocation?.locationType,
        address: selectedLocation?.address,
        coordinates: selectedLocation?.coordinates,
        placeId: selectedLocation?.placeId,
        tags,
        requiresApproval,
      });
      onClose();
    } catch (err) {
      setError("Failed to update event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Edit Event
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's this event about?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Time *
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Location
              </label>
              <LocationAutocomplete
                value={location}
                onChange={handleLocationChange}
                onSelect={handleLocationSelect}
                placeholder="Search for a location, type 'Online', or 'TBD'"
              />
              {selectedLocation && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Location verified
                  {selectedLocation.coordinates && " with coordinates"}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tags
              </label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      tags.includes(tag)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="approval-edit"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <label
                htmlFor="approval-edit"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Require approval for attendees
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
