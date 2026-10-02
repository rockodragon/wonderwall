// A Shortlist card's buttons (shortlistCards.ts decides which): links go,
// calls run the mutation the item's own page would. A button is disabled
// while its call runs, and so are the others, so Accept and Decline can't
// race, and ← / → wait too, so the call lands on the card it started on. When
// it lands, a toast says what happened and the card closes, if it's still the
// one open: the member may have closed it, or opened another, meanwhile. The
// Shortlist updates itself from the query. A failure stays on the card, read
// out, the way the event button reports one.
//
// Mutations come from the hooks Convex gives every page; nothing new is
// read. useMutation only binds a function, so all six cost nothing until one
// is pressed.

import { useState } from "react";
import { useMutation } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorMessage } from "../lib/convexError";
import { showDeskToast } from "./DeskToast";
import type { DeskCardId } from "./deskState";
import type { ShortlistButton, ShortlistCall } from "./shortlistCards";
import { CARD_BUTTON_CLASS, DESK, FOCUS_RING_CLASS } from "./tokens";

const SOLID = `${CARD_BUTTON_CLASS} border border-transparent bg-[#FFE066] text-[#121212] hover:bg-[#FFEA94] disabled:cursor-default disabled:opacity-70`;
// "You're going": true already, in the accent's outline.
const STATE = `${CARD_BUTTON_CLASS} cursor-default border border-[#FFE066] bg-[rgba(255,224,102,0.1)] text-[#FFE066]`;
const TEXT = `border-0 bg-transparent p-0 py-1.5 text-[15px] text-[#D6D6D6] no-underline transition-colors hover:text-[#FFE066] disabled:cursor-default disabled:opacity-60 ${FOCUS_RING_CLASS}`;

/** Runs a Shortlist call: the one place its arguments meet the API. */
function useShortlistCall(): (call: ShortlistCall) => Promise<unknown> {
  const respondToInvite = useMutation(api.garden.projectTeam.respondToInvite);
  const decideRequest = useMutation(api.garden.projectTeam.decideRequest);
  const withdrawRequest = useMutation(api.garden.projectTeam.withdrawRequest);
  const updateApplicationStatus = useMutation(api.events.updateApplicationStatus);
  const apply = useMutation(api.events.apply);
  const removeFavorite = useMutation(api.favorites.remove);

  return (call) => {
    switch (call.fn) {
      case "respondToInvite":
        return respondToInvite({ projectId: call.projectId as Id<"projects">, accept: call.accept });
      case "decideRequest":
        return decideRequest({ memberId: call.memberId as Id<"projectMembers">, accept: call.accept });
      case "withdrawRequest":
        return withdrawRequest({ projectId: call.projectId as Id<"projects"> });
      case "updateApplicationStatus":
        return updateApplicationStatus({ applicationId: call.applicationId as Id<"eventApplications">, status: call.status });
      case "apply":
        return apply({ eventId: call.eventId as Id<"events"> });
      case "unsave":
        // Remove, never toggle: pressed twice, or after the save went
        // elsewhere, it can't save the thing again.
        return removeFavorite({ targetType: call.targetType, targetId: call.targetId });
    }
  };
}

export function ShortlistActions({
  id,
  buttons,
  onDone,
  onBusy,
}: {
  /** The card the buttons are on. */
  id: DeskCardId;
  buttons: ShortlistButton[];
  /** A call landed: close card `id`, unless it has closed already. */
  onDone: (id: DeskCardId) => void;
  /** A call started (true) or settled (false). */
  onBusy?: (busy: boolean) => void;
}) {
  const run = useShortlistCall();
  const [running, setRunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function press(button: Extract<ShortlistButton, { kind: "call" }>, i: number) {
    if (running !== null) return;
    setRunning(i);
    setError(null);
    onBusy?.(true);
    try {
      await run(button.call);
      showDeskToast(button.done);
      onDone(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(null);
      onBusy?.(false);
    }
  }

  return (
    <>
      {buttons.map((button, i) => {
        switch (button.kind) {
          case "call":
            return (
              <button
                key={button.label}
                type="button"
                onClick={() => press(button, i)}
                disabled={running !== null}
                aria-busy={running === i || undefined}
                className={button.solid ? SOLID : TEXT}
              >
                {button.label}
              </button>
            );
          case "link":
            return (
              <Link key={button.label} to={button.href} className={button.solid ? `${SOLID}` : TEXT}>
                {button.label}
              </Link>
            );
          case "state":
            return (
              <button key={button.label} type="button" disabled className={STATE}>
                {button.label}
              </button>
            );
        }
      })}
      <span role="status" aria-live="polite" style={{ fontSize: 14, color: "#FF9B8F", flexBasis: error ? "100%" : undefined }}>
        {error}
      </span>
      {running !== null && <span style={{ fontSize: 14, color: DESK.muted }}>Saving…</span>}
    </>
  );
}
