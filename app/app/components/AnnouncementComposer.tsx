import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

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
}

export function AnnouncementComposer({
  targetType,
  targetId,
  heading,
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

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
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
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

      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
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

      <div className="flex items-center justify-between gap-3 mt-2">
        <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
          {rateLimited ? RATE_LIMIT_MESSAGE : audienceLine(audience, targetType)}
        </span>
        <button
          onClick={handleSend}
          disabled={sending || rateLimited || !body.trim() || totalReach === null}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {sending
            ? "Sending…"
            : `Send${totalReach !== null && !rateLimited ? ` to ${totalReach}` : ""}`}
        </button>
      </div>

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      {confirmation && (
        <p className="text-sm mt-2" style={{ color: "var(--garden-muted)" }}>
          {confirmation}
        </p>
      )}

      {history && history.length > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
          <p
            className="text-[11px] uppercase tracking-[0.06em] mb-2"
            style={{ color: "var(--garden-dim)" }}
          >
            Sent
          </p>
          <ul className="space-y-1.5">
            {history.map((item) => (
              <li
                key={item._id}
                className="flex items-center justify-between gap-3 text-xs"
                style={{ color: "var(--garden-muted)" }}
              >
                <span className="truncate">
                  {item.kind === "reminder" ? "Reminder (automatic)" : `"${truncate(item.body, 40)}"`}
                </span>
                <span className="shrink-0" style={{ fontFamily: "var(--garden-font-mono)" }}>
                  {item.recipientCount} · {relativeTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
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

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
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
}

// Same helper as offerings.tsx/projects.tsx (ConvexError({code, reason}) —
// the garden convention this module follows).
function errorMessage(err: unknown): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "reason" in data) {
    return String((data as { reason: unknown }).reason);
  }
  return "Something went wrong — try again.";
}
