import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";

// Notifications visible before "Show all". We fetch past this so we know
// whether there is anything more to show; the query's own default is 20.
const NOTIFICATIONS_SHOWN = 20;
const NOTIFICATIONS_FETCH = 100;

export default function MessagesIndex() {
  const navigate = useNavigate();
  const conversations = useQuery(api.messaging.getConversations);
  const notifications = useQuery(api.notifications.getNotifications, {
    limit: NOTIFICATIONS_FETCH,
  });
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  // The sidebar's unread badge is Messages + Notifications combined, and
  // this page is where notifications are listed and read — so mounting it
  // clears both. The list keeps rendering read items.
  const markAllNotificationsRead = useMutation(api.notifications.markAllAsRead);
  useEffect(() => {
    markAllNotificationsRead({});
  }, []);

  // markAllAsRead fires on mount, so the live query flips every readAt a
  // render or two later. Capture which rows were unread the first time data
  // arrives and keep highlighting those for the life of the page.
  const initialUnreadIds = useRef<Set<string> | null>(null);
  if (notifications !== undefined && initialUnreadIds.current === null) {
    initialUnreadIds.current = new Set(
      notifications
        .filter((n) => n.readAt === undefined)
        .map((n) => n._id as string),
    );
  }

  const hasNotifications =
    notifications !== undefined && notifications.length > 0;
  const visibleNotifications = !hasNotifications
    ? []
    : showAllNotifications
      ? notifications
      : notifications.slice(0, NOTIFICATIONS_SHOWN);
  const hasMoreNotifications =
    hasNotifications && notifications.length > NOTIFICATIONS_SHOWN;

  // Helper to format relative time
  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (months > 0) return `${months}mo ago`;
    if (weeks > 0) return `${weeks}w ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  // Get initials from name for avatar fallback
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--app-text)" }}
        >
          Messages
        </h1>
        <p className="mt-1" style={{ color: "var(--app-text-dim)" }}>
          Your conversations
        </p>
      </div>

      {/* Notifications — rendered only when there are any */}
      {hasNotifications && (
        <div className="mb-8">
          <h2
            className="text-lg font-semibold mb-3"
            style={{ color: "var(--app-text)" }}
          >
            Notifications
          </h2>
          <div
            className="rounded-2xl border divide-y divide-[var(--app-hairline)] overflow-hidden"
            style={{
              backgroundColor: "var(--app-surface-raised)",
              borderColor: "var(--app-hairline)",
            }}
          >
            {visibleNotifications.map((n) => {
              const wasUnread = initialUnreadIds.current?.has(n._id) ?? false;
              const avatarUrl = n.relatedUserProfile?.imageUrl || n.imageUrl;
              const avatarName = n.relatedUserProfile?.name;

              const rowClassName = `flex items-start gap-3 px-4 py-3 border-l-2 transition-colors ${
                wasUnread
                  ? "border-l-[var(--app-accent)]"
                  : "border-l-transparent"
              } ${
                n.linkUrl
                  ? "hover:bg-[var(--app-hairline-raised)]"
                  : ""
              }`;

              const content = (
                <>
                  {/* Avatar */}
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={avatarName ?? ""}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : avatarName ? (
                    <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                      {getInitials(avatarName)}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`text-sm truncate ${
                          wasUnread ? "font-semibold" : "font-medium"
                        }`}
                        style={{ color: "var(--app-text)" }}
                      >
                        {n.title}
                      </p>
                      <span
                        className="text-xs flex-shrink-0"
                        style={{ color: "var(--app-text-dim)" }}
                      >
                        {getRelativeTime(n.createdAt)}
                      </span>
                    </div>
                    {n.message && (
                      <p
                        className="text-sm mt-0.5"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {n.message}
                      </p>
                    )}
                  </div>
                </>
              );

              return n.linkUrl ? (
                <Link key={n._id} to={n.linkUrl} className={rowClassName}>
                  {content}
                </Link>
              ) : (
                <div key={n._id} className={rowClassName}>
                  {content}
                </div>
              );
            })}
          </div>
          {hasMoreNotifications && (
            <button
              onClick={() => setShowAllNotifications((v) => !v)}
              className="mt-2 text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: "var(--app-accent-ink)" }}
            >
              {showAllNotifications ? "Show less" : "Show all"}
            </button>
          )}
        </div>
      )}

      {/* Conversations heading — only needed once there is a section above */}
      {hasNotifications && (
        <h2
          className="text-lg font-semibold mb-3"
          style={{ color: "var(--app-text)" }}
        >
          Conversations
        </h2>
      )}

      {/* Loading State */}
      {conversations === undefined ? (
        <div className="flex items-center justify-center py-16">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderBottomColor: "var(--app-accent)" }}
          />
        </div>
      ) : conversations.length === 0 ? (
        /* Empty State */
        <div
          className="text-center py-16"
          style={{ color: "var(--app-text-dim)" }}
        >
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-lg font-medium mb-1">No messages yet</p>
          <p className="text-sm">
            Start a conversation by visiting someone's profile
          </p>
        </div>
      ) : (
        /* Conversation List */
        <div className="space-y-2">
          {conversations.map((conversation) => {
            const isUnread = conversation.unreadCount > 0;

            return (
              <div
                key={conversation._id}
                onClick={() => navigate(`/messages/${conversation._id}`)}
                className="group flex items-center gap-4 p-4 rounded-2xl border hover:border-[var(--app-accent)] transition-all hover:shadow-lg cursor-pointer"
                style={{
                  backgroundColor: "var(--app-surface-raised)",
                  borderColor: "var(--app-hairline)",
                }}
              >
                {/* Profile Image */}
                {conversation.participant.imageUrl ? (
                  <img
                    src={conversation.participant.imageUrl}
                    alt={conversation.participant.name}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {getInitials(conversation.participant.name)}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Name and Timestamp Row */}
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      to={`/profile/${conversation.participant.profileId}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`truncate hover:text-[var(--app-accent-ink)] transition-colors ${
                        isUnread ? "font-bold" : "font-medium"
                      }`}
                      style={{ color: "var(--app-text)" }}
                    >
                      {conversation.participant.name}
                    </Link>
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: "var(--app-text-dim)" }}
                    >
                      {getRelativeTime(conversation.lastMessageAt)}
                    </span>
                  </div>

                  {/* Message Preview */}
                  <div className="flex items-center gap-2 mt-1">
                    <p
                      className={`text-sm truncate flex-1 ${
                        isUnread ? "font-semibold" : ""
                      }`}
                      style={{
                        color: isUnread
                          ? "var(--app-text-muted)"
                          : "var(--app-text-dim)",
                      }}
                    >
                      {conversation.lastMessagePreview || "No messages yet"}
                    </p>

                    {/* Unread Indicator */}
                    {isUnread && (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "var(--app-accent)" }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
