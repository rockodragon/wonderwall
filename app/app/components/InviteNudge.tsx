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
import { DESK, FOCUS_RING_CLASS } from "../desk/tokens";
import { InviteIcon } from "./InviteCTA";

export const INVITE_NUDGE_KEY = "today.inviteNudge";

type Tone = "desk" | "page";

const COLORS: Record<Tone, { text: string; soft: string; line: string; bg: string; accent: string }> = {
  desk: { text: DESK.text, soft: DESK.textSoft, line: DESK.line, bg: DESK.panel, accent: DESK.accent },
  page: {
    text: "var(--app-text)",
    soft: "var(--app-text-muted)",
    line: "var(--app-hairline-raised)",
    bg: "var(--app-surface-raised)",
    accent: "var(--app-accent-ink)",
  },
};

export function InviteNudge({ tone, className }: { tone: Tone; className?: string }) {
  const [days, setDays] = useState(0);
  useEffect(() => setDays(recordVisitDay()), []);
  const note = useOnceNote(INVITE_NUDGE_KEY, days >= NUDGE_ON_DAY);
  if (!note.show) return null;
  return (
    <div className={className}>
      <NudgeCard tone={tone} onClose={note.dismiss} />
    </div>
  );
}

function NudgeCard({ tone, onClose }: { tone: Tone; onClose: () => void }) {
  const c = COLORS[tone];
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
      <p className="min-w-0 flex-1 text-[15px]" style={{ color: c.text }}>
        Know someone who'd like it here?
      </p>
      <button
        type="button"
        onClick={copy}
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
