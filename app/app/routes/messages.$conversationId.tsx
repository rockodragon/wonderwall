import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function ConversationView() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const conversation = useQuery(
    api.messaging.getConversation,
    conversationId
      ? { conversationId: conversationId as Id<"conversations"> }
      : "skip",
  );

  const messagesData = useQuery(
    api.messaging.getMessages,
    conversationId
      ? { conversationId: conversationId as Id<"conversations">, limit: 100 }
      : "skip",
  );

  const sendMessage = useMutation(api.messaging.sendMessage);

  // See messages._index.tsx — a direct conversation link should also clear
  // the merged Messages+Notifications badge, not just the inbox list view.
  const markAllNotificationsRead = useMutation(api.notifications.markAllAsRead);
  useEffect(() => {
    markAllNotificationsRead({});
  }, []);
  const markRead = useMutation(api.messaging.markConversationRead);

  // Mark messages as read when viewing
  useEffect(() => {
    if (conversationId) {
      markRead({
        conversationId: conversationId as Id<"conversations">,
      }).catch(() => {});
    }
  }, [conversationId, markRead, messagesData?.messages.length]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    if (!message.trim() || !conversation?.participant.userId || sending) return;

    setSending(true);
    try {
      await sendMessage({
        recipientId: conversation.participant.userId,
        content: message.trim(),
      });
      setMessage("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Failed to send message:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to send message";
      alert(errorMessage);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTimestamp(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return `Yesterday ${date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    } else if (diffDays < 7) {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  // Loading state
  if (conversation === undefined || messagesData === undefined) {
    return (
      <div
        className="flex flex-col h-screen"
        style={{ backgroundColor: "var(--app-surface)" }}
      >
        {/* Header skeleton */}
        <div
          className="flex items-center gap-3 p-4 border-b"
          style={{
            backgroundColor: "var(--app-surface-raised)",
            borderColor: "var(--app-hairline)",
          }}
        >
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
          <div className="flex-1">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
        {/* Messages area skeleton */}
        <div className="flex-1 p-4 space-y-4">
          <div className="flex justify-start">
            <div className="h-12 w-48 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 w-56 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Conversation not found
  if (!conversation) {
    return (
      <div
        className="flex flex-col items-center justify-center h-screen p-6"
        style={{ backgroundColor: "var(--app-surface)" }}
      >
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            style={{ color: "var(--app-text-dim)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <h2
            className="text-xl font-semibold mb-2"
            style={{ color: "var(--app-text)" }}
          >
            Conversation not found
          </h2>
          <p className="mb-6" style={{ color: "var(--app-text-dim)" }}>
            This conversation may have been deleted or you don't have access to
            it.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 rounded-xl font-medium hover:opacity-90 transition-colors"
            style={{
              backgroundColor: "var(--app-accent)",
              color: "var(--garden-ink)",
            }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const messages = messagesData?.messages ?? [];

  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: "var(--app-surface)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 border-b shrink-0"
        style={{
          backgroundColor: "var(--app-surface-raised)",
          borderColor: "var(--app-hairline)",
        }}
      >
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg transition-colors hover:text-[var(--app-text)] hover:bg-[var(--app-hairline-raised)]"
          style={{ color: "var(--app-text-dim)" }}
          aria-label="Go back"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Participant info */}
        <Link
          to={`/profile/${conversation.participant.profileId}`}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          {conversation.participant.imageUrl ? (
            <img
              src={conversation.participant.imageUrl}
              alt={conversation.participant.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center text-white font-bold">
              {conversation.participant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1
              className="font-semibold truncate"
              style={{ color: "var(--app-text)" }}
            >
              {conversation.participant.name}
            </h1>
          </div>
        </Link>

        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg transition-colors hover:text-[var(--app-text)] hover:bg-[var(--app-hairline-raised)]"
            style={{ color: "var(--app-text-dim)" }}
            aria-label="Menu"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-lg border z-20 overflow-hidden"
                style={{
                  backgroundColor: "var(--app-surface-raised)",
                  borderColor: "var(--app-hairline)",
                }}
              >
                <Link
                  to={`/profile/${conversation.participant.profileId}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--app-hairline-raised)] transition-colors"
                  style={{ color: "var(--app-text-muted)" }}
                  onClick={() => setShowMenu(false)}
                >
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
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  View Profile
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                style={{ color: "var(--app-text-dim)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p style={{ color: "var(--app-text-dim)" }}>
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg._id}
              className={`flex ${msg.isOwnMessage ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl ${
                  msg.isOwnMessage ? "rounded-br-md" : "rounded-bl-md"
                }`}
                style={
                  msg.isOwnMessage
                    ? { backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }
                    : { backgroundColor: "var(--app-hairline-raised)", color: "var(--app-text)" }
                }
              >
                <p className="px-4 py-2.5 whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
                <p
                  className="px-4 pb-2 text-xs"
                  style={
                    msg.isOwnMessage
                      ? { color: "var(--garden-ink)", opacity: 0.65 }
                      : { color: "var(--app-text-dim)" }
                  }
                >
                  {formatTimestamp(msg.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        className="p-4 border-t shrink-0"
        style={{
          backgroundColor: "var(--app-surface-raised)",
          borderColor: "var(--app-hairline)",
        }}
      >
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-4 py-3 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] max-h-32"
            style={{
              backgroundColor: "var(--app-hairline-raised)",
              color: "var(--app-text)",
              height: "auto",
              minHeight: "48px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="p-3 rounded-full hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            style={{ backgroundColor: "var(--app-accent)", color: "var(--garden-ink)" }}
            aria-label="Send message"
          >
            {sending ? (
              <div
                className="w-5 h-5 animate-spin rounded-full border-2"
                style={{ borderColor: "var(--garden-ink)", borderTopColor: "transparent" }}
              />
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>
        <p
          className="text-xs mt-2 text-center"
          style={{ color: "var(--app-text-dim)" }}
        >
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
