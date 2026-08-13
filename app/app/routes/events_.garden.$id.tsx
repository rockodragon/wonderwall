// /garden/events/:id — the Garden event detail page, and the actual point of
// this build: a working guest RSVP form wired to
// convex/garden/eventRsvps.ts's rsvpToEvent mutation (name + email, no
// account required, dedupes by normalized email) and getEventRsvps query
// (public callers get {count, names} — first names only, never emails).
// Today the static /events/first-table page just tells people to email
// rickmoy@gmail.com; this closes that gap.
//
// Reuses events.ts's existing `get` query for event facts/organizer — it's
// already public (auth.getUserId resolves to null for guests rather than
// throwing), so no garden/eventsPublic.ts wrapper was needed. See
// events_.garden._index.tsx for the same call on `list`.
//
// Registered as a top-level route at "garden/events/:id" — /events/:eventId
// is already the legacy app-shell route in routes.ts. Promoting this to
// /events/:id is a follow-up decision, not made here.
//
// Field-level form pattern (Field wrapper, g-label/g-input, ConvexError ->
// reasonFor) mirrors admin.garden.tsx; the confirm/error handling mirrors
// c.$code.tsx's redeem flow.

import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DenialPanel,
  FactRow,
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
  SectionLabel,
  formatDateTime,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Event — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage>
      <GardenNav active="Events" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This event isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

type EventDetail = {
  _id: string;
  title: string;
  description: string;
  datetime: number;
  location?: string;
  tags: string[];
  priceCents?: number;
  organizer: { name: string } | null;
};

/** Same derivation as the browse page's costLine — kept local rather than
    shared since these two routes are each meant to stand alone. */
function costLine(event: EventDetail): string {
  if (typeof event.priceCents === "number") {
    return event.priceCents > 0
      ? `$${(event.priceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`
      : "Free";
  }
  const priceTag = event.tags?.find((t) => /^\$\d/.test(t.trim()));
  if (priceTag) return priceTag.trim();
  return "Free";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Attendance line from getEventRsvps. Public callers get {count, names};
    an organizer/admin viewing their own event gets {count, rsvps} — handled
    defensively here too, but only first names are ever rendered, never
    emails, regardless of shape. */
function AttendanceLine({
  data,
}: {
  data: { count: number; names: string[] } | { count: number; rsvps: Array<{ name: string }> } | undefined;
}) {
  if (data === undefined) return null;

  if (data.count === 0) {
    return <p style={{ fontSize: 14, color: "var(--g-muted)" }}>Be the first to say you're in.</p>;
  }

  const names = "names" in data ? data.names : data.rsvps.map((r) => r.name.trim().split(/\s+/)[0] || "A guest");

  return (
    <p style={{ fontSize: 14, color: "var(--g-muted)" }}>
      {data.count} coming: {names.join(", ")}
    </p>
  );
}

export default function GardenEventDetail() {
  const { id } = useParams();
  // Hooks stay above every early return (React rules-of-hooks).
  const eventId = id as Id<"events"> | undefined;
  const event = useQuery(api.events.get, eventId ? { eventId } : "skip") as EventDetail | null | undefined;
  const rsvps = useQuery(api.garden.eventRsvps.getEventRsvps, eventId ? { eventId } : "skip");
  const rsvpToEvent = useMutation(api.garden.eventRsvps.rsvpToEvent);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ alreadyRsvpd: boolean } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const formValid = trimmedName.length > 0 && EMAIL_RE.test(trimmedEmail);

  if (event === undefined) {
    return (
      <GardenPage>
        <GardenNav active="Events" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (event === null) {
    return (
      <GardenPage>
        <GardenNav active="Events" />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="That event isn't there anymore — check the link and try again." />
        </div>
      </GardenPage>
    );
  }

  const eventUrl = typeof window !== "undefined" ? window.location.href : "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValid || !eventId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await rsvpToEvent({ eventId, name: trimmedName, email: trimmedEmail });
      setResult({ alreadyRsvpd: res.alreadyRsvpd });
    } catch (err) {
      setError(reasonFor(err, "Something went wrong — try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBringSomeone() {
    try {
      if (!navigator.clipboard || !window.isSecureContext) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(eventUrl);
      setCopyState("copied");
    } catch {
      setCopyState("fallback");
    }
  }

  return (
    <GardenPage>
      <GardenNav active="Events" />

      <div style={{ marginTop: 28 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          {event.title}
        </h1>
        {event.organizer && (
          <p className="g-credit" style={{ marginTop: 10 }}>
            Hosted by <b>{event.organizer.name}</b>
          </p>
        )}
      </div>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
        <FactRow k="When" v={formatDateTime(event.datetime)} />
        <FactRow k="Where" v={event.location ?? "TBA"} />
        <FactRow k="Cost" v={costLine(event)} />
      </div>

      <p style={{ marginTop: 22, fontSize: 15, lineHeight: 1.6, maxWidth: "58ch" }}>
        {event.description}
      </p>

      <div style={{ marginTop: 32, maxWidth: 420 }}>
        <SectionLabel>RSVP</SectionLabel>

        {result ? (
          <div className="g-card" style={{ marginTop: 12, borderColor: "var(--g-citron)" }}>
            <div className="g-label" style={{ color: "var(--g-citron)" }}>
              {result.alreadyRsvpd ? "Already saved" : "Chair saved"}
            </div>
            <p className="g-h" style={{ marginTop: 10, fontSize: 22 }}>
              {result.alreadyRsvpd ? "You're already on the list — we have you." : "You're on the list."}
            </p>
            {!result.alreadyRsvpd && (
              <p style={{ marginTop: 8, fontSize: 14.5 }}>We'll email you the details.</p>
            )}
            <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="g-btn g-btn-citron" onClick={handleBringSomeone}>
                Bring someone
              </button>
              {copyState === "copied" && (
                <span className="g-hint">Link copied — send it to someone.</span>
              )}
            </div>
            {copyState === "fallback" && (
              <div style={{ marginTop: 12 }}>
                <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
                  Copy this link
                </label>
                <input
                  className="g-input"
                  readOnly
                  value={eventUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
            <Field label="Name">
              <input
                className="g-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sam Alvarez"
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <input
                className="g-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sam@example.com"
                autoComplete="email"
              />
            </Field>
            <button
              type="submit"
              className="g-btn g-btn-citron"
              disabled={!formValid || submitting}
              style={{
                marginTop: 18,
                opacity: !formValid || submitting ? 0.5 : 1,
                cursor: !formValid || submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Saving…" : "Save me a chair"}
            </button>
            <p className="g-hint" style={{ marginTop: 10 }}>No account needed.</p>
            {error && (
              <div style={{ marginTop: 14 }}>
                <DenialPanel reason={error} />
              </div>
            )}
          </form>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <AttendanceLine data={rsvps} />
      </div>

      <div style={{ marginTop: 32 }}>
        <Link to="/garden/events" className="g-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--g-muted)" }}>
          ← All events
        </Link>
      </div>
    </GardenPage>
  );
}
