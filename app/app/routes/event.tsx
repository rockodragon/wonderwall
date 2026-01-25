import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function EventDetail() {
  const { eventId } = useParams();
  const event = useQuery(
    api.events.get,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
  const applyToEvent = useMutation(api.events.apply);
  const applications = useQuery(
    api.events.getApplications,
    eventId && event?.isOrganizer
      ? { eventId: eventId as Id<"events"> }
      : "skip",
  );
  const updateStatus = useMutation(api.events.updateApplicationStatus);

  const [message, setMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);

  if (event === undefined) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-8" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-gray-600 dark:text-gray-400">
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
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
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
        {event.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {event.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Organizer */}
      {event.organizer && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
            {event.organizer.imageUrl ? (
              <img
                src={event.organizer.imageUrl}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-sm font-medium text-gray-500">
                {event.organizer.name.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Organized by
            </p>
            <p className="font-medium text-gray-900 dark:text-white">
              {event.organizer.name}
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {event.description}
        </p>
      </div>

      {/* Status / Apply section */}
      {isPast ? (
        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl text-center">
          <p className="text-gray-500 dark:text-gray-400">
            This event has ended
          </p>
        </div>
      ) : event.userApplication ? (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <p className="text-blue-700 dark:text-blue-300 font-medium">
            {event.userApplication.status === "accepted"
              ? "You're attending this event!"
              : event.userApplication.status === "declined"
                ? "Your application was declined"
                : "Your application is pending"}
          </p>
        </div>
      ) : canApply ? (
        showApplyForm ? (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <h3 className="font-medium text-gray-900 dark:text-white mb-3">
              Apply to attend
            </h3>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={applying}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {applying ? "Applying..." : "Submit"}
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
            {event.requiresApproval ? "Apply to Attend" : "Register"}
          </button>
        )
      ) : null}

      {/* Organizer dashboard */}
      {event.isOrganizer && applications && (
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Applications ({applications.length})
          </h2>
          {applications.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              No applications yet
            </p>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div
                  key={app._id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                      {app.applicant?.imageUrl ? (
                        <img
                          src={app.applicant.imageUrl}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-500">
                          {app.applicant?.name?.charAt(0) || "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {app.applicant?.name || "Unknown"}
                      </p>
                      {app.message && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                          {app.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {app.status === "pending" ? (
                      <>
                        <button
                          onClick={() =>
                            handleUpdateStatus(app._id, "accepted")
                          }
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() =>
                            handleUpdateStatus(app._id, "declined")
                          }
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          Decline
                        </button>
                      </>
                    ) : (
                      <span
                        className={`px-2 py-1 rounded text-sm ${
                          app.status === "accepted"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {app.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
  );
}
