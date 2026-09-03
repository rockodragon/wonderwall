// Shared pieces for The Garden's public production routes (fund/story/tables).
// Same credit-sheet system as /demo — see garden.css and demo.app.tsx for the
// established look. Kept deliberately small: these routes each own their
// layout, this file only holds what's genuinely shared.

import type { ReactNode } from "react";
import { Link } from "react-router";

// ————— Page shell —————

/** garden-root + token/font links + the standard max-width wrap. Every
    production Garden route renders inside this, same as /demo/app. */
export function GardenPage({
  children,
  wide,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="garden-root">
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/about/fonts/fonts.css" />
      <div className={wide ? "g-wrap g-wrap-wide" : "g-wrap"}>{children}</div>
    </div>
  );
}

/** The small uppercase mono label used throughout the credit-sheet system —
    section headers, "Roster", "Goal", etc. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="g-label">{children}</div>;
}

/** A back-to-home wordmark link — the quiet top-left anchor every standalone
    production page gets, since these routes live outside the app shell/nav. */
/** Platform wordmark. "The Garden" is now one COMMUNITY among several
    (Abiding Practice, Table Art Society, The Rabbit Room); the platform these
    pages belong to is creatives.exchange. Community names appear on the
    community's own surfaces, not here. */
export function GardenWordmark() {
  return (
    <Link to="/garden" className="g-wordmark">
      creatives.exchange
    </Link>
  );
}

/** THE shared nav for every Garden surface. Without this the pages are
    orphans reachable only by typed URL — which is exactly what happened.
    Keep the item list identical everywhere; the active item gets the
    citron underline (never a fill — citron is for actions). */
const NAV_ITEMS = [
  { to: "/garden", label: "Garden" },
  { to: "/projects", label: "Projects" },
  { to: "/garden/events", label: "Events" }, // NOT /events — that's the legacy auth-gated route
  { to: "/tables", label: "Tables" },
  { to: "/fund/abiding-practice", label: "Fund" },
] as const;

export function GardenNav({ active }: { active?: string }) {
  return (
    <header style={{ paddingBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <GardenWordmark />
        <Link
          to="/login"
          className="g-nav"
          style={{ color: "var(--g-muted)" }}
        >
          Sign in
        </Link>
      </div>
      <hr className="g-rule-heavy" style={{ marginTop: 12 }} />
      <nav
        aria-label="Garden"
        style={{ display: "flex", gap: 22, marginTop: 14, flexWrap: "wrap" }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.label;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="g-nav"
              aria-current={isActive ? "page" : undefined}
              style={
                isActive ? undefined : { borderBottom: "2px solid transparent" }
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

// ————— Loading —————

/** Minimal skeleton for the useQuery === undefined case — a single g-label
    line, no spinner libraries (founder instruction: empty states are the
    point, but loading should stay out of the way). */
export function GardenLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <span className="g-label">{label}</span>
    </div>
  );
}

// ————— Error / not-live states —————

/** The one designed state for "unknown slug" and "backend not deployed yet"
    (this route shipped before the Convex functions did). Same shape for
    both: a plain sentence, never a stack trace, with a way back home. */
export function GardenErrorState({
  title = "This page isn't live yet.",
  message,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div style={{ paddingTop: 8, maxWidth: "50ch" }}>
      <h1 className="g-h" style={{ fontSize: "clamp(24px,4.5vw,32px)" }}>
        {title}
      </h1>
      {message && (
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
          {message}
        </p>
      )}
      <Link
        to="/"
        className="g-mono"
        style={{
          display: "inline-block",
          marginTop: 20,
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--g-muted)",
        }}
      >
        ← Back home
      </Link>
    </div>
  );
}

// ————— Shared data-display pieces (from demo.app.tsx's established pattern) —————

export function FactRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
      <span className="g-label" style={{ minWidth: 66, flexShrink: 0 }}>
        {k}
      </span>
      <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>{v}</span>
    </div>
  );
}

/** A CanResult-shaped denial, rendered as an invitation — the house pattern
    from demo.app.tsx's GateHint: what it is, then the path in. The
    upgradePath button is decorative copy (no client-side purchase flow
    lives here), matching the demo's treatment exactly. */
export function DenialPanel({
  reason,
  upgradePath,
}: {
  reason?: string;
  upgradePath?: string;
}) {
  return (
    <div style={{ marginTop: 4, maxWidth: "50ch" }}>
      <p style={{ fontSize: 14, lineHeight: 1.55 }}>
        {reason ?? "This isn't available right now."}
      </p>
      {upgradePath ? (
        <button className="g-btn g-btn-citron" style={{ marginTop: 12 }}>
          {upgradePath}
        </button>
      ) : null}
    </div>
  );
}

// ————— Formatters —————

/** cents -> "$500" (whole dollars) or "$5.50" when there's a fractional
    part — the ledger and price surfaces never show raw cents. */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  const isWhole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08" or "2026-08 · monthly" -> "Aug 2026" — the ledger's period
    column reads as a date, not a database key. Falls back to the raw
    string when it doesn't parse. */
export function formatPeriod(period: string): string {
  const [ym] = period.split(" · ");
  const match = ym?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return period;
  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS[monthIndex];
  return month ? `${month} ${year}` : period;
}

/** A timestamp -> "Aug 13, 2026" — used for update/session dates. */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A timestamp -> "Aug 13, 2026 · 7:00 PM" — sessions need the time too. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

/** durationMins -> "60 min" / "1.5 hr" — kept short for a fact row. */
export function formatDuration(mins?: number): string | undefined {
  if (!mins) return undefined;
  if (mins < 60) return `${mins} min`;
  const hrs = mins / 60;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hr`;
}
