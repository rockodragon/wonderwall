import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LocationAutocomplete, LocationVerifiedHint } from "./LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";
import { EVENT_TAGS } from "../constants/eventTags";
import { CommunityPicker, useDefaultEventCommunity } from "./CommunityPicker";
import {
  TicketTierEditor,
  draftsToTiers,
  emptyTierDraft,
  type TicketTierDraft,
} from "./TicketTierEditor";
import { describeMediaLink, MediaLinkField } from "./MediaLinkField";
import { ImageFill } from "./ImageFill";

// Hosting an event in three short steps instead of one wall of fields
// (Rick, 2026-10-01): what and when -> tell people about it -> options.
// Every field's state lives up here, so Back never loses anything and all
// three panels stay mounted (hidden when inactive) — the community picker
// pre-fills itself once on mount and would otherwise overwrite a "No
// community" choice the next time step 3 mounted.

const STEPS = ["What and when", "Tell people about it", "Options"] as const;
type Step = 1 | 2 | 3;

const MAX_COVER_BYTES = 5 * 1024 * 1024;

const inputBase =
  "w-full py-2 border rounded-lg focus:ring-2 focus:ring-[var(--app-accent)] focus:border-transparent placeholder:text-[var(--app-text-dim)]";
const inputClass = `${inputBase} px-4`;
// Date and time boxes sit three across; they need the room.
const inputTightClass = `${inputBase} px-3`;
const inputStyle = {
  borderColor: "var(--app-hairline)",
  backgroundColor: "var(--app-surface-raised)",
  color: "var(--app-text)",
};

// The location box, the tier editor, the link field and the community picker
// are shared components styled for gray/dark Tailwind, not the app's
// --app-* tokens. This wrapper repaints what they render, from outside.
const EMBEDDED = [
  "[&_label]:text-[var(--app-text-muted)]",
  "[&_input]:bg-[var(--app-surface-raised)]",
  "[&_input]:border-[var(--app-hairline)]",
  "[&_input]:text-[var(--app-text)]",
  "[&_input]:placeholder:text-[var(--app-text-dim)]",
  "[&_input]:focus:ring-[var(--app-accent)]",
  "[&_select]:bg-[var(--app-surface-raised)]",
  "[&_select]:border-[var(--app-hairline)]",
  "[&_select]:text-[var(--app-text)]",
  "[&_select]:focus:ring-[var(--app-accent)]",
  "[&_.shadow-lg]:bg-[var(--app-surface-raised)]",
  "[&_.shadow-lg]:border-[var(--app-hairline-raised)]",
  "[&_button.text-blue-600]:text-[var(--app-accent-ink)]",
].join(" ");

const secondaryButtonClass =
  "px-4 py-2.5 rounded-lg border text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline)] disabled:opacity-50";
const secondaryButtonStyle = {
  borderColor: "var(--app-hairline-raised)",
  color: "var(--app-text)",
};

function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Start/end as timestamps, or the message to show when they don't work. */
function resolveWhen(
  date: string,
  time: string,
  endTimeStr: string,
): { datetime: number; endTime?: number; error?: string } {
  const datetime = new Date(`${date}T${time}`).getTime();
  if (datetime < Date.now()) {
    return { datetime, error: "Event date must be in the future" };
  }
  // Optional end time — same day as the start; must be after it.
  if (endTimeStr) {
    const endTime = new Date(`${date}T${endTimeStr}`).getTime();
    if (endTime <= datetime) {
      return { datetime, error: "End time must be after the start time" };
    }
    return { datetime, endTime };
  }
  return { datetime };
}

function FieldLabel({
  htmlFor,
  id,
  optional,
  children,
}: {
  htmlFor?: string;
  id?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const className = "block text-sm font-medium mb-1.5 whitespace-nowrap";
  const style = { color: "var(--app-text-muted)" };
  const content = (
    <>
      {children}
      {optional && (
        <span className="font-normal" style={{ color: "var(--app-text-dim)" }}>
          {" "}
          · optional
        </span>
      )}
    </>
  );
  // A <label> only where there's a control to point at.
  return htmlFor ? (
    <label htmlFor={htmlFor} id={id} className={className} style={style}>
      {content}
    </label>
  ) : (
    <div id={id} className={className} style={style}>
      {content}
    </div>
  );
}

// One compact line on the Options step: a label, what it's set to, and a
// button that opens the full editor underneath.
function OptionRow({
  label,
  value,
  actionLabel,
  expanded,
  onToggle,
  panelId,
  children,
}: {
  label: string;
  value: string;
  actionLabel: string;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="py-3 border-t"
      style={{ borderColor: "var(--app-hairline)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-sm font-medium"
            style={{ color: "var(--app-text-muted)" }}
          >
            {label}
          </div>
          <div
            className="text-[15px] truncate"
            style={{ color: "var(--app-text)" }}
          >
            {value}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={`${secondaryButtonClass} flex-shrink-0`}
          style={secondaryButtonStyle}
        >
          {expanded ? "Done" : actionLabel}
        </button>
      </div>
      {expanded && (
        <div id={panelId} className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function CreateEventModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const createEvent = useMutation(api.events.create);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveEventCoverImage = useMutation(api.files.saveEventCoverImage);
  // Ticketed events go live only once the organizer can sell tickets
  // (product rule, 2026-09-27) — the editor stays open to everyone, this
  // just informs a non-member. `undefined` while loading reads as "not a
  // member yet" for a beat, which is fine: it only gates a hint line.
  const membership = useQuery(api.garden.memberships.getMyMembership);
  const isMember = !!membership;

  const uid = useId();
  const titleId = `${uid}-title`;
  const dateId = `${uid}-date`;
  const startId = `${uid}-start`;
  const endId = `${uid}-end`;
  const locationLabelId = `${uid}-location-label`;
  const descriptionId = `${uid}-description`;
  const ticketsPanelId = `${uid}-tickets`;
  const mediaPanelId = `${uid}-media`;
  const stripeLinkId = `${uid}-stripe-link`;
  const stripePriceId = `${uid}-stripe-price`;

  const [step, setStep] = useState<Step>(1);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");
  const [ticketTiers, setTicketTiers] = useState<TicketTierDraft[]>([]);
  const [externalTicketUrl, setExternalTicketUrl] = useState("");
  const [externalTicketPrice, setExternalTicketPrice] = useState("");
  const location = useLocationField();
  const [tags, setTags] = useState<string[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [hostOrgId, setHostOrgId] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Pre-fill from the sidebar switcher's community, else The Garden —
  // still changeable to "No community — just me" via CommunityPicker.
  const defaultHostOrgId = useDefaultEventCommunity();

  // Options-step rows start closed; each opens its full editor.
  const [showTickets, setShowTickets] = useState(false);
  const [showMedia, setShowMedia] = useState(false);

  // Cover image: uploaded as soon as it's picked, so Create only has to
  // attach the storageId. `previewUrl` is a local object URL for the preview.
  const [cover, setCover] = useState<{
    storageId: Id<"_storage">;
    previewUrl: string;
  } | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef(cover);
  coverRef.current = cover;

  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // Let go of the preview's object URL when the modal closes.
  useEffect(() => {
    return () => {
      if (coverRef.current) URL.revokeObjectURL(coverRef.current.previewUrl);
    };
  }, []);

  // The page behind shouldn't scroll under a sheet that fills the phone.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // New step: back to the top, and into its first field. Not on first open
  // on a phone — the keyboard would cover half the sheet before anyone asked.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (firstRender.current) {
      firstRender.current = false;
      if (!window.matchMedia("(min-width: 640px)").matches) return;
    }
    // Step 3 has no first field worth jumping to; park focus on the body so
    // it isn't lost with the button that was just pressed.
    (
      bodyRef.current?.querySelector<HTMLElement>(
        `[data-step="${step}"] [data-autofocus]`,
      ) ?? bodyRef.current
    )?.focus();
  }, [step]);

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverError("");

    if (!file.type.startsWith("image/")) {
      setCoverError("Pick an image file.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setCoverError("Image must be under 5 MB.");
      return;
    }

    setCoverUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = await result.json();
      if (coverRef.current) URL.revokeObjectURL(coverRef.current.previewUrl);
      setCover({ storageId, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      console.error("Cover upload error:", err);
      setCoverError("Couldn't upload that image. Try again.");
    } finally {
      setCoverUploading(false);
    }
  }

  function removeCover() {
    if (cover) URL.revokeObjectURL(cover.previewUrl);
    setCover(null);
    setCoverError("");
  }

  const whenFilled = !!title.trim() && !!date && !!time;
  const aboutFilled = !!description.trim();

  function goNext() {
    setError("");
    if (step === 1) {
      if (!whenFilled) return;
      const { error: whenError } = resolveWhen(date, time, endTimeStr);
      if (whenError) {
        setError(whenError);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!aboutFilled || coverUploading) return;
      setStep(3);
    }
  }

  function goBack() {
    setError("");
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  async function submit() {
    setError("");

    // Each step checked its own fields on the way here; this repeats it so
    // a stale one (the start time passing while step 3 sat open) lands the
    // person back on the step that needs fixing.
    if (!whenFilled) {
      setStep(1);
      setError("Add a title, date and start time");
      return;
    }
    if (!aboutFilled) {
      setStep(2);
      setError("Add a description");
      return;
    }

    const { datetime, endTime, error: whenError } = resolveWhen(
      date,
      time,
      endTimeStr,
    );
    if (whenError) {
      setStep(1);
      setError(whenError);
      return;
    }

    const { tiers, error: tiersError } = draftsToTiers(ticketTiers);
    if (tiersError) {
      setError(tiersError);
      return;
    }

    // A link we can't show is never submitted — the field already says so
    // inline; this repeats it where a failed submit is looked for.
    const mediaLink = describeMediaLink(mediaUrl);
    if (mediaLink.state === "invalid") {
      setError(mediaLink.message);
      return;
    }

    setSaving(true);
    try {
      const eventId = await createEvent({
        title,
        description,
        datetime,
        endTime,
        ticketTiers: tiers,
        externalTicketUrl: externalTicketUrl.trim() || undefined,
        externalTicketPriceCents: externalTicketPrice.trim()
          ? Math.round(parseFloat(externalTicketPrice) * 100)
          : undefined,
        ...location.toArgs(),
        tags,
        requiresApproval,
        hostOrgId: hostOrgId ? (hostOrgId as any) : undefined,
        mediaUrl: mediaLink.state === "ok" ? mediaLink.url : undefined,
      });

      // The event exists now. A cover that fails to attach isn't worth
      // stranding the person here — it can be added from Edit.
      if (cover) {
        try {
          await saveEventCoverImage({ eventId, storageId: cover.storageId });
        } catch (err) {
          console.error("Cover save error:", err);
        }
      }

      // Track event created
      posthog?.capture("event_created", {
        has_location: !!location.value,
        location_type: location.selected?.locationType || "manual",
        has_coordinates: !!location.selected?.coordinates,
        tags_count: tags.length,
        requires_approval: requiresApproval,
        has_cover: !!cover,
        // A short link the server still has to follow is TikTok to the
        // dashboard, same as a permalink.
        media_provider:
          mediaLink.state !== "ok"
            ? null
            : mediaLink.kind === "tiktok-short"
              ? "tiktok"
              : mediaLink.kind,
      });

      navigate(`/events/${eventId}`);
    } catch (err) {
      setError("Failed to create event");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      goNext();
    } else if (!saving && !coverUploading) {
      void submit();
    }
  }

  // Enter in a field on steps 1-2 goes Next (via the form's submit). On the
  // last step it would create the event from inside a ticket-tier box, so
  // there Enter in a text box does nothing.
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (
      step === 3 &&
      e.key === "Enter" &&
      e.target instanceof HTMLInputElement
    ) {
      e.preventDefault();
    }
  }

  // Row summaries.
  const filledTiers = ticketTiers.filter(
    (t) => t.name.trim() || t.price.trim(),
  ).length;
  const ticketSummary =
    [
      filledTiers > 0 ? `${filledTiers} tier${filledTiers > 1 ? "s" : ""}` : "",
      externalTicketUrl.trim() ? "Stripe link" : "",
    ]
      .filter(Boolean)
      .join(" · ") || "Free";
  const mediaSummary = mediaUrl.trim() || "None";

  function toggleTickets() {
    if (!showTickets && ticketTiers.length === 0) {
      // Open on a ready row instead of an empty list and a second click.
      setTicketTiers([emptyTierDraft()]);
    }
    setShowTickets((open) => !open);
  }

  const busy = saving || coverUploading;
  const primaryDisabled =
    step === 1
      ? !whenFilled
      : step === 2
        ? !aboutFilled || coverUploading
        : busy;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-heading`}
        className="flex flex-col w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border shadow-2xl"
        style={{
          backgroundColor: "var(--app-surface)",
          borderColor: "var(--app-hairline-raised)",
        }}
      >
        <div className="px-5 sm:px-6 pt-5 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2
              id={`${uid}-heading`}
              className="text-xl font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Host an event
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 w-10 h-10 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--app-hairline)]"
              style={{ color: "var(--app-text-muted)" }}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="flex gap-1.5 mt-3" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    n <= step
                      ? "var(--app-accent)"
                      : "var(--app-hairline-raised)",
                }}
              />
            ))}
          </div>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--app-text-muted)" }}
          >
            {step} of 3 · {STEPS[step - 1]}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className="flex flex-col flex-1 min-h-0"
        >
          <div
            ref={bodyRef}
            tabIndex={-1}
            className={`flex-1 min-h-0 px-5 sm:px-6 pb-4 overflow-y-auto outline-none ${
              step === 1 ? "sm:overflow-visible" : ""
            }`}
          >
            {/* Step 1 — what and when */}
            <div
              data-step="1"
              className={step === 1 ? "space-y-4" : "hidden"}
            >
              <div>
                <FieldLabel htmlFor={titleId}>Title</FieldLabel>
                <input
                  id={titleId}
                  data-autofocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Event name"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <FieldLabel htmlFor={dateId}>Date</FieldLabel>
                  <input
                    id={dateId}
                    type="date"
                    min={todayString()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputTightClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={startId}>Start time</FieldLabel>
                  <input
                    id={startId}
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className={inputTightClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={endId} optional>
                    End time
                  </FieldLabel>
                  <input
                    id={endId}
                    type="time"
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    className={inputTightClass}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                className={EMBEDDED}
                role="group"
                aria-labelledby={locationLabelId}
              >
                <FieldLabel id={locationLabelId}>Location</FieldLabel>
                <LocationAutocomplete
                  value={location.value}
                  onChange={location.onChange}
                  onSelect={location.onSelect}
                  placeholder="Venue or address, or Online, TBD"
                />
                <LocationVerifiedHint
                  value={location.value}
                  selected={location.selected}
                />
              </div>
            </div>

            {/* Step 2 — tell people about it */}
            <div
              data-step="2"
              className={step === 2 ? "space-y-5" : "hidden"}
            >
              <div>
                <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
                <textarea
                  id={descriptionId}
                  data-autofocus
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this event about?"
                  rows={4}
                  className={`${inputClass} resize-none`}
                  style={inputStyle}
                />
              </div>

              <div>
                <FieldLabel optional>Cover image</FieldLabel>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverPick}
                  className="hidden"
                  tabIndex={-1}
                />
                {cover ? (
                  <div className="flex items-center gap-4">
                    <div
                      className="relative overflow-hidden aspect-[16/10] w-40 flex-shrink-0 rounded-lg border"
                      style={{
                        borderColor: "var(--app-hairline)",
                        backgroundColor: "var(--app-surface-raised)",
                      }}
                    >
                      <ImageFill src={cover.previewUrl} alt="Cover preview" />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        disabled={coverUploading}
                        className="py-1 text-[13.5px] font-medium hover:underline disabled:opacity-50"
                        style={{ color: "var(--app-accent-ink)" }}
                      >
                        {coverUploading ? "Uploading…" : "Change"}
                      </button>
                      <button
                        type="button"
                        onClick={removeCover}
                        disabled={coverUploading}
                        className="py-1 text-[13.5px] font-medium hover:underline disabled:opacity-50"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={coverUploading}
                    className="w-full flex items-center justify-center gap-2 py-5 rounded-lg border border-dashed text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline)] disabled:opacity-50"
                    style={{
                      borderColor: "var(--app-hairline-raised)",
                      color: "var(--app-text)",
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.8}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {coverUploading ? "Uploading…" : "Add a cover image"}
                  </button>
                )}
                {coverError ? (
                  <p className="mt-1.5 text-sm text-red-300" role="alert">
                    {coverError}
                  </p>
                ) : (
                  <p
                    className="mt-1.5 text-sm"
                    style={{ color: "var(--app-text-dim)" }}
                  >
                    Landscape, 1600 × 900 works best.
                  </p>
                )}
              </div>

              <div>
                <FieldLabel optional>Tags</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TAGS.map((tag) => {
                    const on = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed={on}
                        className="px-3 py-1.5 rounded-full border text-sm transition-colors"
                        style={
                          on
                            ? {
                                backgroundColor: "var(--app-accent)",
                                borderColor: "var(--app-accent)",
                                color: "var(--garden-ink)",
                              }
                            : {
                                backgroundColor: "var(--app-surface-raised)",
                                borderColor: "var(--app-hairline)",
                                color: "var(--app-text-muted)",
                              }
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 3 — options, all optional */}
            <div data-step="3" className={step === 3 ? "" : "hidden"}>
              {/* Renders nothing for a person in no community — empty:hidden drops the padding too. */}
              <div className={`${EMBEDDED} pb-4 empty:hidden`}>
                <CommunityPicker
                  value={hostOrgId}
                  onChange={setHostOrgId}
                  variant="tailwind"
                  defaultHostOrgId={defaultHostOrgId}
                />
              </div>

              <div
                className="py-3 border-t"
                style={{ borderColor: "var(--app-hairline)" }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={requiresApproval}
                  onClick={() => setRequiresApproval((on) => !on)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <span
                    className="text-[15px]"
                    style={{ color: "var(--app-text)" }}
                  >
                    Require approval
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
                    style={{
                      backgroundColor: requiresApproval
                        ? "var(--app-accent)"
                        : "var(--app-hairline-raised)",
                    }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform"
                      style={{
                        backgroundColor: requiresApproval
                          ? "var(--garden-ink)"
                          : "var(--app-text)",
                        transform: requiresApproval
                          ? "translateX(20px)"
                          : "translateX(0)",
                      }}
                    />
                  </span>
                </button>
              </div>

              <OptionRow
                label="Tickets"
                value={ticketSummary}
                actionLabel="Add tickets"
                expanded={showTickets}
                onToggle={toggleTickets}
                panelId={ticketsPanelId}
              >
                <div className={`${EMBEDDED} space-y-4 [&_p.text-xs]:hidden`}>
                  <TicketTierEditor
                    tiers={ticketTiers}
                    onChange={setTicketTiers}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-3">
                    <div>
                      <FieldLabel htmlFor={stripeLinkId}>
                        Stripe Payment Link
                      </FieldLabel>
                      <input
                        id={stripeLinkId}
                        type="text"
                        value={externalTicketUrl}
                        onChange={(e) => setExternalTicketUrl(e.target.value)}
                        placeholder="https://buy.stripe.com/..."
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={stripePriceId}>Price ($)</FieldLabel>
                      <input
                        id={stripePriceId}
                        type="number"
                        min="0"
                        step="0.01"
                        value={externalTicketPrice}
                        onChange={(e) => setExternalTicketPrice(e.target.value)}
                        placeholder="25"
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  {!isMember && (
                    <p
                      className="text-sm"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Ticketed events go live once you're a member.
                    </p>
                  )}
                </div>
              </OptionRow>

              <OptionRow
                label="Video or reel link"
                value={mediaSummary}
                actionLabel="Add"
                expanded={showMedia}
                onToggle={() => setShowMedia((open) => !open)}
                panelId={mediaPanelId}
              >
                <div className={EMBEDDED}>
                  <MediaLinkField
                    value={mediaUrl}
                    onChange={setMediaUrl}
                    label="Instagram, TikTok, YouTube or Vimeo"
                  />
                </div>
              </OptionRow>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mx-5 sm:mx-6 mb-3 px-3 py-2 rounded-lg border text-sm text-red-200 flex-shrink-0"
              style={{
                borderColor: "rgba(248, 113, 113, 0.4)",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
              }}
            >
              {error}
            </div>
          )}

          <div
            className="flex gap-3 px-5 sm:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5 border-t flex-shrink-0"
            style={{ borderColor: "var(--app-hairline)" }}
          >
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={saving}
                className={secondaryButtonClass}
                style={secondaryButtonStyle}
              >
                Back
              </button>
            )}
            <button
              key={step === 3 ? "create" : "next"}
              type="submit"
              disabled={primaryDisabled}
              className="flex-1 px-4 py-2.5 rounded-lg text-[13.5px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                backgroundColor: "var(--app-accent)",
                color: "var(--garden-ink)",
              }}
            >
              {step < 3 ? "Next" : saving ? "Creating…" : "Create event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
