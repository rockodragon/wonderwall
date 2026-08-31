import { useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";

// Discipline tags share the canonical INTERESTS list with People
// (search.tsx) and Projects (projects.tsx) — same values, same order.
// This page (like projects.tsx) renders its own garden-token-styled pills
// rather than the shared TagFilterPills component: TagFilterPills is
// Tailwind-colored (bg-blue-600 active state) and would read as visually
// foreign against this page's --garden-* dark/citron token system, whereas
// this local pill markup matches Projects' existing #Tag convention exactly.
const DISCIPLINE_TAGS: readonly string[] = INTERESTS;

const FORMAT_FILTERS = [
  { label: "All", value: "" },
  { label: "Class", value: "class" },
  { label: "Coaching", value: "coaching" },
  { label: "Workshop", value: "workshop" },
  { label: "Mentorship", value: "mentorship" },
  { label: "Other", value: "other" },
];

const FORMAT_OPTIONS = [
  { label: "Class", value: "class" },
  { label: "Coaching", value: "coaching" },
  { label: "Workshop", value: "workshop" },
  { label: "Mentorship", value: "mentorship" },
  { label: "Other", value: "other" },
];

const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  FORMAT_OPTIONS.map((f) => [f.value, f.label]),
);

// Convex surfaces a thrown ConvexError's payload on err.data, not
// err.message — see the identical helper in projects.tsx.
function errorMessage(err: unknown): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "reason" in data) {
    return String((data as { reason: unknown }).reason);
  }
  return "Something went wrong — try again.";
}

function formatPrice(priceCents?: number): string {
  if (!priceCents) return "Free";
  return `$${(priceCents / 100).toLocaleString()}`;
}

// Same display convention as event.tsx's datetime rendering.
function formatDateTime(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Same separate date + time inputs as event.tsx's edit form, combined back
// into epoch ms with `new Date(...)`. Deliberately NOT event.tsx's
// `toISOString().split("T")[0]` for the date half — toISOString() is UTC,
// so a start time entered/displayed in local time (toLocaleDateString,
// toTimeString below — both local) round-trips to the wrong calendar day
// once local time is behind UTC. getFullYear/Month/Date are local, matching
// every other date read in this file.
function toDateInputValue(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInputValue(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toTimeString().slice(0, 5);
}

// Same hostname-display convention as work.tsx/profile.tsx/settings.tsx.
function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export default function Offerings() {
  const offerings = useQuery(api.offerings.listOfferings);
  const myProfile = useQuery(api.profiles.getMyProfile);
  const [formatFilter, setFormatFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Discipline-tag pills, a hard filter alongside the format-pill row —
  // same semantics as Projects' tag pills: click to require, not just sort.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  function toggleTag(tag: string) {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const filtered = useMemo(() => {
    if (!offerings) return [];
    let list = formatFilter ? offerings.filter((o) => o.format === formatFilter) : offerings;
    if (tagFilter.length > 0) {
      list = list.filter((o) => o.interests?.some((tag) => tagFilter.includes(tag)));
    }
    return list;
  }, [offerings, formatFilter, tagFilter]);

  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-[var(--garden-paper)] mb-1"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Classes & Coaching
        </h1>
        <p className="text-[var(--garden-body)] mb-6">
          Recurring classes, coaching, and workshop series — find a seat, or offer one.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            {FORMAT_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormatFilter(f.value)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium uppercase tracking-[0.06em] whitespace-nowrap transition-colors"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor:
                    formatFilter === f.value ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                  color: formatFilter === f.value ? "var(--garden-ink)" : "var(--garden-muted)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={{ fontFamily: "var(--garden-font-body)", backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            + Post an offering
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          {DISCIPLINE_TAGS.map((tag) => {
            const active = tagFilter.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                  color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                }}
              >
                {tag}
              </button>
            );
          })}
          {tagFilter.length > 0 && (
            <button
              onClick={() => setTagFilter([])}
              className="text-xs underline underline-offset-2 hover:opacity-80"
              style={{ color: "var(--garden-citron)" }}
            >
              Clear
            </button>
          )}
        </div>

        {!offerings ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--garden-citron)", borderTopColor: "transparent" }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--garden-dim)" }}>
            <p className="text-lg font-medium mb-1" style={{ color: "var(--garden-body)" }}>
              No offerings yet
            </p>
            <p className="text-sm">Be the first to post a class, a coaching slot, or a workshop</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((offering) => (
              <OfferingCard
                key={offering._id}
                offering={offering}
                isOwner={!!myProfile && offering.userId === myProfile.userId}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && <PostOfferingForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

function OfferingCard({ offering, isOwner }: { offering: any; isOwner: boolean }) {
  const updateStatus = useMutation(api.offerings.updateOfferingStatus);
  const deleteOffering = useMutation(api.offerings.deleteOffering);
  const [busy, setBusy] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  async function handleStatusChange(status: string) {
    setBusy(true);
    try {
      await updateStatus({ offeringId: offering._id, status });
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${offering.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteOffering({ offeringId: offering._id });
    } catch (err) {
      window.alert(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden border h-full flex flex-col transition-colors"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <div
        className="aspect-[16/10] overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: "var(--garden-ink)" }}
      >
        {offering.photoUrl ? (
          <img
            src={offering.photoUrl}
            alt={offering.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg
            className="w-10 h-10"
            style={{ color: "var(--garden-hairline-raised)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 6L3 10l9 4 9-4-9-4zM6.5 12.5V17c0 1 2.5 3 5.5 3s5.5-2 5.5-3v-4.5"
            />
          </svg>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3
            className="font-semibold line-clamp-2"
            style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
          >
            {offering.title}
          </h3>
          <span
            className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-[0.06em]"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "rgba(215,242,90,0.14)",
              color: "var(--garden-citron)",
            }}
          >
            {FORMAT_LABELS[offering.format] ?? offering.format}
          </span>
        </div>
        {offering.interests && offering.interests.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {offering.interests.map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor: "rgba(198,198,190,0.1)",
                  color: "var(--garden-muted)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {offering.description && (
          <p className="text-sm line-clamp-2 mb-2" style={{ color: "var(--garden-dim)" }}>
            {offering.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-3" style={{ color: "var(--garden-muted)" }}>
          {offering.cadence && <span>{offering.cadence}</span>}
          {formatDateTime(offering.startDate) && <span>{formatDateTime(offering.startDate)}</span>}
          {offering.isRecurring && (
            <span>
              {formatDateOnly(offering.endDate)
                ? `Recurring until ${formatDateOnly(offering.endDate)}`
                : "Recurring"}
            </span>
          )}
          <span style={{ color: "var(--garden-citron)" }}>{formatPrice(offering.priceCents)}</span>
          <span>{offering.remote === false && offering.location ? offering.location : "Remote"}</span>
        </div>
        {offering.creator && (
          <div className="mt-auto flex items-center gap-2 pt-2 min-w-0">
            {offering.creator.imageUrl ? (
              <img
                src={offering.creator.imageUrl}
                alt={offering.creator.name}
                className="w-5 h-5 rounded-full object-cover shrink-0"
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
              >
                {offering.creator.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs break-words" style={{ color: "var(--garden-muted)" }}>
              {offering.creator.name}
            </span>
          </div>
        )}

        <div
          className="flex items-center justify-between gap-2 mt-3 pt-3"
          style={{ borderTop: "1px solid var(--garden-hairline)" }}
        >
          <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
            {offering.signupCount > 0
              ? `${offering.signupCount} signed up`
              : "Be the first to sign up"}
          </span>
          <button
            onClick={() => setShowSignupModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Sign up
          </button>
        </div>

        {isOwner && (
          <div
            className="flex items-center justify-between gap-2 mt-3 pt-3"
            style={{ borderTop: "1px solid var(--garden-hairline)" }}
          >
            <select
              value={offering.status}
              disabled={busy}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="px-2 py-1 rounded-lg text-xs font-medium outline-none disabled:opacity-50"
              style={{
                fontFamily: "var(--garden-font-body)",
                backgroundColor: "var(--garden-ink)",
                color: "var(--garden-body)",
                border: "1px solid var(--garden-hairline-raised)",
              }}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEditForm(true)}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  color: "var(--garden-body)",
                  border: "1px solid var(--garden-hairline-raised)",
                }}
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "transparent", color: "var(--garden-dim)" }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {showEditForm && (
        <PostOfferingForm offering={offering} onClose={() => setShowEditForm(false)} />
      )}
      {showSignupModal && (
        <SignupModal offering={offering} onClose={() => setShowSignupModal(false)} />
      )}
    </div>
  );
}

function SignupModal({ offering, onClose }: { offering: any; onClose: () => void }) {
  const signUp = useMutation(api.offerings.signUpForOffering);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isFree = !offering.priceCents || offering.priceCents <= 0;
  const hasExternalLink = !!offering.externalPaymentLinkUrl;

  async function handleSignUp() {
    setError("");
    setSubmitting(true);
    try {
      await signUp({ offeringId: offering._id });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  // The external link both navigates (real <a target="_blank"> — window.open()
  // gets blocked in some environments) AND records the sign-up here, so the
  // roster stays accurate even though the money moves off-platform.
  function handleExternalClick() {
    void handleSignUp();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 my-8"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          Sign up for "{offering.title}"
        </h2>

        {done ? (
          <div className="py-4">
            <p className="text-sm mb-4" style={{ color: "var(--garden-body)" }}>
              {hasExternalLink
                ? "You're recorded as signed up here — finish registering and paying on the external site if you haven't yet."
                : isFree
                  ? "You're in — see you there."
                  : "Pledge recorded — thank you. We'll follow up when real checkout is live."}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Done
            </button>
          </div>
        ) : hasExternalLink ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--garden-body)" }}>
              {offering.creator?.name ?? "The instructor"} takes sign-ups and payment through
              another tool. Clicking through also saves your spot here, so there's one place to
              see who's coming.
            </p>
            <a
              href={offering.externalPaymentLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalClick}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-center"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Register &amp; Pay — opens {domainFromUrl(offering.externalPaymentLinkUrl)}
            </a>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: "var(--garden-dim)" }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!isFree && (
              <p
                className="text-xs px-2.5 py-1.5 rounded-md"
                style={{ color: "var(--garden-citron)", backgroundColor: "rgba(215,242,90,0.1)" }}
              >
                This is a pledge — no checkout, no charge. Nothing is collected at this point.
              </p>
            )}
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
                onClick={handleSignUp}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
              >
                {submitting ? "Saving…" : isFree ? "Reserve a spot" : "Pledge to attend"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Create when `offering` is omitted, edit in place when it's passed — one
// form instead of two parallel ones, prefilled from the existing record.
function PostOfferingForm({
  offering,
  onClose,
}: {
  offering?: any;
  onClose: () => void;
}) {
  const isEdit = !!offering;
  const createOffering = useMutation(api.offerings.createOffering);
  const updateOffering = useMutation(api.offerings.updateOffering);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [title, setTitle] = useState(offering?.title ?? "");
  const [description, setDescription] = useState(offering?.description ?? "");
  const [format, setFormat] = useState(offering?.format ?? "class");
  const [cadence, setCadence] = useState(offering?.cadence ?? "");
  const [startDateStr, setStartDateStr] = useState(toDateInputValue(offering?.startDate));
  const [startTimeStr, setStartTimeStr] = useState(toTimeInputValue(offering?.startDate));
  const [isRecurring, setIsRecurring] = useState(offering?.isRecurring ?? false);
  const [endDateStr, setEndDateStr] = useState(toDateInputValue(offering?.endDate));
  const [isFree, setIsFree] = useState(offering ? !offering.priceCents : true);
  const [price, setPrice] = useState(
    offering?.priceCents ? String(offering.priceCents / 100) : "",
  );
  const [remote, setRemote] = useState(offering?.remote ?? true);
  const location = useLocationField(offering);
  const [selectedTags, setSelectedTags] = useState<string[]>(offering?.interests ?? []);
  const [externalPaymentLinkUrl, setExternalPaymentLinkUrl] = useState(
    offering?.externalPaymentLinkUrl ?? "",
  );
  // photoUrl from the query is already resolved (a real storage URL when
  // photoStorageId is set) — fine to preview, but never re-submitted as-is:
  // the only thing this form writes back is photoStorageId.
  const [photoStorageId, setPhotoStorageId] = useState<string | null>(
    offering?.photoStorageId ?? null,
  );
  const [photoPreview, setPhotoPreview] = useState<string | null>(offering?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  // Same generateUploadUrl → fetch(POST, file) → storageId pattern as
  // CreateWorkComposer.tsx's handleFileUpload.
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be less than 5MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = await result.json();
      setPhotoStorageId(storageId);

      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload image — try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemovePhoto() {
    setPhotoStorageId(null);
    setPhotoPreview(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    let priceCents: number | undefined;
    if (!isFree) {
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        setError("Price needs to be a real number, or mark it Free.");
        return;
      }
      priceCents = Math.round(priceNum * 100);
    }
    if (!remote && !location.value.trim()) {
      setError("Add a location, or mark this remote/online.");
      return;
    }

    let startDate: number | undefined;
    if (startDateStr) {
      startDate = new Date(`${startDateStr}T${startTimeStr || "00:00"}`).getTime();
      if (!Number.isFinite(startDate)) {
        setError("That start date doesn't look right.");
        return;
      }
    }
    let endDate: number | undefined;
    if (isRecurring && endDateStr) {
      endDate = new Date(`${endDateStr}T00:00:00`).getTime();
      if (!Number.isFinite(endDate)) {
        setError("That end date doesn't look right.");
        return;
      }
    }

    const trimmedLink = externalPaymentLinkUrl.trim();
    if (trimmedLink) {
      try {
        new URL(trimmedLink);
      } catch {
        setError("That registration link doesn't look like a real URL.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        format,
        cadence: cadence.trim() || undefined,
        startDate,
        isRecurring,
        endDate,
        priceCents,
        ...location.toArgs(),
        remote,
        photoStorageId: (photoStorageId as any) ?? undefined,
        externalPaymentLinkUrl: trimmedLink || undefined,
        interests: selectedTags.length > 0 ? selectedTags : undefined,
      };
      if (isEdit) {
        await updateOffering({ offeringId: offering._id, ...payload });
      } else {
        await createOffering(payload);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div
        className="w-full max-w-md rounded-2xl border p-6 my-8"
        style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline)" }}
      >
        <h2
          className="text-xl font-semibold mb-1"
          style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
        >
          {isEdit ? "Edit offering" : "Post an offering"}
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--garden-dim)" }}>
          A recurring class, coaching slot, or workshop series — a display cadence, not a calendar system.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly beginner tap class"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Photo (optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            {photoPreview ? (
              <div className="relative rounded-lg overflow-hidden aspect-[16/10]">
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-6 rounded-lg border border-dashed text-xs disabled:opacity-50 transition-colors"
                style={{ borderColor: "var(--garden-hairline-raised)", color: "var(--garden-dim)" }}
              >
                {uploading ? "Uploading…" : "Click to upload an image"}
              </button>
            )}
          </div>
          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What happens in a session"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Cadence
              </label>
              <input
                type="text"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                placeholder="Tuesdays 6pm"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Start date
              </label>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => setStartDateStr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Start time
              </label>
              <input
                type="time"
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--garden-body)" }}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              This repeats (recurring)
            </label>
            {isRecurring && (
              <>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Recurring until
                </label>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    backgroundColor: "var(--garden-ink)",
                    borderColor: "var(--garden-hairline-raised)",
                    color: "var(--garden-paper)",
                  }}
                />
              </>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DISCIPLINE_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                    style={{
                      fontFamily: "var(--garden-font-body)",
                      backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink)",
                      color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                      border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--garden-body)" }}>
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
              />
              This is free
            </label>
            {!isFree && (
              <input
                type="number"
                min="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Price (USD)"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  fontFamily: "var(--garden-font-mono)",
                  backgroundColor: "var(--garden-ink)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
              Link to register/pay elsewhere (optional)
            </label>
            <input
              type="text"
              value={externalPaymentLinkUrl}
              onChange={(e) => setExternalPaymentLinkUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: "var(--garden-ink)",
                borderColor: "var(--garden-hairline-raised)",
                color: "var(--garden-paper)",
              }}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
              If you already use another tool to take sign-ups and payment, link it here — people
              can still sign up here so you have one place to see who's coming.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm mb-2" style={{ color: "var(--garden-body)" }}>
              <input
                type="checkbox"
                checked={remote}
                onChange={(e) => setRemote(e.target.checked)}
              />
              This is remote / online
            </label>
            {!remote && (
              <>
                <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                  Location
                </label>
                <LocationAutocomplete
                  value={location.value}
                  onChange={location.onChange}
                  onSelect={location.onSelect}
                  placeholder="Search for a location"
                />
              </>
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
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Post offering"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
