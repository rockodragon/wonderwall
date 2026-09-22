// The "Dates" card on a gig's project page (docs/features/live-booking.md).
// Renders the schedule returned by garden/gigs.ts's getSchedule: one row per
// date, host tools to book/pay/manage, and the artist's respond flow. Local
// copies of DetailCard/Avatar (projects.$id.tsx doesn't export them) keep
// the same --garden-* look the rest of the project page uses.

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "../routes/projects";
import { toEmbedUrl } from "../lib/videoEmbed";
import { MAX_CLIPS, MAX_NOTE_LENGTH, PAID_METHODS, isClipArtifact, type PaidMethod } from "../../convex/garden/gigRules";

const PAID_METHOD_LABELS: Record<PaidMethod, string> = {
  venmo: "Venmo",
  cashapp: "Cash App",
  paypal: "PayPal",
  zelle: "Zelle",
  cash: "Cash",
  check: "Check",
  other: "Other",
};

function DetailCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4 mb-6"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <div
        className="text-xs font-semibold uppercase tracking-[0.08em] mb-3"
        style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Avatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  return imageUrl ? (
    <img src={imageUrl} alt={name} className="w-6 h-6 rounded-full object-cover shrink-0" />
  ) : (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StatusPill({ label, kind = "muted" }: { label: string; kind?: "muted" | "citron" }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-[0.06em] whitespace-nowrap"
      style={{
        fontFamily: "var(--garden-font-mono)",
        backgroundColor: kind === "citron" ? "var(--garden-citron)" : "rgba(198,198,190,0.1)",
        color: kind === "citron" ? "var(--garden-ink)" : "var(--garden-muted)",
      }}
    >
      {label}
    </span>
  );
}

function TextButton({
  onClick,
  disabled,
  children,
  tone = "dim",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: "dim" | "citron";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="text-xs underline underline-offset-2 hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
      style={{ color: tone === "citron" ? "var(--garden-citron)" : "var(--garden-dim)" }}
    >
      {children}
    </button>
  );
}

/** id after "…/embed/<id>" — youtu.be thumbnails follow this same id. */

// ——————————————————————————————————————————————————————————————
// Payment panel — host or booked artist, per booked slot.
// ——————————————————————————————————————————————————————————————

function SlotPaymentPanel({ slotId }: { slotId: any }) {
  const payment: any = useQuery(api.garden.gigs.getSlotPayment, { slotId });
  const markSlotPaid = useMutation(api.garden.gigs.markSlotPaid);
  const confirmSlotPaid = useMutation(api.garden.gigs.confirmSlotPaid);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaidMethod>("venmo");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!amountTouched && payment?.amountDollars) setAmount(String(payment.amountDollars));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.amountDollars]);

  if (payment === undefined || payment === null) return null;

  async function handleMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError("A real amount bigger than zero.");
      return;
    }
    setBusy(true);
    try {
      await markSlotPaid({ slotId, amountCents: cents, method });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      await confirmSlotPaid({ slotId });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(handle: string) {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(handle);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be unavailable (permissions, insecure context) — the
      // handle is already on screen to copy by hand, so fail silently.
    }
  }

  return (
    <div
      className="mt-2.5 p-3 rounded-lg"
      style={{ backgroundColor: "var(--garden-ink)", border: "1px solid var(--garden-hairline-raised)" }}
    >
      <p className="text-sm font-medium mb-1" style={{ color: "var(--garden-paper)" }}>
        {payment.isHost ? `Pay ${payment.artistName}` : "Getting paid"}
      </p>
      <p className="text-xs mb-2" style={{ color: "var(--garden-dim)" }}>
        {payment.amountDollars ? `$${payment.amountDollars.toLocaleString("en-US")} per date` : "Amount as agreed"}
      </p>

      {payment.links.length === 0 ? (
        <p className="text-sm mb-2" style={{ color: "var(--garden-body)" }}>
          {payment.artistName} hasn't added a way to get paid yet. Message them.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {payment.links.map((link: any) =>
            link.url === null ? (
              <span
                key={link.kind}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                style={{
                  backgroundColor: "var(--garden-ink-raised)",
                  color: "var(--garden-body)",
                  border: "1px solid var(--garden-hairline-raised)",
                }}
              >
                {link.label}: {link.handle}
                <button
                  type="button"
                  onClick={() => handleCopy(link.handle)}
                  className="underline underline-offset-2"
                  style={{ color: "var(--garden-citron)" }}
                >
                  {copied === link.handle ? "Copied" : "Copy"}
                </button>
              </span>
            ) : (
              <a
                key={link.kind}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {link.label} {link.handle}
              </a>
            ),
          )}
        </div>
      )}

      {payment.isHost && (
        <form onSubmit={handleMarkPaid} className="flex flex-wrap items-center gap-2 mt-2">
          <input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmountTouched(true);
              setAmount(e.target.value);
            }}
            placeholder="300"
            aria-label="Amount paid, in US dollars"
            className="w-24 px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "var(--garden-ink-raised)",
              borderColor: "var(--garden-hairline-raised)",
              color: "var(--garden-paper)",
            }}
          />
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaidMethod)}
            className="px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{
              backgroundColor: "var(--garden-ink-raised)",
              borderColor: "var(--garden-hairline-raised)",
              color: "var(--garden-body)",
            }}
          >
            {PAID_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAID_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Mark paid
          </button>
        </form>
      )}

      {!payment.isHost && payment.paidAt && !payment.paidConfirmedAt && (
        <button
          type="button"
          disabled={busy}
          onClick={handleConfirm}
          className="mt-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          Confirm received
        </button>
      )}

      {payment.paidAt && (
        <p className="text-xs mt-2" style={{ color: "var(--garden-dim)" }}>
          Marked paid ${(payment.paidAmountCents / 100).toLocaleString("en-US")} via{" "}
          {PAID_METHOD_LABELS[payment.paidMethod as PaidMethod] ?? payment.paidMethod} on{" "}
          {new Date(payment.paidAt).toLocaleDateString()}
          {payment.paidConfirmedAt ? ` · confirmed by ${payment.artistName}` : ""}
        </p>
      )}

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Responders — host only, one open slot at a time (query only runs once
// the row is expanded, per the parent's conditional render).
// ——————————————————————————————————————————————————————————————

function ClipPreview({ clip }: { clip: any }) {
  if (clip.type === "audio" && clip.mediaUrl) {
    return <audio controls src={clip.mediaUrl} className="w-full max-w-xs" />;
  }
  const embed = toEmbedUrl(clip.linkUrl ?? clip.mediaUrl ?? undefined);
  if (embed) {
    return (
      <iframe
        src={embed.embedUrl}
        className={
          embed.aspect === "9/16"
            ? "w-full max-w-[280px] aspect-[9/16] rounded-lg"
            : "w-full aspect-video rounded-lg"
        }
        allow="autoplay; encrypted-media"
        allowFullScreen
        title={clip.title ?? "Clip"}
      />
    );
  }
  if (clip.type === "video" && clip.mediaUrl) {
    return <video controls src={clip.mediaUrl} className="w-full max-w-xs rounded-lg" />;
  }
  if (clip.linkUrl) {
    return (
      <a
        href={clip.linkUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-sm underline underline-offset-2"
        style={{ color: "var(--garden-citron)" }}
      >
        {clip.ogImageUrl && <img src={clip.ogImageUrl} alt="" className="w-10 h-10 rounded object-cover" />}
        {clip.title || clip.linkUrl}
      </a>
    );
  }
  return null;
}

function OpenSlotResponders({ slotId }: { slotId: any }) {
  const responders: any = useQuery(api.garden.gigs.listResponders, { slotId });
  const bookSlot = useMutation(api.garden.gigs.bookSlot);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (responders === undefined) {
    return (
      <p className="text-xs mt-2" style={{ color: "var(--garden-dim)" }}>
        Loading…
      </p>
    );
  }
  if (responders.length === 0) {
    return (
      <p className="text-xs mt-2" style={{ color: "var(--garden-dim)" }}>
        No responses yet.
      </p>
    );
  }

  async function handleBook(responseId: string) {
    setBusyId(responseId);
    setError("");
    try {
      await bookSlot({ slotId, responseId: responseId as any });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-2.5 flex flex-col gap-3">
      {responders.map((r: any) => (
        <div key={r.responseId} className="flex items-start gap-2">
          <Avatar name={r.name} imageUrl={r.imageUrl} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/profile/${r.profileId}`}
                className="text-sm hover:opacity-80"
                style={{ color: "var(--garden-paper)" }}
              >
                {r.name}
              </Link>
              {r.location && (
                <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
                  {r.location}
                </span>
              )}
            </div>
            {r.bookedElsewhereCount > 0 && (
              <p className="text-xs" style={{ color: "var(--garden-dim)" }}>
                booked {r.bookedElsewhereCount} other date{r.bookedElsewhereCount === 1 ? "" : "s"} here
              </p>
            )}
            {r.note && (
              <p className="text-sm mt-1" style={{ color: "var(--garden-body)" }}>
                "{r.note}"
              </p>
            )}
            {r.clips.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                {r.clips.map((clip: any) => (
                  <ClipPreview key={clip.artifactId} clip={clip} />
                ))}
              </div>
            )}
          </div>
          {r.status === "booked" ? (
            <div className="shrink-0">
              <StatusPill label="Booked" kind="citron" />
            </div>
          ) : (
            <button
              type="button"
              disabled={busyId === r.responseId}
              onClick={() => handleBook(r.responseId)}
              className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Book {String(r.name).split(" ")[0]}
            </button>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Respond modal — a non-host artist marking themselves available.
// ——————————————————————————————————————————————————————————————

function GigRespondModal({
  seriesId,
  venueName,
  slotIds,
  dateLabels,
  onClose,
  onSent,
}: {
  seriesId: any;
  venueName: string;
  slotIds: any[];
  dateLabels: string[];
  onClose: () => void;
  onSent: () => void;
}) {
  const respondAvailable = useMutation(api.garden.gigs.respondAvailable);
  const myArtifacts: any = useQuery(api.artifacts.getMyArtifacts);
  const clips = useMemo(() => (myArtifacts ?? []).filter((a: any) => isClipArtifact(a)), [myArtifacts]);
  const [note, setNote] = useState("");
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function toggleClip(id: string) {
    setSelectedClipIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= MAX_CLIPS) return prev;
      return [...prev, id];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await respondAvailable({
        seriesId,
        slotIds,
        note: note.trim() || undefined,
        clipIds: selectedClipIds as any,
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-6 my-8"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          I can play {slotIds.length} date{slotIds.length === 1 ? "" : "s"} at {venueName}
        </h2>

        {sent ? (
          <div className="py-2">
            <p className="text-sm mb-4" style={{ color: "var(--garden-body)" }}>
              Sent — the venue will pick who plays each date.
            </p>
            <button
              onClick={onSent}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <ul className="text-sm flex flex-col gap-1" style={{ color: "var(--garden-body)" }}>
              {dateLabels.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>

            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Note to the venue (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                rows={3}
                maxLength={MAX_NOTE_LENGTH}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
              <p className="text-xs mt-1 text-right" style={{ color: "var(--garden-dim)" }}>
                {note.length}/{MAX_NOTE_LENGTH}
              </p>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Clips ({selectedClipIds.length} of {MAX_CLIPS})
              </label>
              {clips.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
                  No clips in your portfolio yet. Add audio, a video, or a SoundCloud/Spotify/YouTube link under
                  Works, then come back.{" "}
                  <Link to="/works" className="underline underline-offset-2" style={{ color: "var(--garden-citron)" }}>
                    Add a clip
                  </Link>
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {clips.map((clip: any) => {
                    const active = selectedClipIds.includes(clip._id);
                    const embed = toEmbedUrl(clip.mediaUrl ?? undefined);
                    const thumb = clip.ogImageUrl ?? embed?.thumbnailUrl ?? null;
                    return (
                      <button
                        key={clip._id}
                        type="button"
                        onClick={() => toggleClip(clip._id)}
                        disabled={!active && selectedClipIds.length >= MAX_CLIPS}
                        className="flex flex-col items-start gap-1 p-2 rounded-lg text-left disabled:opacity-60"
                        style={{
                          backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                          border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                        }}
                      >
                        {thumb && <img src={thumb} alt="" className="w-full h-14 object-cover rounded" />}
                        <span
                          className="text-xs font-medium truncate w-full"
                          style={{ color: active ? "var(--garden-ink)" : "var(--garden-paper)" }}
                        >
                          {clip.title || "Untitled"}
                        </span>
                        <span
                          className="text-xs uppercase tracking-[0.04em]"
                          style={{ color: active ? "var(--garden-ink)" : "var(--garden-dim)" }}
                        >
                          {clip.type}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: "var(--garden-dim)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// One date row.
// ——————————————————————————————————————————————————————————————

function SlotRow({
  schedule,
  slot,
  isOwner,
  selected,
  onToggleSelect,
}: {
  schedule: any;
  slot: any;
  isOwner: boolean;
  selected: boolean;
  onToggleSelect: (slotId: string) => void;
}) {
  const [showResponders, setShowResponders] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reopenSlot = useMutation(api.garden.gigs.reopenSlot);
  const cancelSlot = useMutation(api.garden.gigs.cancelSlot);
  const unbookSlot = useMutation(api.garden.gigs.unbookSlot);
  const withdrawResponse = useMutation(api.garden.gigs.withdrawResponse);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isBookedArtist = !isOwner && slot.status === "booked" && slot.mine === "booked";

  let right: ReactNode = null;

  if (slot.status === "cancelled") {
    right = (
      <div className="flex items-center gap-2">
        <StatusPill label="Cancelled" />
        {isOwner && !slot.isPast && (
          <TextButton disabled={busy} onClick={() => run(() => reopenSlot({ slotId: slot.slotId }))}>
            Undo
          </TextButton>
        )}
      </div>
    );
  } else if (slot.status === "booked") {
    right = (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          {slot.booked && (
            <Link to={`/profile/${slot.booked.profileId}`} className="flex items-center gap-1.5 hover:opacity-80">
              <Avatar name={slot.booked.name} imageUrl={slot.booked.imageUrl} />
              <span className="text-sm" style={{ color: "var(--garden-paper)" }}>
                {slot.booked.name}
              </span>
            </Link>
          )}
          <StatusPill label={slot.isPast ? "Played" : "Booked"} kind={slot.isPast ? "muted" : "citron"} />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isOwner && <TextButton tone="citron" onClick={() => setShowPay((v) => !v)}>Pay</TextButton>}
          {isOwner && !slot.isPast && (
            <>
              <TextButton disabled={busy} onClick={() => run(() => unbookSlot({ slotId: slot.slotId }))}>
                Reopen
              </TextButton>
              <TextButton
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Cancel this date? The booked artist will be told.")) {
                    run(() => cancelSlot({ slotId: slot.slotId }));
                  }
                }}
              >
                Cancel date
              </TextButton>
            </>
          )}
          {isBookedArtist && !slot.isPast && (
            <TextButton
              disabled={busy}
              onClick={() => {
                if (window.confirm("Tell the venue you can't make this date?")) {
                  run(() => withdrawResponse({ slotId: slot.slotId }));
                }
              }}
            >
              Can't make it
            </TextButton>
          )}
        </div>
      </div>
    );
  } else if (slot.status === "open") {
    if (slot.isPast) {
      right = <StatusPill label="Unfilled" />;
    } else if (isOwner) {
      right = (
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xs" style={{ color: slot.availableCount > 0 ? "var(--garden-body)" : "var(--garden-dim)" }}>
            {slot.availableCount > 0 ? `${slot.availableCount} available` : "No responses yet"}
          </span>
          <div className="flex items-center gap-2">
            <TextButton tone="citron" onClick={() => setShowResponders((v) => !v)}>
              {showResponders ? "Hide" : "See who's available"}
            </TextButton>
            <TextButton
              disabled={busy}
              onClick={() => {
                if (window.confirm("Cancel this date?")) run(() => cancelSlot({ slotId: slot.slotId }));
              }}
            >
              Cancel date
            </TextButton>
          </div>
        </div>
      );
    } else if (
      schedule.viewer.isSignedIn &&
      schedule.viewer.hasProfile &&
      schedule.viewer.canRespond &&
      schedule.status === "open"
    ) {
      if (slot.mine === "available") {
        right = (
          <div className="flex items-center gap-2">
            <StatusPill label="You're available" kind="citron" />
            <TextButton disabled={busy} onClick={() => run(() => withdrawResponse({ slotId: slot.slotId }))}>
              Withdraw
            </TextButton>
          </div>
        );
      } else {
        right = (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(slot.slotId)}
            className="w-4 h-4"
            aria-label={`Select ${slot.dateLabel}`}
          />
        );
      }
    }
  }

  return (
    <div className="py-3" style={{ borderBottom: "1px solid var(--garden-hairline)" }}>
      <div className={`flex items-start justify-between gap-3 ${slot.isPast ? "opacity-60" : ""}`}>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--garden-paper)" }}>
            {slot.dateLabel}
          </p>
          <p className="text-xs" style={{ color: "var(--garden-dim)" }}>
            {schedule.timeRange}
          </p>
        </div>
        <div className="shrink-0">{right}</div>
      </div>

      {isBookedArtist && (
        <div className="mt-1">
          <SlotPaymentPanel slotId={slot.slotId} />
        </div>
      )}
      {isOwner && slot.status === "booked" && showPay && (
        <div className="mt-1">
          <SlotPaymentPanel slotId={slot.slotId} />
        </div>
      )}
      {isOwner && slot.status === "open" && !slot.isPast && showResponders && <OpenSlotResponders slotId={slot.slotId} />}

      {error && <p className="text-sm text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// Series controls — host only.
// ——————————————————————————————————————————————————————————————

function SeriesControls({ schedule }: { schedule: any }) {
  const setSeriesStatus = useMutation(api.garden.gigs.setSeriesStatus);
  const addSlot = useMutation(api.garden.gigs.addSlot);
  const updateGigSeries = useMutation(api.garden.gigs.updateGigSeries);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openEditor, setOpenEditor] = useState<null | "add" | "time" | "venue">(null);
  const [newDate, setNewDate] = useState("");
  const [editStart, setEditStart] = useState(schedule.rule.startTime);
  const [editEnd, setEditEnd] = useState(schedule.rule.endTime);
  const [editVenue, setEditVenue] = useState(schedule.venueName ?? "");

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError("");
    try {
      await action();
      after?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const status = schedule.status as "open" | "paused" | "ended";

  return (
    <div className="pt-4 mt-4 flex flex-col gap-3" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
      <div className="flex flex-wrap items-center gap-3">
        {status !== "ended" && (
          <TextButton
            disabled={busy}
            onClick={() => run(() => setSeriesStatus({ seriesId: schedule.seriesId, status: status === "paused" ? "open" : "paused" }))}
          >
            {status === "paused" ? "Resume" : "Pause"}
          </TextButton>
        )}
        {status !== "ended" && (
          <TextButton
            disabled={busy}
            onClick={() => {
              if (window.confirm("End this series? Future open dates will be dropped.")) {
                run(() => setSeriesStatus({ seriesId: schedule.seriesId, status: "ended" }));
              }
            }}
          >
            End series
          </TextButton>
        )}
        <TextButton onClick={() => setOpenEditor(openEditor === "add" ? null : "add")}>Add a date</TextButton>
        <TextButton onClick={() => setOpenEditor(openEditor === "time" ? null : "time")}>Change time</TextButton>
        <TextButton onClick={() => setOpenEditor(openEditor === "venue" ? null : "venue")}>Venue name</TextButton>
      </div>

      {openEditor === "add" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          />
          <button
            type="button"
            disabled={busy || !newDate}
            onClick={() =>
              run(
                () => addSlot({ seriesId: schedule.seriesId, date: newDate }),
                () => {
                  setNewDate("");
                  setOpenEditor(null);
                },
              )
            }
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Add
          </button>
        </div>
      )}

      {openEditor === "time" && (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={editStart}
            onChange={(e) => setEditStart(e.target.value)}
            className="px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          />
          <span className="text-sm" style={{ color: "var(--garden-dim)" }}>
            to
          </span>
          <input
            type="time"
            value={editEnd}
            onChange={(e) => setEditEnd(e.target.value)}
            className="px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => updateGigSeries({ seriesId: schedule.seriesId, startTime: editStart, endTime: editEnd }),
                () => setOpenEditor(null),
              )
            }
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Save
          </button>
        </div>
      )}

      {openEditor === "venue" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editVenue}
            onChange={(e) => setEditVenue(e.target.value)}
            placeholder="The Grove"
            className="flex-1 px-2 py-1.5 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: "var(--garden-ink)", borderColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () => updateGigSeries({ seriesId: schedule.seriesId, venueName: editVenue.trim() || undefined }),
                () => setOpenEditor(null),
              )
            }
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Save
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ——————————————————————————————————————————————————————————————
// The card.
// ——————————————————————————————————————————————————————————————

export function GigSchedule({ project, isOwner, myProfile }: { project: any; isOwner: boolean; myProfile: any }) {
  void myProfile; // not needed directly — schedule.viewer already carries what this card reads
  const schedule: any = useQuery(api.garden.gigs.getSchedule, { projectId: project._id });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRespond, setShowRespond] = useState(false);

  if (schedule === undefined || schedule === null) return null;

  const viewer = schedule.viewer;

  function toggleSelect(slotId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  const selectableSlotIds: string[] =
    !isOwner && viewer.canRespond
      ? schedule.slots.filter((s: any) => s.status === "open" && !s.isPast && s.mine !== "available").map((s: any) => s.slotId)
      : [];

  const selectedSlots = schedule.slots.filter((s: any) => selected.has(s.slotId));
  const hasBookedSlot = schedule.slots.some((s: any) => s.mine === "booked");

  return (
    <DetailCard label="Dates">
      {schedule.venueName && (
        <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--garden-paper)" }}>
          {schedule.venueName}
        </p>
      )}
      <p className="text-sm mb-1" style={{ color: "var(--garden-body)" }}>
        {schedule.schedule} · {schedule.ends}
      </p>
      {schedule.status === "paused" && (
        <div className="mb-3">
          <StatusPill label="Paused — not taking responses" />
        </div>
      )}
      {schedule.status === "ended" && (
        <div className="mb-3">
          <StatusPill label="Ended" />
        </div>
      )}

      {!viewer.hasPayoutHandles && hasBookedSlot && (
        <p className="text-sm mb-3" style={{ color: "var(--garden-body)" }}>
          Add how you get paid under{" "}
          <Link to="/settings" className="underline underline-offset-2" style={{ color: "var(--garden-citron)" }}>
            Settings
          </Link>{" "}
          so the venue can pay you.
        </p>
      )}

      {!isOwner && viewer.isSignedIn && !viewer.hasProfile && (
        <p className="text-sm mb-3" style={{ color: "var(--garden-body)" }}>
          <Link to="/settings" className="underline underline-offset-2" style={{ color: "var(--garden-citron)" }}>
            Finish your profile
          </Link>{" "}
          to respond.
        </p>
      )}

      {/* The gate (docs/features/live-booking.md §8): free to look, membership
          to respond. The text is the server's own denial, so the page and
          the mutation can never disagree about the rule. */}
      {!isOwner && viewer.isSignedIn && viewer.hasProfile && !viewer.canRespond && schedule.status === "open" && (
        <p className="text-sm mb-3" style={{ color: "var(--garden-body)" }}>
          {viewer.respondDenial?.reason ?? "Responding to a gig takes membership."}{" "}
          <Link to="/join" className="underline underline-offset-2 font-medium" style={{ color: "var(--garden-citron)" }}>
            {viewer.respondDenial?.upgradePath ?? "Join to respond"}
          </Link>
        </p>
      )}

      {!isOwner && viewer.isSignedIn && viewer.hasProfile && schedule.status === "open" && selectableSlotIds.length > 0 && (
        <button
          type="button"
          onClick={() => setSelected(new Set(selectableSlotIds))}
          className="text-xs underline underline-offset-2 hover:opacity-80 mb-3 block"
          style={{ color: "var(--garden-citron)" }}
        >
          Select all open dates
        </button>
      )}

      {selected.size > 0 && (
        <div
          className="flex items-center justify-between gap-3 p-3 mb-3 rounded-lg"
          style={{ backgroundColor: "var(--garden-ink)", border: "1px solid var(--garden-hairline-raised)" }}
        >
          <span className="text-sm" style={{ color: "var(--garden-body)" }}>
            {selected.size} date{selected.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={() => setShowRespond(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            I'm available
          </button>
        </div>
      )}

      <div>
        {schedule.slots.map((slot: any) => (
          <SlotRow
            key={slot.slotId}
            schedule={schedule}
            slot={slot}
            isOwner={isOwner}
            selected={selected.has(slot.slotId)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {isOwner && <SeriesControls schedule={schedule} />}

      {showRespond && (
        <GigRespondModal
          seriesId={schedule.seriesId}
          venueName={schedule.venueName ?? project.title}
          slotIds={selectedSlots.map((s: any) => s.slotId)}
          dateLabels={selectedSlots.map((s: any) => s.dateLabel)}
          onClose={() => setShowRespond(false)}
          onSent={() => {
            setShowRespond(false);
            setSelected(new Set());
          }}
        />
      )}
    </DetailCard>
  );
}
