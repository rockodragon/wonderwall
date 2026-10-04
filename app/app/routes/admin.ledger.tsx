// /admin/ledger — the operator's whole-platform money view (task spec):
// fees collected, grant pool balances, host earnings/payouts, community and
// membership counts, and a signed recent-events feed. Read-only except for
// recordHostPayout. Same operator gate as admin.garden.tsx (profile.isAdmin),
// same credit-sheet system (garden.css tokens) — g-cell/g-cell-hot stat
// tiles, g-card panels, and flex-row hairline tables like fund.$slug.tsx's
// ledger.

import { useState } from "react";
import type { FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  GardenLoading,
  GardenPage,
  SectionLabel,
  formatDateTime,
  formatMoney,
  formatPeriod,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Platform Ledger — TheCreative.exchange" },
    { name: "robots", content: "noindex" },
  ];
}

function reasonFor(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { reason?: string } | undefined;
    if (data?.reason) return data.reason;
  }
  return fallback;
}

/** cents can be negative (a recent-events row) — formatMoney alone renders
 * "$-50"; this keeps the sign out front and the digits readable. */
function formatSignedMoney(cents: number): string {
  return cents < 0 ? `-${formatMoney(-cents)}` : formatMoney(cents);
}

type Status = { kind: "ok" | "err"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p style={{ marginTop: 10, fontSize: 14, color: status.kind === "ok" ? "var(--g-citron)" : "var(--g-body)" }}>
      {status.kind === "ok" ? "✓ " : ""}
      {status.text}
    </p>
  );
}

function StatCell({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={hot ? "g-cell g-cell-hot" : "g-cell"}>
      <div className="g-cell-v">{value}</div>
      <div className="g-label" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}

function LedgerRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="g-hint" style={{ padding: "10px 2px" }}>{children}</p>;
}

// ————— Report shape (from getPlatformReport's return, task spec) —————

type PlatformReport = {
  generatedAt: number;
  tablePaymentExceptions?: {paymentId: string; title: string; grossCents: number; stripeRef: string; paymentIntentId?: string; createdAt: number}[];
  externalTicketExceptions?: {exceptionId: string; title: string; grossCents: number; ticketCount: number; reason: string; stripeRef: string; createdAt: number}[];
  periods: string[];
  fees: {
    totalPlatformCents: number;
    bySource: { source: string; label: string; grossCents: number; platformCents: number; count: number; splitRecorded: boolean }[];
    byPeriod: { period: string; grossCents: number; platformCents: number }[];
  };
  pools: {
    hostOrgId: string;
    name: string;
    slug: string;
    kind: string;
    inflowPoolCents: number;
    inflowGrossCents: number;
    inflowPlatformCents: number;
    outflowCents: number;
    balanceCents: number;
    byType: { type: string; poolCents: number; count: number }[];
  }[];
  hostEarnings: {
    hostOrgId: string;
    name: string;
    slug: string;
    salesCount: number;
    grossCents: number;
    platformCents: number;
    hostCents: number;
    paidOutCents: number;
    owedCents: number;
    activeProducts: number;
  }[];
  creativeEarnings: {
    payeeUserId: string; // or "unassigned"
    name: string;
    profileId: string | null;
    projects: string[];
    paymentsCount: number;
    grossCents: number;
    platformCents: number;
    workCents: number;
    paidOutCents: number;
    owedCents: number;
  }[];
  communities: {
    hostOrgId: string;
    name: string;
    slug: string;
    status: string;
    members: {
      total: number;
      pending: number;
      hosts: number;
      byLevel: { free: number; seat: number; five: number; host: number };
      covered: number;
      home: number;
    };
    products: number;
    purchases: number;
  }[];
  memberships: {
    active: number;
    pastDue: number;
    canceled: number;
    byLevel: { seat: number; five: number; host: number };
    covered: number;
    coverageCodes: { code: string; sponsorName?: string; seats: number; redeemed: number; status: string }[];
  };
  recent: {
    at: number;
    source: string;
    description: string;
    hostOrgName?: string;
    grossCents: number;
    platformCents: number;
    ref?: string;
  }[];
};

// ————— 1. Fees collected —————

function FeesSection({ fees, periods }: { fees: PlatformReport["fees"]; periods: string[] }) {
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Fees collected</SectionLabel>
      <div style={{ marginTop: 12, maxWidth: 260 }}>
        <StatCell label="Total platform take" value={formatMoney(fees.totalPlatformCents)} hot />
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="g-label" style={{ marginBottom: 10 }}>By source</div>
        {fees.bySource.length === 0 ? (
          <EmptyRow>Nothing collected yet.</EmptyRow>
        ) : (
          <div>
            {fees.bySource.map((s) => (
              <LedgerRow key={s.source}>
                <span style={{ fontSize: 14.5, color: "var(--g-paper)", fontWeight: 600, minWidth: 160 }}>
                  {s.label}
                </span>
                <span className="g-hint">{s.count} event{s.count === 1 ? "" : "s"}</span>
                <span className="g-hint">gross {formatMoney(s.grossCents)}</span>
                <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>
                  platform {formatMoney(s.platformCents)}
                </span>
                {!s.splitRecorded && (
                  <span className="g-badge g-badge-line">split not recorded</span>
                )}
              </LedgerRow>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="g-label" style={{ marginBottom: 10 }}>By period</div>
        {fees.byPeriod.length === 0 ? (
          <EmptyRow>Nothing recorded yet.</EmptyRow>
        ) : (
          <div>
            {fees.byPeriod.map((p) => (
              <LedgerRow key={p.period}>
                <span className="g-mono" style={{ fontSize: 12.5, color: "var(--g-dim)", minWidth: 68 }}>
                  {formatPeriod(p.period)}
                </span>
                <span className="g-hint">gross {formatMoney(p.grossCents)}</span>
                <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>
                  platform {formatMoney(p.platformCents)}
                </span>
              </LedgerRow>
            ))}
          </div>
        )}
      </div>
      {periods.length === 0 && null}
    </section>
  );
}

// ————— 2. Grant pools —————

function PoolCard({ pool }: { pool: PlatformReport["pools"][number] }) {
  return (
    <div className="g-card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <Link to={`/fund/${pool.slug}`} className="g-h" style={{ fontSize: 17, textDecoration: "none" }}>
          {pool.name}
        </Link>
        <span className="g-badge g-badge-line">{pool.kind}</span>
      </div>
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
          gap: 10,
        }}
      >
        <StatCell label="Inflow (pool)" value={formatMoney(pool.inflowPoolCents)} />
        <StatCell label="Inflow (gross)" value={formatMoney(pool.inflowGrossCents)} />
        <StatCell label="Platform take" value={formatMoney(pool.inflowPlatformCents)} />
        <StatCell label="Outflow" value={formatMoney(pool.outflowCents)} />
        <StatCell label="Balance" value={formatMoney(pool.balanceCents)} hot />
      </div>
      {pool.byType.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {pool.byType.map((t) => (
            <LedgerRow key={t.type}>
              <span style={{ fontSize: 14, color: "var(--g-paper)" }}>{t.type}</span>
              <span className="g-hint">{t.count} event{t.count === 1 ? "" : "s"}</span>
              <span className="g-hint">{formatMoney(t.poolCents)}</span>
            </LedgerRow>
          ))}
        </div>
      )}
    </div>
  );
}

function PoolsSection({ pools }: { pools: PlatformReport["pools"] }) {
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Grant pools</SectionLabel>
      {pools.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyRow>No pools yet.</EmptyRow>
        </div>
      ) : (
        pools.map((p) => <PoolCard key={p.hostOrgId} pool={p} />)
      )}
    </section>
  );
}

// ————— 3. Host earnings —————

/** The manual-transfer form, shared by host and creative rows — the caller
 * passes the mutation to record with, so the two ledgers can't drift into
 * two slightly different forms. */
function RecordPayoutForm({
  record,
  onDone,
}: {
  record: (fields: { amountCents: number; reference?: string; note?: string }) => Promise<unknown>;
  onDone: () => void;
}) {
  const [amountDollars, setAmountDollars] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const amountCents = Math.round(parseFloat(amountDollars || "0") * 100);
      await record({
        amountCents,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      setStatus({ kind: "ok", text: "Payout recorded." });
      setAmountDollars("");
      setReference("");
      setNote("");
      onDone();
    } catch (err) {
      setStatus({ kind: "err", text: reasonFor(err, "Couldn't record the payout — try again.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
      <input
        className="g-input"
        value={amountDollars}
        onChange={(e) => setAmountDollars(e.target.value)}
        inputMode="decimal"
        placeholder="Dollars"
        style={{ maxWidth: 120 }}
      />
      <input
        className="g-input"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Reference (optional)"
        style={{ maxWidth: 180 }}
      />
      <input
        className="g-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        style={{ maxWidth: 220 }}
      />
      <button className="g-btn g-btn-citron" type="submit" disabled={busy || !amountDollars.trim()}>
        {busy ? "Recording…" : "Record payout"}
      </button>
      <div style={{ flexBasis: "100%" }}>
        <StatusLine status={status} />
      </div>
    </form>
  );
}

function HostEarningsRow({ row }: { row: PlatformReport["hostEarnings"][number] }) {
  const recordHostPayout = useMutation(api.garden.products.recordHostPayout);
  const [open, setOpen] = useState(false);
  return (
    <div className="g-cell" style={{ padding: "12px 14px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <Link to={`/communities/${row.slug}`} style={{ fontSize: 14.5, fontWeight: 600, color: "var(--g-paper)", textDecoration: "none" }}>
          {row.name}
        </Link>
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--g-citron)" }}>{formatMoney(row.owedCents)} owed</span>
      </div>
      <div className="g-hint" style={{ marginTop: 6 }}>
        {row.salesCount} sale{row.salesCount === 1 ? "" : "s"} · gross {formatMoney(row.grossCents)} · platform{" "}
        {formatMoney(row.platformCents)} · host {formatMoney(row.hostCents)} · paid out {formatMoney(row.paidOutCents)} ·{" "}
        {row.activeProducts} active product{row.activeProducts === 1 ? "" : "s"}
      </div>
      <button className="g-btn g-btn-ghost" style={{ marginTop: 10 }} onClick={() => setOpen((o) => !o)}>
        {open ? "Cancel" : "Record payout"}
      </button>
      {open && (
        <RecordPayoutForm
          record={(f) => recordHostPayout({ hostOrgId: row.hostOrgId as Id<"hostOrgs">, ...f })}
          onDone={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function HostEarningsSection({ hostEarnings }: { hostEarnings: PlatformReport["hostEarnings"] }) {
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Host earnings</SectionLabel>
      {hostEarnings.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyRow>No sales yet.</EmptyRow>
        </div>
      ) : (
        <div>
          {hostEarnings.map((row) => (
            <HostEarningsRow key={row.hostOrgId} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function CreativeEarningsRow({ row }: { row: PlatformReport["creativeEarnings"][number] }) {
  const recordCreativePayout = useMutation(api.garden.payouts.recordCreativePayout);
  const [open, setOpen] = useState(false);
  const unassigned = row.payeeUserId === "unassigned";
  return (
    <div className="g-cell" style={{ padding: "12px 14px", marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        {row.profileId ? (
          <Link to={`/profile/${row.profileId}`} style={{ fontSize: 14.5, fontWeight: 600, color: "var(--g-paper)", textDecoration: "none" }}>
            {row.name}
          </Link>
        ) : (
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--g-paper)" }}>{row.name}</span>
        )}
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--g-citron)" }}>{formatMoney(row.owedCents)} owed</span>
      </div>
      {row.projects.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 13.5, color: "var(--g-body)" }}>
          {row.projects.join(" · ")}
        </div>
      )}
      <div className="g-hint" style={{ marginTop: 6 }}>
        {row.paymentsCount} payment{row.paymentsCount === 1 ? "" : "s"} · gross {formatMoney(row.grossCents)} · platform{" "}
        {formatMoney(row.platformCents)} · work {formatMoney(row.workCents)} · paid out {formatMoney(row.paidOutCents)}
      </div>
      {unassigned ? (
        // No one to pay: the project or class was gone when the money arrived.
        // Resolve by hand (refund the payer, or reassign) — there's no form for it.
        <div className="g-hint" style={{ marginTop: 10 }}>
          Resolve by hand: refund the people who paid, or pay whoever took over the work.
        </div>
      ) : (
        <>
          <button className="g-btn g-btn-ghost" style={{ marginTop: 10 }} onClick={() => setOpen((o) => !o)}>
            {open ? "Cancel" : "Record payout"}
          </button>
          {open && (
            <RecordPayoutForm
              record={(f) => recordCreativePayout({ payeeUserId: row.payeeUserId as Id<"users">, ...f })}
              onDone={() => setOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Backings and class payments owed to creatives (bead wonderwall-7avu,
 * step 1). One balance per person: a teacher's share of a class counts here
 * beside a backing's work share. Paid by hand until Stripe Connect ships;
 * this is the list to pay from. */
function CreativeEarningsSection({ creativeEarnings }: { creativeEarnings: PlatformReport["creativeEarnings"] }) {
  const totalOwed = creativeEarnings.reduce((s, r) => s + r.owedCents, 0);
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Creative earnings</SectionLabel>
      <p className="g-hint" style={{ marginTop: 8 }}>
        90% of every backing and every class, owed until paid by hand. {formatMoney(totalOwed)} owed in total.
      </p>
      {creativeEarnings.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyRow>No backings or classes yet.</EmptyRow>
        </div>
      ) : (
        <div>
          {creativeEarnings.map((row) => (
            <CreativeEarningsRow key={row.payeeUserId} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function TableRefundRow({row}: {row: NonNullable<PlatformReport["tablePaymentExceptions"]>[number]}) {
  const refund = useAction(api.garden.stripe.refundTablePayment);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!window.confirm(`Refund the full payment for ${row.title}, including its processing fee?`)) return;
    setPending(true);
    setError("");
    try { await refund({paymentId: row.paymentId as Id<"classPayments">}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Refund failed. Try again."); }
    finally { setPending(false); }
  }
  return <div className="g-cell" style={{marginTop: 12, padding: 16}}>
    <strong>{row.title}</strong> · Table price {formatMoney(row.grossCents)}
    <div className="g-hint">Stripe reference: {row.paymentIntentId ?? row.stripeRef}</div>
    <button type="button" className="g-btn g-btn-sm" style={{marginTop: 12}} disabled={pending || !row.paymentIntentId} onClick={submit}>{pending ? "Refunding…" : "Refund full payment"}</button>
    {!row.paymentIntentId && <p className="g-hint">Payment reference missing; resolve this payment in Stripe.</p>}
    {error && <p role="alert" className="g-hint">{error}</p>}
  </div>;
}

function TablePaymentExceptions({rows}: {rows: NonNullable<PlatformReport["tablePaymentExceptions"]>}) {
  if (!rows.length) return null;
  return <section style={{marginTop: 40}}>
    <SectionLabel>Table payments needing a refund</SectionLabel>
    <p className="g-hint" style={{marginTop: 8}}>Payment arrived after enrollment became unavailable. These payments are excluded from host earnings. Refunds return the full original payment, including its processing fee.</p>
    {rows.map(row => <TableRefundRow key={row.paymentId} row={row} />)}
  </section>;
}

function TicketRefundRow({row}: {row: NonNullable<PlatformReport["externalTicketExceptions"]>[number]}) {
  const markRefunded = useMutation(api.garden.operator.markExternalTicketRefunded);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!window.confirm(`Mark the ticket payment for ${row.title} as refunded? Refund it in Abiding Practice's Stripe account first.`)) return;
    setPending(true);
    setError("");
    try { await markRefunded({exceptionId: row.exceptionId as Id<"externalTicketExceptions">}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save. Try again."); }
    finally { setPending(false); }
  }
  return <div className="g-cell" style={{marginTop: 12, padding: 16}}>
    <strong>{row.title}</strong> · {formatMoney(row.grossCents)} · {row.ticketCount} ticket{row.ticketCount === 1 ? "" : "s"}
    <div className="g-hint">Reason: {row.reason.replace(/_/g, " ")} · Stripe reference: {row.stripeRef.replace(/^ap:/, "")}</div>
    <button type="button" className="g-btn g-btn-sm" style={{marginTop: 12}} disabled={pending} onClick={submit}>{pending ? "Saving…" : "Mark refunded"}</button>
    {error && <p role="alert" className="g-hint">{error}</p>}
  </div>;
}

function TicketPaymentExceptions({rows}: {rows: NonNullable<PlatformReport["externalTicketExceptions"]>}) {
  if (!rows.length) return null;
  return <section style={{marginTop: 40}}>
    <SectionLabel>Ticket payments needing a refund</SectionLabel>
    <p className="g-hint" style={{marginTop: 8}}>Paid through Abiding Practice for a Table's Event the buyer can't attend under the Table's rules. No RSVP was made. Refund each in Abiding Practice's Stripe account, then mark it here.</p>
    {rows.map(row => <TicketRefundRow key={row.exceptionId} row={row} />)}
  </section>;
}

// ————— 4. Communities and members —————

function CommunitiesMembersSection({ communities }: { communities: PlatformReport["communities"] }) {
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Communities and members</SectionLabel>
      {communities.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyRow>No communities yet.</EmptyRow>
        </div>
      ) : (
        <div>
          {communities.map((c) => (
            <div key={c.hostOrgId} className="g-cell" style={{ padding: "12px 14px", marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <Link to={`/communities/${c.slug}`} style={{ fontSize: 14.5, fontWeight: 600, color: "var(--g-paper)", textDecoration: "none" }}>
                  {c.name}
                </Link>
                <span className="g-badge g-badge-line">{c.status}</span>
              </div>
              <div className="g-hint" style={{ marginTop: 6 }}>
                {c.members.total} member{c.members.total === 1 ? "" : "s"}
                {c.members.pending > 0 ? ` · ${c.members.pending} pending` : ""} · {c.members.hosts} host
                {c.members.hosts === 1 ? "" : "s"}
              </div>
              <div className="g-hint" style={{ marginTop: 4 }}>
                Free {c.members.byLevel.free} · Seat {c.members.byLevel.seat} · Five {c.members.byLevel.five} · Leader{" "}
                {c.members.byLevel.host} · Covered {c.members.covered} · Home {c.members.home}
              </div>
              <div className="g-hint" style={{ marginTop: 4 }}>
                {c.products} product{c.products === 1 ? "" : "s"} · {c.purchases} purchase{c.purchases === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ————— 5. Platform seats —————

function MembershipsSection({ memberships }: { memberships: PlatformReport["memberships"] }) {
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Platform seats</SectionLabel>
      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
          gap: 10,
        }}
      >
        <StatCell label="Active" value={String(memberships.active)} hot />
        <StatCell label="Past due" value={String(memberships.pastDue)} />
        <StatCell label="Canceled" value={String(memberships.canceled)} />
        <StatCell label="Seat" value={String(memberships.byLevel.seat)} />
        <StatCell label="Five" value={String(memberships.byLevel.five)} />
        <StatCell label="Leader" value={String(memberships.byLevel.host)} />
        <StatCell label="Covered" value={String(memberships.covered)} />
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="g-label" style={{ marginBottom: 10 }}>Coverage codes</div>
        {memberships.coverageCodes.length === 0 ? (
          <EmptyRow>No coverage codes yet.</EmptyRow>
        ) : (
          <div>
            {memberships.coverageCodes.map((c) => (
              <LedgerRow key={c.code}>
                <span className="g-mono" style={{ fontSize: 14, color: "var(--g-paper)" }}>{c.code}</span>
                {c.sponsorName && <span className="g-hint">{c.sponsorName}</span>}
                <span className="g-hint">{c.redeemed} of {c.seats} seats</span>
                <span className="g-badge g-badge-line">{c.status}</span>
              </LedgerRow>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ————— 6. Recent money events —————

function RecentSection({ recent }: { recent: PlatformReport["recent"] }) {
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Recent money events</SectionLabel>
      {recent.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyRow>Nothing yet.</EmptyRow>
        </div>
      ) : (
        <div>
          {[...recent]
            .sort((a, b) => b.at - a.at)
            .map((r, i) => (
              <LedgerRow key={`${r.at}-${i}`}>
                <span className="g-mono" style={{ fontSize: 12, color: "var(--g-dim)", minWidth: 130 }}>
                  {formatDateTime(r.at)}
                </span>
                <span
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: r.grossCents < 0 ? "var(--g-dim)" : "var(--g-paper)",
                  }}
                >
                  {formatSignedMoney(r.grossCents)}
                </span>
                <span className="g-hint">platform {formatSignedMoney(r.platformCents)}</span>
                <span className="g-badge g-badge-line">{r.source}</span>
                <span style={{ fontSize: 14, color: "var(--g-body)" }}>{r.description}</span>
                {r.hostOrgName && <span className="g-hint">{r.hostOrgName}</span>}
                {r.ref && <span className="g-hint">{r.ref}</span>}
              </LedgerRow>
            ))}
        </div>
      )}
    </section>
  );
}

// ————— Member-directed giving —————
//
// What members do with their monthly half (getGivingReport, operator only).
// The report is read defensively: a backend that hasn't shipped it yet
// leaves this section empty and the rest of the page renders.

type GivingPeriodRow = {
  period?: string;
  membersBilled?: number;
  gaveToCreative?: number;
  gaveToProject?: number;
  choseFund?: number;
  didntPick?: number;
  notPickedYet?: number;
  givenCents?: number;
  decidedWithin7Days?: number;
  distinctRecipients?: number;
  plussedUpMembers?: number;
  plussedUpCents?: number;
  plussedUpMonthly?: number;
  plussedUpRate?: number;
  gaveAgain?: number;
  plussedUpAgain?: number;
};

type GivingMemberRow = {
  userId?: string;
  name?: string;
  profileId?: string | null;
  timesPlussedUp?: number;
  plussedUpCents?: number;
  gaveCount?: number;
  lastPeriod?: string;
};

type GivingReport = {
  byPeriod?: GivingPeriodRow[];
  members?: GivingMemberRow[];
  totals?: {
    membersBilled?: number;
    gave?: number;
    givenCents?: number;
    plussedUpCents?: number;
    plussedUpMembers?: number;
  };
};

const GIVING_LINE: React.CSSProperties = { fontSize: 15, color: "var(--g-body)", margin: "4px 0" };

function GivingMonth({ r }: { r: GivingPeriodRow }) {
  const notYet = r.notPickedYet ?? 0;
  const again = r.gaveAgain ?? 0;
  return (
    <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--g-hairline)" }}>
      <h3 className="g-h" style={{ fontSize: 20 }}>
        {formatPeriod(r.period ?? "")}
      </h3>
      <p style={GIVING_LINE}>{r.membersBilled ?? 0} {(r.membersBilled ?? 0) === 1 ? "member" : "members"} billed</p>
      <p style={GIVING_LINE}>
        {r.gaveToCreative ?? 0} gave to a creative, {r.gaveToProject ?? 0} to a project
      </p>
      <p style={GIVING_LINE}>
        {r.choseFund ?? 0} chose the grant fund, {r.didntPick ?? 0} didn't pick (it went to the fund)
      </p>
      {notYet > 0 && <p style={GIVING_LINE}>{notYet} haven't picked yet</p>}
      <p style={GIVING_LINE}>
        {r.plussedUpMembers ?? 0} plussed up, {formatMoney(r.plussedUpCents ?? 0)}
      </p>
      {again > 0 && <p style={GIVING_LINE}>{again} gave again this month and last</p>}
    </div>
  );
}

function GivingSection({ report }: { report: GivingReport | null | undefined }) {
  const rows = (report?.byPeriod ?? []).slice(0, 6);
  const members = report?.members ?? [];
  return (
    <section style={{ marginTop: 40 }}>
      <SectionLabel>Member-directed giving</SectionLabel>
      <p style={{ marginTop: 8, fontSize: 15, color: "var(--g-body)", maxWidth: "60ch" }}>
        Each month a member picks who gets their monthly grant. Plussed up means they gave more of their own money on
        top.
      </p>
      {report === undefined ? (
        <div style={{ marginTop: 12 }}>
          <GardenLoading />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyRow>Nothing yet.</EmptyRow>
        </div>
      ) : (
        <>
          {rows.map((r, i) => (
            <GivingMonth key={r.period ?? i} r={r} />
          ))}
          <div style={{ marginTop: 26 }}>
            <h3 className="g-h" style={{ fontSize: 20, marginBottom: 8 }}>
              Who plussed up
            </h3>
            {members.length === 0 ? (
              <p style={GIVING_LINE}>Nobody yet.</p>
            ) : (
              members.map((m, i) => {
                const name = m.name ?? "Someone";
                return (
                  <p key={m.userId ?? i} style={GIVING_LINE}>
                    {m.profileId ? (
                      <Link to={`/profile/${m.profileId}`} style={{ color: "var(--g-paper)", fontWeight: 600 }}>
                        {name}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--g-paper)", fontWeight: 600 }}>{name}</span>
                    )}{" "}
                    · {m.timesPlussedUp ?? 0}× · {formatMoney(m.plussedUpCents ?? 0)}
                  </p>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ————— Page —————

export default function AdminLedgerPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const report = useQuery(api.garden.reports.getPlatformReport, {}) as PlatformReport | null | undefined;
  const givingReport = useQuery(api.garden.giving.getGivingReport, {}) as GivingReport | null | undefined;

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
          <div className="g-label">TheCreative.exchange</div>
          <h1 className="g-h" style={{ marginTop: 6, fontSize: "clamp(26px,5vw,36px)" }}>
            Platform ledger
          </h1>
        </div>
        <Link to="/admin" className="g-mono" style={{ fontSize: 12.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--g-muted)" }}>
          ← Back to admin
        </Link>
      </div>

      {report === undefined ? (
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      ) : report === null ? (
        <p className="g-hint" style={{ marginTop: 28 }}>Nothing to show yet.</p>
      ) : (
        <>
          <p className="g-hint" style={{ marginTop: 10 }}>Generated {formatDateTime(report.generatedAt)}</p>
          <FeesSection fees={report.fees} periods={report.periods} />
          <PoolsSection pools={report.pools} />
          <GivingSection report={givingReport} />
          <HostEarningsSection hostEarnings={report.hostEarnings} />
          <CreativeEarningsSection creativeEarnings={report.creativeEarnings ?? []} />
          <TablePaymentExceptions rows={report.tablePaymentExceptions ?? []} />
          <TicketPaymentExceptions rows={report.externalTicketExceptions ?? []} />
          <CommunitiesMembersSection communities={report.communities} />
          <MembershipsSection memberships={report.memberships} />
          <RecentSection recent={report.recent} />
        </>
      )}
    </GardenPage>
  );
}
