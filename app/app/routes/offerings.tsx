import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { INTERESTS } from "../constants/interests";
import { LocationAutocomplete } from "../components/LocationAutocomplete";
import { useLocationField } from "../lib/useLocationField";
import { CommunityPicker } from "../components/CommunityPicker";
import {
  CommunityContextLine,
  communityNameFor,
  useCommunityContext,
} from "../components/CommunityFilter";

// AnnouncementComposer moved off this list page entirely — it now renders
// only on the detail page (routes/offerings.$id.tsx), per the founder's
// item 3 ("messaging belongs inside the detail page, not included in list
// view"). PostOfferingForm/SignupModal/the format helpers below are
// exported so that detail page can reuse them rather than re-implement the
// edit form and sign-up flow.

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

export const FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  FORMAT_OPTIONS.map((f) => [f.value, f.label]),
);

// Convex surfaces a thrown ConvexError's payload on err.data, not
// err.message — see the identical helper in projects.tsx. Exported: the
// detail route (offerings.$id.tsx) reuses this for its own owner-action
// mutations rather than duplicating it.
export function errorMessage(err: unknown): string {
  const data = (err as { data?: unknown })?.data;
  if (data && typeof data === "object" && "reason" in data) {
    return String((data as { reason: unknown }).reason);
  }
  return "Something went wrong — try again.";
}

export function formatPrice(priceCents?: number): string {
  if (!priceCents) return "Free";
  return `$${(priceCents / 100).toLocaleString()}`;
}

// Same display convention as event.tsx's datetime rendering.
export function formatDateTime(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateOnly(ms?: number): string | null {
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
export function domainFromUrl(url: string): string {
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
  // "Mine" — item 3's second half: a quick filter to the signed-in creator's
  // own offerings, now that messaging (the other reason someone would want
  // to find their own listing) has moved to the detail page.
  const [mineOnly, setMineOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const {
    selected: communitySlug,
    setSelected: setCommunitySlug,
    communities,
  } = useCommunityContext();

  // Discipline-tag pills, a hard filter alongside the format-pill row —
  // same semantics as Projects' tag pills: click to require, not just sort.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  function toggleTag(tag: string) {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const filtered = useMemo(() => {
    if (!offerings) return [];
    let list = formatFilter ? offerings.filter((o) => o.format === formatFilter) : offerings;
    if (mineOnly) {
      list = list.filter((o) => !!myProfile && o.userId === myProfile.userId);
    }
    if (communitySlug !== "all") {
      list = list.filter((o) => o.community?.slug === communitySlug);
    }
    if (tagFilter.length > 0) {
      list = list.filter((o) => o.interests?.some((tag) => tagFilter.includes(tag)));
    }
    return list;
  }, [offerings, formatFilter, mineOnly, myProfile, communitySlug, tagFilter]);

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

        <CommunityContextLine
          variant="app"
          selected={communitySlug}
          setSelected={setCommunitySlug}
          communities={communities}
          rows={offerings}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 mt-3">
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
            {myProfile && (
              <button
                onClick={() => setMineOnly((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium uppercase tracking-[0.06em] whitespace-nowrap transition-colors"
                style={{
                  fontFamily: "var(--garden-font-body)",
                  backgroundColor: mineOnly ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                  color: mineOnly ? "var(--garden-ink)" : "var(--garden-muted)",
                }}
              >
                Mine
              </button>
            )}
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
        ) : filtered.length === 0 && communitySlug !== "all" ? (
          <div className="text-center py-16" style={{ color: "var(--garden-dim)" }}>
            <p className="text-lg font-medium mb-1" style={{ color: "var(--garden-body)" }}>
              Nothing in {communityNameFor(communitySlug, communities, offerings)} yet — see
              everything
            </p>
            <button
              onClick={() => setCommunitySlug("all")}
              className="text-sm underline underline-offset-2 hover:opacity-80"
              style={{ color: "var(--garden-citron)" }}
            >
              Show all communities
            </button>
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

// The whole card is a Link to the detail page now (founder item 3: owner
// messaging moved off the list entirely, and item 2 moved owner controls
// behind a kebab) — matches ProjectCard's "wrap the card, stop propagation
// on the interactive bits" convention in projects.tsx. PostOfferingForm/
// SignupModal render as siblings AFTER the Link (not nested inside it):
// nesting a fixed-position modal inside an <a> would mean every click
// inside it (Cancel, form fields, the backdrop) bubbles to the anchor and
// triggers navigation unless every single one stops propagation — lifting
// them out avoids that whole class of bug, same as projects.tsx lifting
// SupportModal to the page level.
function OfferingCard({ offering, isOwner }: { offering: any; isOwner: boolean }) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  return (
    <>
      <Link
        to={`/offerings/${offering._id}`}
        className="group rounded-2xl overflow-hidden border h-full flex flex-col transition-colors"
        style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
      >
        {/* Image area: format + price badges always overlay this same box
            (top-left / top-right) whether it holds a real photo or the
            placeholder icon — founder item 1 wanted the price in a fixed,
            non-buried spot, and photo-dependent positioning would defeat
            that. Both are solid (non-translucent) chips so they stay
            legible over any photo. */}
        <div
          className="relative aspect-[16/10] overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: "var(--garden-ink)" }}
        >
          {offering.photoUrl ? (
            <img
              src={offering.photoUrl}
              alt={offering.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "rgba(20,20,18,0.72)",
              color: "var(--garden-paper)",
            }}
          >
            {FORMAT_LABELS[offering.format] ?? offering.format}
          </span>
          <span
            className="absolute top-2 right-2 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{
              fontFamily: "var(--garden-font-mono)",
              backgroundColor: "var(--garden-citron)",
              color: "var(--garden-ink)",
            }}
          >
            {formatPrice(offering.priceCents)}
          </span>
        </div>
        <div className="p-4 flex-1 flex flex-col min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3
              className="font-semibold line-clamp-2"
              style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
            >
              {offering.title}
            </h3>
            {isOwner && (
              <OfferingKebabMenu offering={offering} onEdit={() => setShowEditForm(true)} />
            )}
          </div>
          {offering.interests && offering.interests.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {offering.interests.slice(0, 4).map((tag: string) => (
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
              {offering.interests.length > 4 && (
                <span className="px-2 py-0.5 text-[11px]" style={{ color: "var(--garden-dim)" }}>
                  +{offering.interests.length - 4}
                </span>
              )}
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
                {offering.community && (
                  <span style={{ color: "var(--garden-dim)" }}> · in {offering.community.name}</span>
                )}
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowSignupModal(true);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Sign up
            </button>
          </div>
        </div>
      </Link>

      {showEditForm && (
        <PostOfferingForm offering={offering} onClose={() => setShowEditForm(false)} />
      )}
      {showSignupModal && (
        <SignupModal offering={offering} onClose={() => setShowSignupModal(false)} />
      )}
    </>
  );
}

// Owner-only kebab (⋮) — replaces the always-visible status select + Edit +
// Delete row (founder item 2: "shouldn't just show up like that, even for
// owners"). Same open/close plumbing as CommunitySwitcher.tsx's own
// dropdown: useState + outside-click/Escape via a ref, role="menu"/
// menuitem, a raised bordered surface. Every trigger and menu item stops
// propagation so the card's own Link never fires underneath it.
function OfferingKebabMenu({ offering, onEdit }: { offering: any; onEdit: () => void }) {
  const updateStatus = useMutation(api.offerings.updateOfferingStatus);
  const deleteOffering = useMutation(api.offerings.deleteOffering);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleToggleStatus(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    setBusy(true);
    try {
      await updateStatus({
        offeringId: offering._id,
        status: offering.status === "active" ? "archived" : "active",
      });
    } catch (err) {
      window.alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
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
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Offering actions"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-base leading-none disabled:opacity-50 transition-colors hover:opacity-80"
        style={{ color: "var(--garden-dim)", backgroundColor: "var(--garden-ink)" }}
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Offering actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute right-0 mt-1 w-40 rounded-lg border overflow-hidden z-20 shadow-lg"
          style={{ backgroundColor: "var(--garden-ink-raised)", borderColor: "var(--garden-hairline-raised)" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              onEdit();
            }}
            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--garden-body)" }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={handleToggleStatus}
            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--garden-body)" }}
          >
            {offering.status === "active" ? "Archive" : "Reactivate"}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={handleDelete}
            className="block w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 text-red-400"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function SignupModal({ offering, onClose }: { offering: any; onClose: () => void }) {
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
// Progressive-disclosure section wrapper (founder item 4: "the edit page is
// too busy and narrow and tall... need sections to progressively
// disclose"). Reuses communities.$slug.tsx's HostToolsPanel <details>
// convention exactly — same bordered box, same SectionLabel-style summary
// treatment — rather than inventing a new collapsible pattern.
// `collapsible={false}` sections (Basics, Schedule) render as a plain
// static header instead of a <summary>, since those two are "always open,
// not collapsible" per the spec, not just "open by default."
function FormSection({
  label,
  children,
  collapsible = true,
  defaultOpen = true,
  summaryExtra,
}: {
  label: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  summaryExtra?: string;
}) {
  const boxStyle = { borderColor: "var(--garden-hairline-raised)", backgroundColor: "var(--garden-ink)" };
  const labelStyle = {
    color: "var(--garden-dim)",
    fontFamily: "var(--garden-font-mono)",
  } as const;

  if (!collapsible) {
    return (
      <div className="rounded-xl border p-4" style={boxStyle}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3.5" style={labelStyle}>
          {label}
        </div>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    );
  }

  return (
    <details className="rounded-xl border" style={boxStyle} open={defaultOpen}>
      <summary
        className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ listStyle: "none" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={labelStyle}>
          {label}
        </span>
        {summaryExtra && (
          <span className="text-xs" style={{ color: "var(--garden-dim)" }}>
            {summaryExtra}
          </span>
        )}
      </summary>
      <div
        className="px-4 pb-4 pt-1 border-t flex flex-col gap-4"
        style={{ borderColor: "var(--garden-hairline)" }}
      >
        {children}
      </div>
    </details>
  );
}

export function PostOfferingForm({
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
  const [hostOrgId, setHostOrgId] = useState(offering?.hostOrgId ?? "");
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
  // Pre-fill from the sidebar switcher's current context, create mode only
  // (community-ux.md §2/§6) — an edit form keeps the offering's own
  // community, it doesn't get silently reassigned to whatever's selected now.
  const { selected: switcherCommunitySlug, communities: myCommunities } = useCommunityContext();
  const defaultHostOrgId = isEdit
    ? undefined
    : myCommunities.find((c) => c.slug === switcherCommunitySlug)?._id;

  // Progressive-disclosure defaults (founder item 4) — computed once from
  // the stable `offering` prop, NOT from the live form state above. If
  // these read from e.g. `selectedTags`/`remote` instead, React would
  // re-sync the <details>'s `open` DOM attribute every time that state
  // changes and fight the user's own manual expand/collapse the moment
  // they, say, clear the last selected tag while the section is open.
  const tagsDefaultOpen = (offering?.interests?.length ?? 0) > 0;
  const locationDefaultOpen =
    offering?.remote === false || !!offering?.photoUrl || !!offering?.photoStorageId;

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
        hostOrgId: hostOrgId ? (hostOrgId as any) : undefined,
      };
      if (isEdit) {
        // Choosing the empty option on an offering that already had a
        // community clears it — Convex validators don't accept `null`
        // through v.optional, so this is a separate flag (see
        // convex/offerings.ts's updateOffering).
        const clearCommunity = !hostOrgId && !!offering.hostOrgId;
        await updateOffering({ offeringId: offering._id, ...payload, clearCommunity });
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
        className="w-full max-w-2xl rounded-2xl border p-6 my-8"
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
          <FormSection label="Basics" collapsible={false}>
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
                  backgroundColor: "var(--garden-ink-raised)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
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
                  backgroundColor: "var(--garden-ink-raised)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--garden-dim)" }}>
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  backgroundColor: "var(--garden-ink-raised)",
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
            <CommunityPicker value={hostOrgId} onChange={setHostOrgId} defaultHostOrgId={defaultHostOrgId} />
          </FormSection>

          <FormSection label="Schedule" collapsible={false}>
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
                  backgroundColor: "var(--garden-ink-raised)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
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
                    backgroundColor: "var(--garden-ink-raised)",
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
                    backgroundColor: "var(--garden-ink-raised)",
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
                      backgroundColor: "var(--garden-ink-raised)",
                      borderColor: "var(--garden-hairline-raised)",
                      color: "var(--garden-paper)",
                    }}
                  />
                </>
              )}
            </div>
          </FormSection>

          <FormSection label="Pricing & registration" defaultOpen>
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
                    backgroundColor: "var(--garden-ink-raised)",
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
                  backgroundColor: "var(--garden-ink-raised)",
                  borderColor: "var(--garden-hairline-raised)",
                  color: "var(--garden-paper)",
                }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--garden-dim)" }}>
                If you already use another tool to take sign-ups and payment, link it here — people
                can still sign up here so you have one place to see who's coming.
              </p>
            </div>
          </FormSection>

          <FormSection
            label="Tags"
            defaultOpen={tagsDefaultOpen}
            summaryExtra={
              selectedTags.length > 0 ? `${selectedTags.length} selected` : "None yet"
            }
          >
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
                      backgroundColor: active ? "var(--garden-citron)" : "var(--garden-ink-raised)",
                      color: active ? "var(--garden-ink)" : "var(--garden-muted)",
                      border: `1px solid ${active ? "var(--garden-citron)" : "var(--garden-hairline-raised)"}`,
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection
            label="Location & photo"
            defaultOpen={locationDefaultOpen}
            summaryExtra={remote ? "Remote" : location.value || "In person"}
          >
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
          </FormSection>

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
