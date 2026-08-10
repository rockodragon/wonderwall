// /demo/patron — the patron flow: two doors, coverage codes, redemption.
// Mock spec: docs/mocks/patron-flow.html (P1, P1B, P2–P5) · plan §2.1, §2.2, §2.5.
// Client-only; transient state lives here, never in demo-data.

import { useEffect, useState } from "react";
import { can, SPLITS } from "../garden/capabilities";
import type { GardenUser } from "../garden/capabilities";
import { COVERAGE, PROJECTS } from "../garden/demo-data";
import { useDemo } from "../garden/demo-context";
import {
  IconCheck,
  IconCredit,
  IconPeople,
  IconQr,
  IconSeat,
} from "../garden/icons";

// ————— Local constants (extra data stays in this file) —————

const SHUA_STORY = PROJECTS.find((p) => p.id === "psalms")!;

const SEAT_PRICE = 10;
const WORK_SHARE = SPLITS.patronage.work * SEAT_PRICE; // $9 — 90% to the work
const PLATFORM_SHARE = SEAT_PRICE - WORK_SHARE; // $1 — 10% incl. processing

type Door = "named" | "cold";
type Intensity = "instant" | "note" | "meet";

const INTENSITIES: { id: Intensity; title: string; note: string }[] = [
  {
    id: "instant",
    title: "Just cover it",
    note: "A host matches you with one person within a week. Their updates start arriving.",
  },
  {
    id: "note",
    title: "Add a note",
    note: "Same match — your note goes with the introduction.",
  },
  {
    id: "meet",
    title: "Meet them",
    note: "A host talks with you first and makes the match personally. Good for churches and larger patrons.",
  },
];

const INTENSITY_ICON: Record<Intensity, typeof IconCheck> = {
  instant: IconCheck,
  note: IconCredit,
  meet: IconPeople,
};

const INTENSITY_CONFIRM: Record<Intensity, string> = {
  instant:
    "A host is matching you now. Within the week: one name, their story updates, your credit line on the work.",
  note: "A host is matching you now — and your note goes with the introduction. One name, within the week.",
  meet: "A host will reach out to set up a conversation. You'll pick the match together — no rush, no pool.",
};

// ————— Small pieces —————

function SplitBar({ who }: { who: string }) {
  return (
    <div
      className="g-mono"
      style={{
        display: "flex",
        gap: 8,
        marginTop: 16,
        fontSize: 10,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        textAlign: "center",
      }}
    >
      <div className="g-cell g-cell-hot" style={{ flex: 9, padding: "10px 6px" }}>
        <b className="g-cell-v" style={{ display: "block", fontSize: 15 }}>
          ${WORK_SHARE}
        </b>
        the work — {who}
      </div>
      <div className="g-cell" style={{ flex: 1, minWidth: 86, color: "var(--g-body)", padding: "10px 6px" }}>
        <b style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--g-body)" }}>
          ${PLATFORM_SHARE}
        </b>
        the garden
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="g-label" style={{ marginBottom: 7 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** Display-only "input" — the mock-checkout card fields are never functional. */
function DeadInput({ value, dim = true }: { value: string; dim?: boolean }) {
  return (
    <div className="g-input" style={{ color: dim ? "var(--g-dim)" : "var(--g-paper)" }}>
      {value}
    </div>
  );
}

function CreditLine({ by }: { by: string }) {
  return (
    <span className="g-credit" style={{ fontSize: 10 }}>
      seat covered by <b>{by}</b>
    </span>
  );
}

/** Denial anatomy — reason, then the path through (always). */
function PatronGate({
  reason,
  upgradePath,
  onUpgrade,
}: {
  reason: string;
  upgradePath?: string;
  onUpgrade: () => void;
}) {
  return (
    <div className="g-card" style={{ marginTop: 20, borderColor: "var(--g-citron)" }}>
      <div className="g-label" style={{ color: "var(--g-citron)" }}>
        One thing first
      </div>
      <p style={{ fontSize: 15, marginTop: 8, maxWidth: "52ch" }}>{reason}</p>
      <p className="g-hint" style={{ marginTop: 8 }}>
        Sixty seconds — a name and an email. No card until you cover someone.
      </p>
      {upgradePath && (
        <button className="g-btn g-btn-citron" style={{ marginTop: 14 }} onClick={onUpgrade}>
          {upgradePath}
        </button>
      )}
    </div>
  );
}

// ————— The flow —————

export default function PatronFlow() {
  const { persona } = useDemo();

  // "Become a patron — free" is a 60-second registration; simulate it locally.
  const [becamePatron, setBecamePatron] = useState(false);
  const [door, setDoor] = useState<Door | null>(null);
  const [intensity, setIntensity] = useState<Intensity>("instant");
  const [patronName, setPatronName] = useState("");
  const [covered, setCovered] = useState(false);
  const [seatTaken, setSeatTaken] = useState(false);

  // A new walker starts the flow fresh.
  useEffect(() => {
    setBecamePatron(false);
    setDoor(null);
    setIntensity("instant");
    setPatronName("");
    setCovered(false);
    setSeatTaken(false);
  }, [persona.id]);

  const effective: GardenUser = becamePatron ? { ...persona, patronRole: true } : persona;
  const verdict = can(effective, "seat.cover");

  const displayName = patronName.trim() || persona.name;
  const idle = COVERAGE.seats - COVERAGE.redeemed;

  const openDoor = (d: Door) => {
    setDoor(d);
    setCovered(false);
  };

  return (
    <main>
      <h1 className="g-h" style={{ marginTop: 28 }}>
        Back a <span className="g-accent">specific person.</span>
      </h1>
      <p style={{ marginTop: 14, maxWidth: "58ch" }}>
        Most patrons start at $10, not $500. Cover a specific creative's
        seat — or cover a seat and we'll match you with someone.
      </p>

      {/* ————— 01 · The two doors ————— */}
      <div className="g-label" style={{ marginTop: 40 }}>
        01 · Two ways in
      </div>

      {!verdict.allowed && (
        <PatronGate
          reason={verdict.reason ?? ""}
          upgradePath={verdict.upgradePath}
          onUpgrade={() => setBecamePatron(true)}
        />
      )}
      {becamePatron && (
        <p className="g-hint" style={{ marginTop: 10 }}>
          Done — {persona.name} now holds the patron role. It costs nothing to
          hold; you pay per act.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        {/* Warm — the named door */}
        <div
          className="g-card"
          style={{ display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden" }}
        >
          {SHUA_STORY.photo && (
            <img
              src={SHUA_STORY.photo}
              alt={SHUA_STORY.title}
              className="g-photo"
              style={{ borderRadius: "9px 9px 0 0" }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconCredit size={22} className="g-ic" />
            <div className="g-credit">
              <b>Shua</b> · songwriter · San Diego
            </div>
          </div>
          <div className="g-h" style={{ fontSize: 22 }}>
            Cover Shua's seat — ${SEAT_PRICE}/mo
          </div>
          <p style={{ fontSize: 14.5 }}>
            His seat, paid for. Right now: <i>{SHUA_STORY.title}</i> —{" "}
            {SHUA_STORY.blurb} You'll get his story updates as the work happens,
            with your name in the credit line.
          </p>
          <p className="g-hint">
            Behind him already: {SHUA_STORY.backers?.join(", ")}.
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="g-btn g-btn-citron"
              disabled={!verdict.allowed}
              style={!verdict.allowed ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
              onClick={() => openDoor("named")}
            >
              Cover his seat
            </button>
            <span className="g-label">${SEAT_PRICE}/mo · cancel anytime</span>
          </div>
          </div>
        </div>

        {/* Cold — we'll seat a creative */}
        <div className="g-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconSeat size={22} className="g-ic" />
            <div className="g-credit">
              <b>Don't know anyone yet?</b>
            </div>
          </div>
          <div className="g-h" style={{ fontSize: 22 }}>
            Cover a seat — we'll match you with a creative
          </div>
          <p style={{ fontSize: 14.5 }}>
            ${SEAT_PRICE}/mo is literally one seat — no pooling. A host matches
            you with one person whose work needs a place, within a week. Their
            updates and your credit line follow.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {INTENSITIES.map((i) => {
              const Icon = INTENSITY_ICON[i.id];
              return (
                <button
                  key={i.id}
                  onClick={() => setIntensity(i.id)}
                  style={{
                    textAlign: "left",
                    background: intensity === i.id ? "#1a1a18" : "transparent",
                    border: `1px solid ${intensity === i.id ? "var(--g-citron)" : "var(--g-hairline)"}`,
                    borderRadius: 3,
                    padding: "10px 12px",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Icon size={17} className="g-ic" />
                    <span className="g-h" style={{ fontSize: 15 }}>
                      {i.title}
                    </span>
                  </span>
                  <span className="g-hint" style={{ display: "block", marginTop: 3 }}>
                    {i.note}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="g-btn g-btn-citron"
              disabled={!verdict.allowed}
              style={!verdict.allowed ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
              onClick={() => openDoor("cold")}
            >
              Cover a seat
            </button>
            <span className="g-label">Matched within a week</span>
          </div>
          <p className="g-hint">
            Only creatives who've opted in are matched, and introductions lead
            with their work, not their need.
          </p>
        </div>
      </div>

      <p className="g-hint" style={{ marginTop: 14, maxWidth: "62ch" }}>
        Covering ten seats at once, or a season of one person's work? Coverage
        codes are below. Ask a host about Fellowships too ($500/mo) — that
        one's better discussed in person.
      </p>

      {/* ————— 02 · Checkout ————— */}
      {door && (
        <>
          <div className="g-label" style={{ marginTop: 44 }}>
            02 · Checkout — your name in the credit line
          </div>
          <div className="g-card" style={{ marginTop: 14, maxWidth: 480 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <span className="g-h" style={{ fontSize: 24 }}>
                {door === "named" ? "Shua's seat" : "A seat — creative to be matched"}
              </span>
              <span className="g-badge g-badge-citron">${SEAT_PRICE}/mo</span>
            </div>
            <SplitBar who={door === "named" ? "his seat" : "one person's seat"} />
            <p className="g-hint" style={{ marginTop: 8 }}>
              Patronage splits {SPLITS.patronage.work * 100}/
              {SPLITS.patronage.platform * 100}, published — ninety cents of
              every dollar reaches the work.
            </p>

            <Field label="Your name, as it will appear">
              <input
                className="g-input"
                value={patronName}
                placeholder={persona.name}
                onChange={(e) => setPatronName(e.target.value)}
              />
            </Field>
            <p className="g-hint" style={{ marginTop: 8 }}>
              Credit preview: <CreditLine by={displayName} />
            </p>
            <Field label="Email">
              <DeadInput value="you@example.com" />
            </Field>
            <Field label="Card">
              <DeadInput value="•••• •••• •••• 4242" />
            </Field>

            {!covered ? (
              <button
                className="g-btn g-btn-citron"
                style={{ marginTop: 20 }}
                onClick={() => setCovered(true)}
              >
                {door === "named" ? "Cover his seat" : "Cover a seat"}
              </button>
            ) : (
              <div className="g-badge g-badge-citron" style={{ marginTop: 20, display: "inline-block" }}>
                Covered · ${SEAT_PRICE}/mo
              </div>
            )}
            <p className="g-hint" style={{ marginTop: 14 }}>
              Prefer to stay unnamed? <span style={{ color: "var(--g-citron)" }}>Give anonymously</span> —{" "}
              {door === "named" ? "Shua" : "your match"} will know, the public won't.
            </p>
          </div>

          {/* ————— The retention loop — what lands next ————— */}
          {covered && (
            <>
              <div className="g-label" style={{ marginTop: 32 }}>
                What lands next — the reason patrons renew
              </div>
              {door === "cold" ? (
                <div className="g-card" style={{ marginTop: 14, maxWidth: 480 }}>
                  <div className="g-credit">
                    <b>Your match</b> · in progress
                  </div>
                  <p style={{ fontSize: 15, marginTop: 10 }}>{INTENSITY_CONFIRM[intensity]}</p>
                  <p className="g-hint" style={{ marginTop: 10 }}>
                    Then updates like the one Diane gets from Shua — a moment
                    from the work, your name already on it.
                  </p>
                </div>
              ) : (
                <div className="g-card" style={{ marginTop: 14, maxWidth: 480 }}>
                  <div className="g-credit">
                    <b>Shua</b> · story update · Tuesday
                  </div>
                  {SHUA_STORY.photo && (
                    <img
                      src={SHUA_STORY.photo}
                      alt={SHUA_STORY.title}
                      className="g-photo-strip"
                      style={{ marginTop: 12 }}
                    />
                  )}
                  <p
                    className="g-hint"
                    style={{ textAlign: "center", marginTop: 8 }}
                  >
                    [ 40 sec — "Prodigal" live at the Casbah, first time in front of a room ]
                  </p>
                  <p style={{ color: "var(--g-paper)", marginTop: 12, fontSize: 15.5 }}>
                    "Three people stayed after to talk. One of them runs a
                    wedding venue and wants the whole set in October."
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <CreditLine by={displayName} />
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 14 }}>
                    <span className="g-credit" style={{ color: "var(--g-citron)" }}>
                      Forward this →
                    </span>
                    <span className="g-label">Reply</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ————— 03 · Coverage codes ————— */}
      <div className="g-label" style={{ marginTop: 44 }}>
        03 · Coverage codes — ten seats, one decision
      </div>
      <p className="g-hint" style={{ marginTop: 8, maxWidth: "62ch" }}>
        For churches and other groups: buy N seats, get a code and a QR made
        for a bulletin, a slide, a lobby table. This is {COVERAGE.sponsor}'s
        sponsor view.
      </p>
      <div className="g-card" style={{ marginTop: 14, maxWidth: 560 }}>
        <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
          <div
            className="g-mono"
            style={{
              width: 104,
              height: 104,
              border: "1px solid var(--g-hairline)",
              borderRadius: 3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "var(--g-dim)",
              textAlign: "center",
              textTransform: "uppercase",
            }}
          >
            <IconQr size={28} className="g-ic" />
            print · slide
            <br />
            bulletin
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="g-label">Your coverage code</div>
            <div
              className="g-mono"
              style={{ fontSize: 20, letterSpacing: "0.14em", color: "var(--g-citron)", marginTop: 6 }}
            >
              {COVERAGE.code}
            </div>
            <div className="g-credit" style={{ marginTop: 6 }}>
              {COVERAGE.qrUrl}
            </div>
            <p className="g-hint" style={{ marginTop: 8 }}>
              Anyone with this code takes a covered seat — your name in their
              credit line from day one.
            </p>
          </div>
        </div>
        <hr className="g-rule" style={{ margin: "18px 0" }} />
        <div className="g-label" style={{ marginBottom: 8 }}>
          {COVERAGE.seats} seats · {COVERAGE.redeemed} taken
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Array.from({ length: COVERAGE.seats }, (_, i) => (
            <span
              key={i}
              title={COVERAGE.redeemedBy[i]}
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: i < COVERAGE.redeemed ? "var(--g-citron)" : "transparent",
                border: i < COVERAGE.redeemed ? "none" : "1px solid var(--g-hairline)",
              }}
            />
          ))}
        </div>
        <p className="g-hint" style={{ marginTop: 10 }}>
          Taken by {COVERAGE.redeemedBy.join(", ")}.
        </p>
        <p className="g-hint" style={{ marginTop: 10 }}>
          {idle} seats are unclaimed — announcing the code from the front is
          what fills them.{" "}
          <span className="g-credit" style={{ color: "var(--g-citron)", fontSize: 10 }}>
            Announce them again →
          </span>
        </p>
      </div>

      {/* ————— 04 · Redemption ————— */}
      <div className="g-label" style={{ marginTop: 44 }}>
        04 · Redemption — a covered seat is a full seat
      </div>
      <p className="g-hint" style={{ marginTop: 8, maxWidth: "62ch" }}>
        What a creative sees landing on {COVERAGE.qrUrl}. Coverage changes who
        pays, not what the creative can do.
      </p>
      <div className="g-card" style={{ marginTop: 14, maxWidth: 480 }}>
        <span className="g-badge g-badge-citron">Covered · {COVERAGE.code}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <IconSeat size={20} className="g-ic g-ic-citron" />
          <div className="g-h" style={{ fontSize: 26 }}>
            Your seat is covered.
          </div>
        </div>
        <p style={{ fontSize: 15, marginTop: 10 }}>
          {COVERAGE.sponsor} paid for your seat — same capabilities as anyone
          paying their own way. Run a project, apply to paid work, join member
          tables.
        </p>
        <Field label="Your name">
          <DeadInput value="What should we call you?" />
        </Field>
        {!seatTaken ? (
          <button
            className="g-btn g-btn-citron"
            style={{ marginTop: 20 }}
            onClick={() => setSeatTaken(true)}
          >
            Claim your seat
          </button>
        ) : (
          <p style={{ fontSize: 15, marginTop: 20, color: "var(--g-paper)" }}>
            You're in — the checkout simply disappeared. Same seat as anyone
            paying their own way.
          </p>
        )}
        <p className="g-hint" style={{ marginTop: 14 }}>
          Your story updates will carry a small credit:{" "}
          <CreditLine by={COVERAGE.sponsor} />
        </p>
      </div>
    </main>
  );
}
