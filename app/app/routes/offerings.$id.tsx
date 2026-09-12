// /offerings/:offeringId — a single class/coaching offering's detail page.
// Founder feedback (items 2 & 3): owner controls (edit/archive/delete) and
// the "message participants" composer don't belong on the list card
// anymore — they live here now, the one place a person actually lands when
// they care about a specific offering. Same app-shell pattern as
// communities.$slug.tsx: a plain PageShell div inside the _app layout (this
// route is already registered inside _app in routes.ts, so it gets the
// sidebar/nav automatically) — NOT projects.$id.tsx's retired GardenPage/
// GardenNav shell.
//
// PostOfferingForm/SignupModal/the format+price helpers are reused directly
// from routes/offerings.tsx (the list page) rather than re-implemented —
// same edit form, same sign-up flow, same badge styling as the card.

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useNavigate, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import { AnnouncementComposer } from "../components/AnnouncementComposer";
import {
  FORMAT_LABELS,
  PostOfferingForm,
  SignupModal,
  domainFromUrl,
  errorMessage,
  formatDateOnly,
  formatDateTime,
  formatPrice,
} from "./offerings";

// Loader-less (this whole app is a client-only SPA over useQuery — same as
// communities.$slug.tsx/projects.$id.tsx), so `data` is never actually
// populated here; this just matches those two routes' existing convention
// for a title that can't be known before the query resolves rather than
// inventing a new one.
export function meta({ data }: { data?: { title?: string } }) {
  return [
    { title: data?.title ? `${data.title} — Classes` : "Class — creatives.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <PageShell>
      <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
        This class isn't here — check back soon.
      </p>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--garden-ink)]">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">{children}</div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--garden-citron)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/offerings"
      className="inline-block text-sm mb-5 hover:opacity-80"
      style={{ color: "var(--garden-citron)" }}
    >
      ← Classes
    </Link>
  );
}

function DetailCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4 mb-6"
      style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-3"
        style={{ color: "var(--garden-dim)", fontFamily: "var(--garden-font-mono)" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export default function OfferingDetail() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const offering = useQuery(
    api.offerings.getOffering,
    offeringId ? { offeringId } : "skip",
  );
  const myProfile = useQuery(api.profiles.getMyProfile);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  if (offering === undefined) {
    return (
      <PageShell>
        <BackLink />
        <Loading />
      </PageShell>
    );
  }

  if (offering === null) {
    return (
      <PageShell>
        <BackLink />
        <p className="text-sm" style={{ color: "var(--garden-dim)" }}>
          Check the link — this class isn't here anymore.
        </p>
      </PageShell>
    );
  }

  const isOwner = !!myProfile && offering.userId === myProfile.userId;

  return (
    <PageShell>
      <BackLink />

      <div
        className="relative rounded-2xl overflow-hidden border aspect-[16/9] flex items-center justify-center mb-6"
        style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
      >
        {offering.photoUrl ? (
          <img src={offering.photoUrl} alt={offering.title} className="w-full h-full object-cover" />
        ) : (
          <svg
            className="w-14 h-14"
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
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "rgba(20,20,18,0.72)", color: "var(--garden-paper)" }}
        >
          {FORMAT_LABELS[offering.format] ?? offering.format}
        </span>
        <span
          className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-sm font-bold"
          style={{ fontFamily: "var(--garden-font-mono)", backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          {formatPrice(offering.priceCents)}
        </span>
      </div>

      <h1
        className="text-2xl sm:text-3xl font-semibold mb-2"
        style={{ color: "var(--garden-paper)", fontFamily: "var(--garden-font-display)" }}
      >
        {offering.title}
      </h1>

      {offering.creator && (
        <Link to={`/profile/${offering.creator._id}`} className="flex items-center gap-2 mb-4 w-fit hover:opacity-80">
          {offering.creator.imageUrl ? (
            <img
              src={offering.creator.imageUrl}
              alt={offering.creator.name}
              className="w-6 h-6 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ backgroundColor: "var(--garden-hairline-raised)", color: "var(--garden-paper)" }}
            >
              {offering.creator.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm" style={{ color: "var(--garden-muted)" }}>
            {offering.creator.name}
            {offering.community && (
              <span style={{ color: "var(--garden-dim)" }}> · in {offering.community.name}</span>
            )}
          </span>
        </Link>
      )}

      {offering.interests && offering.interests.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {offering.interests.map((tag: string) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ fontFamily: "var(--garden-font-body)", backgroundColor: "rgba(198,198,190,0.1)", color: "var(--garden-muted)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {offering.description && (
        <p className="text-[15px] leading-relaxed mb-6 whitespace-pre-wrap" style={{ color: "var(--garden-body)" }}>
          {offering.description}
        </p>
      )}

      <DetailCard label="Schedule">
        <div className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--garden-body)" }}>
          {offering.cadence && <div>{offering.cadence}</div>}
          {formatDateTime(offering.startDate) && <div>Starts {formatDateTime(offering.startDate)}</div>}
          {offering.isRecurring && (
            <div>
              {formatDateOnly(offering.endDate)
                ? `Recurring until ${formatDateOnly(offering.endDate)}`
                : "Recurring"}
            </div>
          )}
          <div>{offering.remote === false && offering.location ? offering.location : "Remote / online"}</div>
          {offering.externalPaymentLinkUrl && (
            <div style={{ color: "var(--garden-dim)" }}>
              Registration and payment happen through {domainFromUrl(offering.externalPaymentLinkUrl)} —
              signing up below still records it here.
            </div>
          )}
        </div>
      </DetailCard>

      <div
        className="flex items-center justify-between gap-3 rounded-2xl border p-4 mb-6"
        style={{ borderColor: "var(--garden-hairline)", backgroundColor: "var(--garden-ink-raised)" }}
      >
        <span className="text-sm" style={{ color: "var(--garden-dim)" }}>
          {offering.signupCount > 0 ? `${offering.signupCount} signed up` : "Be the first to sign up"}
        </span>
        <button
          onClick={() => setShowSignupModal(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
        >
          Sign up
        </button>
      </div>

      {isOwner && <OwnerActions offering={offering} onEdit={() => setShowEditForm(true)} />}

      {isOwner && (
        <div className="mb-6">
          <AnnouncementComposer targetType="offering" targetId={offering._id} heading="Message participants" />
        </div>
      )}

      {showEditForm && <PostOfferingForm offering={offering} onClose={() => setShowEditForm(false)} />}
      {showSignupModal && <SignupModal offering={offering} onClose={() => setShowSignupModal(false)} />}
    </PageShell>
  );
}

// Owner-only actions — plain visible buttons rather than the list card's
// kebab menu, since there's no card Link underneath here to protect from
// accidental navigation; the detail page has the room to just show them.
function OwnerActions({ offering, onEdit }: { offering: any; onEdit: () => void }) {
  const updateStatus = useMutation(api.offerings.updateOfferingStatus);
  const deleteOffering = useMutation(api.offerings.deleteOffering);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleToggleStatus() {
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

  async function handleDelete() {
    if (!window.confirm(`Delete "${offering.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteOffering({ offeringId: offering._id });
      navigate("/offerings");
    } catch (err) {
      window.alert(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <DetailCard label="Manage">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onEdit}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-ink)", color: "var(--garden-body)", border: "1px solid var(--garden-hairline-raised)" }}
        >
          Edit
        </button>
        <button
          onClick={handleToggleStatus}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "var(--garden-ink)", color: "var(--garden-body)", border: "1px solid var(--garden-hairline-raised)" }}
        >
          {offering.status === "active" ? "Archive" : "Reactivate"}
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50 text-red-400"
          style={{ backgroundColor: "transparent" }}
        >
          Delete
        </button>
      </div>
    </DetailCard>
  );
}
