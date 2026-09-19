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
import { Link, useNavigate, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
        className="text-xs font-semibold uppercase tracking-[0.08em] mb-3"
        style={{ color: "var(--garden-muted)", fontFamily: "var(--garden-font-mono)" }}
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

  // Stripe sends a student back here with ?paid=1 (createClassCheckout's
  // success_url). The webhook can trail the redirect by a few seconds, so this
  // reads the live sign-up: it says "signed up" once the payment is confirmed
  // and, until then, only that the payment went out. No sign-up row means they
  // didn't come from a checkout, so nothing is said.
  const [searchParams] = useSearchParams();
  const justPaid = searchParams.get("paid") === "1";
  const mySignup = useQuery(
    api.offerings.getMySignup,
    justPaid && offeringId ? { offeringId } : "skip",
  );

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

      {offering.pause.paused && <PausedBanner offering={offering} isOwner={isOwner} />}
      {justPaid && mySignup && (
        <div
          role="status"
          className="rounded-2xl border p-4 mb-6 text-sm"
          style={{
            borderColor: "var(--garden-hairline)",
            backgroundColor: "var(--garden-ink-raised)",
            color: "var(--garden-body)",
          }}
        >
          {mySignup.status === "confirmed"
            ? "You're signed up."
            : "Payment sent. Your spot shows here in a moment."}
        </div>
      )}

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
        {offering.pause.paused ? (
          <span className="text-sm text-right" style={{ color: "var(--garden-body)" }}>
            Paused — no new sign-ups
          </span>
        ) : (
          <button
            onClick={() => setShowSignupModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            Sign up
          </button>
        )}
      </div>

      {isOwner && <OwnerActions offering={offering} onEdit={() => setShowEditForm(true)} />}

      {isOwner && (
        <div className="mb-6">
          <AnnouncementComposer targetType="offering" targetId={offering._id} heading="Message participants" />
        </div>
      )}

      {offering.canModerate && <ModerationPanel offering={offering} />}

      {offering.canReport && !offering.canModerate && <ReportControl offering={offering} />}

      {showEditForm && <PostOfferingForm offering={offering} onClose={() => setShowEditForm(false)} />}
      {showSignupModal && !offering.pause.paused && (
        <SignupModal offering={offering} onClose={() => setShowSignupModal(false)} />
      )}
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

// ——————————————————————————————————————————————————————————————
// Pause and report (docs/features/class-payments-and-moderation.md). The
// rules are enforced in convex/offerings.ts; this is just the surface.
// ——————————————————————————————————————————————————————————————

const REPORT_REASON_LABELS: Record<string, string> = {
  harassment: "Harassment or bullying",
  spam: "Spam or a scam",
  unsafe: "It doesn't feel safe",
  misleading: "It's not what it says it is",
  other: "Something else",
};

// Real controls: 13.5px (the type scale's button size), never the .g-label
// class. The neutral one matches OwnerActions' buttons; citron is for the
// one real action in a block.
const CONTROL_BUTTON =
  "px-3.5 py-2 rounded-lg text-[13.5px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50";
const NEUTRAL_BUTTON_STYLE = {
  backgroundColor: "var(--garden-ink)",
  color: "var(--garden-body)",
  border: "1px solid var(--garden-hairline-raised)",
} as const;
const FIELD_STYLE = {
  backgroundColor: "var(--garden-ink)",
  borderColor: "var(--garden-hairline-raised)",
  color: "var(--garden-paper)",
} as const;

type PausableOffering = {
  _id: Id<"offerings">;
  title: string;
  community: { name: string; slug: string } | null;
  pause: { paused: boolean; reason: string | null; at: number | null; canRestore: boolean };
};

// Tells the teacher a class is paused, by which community (never a person's
// name), and why. Hosts and admins see the same box from their side; the
// controls are in ModerationPanel below.
function PausedBanner({ offering, isOwner }: { offering: PausableOffering; isOwner: boolean }) {
  const who = offering.community?.name ?? "The site team";
  const since = formatDateOnly(offering.pause.at ?? undefined);
  return (
    <div
      role="status"
      className="rounded-2xl border p-4 mb-6"
      style={{ borderColor: "var(--garden-hairline-raised)", backgroundColor: "var(--garden-ink-raised)" }}
    >
      <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--garden-paper)" }}>
        {isOwner ? `${who} paused this class` : "This class is paused"}
      </p>
      <p className="text-sm" style={{ color: "var(--garden-body)" }}>
        {isOwner
          ? "Other people can't see it or sign up right now. Everyone who already signed up stays signed up."
          : `${
              offering.community
                ? "Only its teacher, this community's hosts and the site team can see it."
                : "Only its teacher and the site team can see it."
            } No one can sign up.`}
      </p>
      {offering.pause.reason && (
        <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: "var(--garden-body)" }}>
          <span style={{ color: "var(--garden-paper)" }}>Reason: </span>
          {offering.pause.reason}
        </p>
      )}
      {since && (
        <p className="text-sm mt-2" style={{ color: "var(--garden-muted)" }}>
          Paused {since}
        </p>
      )}
      {isOwner && (
        <p className="text-sm mt-2" style={{ color: "var(--garden-body)" }}>
          Talk to {offering.community ? `${offering.community.name}'s hosts` : "the site team"} if you think this
          is a mistake. You can still edit and archive it.
        </p>
      )}
    </div>
  );
}

// Hosts of the class's community and platform admins only (the server
// decides — offering.canModerate). Pause with a required reason, restore,
// and the open reports with a Dismiss on each. A report is anonymous.
function ModerationPanel({ offering }: { offering: PausableOffering }) {
  const pause = useMutation(api.offerings.pauseOffering);
  const restore = useMutation(api.offerings.restoreOffering);
  const dismiss = useMutation(api.offerings.dismissReport);
  const reports = useQuery(api.offerings.listReportsForOffering, { offeringId: offering._id });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handlePause() {
    if (!reason.trim()) {
      setError("Say why you're pausing it — the teacher will see this.");
      return;
    }
    if (
      !window.confirm(
        `Pause "${offering.title}"? Other people won't be able to see it or sign up until you restore it.`,
      )
    ) {
      return;
    }
    void run(async () => {
      await pause({ offeringId: offering._id, reason });
      setReason("");
    });
  }

  return (
    <DetailCard label={offering.community ? "Community tools" : "Site team tools"}>
      {offering.pause.paused ? (
        <div className="flex flex-col gap-3 mb-5">
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>
            This class is paused. Restoring it shows it to everyone again and lets people sign up.
          </p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => restore({ offeringId: offering._id }))}
              className={CONTROL_BUTTON}
              style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
            >
              Restore this class
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-5">
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>
            Pausing hides this class from everyone but its teacher and the hosts, and stops new sign-ups.
            People who already signed up stay signed up. You can restore it any time.
          </p>
          <label htmlFor="pause-reason" className="text-sm font-medium" style={{ color: "var(--garden-paper)" }}>
            Why are you pausing it? The teacher will see this.
          </label>
          <textarea
            id="pause-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={FIELD_STYLE}
          />
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={handlePause}
              className={CONTROL_BUTTON}
              style={NEUTRAL_BUTTON_STYLE}
            >
              Pause this class
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-200 mb-4">
          {error}
        </p>
      )}

      <div className="pt-4" style={{ borderTop: "1px solid var(--garden-hairline)" }}>
        <p className="text-sm font-semibold mb-2" style={{ color: "var(--garden-paper)" }}>
          Reports
        </p>
        {reports === undefined ? (
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>
            Loading…
          </p>
        ) : reports.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--garden-body)" }}>
            No open reports.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => (
              <li
                key={r._id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
                style={{ borderColor: "var(--garden-hairline-raised)", backgroundColor: "var(--garden-ink)" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--garden-paper)" }}>
                    {REPORT_REASON_LABELS[r.reason] ?? r.reason}
                  </p>
                  {r.details && (
                    <p className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: "var(--garden-body)" }}>
                      {r.details}
                    </p>
                  )}
                  <p className="text-sm mt-1" style={{ color: "var(--garden-muted)" }}>
                    {formatDateOnly(r.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => dismiss({ reportId: r._id }))}
                  className={CONTROL_BUTTON}
                  style={NEUTRAL_BUTTON_STYLE}
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DetailCard>
  );
}

// Any signed-in member who isn't the teacher (offering.canReport). A reason
// and up to 500 characters; reporting again replaces the first report.
function ReportControl({
  offering,
}: {
  offering: PausableOffering & { viewerHasOpenReport: boolean };
}) {
  const report = useMutation(api.offerings.reportOffering);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const whoLooks = offering.community ? `${offering.community.name}'s hosts` : "The site team";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Pick what's wrong.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await report({
        offeringId: offering._id,
        reason: reason as "harassment" | "spam" | "unsafe" | "misleading" | "other",
        details: details.trim() || undefined,
      });
      setSent(true);
      setOpen(false);
      setReason("");
      setDetails("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent || (offering.viewerHasOpenReport && !open)) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm" style={{ color: "var(--garden-body)" }}>
          {sent ? `Thanks. ${whoLooks} will take a look.` : `You reported this class. ${whoLooks} will take a look.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setOpen(true);
          }}
          className="text-[13.5px] underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--garden-body)" }}
        >
          Change your report
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[13.5px] underline underline-offset-2 hover:opacity-80"
          style={{ color: "var(--garden-body)" }}
        >
          Report this class
        </button>
      </div>
    );
  }

  return (
    <DetailCard label="Report this class">
      <form onSubmit={handleSend} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm mb-2" style={{ color: "var(--garden-body)" }}>
            What's wrong? {whoLooks} will see your report, but not your name.
          </legend>
          {Object.entries(REPORT_REASON_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm" style={{ color: "var(--garden-body)" }}>
              <input
                type="radio"
                name="report-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                style={{ accentColor: "var(--garden-citron)" }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="report-details" className="block text-sm mb-1.5" style={{ color: "var(--garden-body)" }}>
            Anything else we should know? (optional, up to 500 characters)
          </label>
          <textarea
            id="report-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
            style={FIELD_STYLE}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className={CONTROL_BUTTON}
            style={{ backgroundColor: "var(--garden-citron)", color: "var(--garden-ink)" }}
          >
            {busy ? "Sending…" : "Send report"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              setError("");
            }}
            className={CONTROL_BUTTON}
            style={NEUTRAL_BUTTON_STYLE}
          >
            Cancel
          </button>
        </div>
      </form>
    </DetailCard>
  );
}
