// /demo/host/dashboard — Marcus's morning (mocks D1–D5; plan §2.2, §2.4).
// Five tabs, four jobs: who's new, who's coming, what moved, who's missing.
// Counts here are deeds the host acts on — nothing on this page ranks a person.
// Client-only; transient useState, reads DASHBOARD/TABLES/COVERAGE verbatim.

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { can, SPLITS } from "../garden/capabilities";
import { useDemo } from "../garden/demo-context";
import { COVERAGE, DASHBOARD, TABLES } from "../garden/demo-data";

type Tab = "today" | "people" | "attendance" | "money" | "grow";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "people", label: "People" },
  { id: "attendance", label: "Attendance" },
  { id: "money", label: "Money" },
  { id: "grow", label: "Grow" },
];

const COHORT_CAP = 10;
const TABLE_LINK = "garden.app/t/third-thursday/spawn";

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

// ————— Small pieces —————

function Stat({ n, label, citron }: { n: string; label: string; citron?: boolean }) {
  return (
    <div className="g-card" style={{ padding: "18px 20px" }}>
      <b
        className="g-h"
        style={{
          display: "block",
          fontSize: 30,
          lineHeight: 1,
          color: citron ? "var(--g-citron)" : undefined,
        }}
      >
        {n}
      </b>
      <span className="g-label" style={{ display: "block", marginTop: 8 }}>
        {label}
      </span>
    </div>
  );
}

function Row({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        padding: "12px 2px",
        borderTop: first ? "none" : "1px solid var(--g-hairline)",
        flexWrap: "wrap",
      }}
    >
      {children}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  citron,
}: {
  label: string;
  value: number;
  max: number;
  citron?: boolean;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span
        className="g-mono"
        style={{ fontSize: 10, color: citron ? "var(--g-citron)" : "var(--g-dim)" }}
      >
        {value}
      </span>
      <i
        style={{
          width: "100%",
          height: Math.max(6, Math.round((value / max) * 72)),
          background: citron ? "var(--g-citron)" : "var(--g-paper)",
          borderRadius: "2px 2px 0 0",
          display: "block",
        }}
      />
      <span
        className="g-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--g-dim)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function QRBox({ size = 72 }: { size?: number }) {
  return (
    <div
      className="g-mono"
      aria-label="QR code"
      style={{
        width: size,
        height: size,
        border: "1px solid var(--g-hairline)",
        borderRadius: 3,
        display: "grid",
        placeItems: "center",
        fontSize: 9,
        letterSpacing: "0.1em",
        color: "var(--g-dim)",
        flexShrink: 0,
      }}
    >
      QR
    </div>
  );
}

function CitronLink({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="g-mono"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--g-citron)",
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ————— The dashboard —————

export default function DemoHostDashboard() {
  const { persona } = useDemo();
  const [tab, setTab] = useState<Tab>("today");
  const [reinvited, setReinvited] = useState<Record<string, boolean>>({});
  const [greeted, setGreeted] = useState<Record<string, boolean>>({});
  const [inviteDrafted, setInviteDrafted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [upgradeNote, setUpgradeNote] = useState(false);

  useEffect(() => {
    setTab("today");
    setReinvited({});
    setGreeted({});
    setInviteDrafted(false);
    setCopied(false);
    setUpgradeNote(false);
  }, [persona.id]);

  const gate = can(persona, "table.create");

  if (!gate.allowed) {
    return (
      <main style={{ marginTop: 28 }}>
        <div className="g-card" style={{ maxWidth: 470, padding: "30px 30px 26px" }}>
          <div className="g-label">Host dashboard</div>
          <div className="g-h" style={{ fontSize: 26, marginTop: 8 }}>
            This is a host's morning view
          </div>
          <p style={{ fontSize: 15, color: "var(--g-body)", marginTop: 12 }}>{gate.reason}</p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {gate.upgradePath ? (
              <button className="g-btn g-btn-citron" onClick={() => setUpgradeNote(true)}>
                {gate.upgradePath}
              </button>
            ) : null}
            <Link to="/demo" className="g-label" style={{ textDecoration: "none" }}>
              Not now
            </Link>
          </div>
          <p className="g-hint" style={{ marginTop: 14 }}>
            {upgradeNote
              ? "Demo — checkout lives in the Join flow. Or walk as Marcus on the bar below to see his dashboard."
              : "Walk as Marcus on the bar below to see his dashboard."}
          </p>
        </div>
      </main>
    );
  }

  const myTables = TABLES.filter((t) => t.hostId === persona.id);
  const quiet = DASHBOARD.goneQuiet
    .map((n) => DASHBOARD.people.find((p) => p.name === n))
    .filter((p): p is (typeof DASHBOARD.people)[number] => Boolean(p));
  const maxCame = Math.max(
    ...DASHBOARD.attendance.map((a) => a.came),
    DASHBOARD.today.rsvps
  );
  const avgCame = Math.round(
    DASHBOARD.attendance.reduce((s, a) => s + a.came, 0) / DASHBOARD.attendance.length
  );
  const bestCame = Math.max(...DASHBOARD.attendance.map((a) => a.came));
  const cohort = myTables.find((t) => t.mode === "cohort");
  const cohortCollected = cohort ? cohort.roster * 40 : 0;
  const idleSeats = COVERAGE.seats - COVERAGE.redeemed;

  return (
    <main style={{ marginTop: 28 }}>
      <div className="g-label">Host dashboard · {persona.name}</div>
      <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(24px,4.5vw,32px)" }}>
        {DASHBOARD.today.nextEvent}
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="g-mono"
            style={{
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "7px 13px",
              borderRadius: 3,
              border: `1px solid ${tab === t.id ? "var(--g-citron)" : "var(--g-hairline)"}`,
              background: tab === t.id ? "var(--g-citron)" : "transparent",
              color: tab === t.id ? "var(--g-ink)" : "var(--g-body)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ——— D1 · Today — the glanceable morning ——— */}
      {tab === "today" ? (
        <section style={{ marginTop: 24 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: 14,
            }}
          >
            <Stat n={String(DASHBOARD.today.rsvps)} label="coming · open table" citron />
            <Stat n={String(DASHBOARD.today.newThisWeek)} label="new this week — greet them" />
            <Stat n={String(DASHBOARD.today.unread)} label="unread — from your people" />
          </div>

          <div className="g-card" style={{ marginTop: 14, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="g-h" style={{ fontSize: 17 }}>
                {DASHBOARD.today.nextEvent}
              </span>
              <span className="g-credit">Folded Note back room</span>
              <span style={{ marginLeft: "auto" }}>
                <CitronLink onClick={() => setTab("attendance")}>Set the chairs →</CitronLink>
              </span>
            </div>
            <p className="g-hint" style={{ marginTop: 6 }}>
              {DASHBOARD.today.rsvps} said they're coming — set the room for{" "}
              {DASHBOARD.today.rsvps + 1}; someone always brings someone.
            </p>
          </div>

          <div className="g-card" style={{ marginTop: 14, padding: "16px 20px" }}>
            <div className="g-label" style={{ marginBottom: 6 }}>
              Your tables
            </div>
            {myTables.map((t, i) => (
              <Row key={t.id} first={i === 0}>
                <span style={{ color: "var(--g-paper)", fontSize: 15, fontWeight: 500 }}>
                  {t.name}
                </span>
                <span className="g-credit">{t.cadence}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "baseline" }}>
                  {t.mode === "cohort" ? (
                    <>
                      <span className="g-credit">
                        {t.roster} of {COHORT_CAP} seated
                      </span>
                      <span className="g-badge g-badge-citron">
                        {COHORT_CAP - t.roster} seat left
                      </span>
                    </>
                  ) : (
                    <span className="g-credit">
                      {t.roster} on the roster
                      {t.mode === "open" ? ` · ${DASHBOARD.today.rsvps} coming` : ""}
                    </span>
                  )}
                </span>
              </Row>
            ))}
          </div>
        </section>
      ) : null}

      {/* ——— D2 · People — arrivals with provenance ——— */}
      {tab === "people" ? (
        <section style={{ marginTop: 24, maxWidth: 640 }}>
          <p className="g-hint" style={{ maxWidth: "58ch" }}>
            Every arrival shows the door they came through — who to thank, and
            which channel is working. Arrivals and absences are deeds; nothing
            here scores a person.
          </p>
          <div style={{ marginTop: 14 }}>
            {DASHBOARD.people.map((p, i) => (
              <Row key={p.name} first={i === 0}>
                <span style={{ color: "var(--g-paper)", fontSize: 15, fontWeight: 500 }}>
                  {p.name}
                </span>
                <span className="g-badge g-badge-line">via {p.via}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span className="g-credit">
                    joined {p.joined} · seen {p.lastSeen} ago
                  </span>
                  {greeted[p.name] ? (
                    <span className="g-credit">
                      <b>note sent</b>
                    </span>
                  ) : (
                    <CitronLink
                      onClick={() => setGreeted((g) => ({ ...g, [p.name]: true }))}
                    >
                      Say hi →
                    </CitronLink>
                  )}
                </span>
              </Row>
            ))}
          </div>

          <div className="g-card" style={{ marginTop: 18, padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span className="g-label">
                {COVERAGE.sponsor} coverage · {COVERAGE.redeemed} of {COVERAGE.seats} seats taken
              </span>
              <span className="g-mono" style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--g-citron)" }}>
                {COVERAGE.code}
              </span>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
              {Array.from({ length: COVERAGE.seats }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    background: i < COVERAGE.redeemed ? "var(--g-citron)" : "transparent",
                    border: i < COVERAGE.redeemed ? "none" : "1px solid var(--g-hairline)",
                  }}
                />
              ))}
            </div>
            <p className="g-hint" style={{ marginTop: 8 }}>
              Idle seats are covered and waiting — the sponsor's announcement is
              the distribution.
            </p>
          </div>
        </section>
      ) : null}

      {/* ——— D3 · Attendance — the room over time, and who's gone quiet ——— */}
      {tab === "attendance" ? (
        <section style={{ marginTop: 24, maxWidth: 640 }}>
          <div className="g-card" style={{ padding: "18px 20px" }}>
            <div className="g-label" style={{ marginBottom: 10 }}>
              Open table · four gatherings
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, paddingTop: 8 }}>
              {DASHBOARD.attendance.map((a) => (
                <Bar
                  key={a.event}
                  label={a.event.split(" ")[0]}
                  value={a.came}
                  max={maxCame}
                />
              ))}
              <Bar label="tmrw · rsvp" value={DASHBOARD.today.rsvps} max={maxCame} citron />
            </div>
            <p className="g-hint" style={{ marginTop: 10 }}>
              Tomorrow's bar is RSVPs; it becomes attendance at check-in — one
              tap at the door, or after, from memory. Averages {avgCame} · best{" "}
              {bestCame}. Bars are rooms, not scores.
            </p>
          </div>

          <div className="g-card" style={{ marginTop: 14, padding: "16px 20px" }}>
            <div className="g-label" style={{ marginBottom: 6 }}>
              Gone quiet
            </div>
            {quiet.map((p, i) => (
              <Row key={p.name} first={i === 0}>
                <span style={{ color: "var(--g-paper)", fontSize: 15, fontWeight: 500 }}>
                  {p.name}
                </span>
                <span className="g-credit">
                  via {p.via} · last seen {p.lastSeen} ago
                </span>
                <span style={{ marginLeft: "auto" }}>
                  {reinvited[p.name] ? (
                    <span className="g-credit">
                      <b>a place is set — sent in your name</b>
                    </span>
                  ) : (
                    <CitronLink
                      onClick={() => setReinvited((r) => ({ ...r, [p.name]: true }))}
                    >
                      Set another place for them →
                    </CitronLink>
                  )}
                </span>
              </Row>
            ))}
            <p className="g-hint" style={{ marginTop: 10 }}>
              Surfaced privately, as care — never a churn metric. The note goes
              out written by you, never automated.
            </p>
          </div>
        </section>
      ) : null}

      {/* ——— D4 · Money — a ledger the host can read aloud ——— */}
      {tab === "money" ? (
        <section style={{ marginTop: 24, maxWidth: 640 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
              gap: 14,
            }}
          >
            <Stat n={usd(cohortCollected)} label="your paid table collected" />
            <Stat n={usd(DASHBOARD.payout)} label="your payout · Sep 1" citron />
          </div>

          <div className="g-card" style={{ marginTop: 14, padding: "18px 20px" }}>
            <dl className="g-mono" style={{ fontSize: 11.5, margin: 0 }}>
              {DASHBOARD.ledger.map((row) => (
                <div
                  key={row.item}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "9px 0",
                    borderTop: "1px solid var(--g-hairline)",
                  }}
                >
                  <dt style={{ color: "var(--g-body)", letterSpacing: "0.04em" }}>{row.item}</dt>
                  <dd style={{ color: "var(--g-paper)", margin: 0 }}>{usd(row.amount)}</dd>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "9px 0",
                  borderTop: "1px solid var(--g-hairline)",
                }}
              >
                <dt style={{ color: "var(--g-citron)", letterSpacing: "0.04em" }}>
                  Your September payout
                </dt>
                <dd style={{ color: "var(--g-citron)", margin: 0 }}>{usd(DASHBOARD.payout)}</dd>
              </div>
            </dl>
            <p className="g-hint" style={{ marginTop: 12 }}>
              {SPLITS.dues.hostOrg * 100}% of every member's dues accrues to
              your host org — {SPLITS.dues.pool * 100}% funds the creative
              project pool, {SPLITS.dues.platform * 100}% keeps the garden.{" "}
              {DASHBOARD.duesShareNote}
            </p>
            <p className="g-hint" style={{ marginTop: 8 }}>
              Your open Thursday table is free to run — and keeps you inside the
              free-door rule.
            </p>
          </div>
        </section>
      ) : null}

      {/* ——— D5 · Grow — every expansion affordance in one place ——— */}
      {tab === "grow" ? (
        <section style={{ marginTop: 24 }}>
          <p className="g-hint" style={{ maxWidth: "58ch" }}>
            Four doors you open — none of them a growth hack that runs itself.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            <div className="g-card" style={{ padding: "18px 20px" }}>
              <div className="g-label">Table link + QR</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12 }}>
                <QRBox />
                <div>
                  <div
                    className="g-mono"
                    style={{ fontSize: 12.5, color: "var(--g-citron)", wordBreak: "break-all" }}
                  >
                    {TABLE_LINK}
                  </div>
                  <p className="g-hint" style={{ marginTop: 6 }}>
                    Bulletin, bio, group chat. {DASHBOARD.today.newThisWeek}{" "}
                    arrivals this week.
                  </p>
                </div>
              </div>
              <button
                className="g-btn g-btn-ghost"
                style={{ marginTop: 12 }}
                onClick={() => {
                  navigator.clipboard?.writeText(TABLE_LINK).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy the link"}
              </button>
            </div>

            <div className="g-card" style={{ padding: "18px 20px" }}>
              <div className="g-label">Personal invitations</div>
              <p className="g-hint" style={{ marginTop: 8 }}>
                Sent in your name, one line from you — every invitation lands as
                an introduction, never a blast.
              </p>
              <button
                className="g-btn g-btn-citron"
                style={{ marginTop: 12 }}
                onClick={() => setInviteDrafted(true)}
              >
                {inviteDrafted ? "Invitation drafted" : "Invite someone"}
              </button>
            </div>

            <div className="g-card" style={{ padding: "18px 20px" }}>
              <div className="g-label">{idleSeats} covered seats idle</div>
              <p className="g-hint" style={{ marginTop: 8 }}>
                {COVERAGE.sponsor} paid for them. Who should have one?
              </p>
              <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                {Array.from({ length: idleSeats }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      border: "1px solid var(--g-hairline)",
                    }}
                  />
                ))}
              </div>
              <button className="g-btn g-btn-ghost" style={{ marginTop: 12 }}>
                Offer a seat by name
              </button>
            </div>

            <div className="g-card" style={{ padding: "18px 20px" }}>
              <div className="g-label">Ready to commit?</div>
              <p className="g-hint" style={{ marginTop: 8 }}>
                Your open night has regulars. Spawn a committed table and carry
                them over — the open night keeps running.
              </p>
              <Link to="/demo/host" className="g-btn g-btn-ghost" style={{ marginTop: 12 }}>
                Set a table from Thursday
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
