// The right-hand panel of an opened card: meta line and close button, title,
// who's behind it, a few lines, and the one thing to do. The left 46% is the
// card's own face (DeskCard.tsx). From the handoff, "Opened card".
//
// The panel mounts when a card opens and unmounts a beat after it closes, so
// its queries (a profile's bio, whether I'm going) only run while it's up.
// Hooks run unconditionally; a query that doesn't apply is skipped.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { X } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useReducedMotion } from "../hooks/useMediaQuery";
import { errorMessage } from "../lib/convexError";
import type { DeskAction, DeskCard } from "./deskCards";
import { plainText } from "./deskCards";
import { DESK, DESK_SANS, FOCUS_RING_CLASS, monoLabel } from "./tokens";

const BUTTON_CLASS = `inline-flex h-[52px] items-center justify-center rounded-[10px] px-7 text-base font-semibold no-underline transition-colors ${FOCUS_RING_CLASS}`;

export function DetailPanel({
  card,
  visible,
  onClose,
}: {
  card: DeskCard;
  visible: boolean;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  // A followed person's bio isn't in the list the card came from.
  const profile = useQuery(
    api.profiles.getProfile,
    card.profileId ? { profileId: card.profileId as Id<"profiles"> } : "skip",
  );

  useEffect(() => {
    if (visible) closeRef.current?.focus({ preventScroll: true });
  }, [visible]);

  const description = card.detail.description || plainText(profile?.bio, 500);
  const host = card.detail.host ?? (profile?.location || null);
  const action = card.detail.action;

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: "46%",
        background: DESK.panel,
        padding: 56,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        overflowY: "auto",
        color: DESK.text,
        fontFamily: DESK_SANS,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        // Fades in 400ms after a 260ms wait; goes quickly when the card closes.
        transition: reduced ? "none" : visible ? `opacity 400ms ${DESK.ease} 260ms` : "opacity 160ms linear",
      }}
    >
      <div className="flex items-start justify-between gap-6">
        <p style={{ ...monoLabel(12, "0.2em"), color: DESK.accent, margin: 0, paddingTop: 10 }}>{card.detail.meta}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#333] bg-transparent text-[#F4F4F2] transition-colors hover:border-[#FFE066] hover:text-[#FFE066] ${FOCUS_RING_CLASS}`}
        >
          <X size={18} weight="regular" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
        <h2 style={{ margin: 0, fontSize: 44, lineHeight: 1.08, fontWeight: 500, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>
          {card.detail.title}
        </h2>
        {host && <p style={{ margin: 0, fontSize: 15, color: DESK.muted }}>{host}</p>}
        {description && (
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.65, color: DESK.textSoft, maxWidth: "46ch" }}>{description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
          {action?.kind === "link" && <ActionLink action={action} />}
          {action?.kind === "rsvp" && <JoinButton action={action} />}
          {card.detail.aside && <span style={{ fontSize: 14, color: DESK.muted }}>{card.detail.aside}</span>}
          {card.kind === "event" && (
            <Link
              to={card.href}
              className={`text-[15px] text-[#F4F4F2] underline-offset-4 transition-colors hover:text-[#FFE066] hover:underline ${FOCUS_RING_CLASS}`}
            >
              Event page →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionLink({ action }: { action: Extract<DeskAction, { kind: "link" }> }): ReactNode {
  return (
    <Link to={action.href} className={`${BUTTON_CLASS} bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94]`}>
      {action.label}
    </Link>
  );
}

/** A free event's button. A signed-in member joins the way the event page's
 * Join Event does (events.apply), so the event page, the host's list and the
 * going count all agree. (rsvpToEvent is the guest path; the desk never uses
 * it.) Hidden until the answers are in, so a member who is already going or
 * hosting never sees a button that isn't true. */
function JoinButton({ action }: { action: Extract<DeskAction, { kind: "rsvp" }> }) {
  const eventId = action.eventId as Id<"events">;
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  // The event page's own answer: my application's status, and whether I host.
  const event = useQuery(api.events.get, { eventId });
  // An RSVP made before the account existed (a guest's) counts as going too.
  const rsvp = useQuery(api.garden.eventRsvps.getMyRsvpStatus, isAuthenticated ? { eventId } : "skip");
  const apply = useMutation(api.events.apply);
  const [state, setState] = useState<"idle" | "saving" | "joined">("idle");
  const [error, setError] = useState<string | null>(null);

  const settled = !authLoading && event !== undefined && (!isAuthenticated || rsvp !== undefined);
  // Not settled: keep the button's place so the panel doesn't shift when it lands.
  if (!settled) return <span aria-hidden style={{ display: "inline-block", height: 52, width: 148 }} />;
  // A guest joins from the event page (events.apply needs an account); a host
  // manages the event there too.
  if (!isAuthenticated || !event || event.isHost || event.isOrganizer) return null;

  const status = event.userApplication?.status;
  const going = state === "joined" || status === "accepted" || !!rsvp;
  const label = going ? "You're going" : status === "pending" ? "Requested" : status === "declined" ? "Declined" : action.label;
  const done = going || status === "pending" || status === "declined";

  async function onClick() {
    if (done || state === "saving") return;
    setState("saving");
    setError(null);
    try {
      await apply({ eventId });
      setState("joined");
    } catch (err) {
      setState("idle");
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={done || state === "saving"}
        className={
          going || status === "pending"
            ? `${BUTTON_CLASS} cursor-default border border-[#FFE066] bg-[rgba(255,224,102,0.1)] text-[#FFE066]`
            : done
              ? `${BUTTON_CLASS} cursor-default border border-[#333] bg-transparent`
              : `${BUTTON_CLASS} border border-transparent bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94] disabled:opacity-70`
        }
        style={status === "declined" && !going ? { color: DESK.muted } : undefined}
      >
        {label}
      </button>
      <span role="status" aria-live="polite" style={{ fontSize: 14, color: "#FF9B8F", flexBasis: error ? "100%" : undefined }}>
        {error}
      </span>
    </>
  );
}
