// Start (or reopen) a conversation with someone and go to it. A profile's
// Message button, an event's guest list, a project's team row, a
// celebration card and the new-message box all do this; a blocked pair
// reads the same on each.

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { usePostHog } from "@posthog/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorCode, errorMessage } from "./convexError";

export const BLOCKED_MESSAGE = "You can't message this person.";

/** The words for a failed start. getOrCreateConversation refuses a blocked
 * pair (either direction) with `{ code: "blocked" }`. */
export function startConversationError(err: unknown): string {
  return errorCode(err) === "blocked" ? BLOCKED_MESSAGE : errorMessage(err);
}

type TrackProps = Record<string, unknown>;

/** `start(userId)` opens the conversation and navigates to it; `error` is the
 * line to show when it can't (`clearError` takes it down). `starting` stays
 * true once they're on their way, so the button can't be pressed twice while
 * the page changes.
 *
 * - `onOpened` runs once the conversation exists, just before we go to it
 *   (a celebration card marks itself done there).
 * - `track` is the PostHog "conversation_started" payload; `start` can add
 *   to it per person. Nothing is sent when neither has anything. */
export function useStartConversation({ onOpened, track }: { onOpened?: () => void; track?: TrackProps } = {}) {
  const getOrCreateConversation = useMutation(api.messaging.getOrCreateConversation);
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function start(userId: string, trackMore?: TrackProps) {
    if (inFlight.current) return;
    inFlight.current = true;
    setStarting(true);
    setError(null);
    try {
      const conversation = await getOrCreateConversation({ otherUserId: userId as Id<"users"> });
      if (!conversation) throw new Error("No conversation");
      const props = { ...track, ...trackMore };
      if (Object.keys(props).length > 0) posthog?.capture("conversation_started", props);
      onOpened?.();
      navigate(`/messages/${conversation._id}`);
    } catch (err) {
      setError(startConversationError(err));
      inFlight.current = false;
      setStarting(false);
    }
  }

  return { start, starting, error, clearError: () => setError(null) };
}
