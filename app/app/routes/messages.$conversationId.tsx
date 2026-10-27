import { useMutation, useQuery } from "convex/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { FF_DESK } from "../lib/featureFlags";
import { FULL_HEIGHT } from "../lib/phoneBar";
import { exactTime, startsStretch, stretchLabel } from "../lib/messageTime";
import { errorMessage } from "../lib/convexError";
import { PersonAvatar } from "../components/PersonAvatar";
import { observeVisibleMessageReads } from "../lib/visibleMessages";

// The thread reads as one column, not edge to edge (Rick, 2026-10-01): full
// width on a phone, then 768px, then 896px on a big screen. Bubbles stop at
// 34rem so a long message keeps a readable line.
const COLUMN = "mx-auto w-full lg:max-w-3xl 2xl:max-w-4xl";
// The composer sits on the bottom edge, where the desktop palette is (56px
// at 28px in, plus its ring). From md to lg the column fills the window, so
// the composer starts past the palette; from lg the centered column already
// clears it.
const PALETTE_CLEAR = "md:pl-28 lg:pl-4";

export default function ConversationView() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const conversation = useQuery(
    api.messaging.getConversation,
    conversationId
      ? { conversationId: conversationId as Id<"conversations"> }
      : "skip",
  );
  const projectContexts = conversation?.projectContexts ?? [];
  const requestedContext = searchParams.get("application");
  const activeProjectContext = requestedContext === "general"
    ? null
    : projectContexts.find(context => context.projectMemberId === (requestedContext ?? projectContexts.at(-1)?.projectMemberId)) ?? null;
  const unavailableProjectContext = requestedContext !== null && requestedContext !== "general" && !activeProjectContext;

  const messagesData = useQuery(
    api.messaging.getMessages,
    conversationId
      ? { conversationId: conversationId as Id<"conversations">, limit: 100 }
      : "skip",
  );

  const sendMessage = useMutation(api.messaging.sendMessage);

  const markRead = useMutation(api.messaging.markConversationRead);
  // IDs change even when the latest page remains at its 100-message limit.
  const messageReadVersion = messagesData?.messages
    .filter(message => !message.isOwnMessage && message.readAt === undefined)
    .map(message => String(message._id)).join("|");
  useEffect(() => {
    if (!conversationId || !messageListRef.current || !messageReadVersion) return;
    return observeVisibleMessageReads(messageListRef.current, visibleMessageIds => markRead({
      conversationId: conversationId as Id<"conversations">,
      visibleMessageIds: visibleMessageIds as Id<"messages">[],
    }));
  }, [conversationId, markRead, messageReadVersion]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend() {
    if (!message.trim() || !conversation?.participant.userId || sending || unavailableProjectContext) return;

    setSending(true);
    setSendError(null);
    try {
      await sendMessage({
        recipientId: conversation.participant.userId,
        content: message.trim(),
        ...(activeProjectContext ? { projectMemberId: activeProjectContext.projectMemberId } : {}),
      });
      setMessage("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(errorMessage(err, "Your message didn't send. Try again."));
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

  // Loading state
  if (conversation === undefined || messagesData === undefined) {
    return (
      <div
        className={`flex flex-col ${FULL_HEIGHT}`}
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
        className={`flex flex-col items-center justify-center ${FULL_HEIGHT} p-6`}
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
  const now = Date.now();

  return (
    <div
      className={`flex flex-col ${FULL_HEIGHT}`}
      style={{ backgroundColor: "var(--app-surface)" }}
    >
      {/* Header */}
      <div
        className="p-4 border-b shrink-0"
        style={{
          backgroundColor: "var(--app-surface-raised)",
          borderColor: "var(--app-hairline)",
        }}
      >
        <div className={`${COLUMN} flex items-center gap-3`}>
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
            <PersonAvatar
              name={conversation.participant.name}
              imageUrl={conversation.participant.imageUrl}
              size="mdBase"
              tone="strong"
            />
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
        {(projectContexts.length > 0 || unavailableProjectContext) && (
          <div className={`${COLUMN} mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm`}>
            <label className="flex items-center gap-2 min-w-0" style={{ color: "var(--app-text-dim)" }}>
              About
              <select
                aria-label="Conversation project and role"
                value={unavailableProjectContext ? "unavailable" : activeProjectContext?.projectMemberId ?? "general"}
                onChange={event => setSearchParams(previous => {
                  const next = new URLSearchParams(previous);
                  next.set("application", event.target.value);
                  return next;
                }, { replace: true })}
                className="min-w-0 max-w-[16rem] sm:max-w-sm rounded-lg border px-2 py-1.5"
                style={{ backgroundColor: "var(--app-surface)", color: "var(--app-text)", borderColor: "var(--app-hairline)" }}
              >
                {unavailableProjectContext && <option value="unavailable" disabled>Project context unavailable</option>}
                <option value="general">General conversation</option>
                {projectContexts.map(context => (
                  <option key={context.projectMemberId} value={context.projectMemberId}>
                    {context.role ? `${context.role} on ` : ""}{context.projectTitle}
                  </option>
                ))}
              </select>
            </label>
            {activeProjectContext && (
              <Link
                to={`/projects/${activeProjectContext.projectId}?tab=team`}
                className="underline underline-offset-2"
                style={{ color: "var(--app-text-muted)" }}
              >
                View project
              </Link>
            )}
          </div>
        )}
        {unavailableProjectContext && (
          <p role="status" className={`${COLUMN} mt-2 text-sm`} style={{ color: "var(--app-text-dim)" }}>
            This project conversation is no longer available. Choose another context or General conversation to send a message.
          </p>
        )}
      </div>

      {/* Messages */}
      <div ref={messageListRef} className="flex-1 overflow-y-auto p-4">
        <div className={`${COLUMN} ${messages.length === 0 ? "h-full" : ""}`}>
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
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              // The time shows as a small label on a new day or after a pause,
              // never inside a bubble. Runs from one sender sit close together.
              const stretch = startsStretch(prev?.createdAt, msg.createdAt);
              const joinedPrev = !stretch && prev?.isOwnMessage === msg.isOwnMessage;
              const gap = i === 0 || stretch ? "" : joinedPrev ? "mt-1" : "mt-3";
              return (
                <Fragment key={msg._id}>
                  {stretch && (
                    <p
                      className={`text-center text-xs mb-2 ${i === 0 ? "" : "mt-5"}`}
                      style={{ color: "var(--app-text-dim)" }}
                    >
                      {stretchLabel(msg.createdAt, now)}
                    </p>
                  )}
                  <div data-inbound-message-id={!msg.isOwnMessage && msg.readAt === undefined ? msg._id : undefined} className={`flex ${gap} ${msg.isOwnMessage ? "justify-end" : "justify-start"}`}>
                    <p
                      title={exactTime(msg.createdAt)}
                      className={`max-w-[80%] md:max-w-[34rem] px-3.5 py-2 rounded-2xl border text-[15px] leading-[1.45] whitespace-pre-wrap break-words ${
                        msg.isOwnMessage
                          ? `border-transparent rounded-br-md ${joinedPrev ? "rounded-tr-md" : ""}`
                          : `rounded-bl-md ${joinedPrev ? "rounded-tl-md" : ""}`
                      }`}
                      style={
                        msg.isOwnMessage
                          ? {
                              backgroundColor: "var(--app-accent-wash)",
                              borderColor: "color-mix(in srgb, var(--app-accent) 22%, transparent)",
                              color: "var(--app-text)",
                            }
                          : {
                              backgroundColor: "var(--app-surface-raised)",
                              borderColor: "var(--app-hairline-raised)",
                              color: "var(--app-text)",
                            }
                      }
                    >
                      {msg.projectContext && (
                        <Link
                          to={`/projects/${msg.projectContext.projectId}?tab=team`}
                          className="block text-xs mb-1 underline underline-offset-2 opacity-75"
                        >
                          About {msg.projectContext.role ? `${msg.projectContext.role} on ` : ""}{msg.projectContext.projectTitle}
                        </Link>
                      )}
                      {msg.content}
                    </p>
                  </div>
                </Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div
        className={`p-4 border-t shrink-0 ${FF_DESK ? PALETTE_CLEAR : ""}`}
        style={{
          backgroundColor: "var(--app-surface-raised)",
          borderColor: "var(--app-hairline)",
        }}
      >
        <div className={COLUMN}>
          {sendError && (
            <p role="alert" className="text-[13px] mb-2" style={{ color: "var(--app-text)" }}>
              {sendError}
            </p>
          )}
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
              disabled={!message.trim() || sending || unavailableProjectContext}
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
    </div>
  );
}
