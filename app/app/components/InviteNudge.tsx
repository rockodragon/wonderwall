// A one-time card on Today, the third day someone comes back
// (lib/visitDays.ts): "Know someone who'd like it here?" with their invite
// link a click away. Gone for good once closed or once they copy the link.
// The canvas shows it under its greeting (tone "desk"); a phone's Today
// shows it under the Updates (tone "page").

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { markNoteSeen, useOnceNote } from "../hooks/useOnceNote";
import { useInviteLink } from "../lib/useInviteLink";
import { NUDGE_ON_DAY, recordVisitDay } from "../lib/visitDays";
import { FOCUS_RING_CLASS } from "../desk/tokens";
import { CARD_TONE, type CardTone } from "./cardTone";
import { InviteIcon } from "./InviteCTA";

export const INVITE_NUDGE_KEY = "today.inviteNudge";

type Tone = CardTone;

/** Counts today's visit; whether the card is up, and how to close it. The
 *  canvas holds this itself, since its layout keeps cards clear of it.
 *  `hold` keeps it back while the spot is taken or not yet known to be
 *  free (the Share a project card, up until the member has a project):
 *  it comes on a later visit instead. */
export function useInviteNudge(hold = false) {
  const [days, setDays] = useState(0);
  useEffect(() => setDays(recordVisitDay()), []);
  return useOnceNote(INVITE_NUDGE_KEY, days >= NUDGE_ON_DAY && !hold);
}

export function InviteNudge({ tone, className, hold }: { tone: Tone; className?: string; hold?: boolean }) {
  const note = useInviteNudge(hold);
  if (!note.show) return null;
  return (
    <div className={className}>
      <InviteNudgeCard tone={tone} onClose={note.dismiss} />
    </div>
  );
}

export function InviteNudgeCard({ tone, onClose }: { tone: Tone; onClose: () => void }) {
  const c = CARD_TONE[tone];
  const link = useInviteLink("nudge");
  async function copy() {
    await link.copy();
    // They did what it asked: it won't come back, though it stays up now
    // so "Link copied" can say so.
    markNoteSeen(INVITE_NUDGE_KEY);
  }
  return (
    <section
      aria-label="Invite someone"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-5 py-4"
      style={{ borderColor: c.line, background: c.bg, maxWidth: 920 }}
    >
      {/* Wide enough to read as one line; on a phone the button goes under it. */}
      <p className="min-w-[13rem] flex-1 text-[15px]" style={{ color: c.text }}>
        Know someone who'd like it here?
      </p>
      <button
        type="button"
        onClick={copy}
        title={link.url ? `Copy ${link.url}` : undefined}
        disabled={link.loading || !link.url}
        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13.5px] font-medium disabled:opacity-50 ${FOCUS_RING_CLASS}`}
        style={{ borderColor: link.copied ? c.accent : c.line, color: link.copied ? c.accent : c.text }}
      >
        <InviteIcon className="h-4 w-4" />
        {link.copied ? "Link copied" : "Copy your invite link"}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className={`rounded-full p-1.5 ${FOCUS_RING_CLASS}`}
        style={{ color: c.soft }}
      >
        <X size={16} weight="bold" aria-hidden />
      </button>
    </section>
  );
}
