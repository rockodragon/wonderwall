import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../lib/convexError";
import { weekdayAndTime, timeAgo } from "../lib/dates";
import { upcomingReminderTimes } from "../../convex/reminderTimes";
import { TalkBox } from "./TalkBox";

// Shared across the three owner-facing surfaces (docs/announcements-prd.md,
// UI/UX Specifications: "one <AnnouncementComposer targetType targetId />
// component — the three surfaces differ only in the props they pass and
// the heading they show. Do not build three composers.")
//   - routes/projects.tsx   — "Message supporters" (isOwn)
//   - routes/event.tsx      — "Message attendees" (event.isOrganizer)
//   - routes/offerings.tsx  — "Message participants" (isOwner)

type TargetType = "project" | "event" | "offering";

const RATE_LIMIT_MESSAGE = "You've sent 2 announcements today. Try again tomorrow.";
const DAY_MS = 24 * 60 * 60 * 1000;

interface AnnouncementComposerProps {
  targetType: TargetType;
  targetId: string;
  heading: string;
  /** When it starts, for an event or class that gets the automatic
   * reminders (convex/reminderTimes.ts). Left out, no reminder line. */
  startsAt?: number;
}

/** "Reminders go out around Thu, Nov 5, 6:00 PM and Fri, Nov 6, 4:00 PM.",
 * for the ones still ahead. Around: the cron runs every 15 minutes. `sentAt`
 * is when this target's reminders went out. */
export function reminderLine(startsAt: number | undefined, now: number, sentAt: readonly number[] = []): string | null {
  if (startsAt === undefined) return null;
  const [first, second] = upcomingReminderTimes(startsAt, now, sentAt);
  if (first === undefined) return null;
  const when = (at: number | "now") => (at === "now" ? "in the next 15 minutes" : `around ${weekdayAndTime(at)}`);
  if (second === undefined) return `A reminder goes out ${when(first)}.`;
  // Both times: "around X and Y", not "around X and around Y".
  const rest = typeof second === "number" && first !== "now" ? weekdayAndTime(second) : when(second);
  return `Reminders go out ${when(first)} and ${rest}.`;
}

export function AnnouncementComposer({
  targetType,
  targetId,
  heading,
  startsAt,
}: AnnouncementComposerProps) {
  const audience = useQuery(api.announcements.getAnnouncementAudience, {
    targetType,
    targetId,
  });
  const history = useQuery(api.announcements.listAnnouncementsForTarget, {
    targetType,
    targetId,
  });
  const sendAnnouncement = useMutation(api.announcements.sendAnnouncement);

  const [body, setBody] = useState("");
  // Closed until asked for (progressive disclosure): a project/event/offering
  // page is mostly read by its owner, not written to, so the composer is a
  // button until pressed. Past messages likewise sit behind their count.
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const reminders = reminderLine(
    startsAt,
    Date.now(),
    history?.filter((item) => item.kind === "reminder").map((item) => item.createdAt),
  );
  const reminderNote = reminders ? (
    <p className="mt-2" style={{ color: "var(--garden-dim)", fontSize: 13.5 }}>
      {reminders}
    </p>
  ) : null;

  const oneDayAgo = Date.now() - DAY_MS;
  const broadcastsToday =
    history?.filter((item) => item.kind === "broadcast" && item.createdAt >= oneDayAgo)
      .length ?? 0;
  const rateLimited = broadcastsToday >= 2;

  const totalReach = audience ? audience.reachable + audience.emailOnly : null;

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sending || rateLimited) return;

    setSending(true);
    setError(null);
    try {
      const result = await sendAnnouncement({ targetType, targetId, body: trimmed });
      setConfirmation(
        `Sent to ${result.recipientCount} ${result.recipientCount === 1 ? "person" : "people"}.`,
      );
      setBody("");
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const historyToggle =
    history && history.length > 0 ? (
      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        aria-expanded={showHistory}
        className="hover:opacity-80"
        style={{ color: "var(--garden-dim)", fontSize: 13.5 }}
      >
        {showHistory ? "Hide sent" : `Sent (${history.length})`}
      </button>
    ) : null;

  const historyList =
    showHistory && history && history.length > 0 ? (
      <ul className="space-y-1.5 mt-3 w-full">
        {history.map((item) => (
          <li
            key={item._id}
            className="flex items-center justify-between gap-3"
            style={{ color: "var(--garden-muted)", fontSize: 13 }}
          >
            <span className="truncate">
              {item.kind === "reminder" ? "Reminder (automatic)" : `"${truncate(item.body, 40)}"`}
            </span>
            <span className="shrink-0" style={{ fontFamily: "var(--garden-font-mono)", fontSize: 12 }}>
              {item.recipientCount} · {timeAgo(item.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    ) : null;

  if (!open) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setConfirmation(null);
              setError(null);
            }}
            className="px-4 py-2 rounded-lg font-semibold border hover:opacity-90"
            style={{
              borderColor: "var(--garden-hairline-raised)",
              color: "var(--garden-paper)",
              fontSize: 13.5,
            }}
          >
            {heading}
          </button>
          {confirmation && (
            <span style={{ color: "var(--garden-muted)", fontSize: 14 }}>{confirmation}</span>
          )}
          {historyToggle}
        </div>
        {reminderNote}
        {historyList}
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <h3
        className="font-semibold mb-3"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        {heading}
      </h3>

      <TalkBox
        autoFocus
        value={body}
        onChange={(v) => {
          setBody(v);
          setError(null);
          setConfirmation(null);
        }}
        placeholder="Write your announcement..."
        rows={3}
        maxLength={2000}
        disabled={sending || rateLimited}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none disabled:opacity-50"
        style={{
          backgroundColor: "var(--garden-ink)",
          borderColor: "var(--garden-hairline-raised)",
          color: "var(--garden-paper)",
          fontFamily: "var(--garden-font-body)",
        }}
      />

      <p className="mt-2" style={{ color: "var(--garden-dim)", fontSize: 13 }}>
        {rateLimited ? RATE_LIMIT_MESSAGE : audienceLine(audience, targetType)}
      </p>

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSend}
          disabled={sending || rateLimited || !body.trim() || totalReach === null}
          className="shrink-0 px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)", fontSize: 13.5 }}
        >
          {sending
            ? "Sending…"
            : `Send${totalReach !== null && !rateLimited ? ` to ${totalReach}` : ""}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="hover:opacity-80"
          style={{ color: "var(--garden-dim)", fontSize: 13.5 }}
        >
          Cancel
        </button>
        <span className="flex-1" />
        {historyToggle}
      </div>

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      {historyList}
    </div>
  );
}

interface AudienceCounts {
  reachable: number;
  emailOnly: number;
  unreachable: number;
  pledged: number;
}

function audienceLine(audience: AudienceCounts | undefined, targetType: TargetType): string {
  if (!audience) return "Loading…";

  const total = audience.reachable + audience.emailOnly;
  if (total === 0) {
    return audience.unreachable > 0 ? "No one can be reached yet." : "No one to send this to yet.";
  }

  const people = total === 1 ? "person" : "people";
  let line: string;
  if (targetType === "offering" && audience.pledged > 0) {
    const confirmed = audience.reachable - audience.pledged;
    line = `${total} ${people} will get this — ${confirmed} confirmed, ${audience.pledged} pledged.`;
  } else if (audience.emailOnly > 0) {
    line = `${total} ${people} will get this — ${audience.reachable} on The Exchange and by email, ${audience.emailOnly} by email only.`;
  } else {
    line = `${total} ${people} will get this.`;
  }

  if (audience.unreachable > 0) {
    line += ` ${audience.unreachable} more can't be reached.`;
  }

  return line;
}

function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

