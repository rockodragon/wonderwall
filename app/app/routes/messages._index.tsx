import { useQuery } from "convex/react";
import { Link, useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";

export default function MessagesIndex() {
  const navigate = useNavigate();
  const conversations = useQuery(api.messaging.getConversations);

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Messages
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Your conversations
        </p>
      </div>

      {/* Loading State */}
      {conversations === undefined ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : conversations.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
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
                className="group flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-lg cursor-pointer"
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
                      className={`truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${
                        isUnread
                          ? "font-bold text-gray-900 dark:text-white"
                          : "font-medium text-gray-900 dark:text-white"
                      }`}
                    >
                      {conversation.participant.name}
                    </Link>
                    <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0">
                      {getRelativeTime(conversation.lastMessageAt)}
                    </span>
                  </div>

                  {/* Message Preview */}
                  <div className="flex items-center gap-2 mt-1">
                    <p
                      className={`text-sm truncate flex-1 ${
                        isUnread
                          ? "font-semibold text-gray-800 dark:text-gray-200"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {conversation.lastMessagePreview || "No messages yet"}
                    </p>

                    {/* Unread Indicator */}
                    {isUnread && (
                      <span className="w-2.5 h-2.5 bg-blue-600 rounded-full flex-shrink-0" />
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
