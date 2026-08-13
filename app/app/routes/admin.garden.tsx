// /admin/garden — the operator console for October concierge ops (spec
// docs/phase-1b/spec.md): operators (profile.isAdmin) hand-create tables,
// sessions, coverage codes, and record AP fund allocations while the
// self-serve versions of these flows don't exist yet. Function over
// beauty, but this still renders inside the credit-sheet system
// (garden.css tokens), scoped to this page's container div — see
// tables._index.tsx / ui.tsx for the same tokens used on the public side.
//
// Admin detection mirrors the app's one signal for it, profile.isAdmin
// (helpers.isAdminProfile server-side, same field admin.crawler.tsx and
// _app.tsx's sidebar link check client-side) — admin.tsx's own gate is a
// server-side requireAdmin() throw with no friendly client message, so we
// reuse the client-checkable form of the same flag instead of reproducing
// that crash.

import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  GardenLoading,
  GardenPage,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPeriod,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Garden Operator Console" },
    { name: "robots", content: "noindex" },
  ];
}

// ————— Shared bits —————

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <label className="g-label" style={{ display: "block", marginBottom: 6 }}>
        {label}
        {required ? <span style={{ color: "var(--g-citron)" }}> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="g-hint" style={{ marginTop: 5 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Status = { kind: "ok" | "err"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p
      style={{
        marginTop: 12,
        fontSize: 14.5,
        color: status.kind === "ok" ? "var(--g-citron)" : "var(--g-body)",
      }}
    >
      {status.kind === "ok" ? "✓ " : ""}
      {status.text}
    </p>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2 className="g-h" style={{ fontSize: "clamp(20px,3.5vw,26px)" }}>
        {title}
      </h2>
      {hint ? (
        <p className="g-hint" style={{ marginTop: 4 }}>
          {hint}
        </p>
      ) : null}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1.2fr)",
          gap: 24,
          alignItems: "start",
        }}
        className="g-op-grid"
      >
        {children}
      </div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="g-hint" style={{ padding: "10px 2px" }}>
      {children}
    </p>
  );
}

// ————— Tables section —————

const TABLE_MODES = ["open", "member", "cohort"] as const;
const TABLE_FORMATS = ["Class", "Mentorship", "Critique", "Open mic", "Workshop", "Show"];

function TablesSection({
  hostOrgs,
  tables,
}: {
  hostOrgs: { _id: string; name: string; slug: string }[];
  tables: {
    _id: string;
    name: string;
    slug: string;
    mode: string;
    status: string;
    hostOrgName: string;
    sessionCount: number;
    rosterCount: number;
  }[];
}) {
  const createTable = useMutation(api.garden.operator.createTable);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [hostOrgSlug, setHostOrgSlug] = useState(hostOrgs[0]?.slug ?? "");
  const [mode, setMode] = useState<(typeof TABLE_MODES)[number]>("open");
  const [format, setFormat] = useState("");
  const [program, setProgram] = useState("");
  const [cadence, setCadence] = useState("");
  const [blurb, setBlurb] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const priceCents = priceDollars.trim()
        ? Math.round(parseFloat(priceDollars) * 100)
        : undefined;
      await createTable({
        name,
        slug,
        hostOrgSlug,
        mode,
        format: format || undefined,
        program: program.trim() || undefined,
        cadence: cadence.trim() || undefined,
        blurb: blurb.trim() || undefined,
        priceCents,
        meetingUrl: meetingUrl.trim() || undefined,
      });
      setStatus({ kind: "ok", text: `Table "${name}" created.` });
      setName("");
      setSlug("");
      setFormat("");
      setProgram("");
      setCadence("");
      setBlurb("");
      setPriceDollars("");
      setMeetingUrl("");
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't create the table — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Tables" hint="Ongoing gatherings with a roster.">
      <form onSubmit={onSubmit}>
        <Field label="Name" required>
          <input className="g-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tuesday Critique" />
        </Field>
        <Field label="Slug" required hint="Lowercase, hyphens only — used in the table's URL.">
          <input className="g-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="tuesday-critique" />
        </Field>
        <Field label="Host org" required>
          <select className="g-input" value={hostOrgSlug} onChange={(e) => setHostOrgSlug(e.target.value)} style={{ appearance: "none" }}>
            {hostOrgs.length === 0 ? <option value="">No host orgs yet</option> : null}
            {hostOrgs.map((o) => (
              <option key={o._id} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode" required>
          <select
            className="g-input"
            value={mode}
            onChange={(e) => setMode(e.target.value as (typeof TABLE_MODES)[number])}
            style={{ appearance: "none" }}
          >
            {TABLE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format (optional)">
          <select className="g-input" value={format} onChange={(e) => setFormat(e.target.value)} style={{ appearance: "none" }}>
            <option value="">—</option>
            {TABLE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Program (optional)">
          <input className="g-input" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Pathfinding · Abiding Practice" />
        </Field>
        <Field label="Cadence (optional)">
          <input className="g-input" value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="Weekly, Tuesdays" />
        </Field>
        <Field label="Blurb (optional)">
          <textarea className="g-input" value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={2} style={{ resize: "vertical" }} />
        </Field>
        <Field label="Price, cohorts only (optional)" hint="Dollars — leave blank for a free table.">
          <input className="g-input" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} inputMode="decimal" placeholder="49" style={{ maxWidth: 160 }} />
        </Field>
        <Field label="Default meeting URL (optional)">
          <input className="g-input" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://..." />
        </Field>
        <button className="g-btn g-btn-citron" type="submit" disabled={busy || !name.trim() || !slug.trim() || !hostOrgSlug} style={{ marginTop: 18 }}>
          {busy ? "Creating…" : "Create table"}
        </button>
        <StatusLine status={status} />
      </form>

      <div>
        <div className="g-label" style={{ marginBottom: 10 }}>
          Current tables ({tables.length})
        </div>
        {tables.length === 0 ? (
          <EmptyRow>No tables yet.</EmptyRow>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tables.map((t) => (
              <div key={t._id} className="g-cell" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{t.name}</span>
                  <span className="g-badge g-badge-line">{t.mode}</span>
                </div>
                <div className="g-hint" style={{ marginTop: 6 }}>
                  {t.hostOrgName} · {t.sessionCount} session{t.sessionCount === 1 ? "" : "s"} · {t.rosterCount} on roster · {t.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ————— Sessions section —————

function SessionsSection({
  tables,
  upcomingSessions,
}: {
  tables: { _id: string; name: string; slug: string }[];
  upcomingSessions: {
    _id: string;
    tableName: string;
    tableSlug: string;
    title?: string;
    startsAt: number;
    durationMins?: number;
    meetingUrl?: string;
  }[];
}) {
  const addSession = useMutation(api.garden.operator.addSession);
  const [tableSlug, setTableSlug] = useState(tables[0]?.slug ?? "");
  const [startsAtISO, setStartsAtISO] = useState("");
  const [durationMins, setDurationMins] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      await addSession({
        tableSlug,
        startsAtISO,
        durationMins: durationMins.trim() ? Number(durationMins) : undefined,
        meetingUrl: meetingUrl.trim() || undefined,
        title: title.trim() || undefined,
      });
      setStatus({ kind: "ok", text: "Session added." });
      setStartsAtISO("");
      setDurationMins("");
      setMeetingUrl("");
      setTitle("");
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't add the session — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Sessions" hint="Dated meetings on a table's schedule.">
      <form onSubmit={onSubmit}>
        <Field label="Table" required>
          <select className="g-input" value={tableSlug} onChange={(e) => setTableSlug(e.target.value)} style={{ appearance: "none" }}>
            {tables.length === 0 ? <option value="">No tables yet</option> : null}
            {tables.map((t) => (
              <option key={t._id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starts at" required>
          <input className="g-input" type="datetime-local" value={startsAtISO} onChange={(e) => setStartsAtISO(e.target.value)} />
        </Field>
        <Field label="Duration, minutes (optional)">
          <input className="g-input" value={durationMins} onChange={(e) => setDurationMins(e.target.value)} inputMode="numeric" placeholder="60" style={{ maxWidth: 160 }} />
        </Field>
        <Field label="Meeting URL (optional)" hint="Overrides the table's default link for this session.">
          <input className="g-input" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://..." />
        </Field>
        <Field label="Title (optional)">
          <input className="g-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 3 — critique" />
        </Field>
        <button className="g-btn g-btn-citron" type="submit" disabled={busy || !tableSlug || !startsAtISO} style={{ marginTop: 18 }}>
          {busy ? "Adding…" : "Add session"}
        </button>
        <StatusLine status={status} />
      </form>

      <div>
        <div className="g-label" style={{ marginBottom: 10 }}>
          Upcoming sessions ({upcomingSessions.length})
        </div>
        {upcomingSessions.length === 0 ? (
          <EmptyRow>Nothing scheduled.</EmptyRow>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {upcomingSessions.map((s) => (
              <div key={s._id} className="g-cell" style={{ padding: "12px 14px" }}>
                <div style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>
                  {s.tableName}
                  {s.title ? ` — ${s.title}` : ""}
                </div>
                <div className="g-hint" style={{ marginTop: 6 }}>
                  {formatDateTime(s.startsAt)}
                  {formatDuration(s.durationMins) ? ` · ${formatDuration(s.durationMins)}` : ""}
                  {s.meetingUrl ? " · has meeting link" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ————— Coverage codes section —————

function CoverageSection({
  hostOrgs,
  coverageCodes,
}: {
  hostOrgs: { _id: string; name: string; slug: string }[];
  coverageCodes: {
    _id: string;
    code: string;
    seats: number;
    redeemed: number;
    status: string;
    hostOrgName: string;
  }[];
}) {
  const createCoverageCode = useMutation(api.garden.operator.createCoverageCode);
  const [code, setCode] = useState("");
  const [seats, setSeats] = useState("");
  const [hostOrgSlug, setHostOrgSlug] = useState(hostOrgs[0]?.slug ?? "");
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      await createCoverageCode({
        code,
        seats: Number(seats),
        hostOrgSlug,
        stripeSubscriptionId: stripeSubscriptionId.trim() || undefined,
      });
      setStatus({ kind: "ok", text: `Code "${code.trim().toUpperCase()}" created.` });
      setCode("");
      setSeats("");
      setStripeSubscriptionId("");
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't create the code — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Coverage codes" hint="One sponsoring subscription (quantity = seats) per code.">
      <form onSubmit={onSubmit}>
        <Field label="Code" required hint="Stored uppercase, e.g. GRACE-FALL.">
          <input className="g-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GRACE-FALL" />
        </Field>
        <Field label="Seats" required>
          <input className="g-input" value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" placeholder="10" style={{ maxWidth: 160 }} />
        </Field>
        <Field label="Host org" required>
          <select className="g-input" value={hostOrgSlug} onChange={(e) => setHostOrgSlug(e.target.value)} style={{ appearance: "none" }}>
            {hostOrgs.length === 0 ? <option value="">No host orgs yet</option> : null}
            {hostOrgs.map((o) => (
              <option key={o._id} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stripe subscription ID (optional)" hint='Defaults to "manual" until Stripe wiring lands.'>
          <input className="g-input" value={stripeSubscriptionId} onChange={(e) => setStripeSubscriptionId(e.target.value)} placeholder="sub_..." />
        </Field>
        <button className="g-btn g-btn-citron" type="submit" disabled={busy || !code.trim() || !seats.trim() || !hostOrgSlug} style={{ marginTop: 18 }}>
          {busy ? "Creating…" : "Create code"}
        </button>
        <StatusLine status={status} />
      </form>

      <div>
        <div className="g-label" style={{ marginBottom: 10 }}>
          Current codes ({coverageCodes.length})
        </div>
        {coverageCodes.length === 0 ? (
          <EmptyRow>No coverage codes yet.</EmptyRow>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {coverageCodes.map((c) => (
              <div key={c._id} className="g-cell" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span className="g-mono" style={{ color: "var(--g-paper)", fontSize: 15 }}>{c.code}</span>
                  <span className="g-badge g-badge-line">{c.status}</span>
                </div>
                <div className="g-hint" style={{ marginTop: 6 }}>
                  {c.hostOrgName} · {c.redeemed} of {c.seats} seats redeemed
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ————— Allocations section —————

function AllocationsSection({
  hostOrgs,
  projects,
  recentAllocations,
}: {
  hostOrgs: { _id: string; name: string; slug: string }[];
  projects: { _id: string; title: string; kind: string }[];
  recentAllocations: {
    _id: string;
    hostOrgName: string;
    recipientName: string;
    amountCents: number;
    period: string;
    note?: string;
    projectTitle?: string;
  }[];
}) {
  const recordAllocation = useMutation(api.garden.allocations.recordAllocation);
  const [hostOrgSlug, setHostOrgSlug] = useState(hostOrgs[0]?.slug ?? "");
  const [projectId, setProjectId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [period, setPeriod] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const amountCents = Math.round(parseFloat(amountDollars || "0") * 100);
      await recordAllocation({
        hostOrgSlug,
        projectId: projectId ? (projectId as Id<"projects">) : undefined,
        recipientName: recipientName.trim() || undefined,
        amountCents,
        period,
        note: note.trim() || undefined,
      });
      setStatus({ kind: "ok", text: "Allocation recorded." });
      setProjectId("");
      setRecipientName("");
      setAmountDollars("");
      setPeriod("");
      setNote("");
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't record the allocation — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Allocations" hint="The AP fund's public ledger — entered by hand, spec's church-treasurer trust engine.">
      <form onSubmit={onSubmit}>
        <Field label="Fund (host org)" required>
          <select className="g-input" value={hostOrgSlug} onChange={(e) => setHostOrgSlug(e.target.value)} style={{ appearance: "none" }}>
            {hostOrgs.length === 0 ? <option value="">No host orgs yet</option> : null}
            {hostOrgs.map((o) => (
              <option key={o._id} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project (optional)" hint="Pulls the recipient name from the project's owner if you leave that blank.">
          <select className="g-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ appearance: "none" }}>
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recipient name" hint="Required unless a project is selected above.">
          <input className="g-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Shua" />
        </Field>
        <Field label="Amount" required hint="Dollars.">
          <input className="g-input" value={amountDollars} onChange={(e) => setAmountDollars(e.target.value)} inputMode="decimal" placeholder="500" style={{ maxWidth: 160 }} />
        </Field>
        <Field label="Period" required hint='e.g. "2026-08" or "2026-08 · monthly".'>
          <input className="g-input" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-08" style={{ maxWidth: 220 }} />
        </Field>
        <Field label="Note (optional)">
          <textarea className="g-input" value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ resize: "vertical" }} />
        </Field>
        <button className="g-btn g-btn-citron" type="submit" disabled={busy || !hostOrgSlug || !amountDollars.trim() || !period.trim()} style={{ marginTop: 18 }}>
          {busy ? "Recording…" : "Record allocation"}
        </button>
        <StatusLine status={status} />
      </form>

      <div>
        <div className="g-label" style={{ marginBottom: 10 }}>
          Recent allocations ({recentAllocations.length})
        </div>
        {recentAllocations.length === 0 ? (
          <EmptyRow>Nothing recorded yet.</EmptyRow>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentAllocations.map((a) => (
              <div key={a._id} className="g-cell" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "var(--g-paper)", fontWeight: 600, fontSize: 14.5 }}>{a.recipientName}</span>
                  <span className="g-cell-v" style={{ fontSize: 16 }}>{formatMoney(a.amountCents)}</span>
                </div>
                <div className="g-hint" style={{ marginTop: 6 }}>
                  {a.hostOrgName} · {formatPeriod(a.period)}
                  {a.projectTitle ? ` · ${a.projectTitle}` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ————— Page —————

export default function AdminGardenPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const data = useQuery(api.garden.operator.listOperatorData);
  const projects = useQuery(api.garden.operator.listProjectsForAllocation);

  if (profile === undefined) {
    return (
      <GardenPage wide>
        <GardenLoading label="Checking access…" />
      </GardenPage>
    );
  }

  if (!profile?.isAdmin) {
    return (
      <GardenPage wide>
        <h1 className="g-h" style={{ fontSize: "clamp(24px,4.5vw,32px)" }}>
          Operator access only.
        </h1>
      </GardenPage>
    );
  }

  return (
    <GardenPage wide>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="g-label">The Garden</div>
          <h1 className="g-h" style={{ marginTop: 6, fontSize: "clamp(26px,5vw,36px)" }}>
            Operator console
          </h1>
        </div>
        <Link to="/admin" className="g-mono" style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--g-muted)" }}>
          ← Back to admin
        </Link>
      </div>

      {data === undefined || projects === undefined ? (
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      ) : (
        <>
          <TablesSection hostOrgs={data.hostOrgs} tables={data.tables} />
          <SessionsSection
            tables={data.tables.map((t) => ({ _id: t._id, name: t.name, slug: t.slug }))}
            upcomingSessions={data.upcomingSessions}
          />
          <CoverageSection hostOrgs={data.hostOrgs} coverageCodes={data.coverageCodes} />
          <AllocationsSection hostOrgs={data.hostOrgs} projects={projects} recentAllocations={data.recentAllocations} />
        </>
      )}

      <style>{`
        @media (max-width: 720px) {
          .g-op-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </GardenPage>
  );
}
