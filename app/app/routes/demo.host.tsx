// /demo/host — the table wizard (mocks H1–H4; plan §2.3–§2.4).
// One object, four questions, the card builds itself live. The free-door rule
// is product-enforced validation in the pricing step, not policy prose.
// Client-only; transient useState, never mutates demo-data.

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Link } from "react-router";
import { can } from "../garden/capabilities";
import type { CanResult } from "../garden/capabilities";
import { useDemo } from "../garden/demo-context";
import { PHOTOS, TABLES } from "../garden/demo-data";
import { IconGrow, IconPeople, IconQr, IconTable } from "../garden/icons";

type Mode = "open" | "member" | "cohort";
type GardenIcon = ComponentType<{ size?: number; className?: string }>;

// ————— Local copy (mock H1–H4 voice; plan §2.3 "attendees show up; a roster belongs") —————

const MODES: { id: Mode; label: string; line: string; Icon: GardenIcon }[] = [
  {
    id: "open",
    label: "Open",
    line: "Anyone sits in, account or not. Your front porch — and your funnel.",
    Icon: IconTable,
  },
  {
    id: "member",
    label: "Members",
    line: "A seat gets a place at it. Attendees show up; a roster belongs.",
    Icon: IconPeople,
  },
  {
    id: "cohort",
    label: "Cohort",
    line: "A fixed group for a fixed term. The one shape that can carry a price.",
    Icon: IconGrow,
  },
];

const MODE_CARD_LABEL: Record<Mode, string> = {
  open: "Open · anyone",
  member: "Members only",
  cohort: "Cohort · fixed term",
};

const CADENCES = ["Weekly", "Every other week", "3rd Thursdays", "8-week term"];

const VENUES = [
  { name: "Folded Note Records", note: "back room · South Park", partner: true, photo: PHOTOS.recordShop },
  { name: "Bread & Salt", note: "gallery · Barrio Logan", partner: true },
  { name: "Communal Coffee", note: "patio · North Park", partner: true, photo: PHOTOS.cafe },
  { name: "My own place", note: "home, studio, church hall", partner: false },
];

const PRICES = [0, 25, 40, 60];

const STEPS = ["Name", "Mode", "Cadence", "Price"];

const INVITE_LINE = "We're moving the Thursday thing somewhere it can grow. Sit with us —";

// ————— Small pieces —————

/** "How the gate thinks" — demo-explainer chrome, visually secondary. */
function GateStrip({ result, personaId }: { result: CanResult; personaId: string }) {
  const parts = [`allowed: ${result.allowed}`];
  if (result.reason) parts.push(`reason: "${result.reason}"`);
  if (result.upgradePath) parts.push(`upgradePath: "${result.upgradePath}"`);
  return (
    <div
      className="g-hint g-mono"
      style={{
        marginTop: 32,
        padding: "10px 14px",
        border: "1px dashed var(--g-hairline)",
        borderRadius: 3,
        fontSize: 11,
        lineHeight: 1.8,
        wordBreak: "break-word",
      }}
    >
      <span style={{ color: "var(--g-citron)" }}>how the gate thinks</span> · can(
      {personaId}, "table.create") → {"{ "}
      {parts.join(" · ")}
      {" }"}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="g-mono"
      style={{
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "9px 14px",
        borderRadius: 3,
        border: `1px solid ${on ? "var(--g-paper)" : "var(--g-hairline)"}`,
        background: on ? "var(--g-paper)" : "transparent",
        color: on ? "var(--g-ink)" : "var(--g-body)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CardRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <dt className="g-mono" style={{ color: "var(--g-dim)", letterSpacing: "0.1em" }}>
        {k}
      </dt>
      <dd style={{ color: "var(--g-body)", textAlign: "right", margin: 0 }} className="g-mono">
        {v}
      </dd>
    </div>
  );
}

function QRBox({ size = 88 }: { size?: number }) {
  return (
    <div
      aria-label="QR code"
      style={{
        width: size,
        height: size,
        border: "1px solid var(--g-hairline)",
        borderRadius: 3,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <IconQr size={30} className="g-ic-paper" />
    </div>
  );
}

// ————— The wizard —————

export default function DemoHost() {
  const { persona } = useDemo();

  const [step, setStep] = useState(0); // 0..3 wizard, 4 done
  const [name, setName] = useState("Third Thursday Songwriters");
  const [mode, setMode] = useState<Mode | null>(null);
  const [cadence, setCadence] = useState<string | null>(null);
  const [venue, setVenue] = useState<string | null>(null);
  const [price, setPrice] = useState(0);
  const [simulateFirstTable, setSimulateFirstTable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [upgradeNote, setUpgradeNote] = useState(false);

  // React live to the persona bar: gates recompute, transient state resets.
  useEffect(() => {
    setStep(0);
    setName("Third Thursday Songwriters");
    setMode(null);
    setCadence(null);
    setVenue(null);
    setPrice(0);
    setSimulateFirstTable(false);
    setCopied(false);
    setUpgradeNote(false);
  }, [persona.id]);

  const gate = can(persona, "table.create");

  // ——— The gate: table.create is host-only ———
  if (!gate.allowed) {
    return (
      <main style={{ marginTop: 28 }}>
        <div className="g-card" style={{ maxWidth: 470, padding: "30px 30px 26px" }}>
          <div className="g-label">Set a table</div>
          <div className="g-h" style={{ fontSize: 26, marginTop: 8 }}>
            Hosting is its own craft
          </div>
          <p style={{ fontSize: 15, color: "var(--g-body)", marginTop: 12 }}>{gate.reason}</p>
          <p style={{ fontSize: 15, color: "var(--g-body)", marginTop: 12 }}>
            A host runs tables in any mode, spawns committed tables out of open
            ones, and — once they charge — pays 10% of what they collect and no
            base at all.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {gate.upgradePath ? (
              <button className="g-btn g-btn-citron" onClick={() => setUpgradeNote(true)}>
                {gate.upgradePath}
              </button>
            ) : null}
            <Link
              to="/demo"
              className="g-label"
              style={{ textDecoration: "none" }}
            >
              Not now
            </Link>
          </div>
          {upgradeNote ? (
            <p className="g-hint" style={{ marginTop: 12 }}>
              Demo — checkout lives in the Join flow. Or walk as Marcus on the
              bar below and set his table.
            </p>
          ) : null}
        </div>
        <GateStrip result={gate} personaId={persona.id} />
      </main>
    );
  }

  // Host's standing free doors — the free-door rule reads the real roster.
  const openDoors = simulateFirstTable
    ? []
    : TABLES.filter((t) => t.hostId === persona.id && t.mode === "open");
  const isPaid = mode === "cohort" && price > 0;
  const blocked = isPaid && openDoors.length === 0;

  const slug =
    (name.trim() || "your-table")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "your-table";
  const existing = TABLES.find(
    (t) => t.name.toLowerCase() === name.trim().toLowerCase()
  );
  const spawnUrl = existing?.spawnUrl ?? `garden.app/t/${slug}/spawn`;
  const inviteMessage = `${INVITE_LINE} ${spawnUrl}`;

  const priceLabel =
    mode === "open"
      ? "Free · always"
      : mode === "member"
        ? "On a seat"
        : price > 0
          ? `$${price}/mo per seat`
          : "Free";

  const liveCard = (
    <div
      className="g-card"
      style={{
        flex: "0 1 300px",
        alignSelf: "flex-start",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 24,
        minWidth: 260,
      }}
    >
      {step === 4 ? (
        <img src={PHOTOS.songwriters} alt="" className="g-photo-strip" />
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span className="g-credit">The Garden</span>
        {step === 4 ? (
          <span className="g-badge g-badge-citron">Live</span>
        ) : (
          <span className="g-badge g-badge-line">Draft</span>
        )}
      </div>
      <div className="g-h" style={{ fontSize: 24 }}>
        {name.trim() || "Untitled table"}
      </div>
      <hr className="g-rule" style={{ margin: 0 }} />
      <dl
        style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 11.5, margin: 0 }}
      >
        <CardRow k="MODE" v={mode ? MODE_CARD_LABEL[mode] : "—"} />
        <CardRow k="WHEN" v={cadence ?? "—"} />
        <CardRow k="WHERE" v={venue ?? "—"} />
        <CardRow k="PRICE" v={mode ? priceLabel : "—"} />
      </dl>
    </div>
  );

  // ——— Done — the table card + the invitation kit (mock H3) ———
  if (step === 4) {
    return (
      <main style={{ marginTop: 28 }}>
        <div className="g-label" style={{ color: "var(--g-citron)" }}>
          Table set
        </div>
        <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(24px,4.5vw,32px)" }}>
          Now — the people you already gather.
        </h1>
        <p style={{ fontSize: 15, marginTop: 10, maxWidth: "54ch" }}>
          Hosts send their own invitations — every one lands as an introduction
          from you by name, never a blast from a platform.
        </p>

        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 24 }}>
          <div style={{ flex: 1, minWidth: 280, maxWidth: 520 }}>
            <div className="g-label">The link + QR</div>
            <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <QRBox />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div
                  className="g-mono"
                  style={{ fontSize: 14, letterSpacing: "0.06em", color: "var(--g-citron)" }}
                >
                  {spawnUrl}
                </div>
                <p className="g-hint" style={{ marginTop: 6 }}>
                  Drop it in the group chat, the bio, the bulletin. Anyone with
                  the link lands on your table's card and asks for a chair.
                </p>
              </div>
            </div>

            <hr className="g-rule" style={{ margin: "24px 0 18px" }} />

            <div className="g-label">Text your people</div>
            <div
              className="g-input"
              style={{ marginTop: 10, color: "var(--g-paper)", fontSize: 15 }}
            >
              {inviteMessage}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="g-btn g-btn-citron"
                onClick={() => {
                  navigator.clipboard?.writeText(inviteMessage).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? "Copied — go send it" : "Copy the message"}
              </button>
              <Link to="/demo/host/dashboard" className="g-btn g-btn-ghost">
                Open the dashboard →
              </Link>
            </div>
            <p className="g-hint" style={{ marginTop: 12 }}>
              Migration, not recruitment — first job is moving the ten people
              you already have out of the group chat.
            </p>
          </div>
          {liveCard}
        </div>
      </main>
    );
  }

  // ——— Steps 0–3 ———
  const stepChips = (
    <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
      {STEPS.map((s, i) => (
        <span
          key={s}
          className="g-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "5px 10px",
            borderRadius: 3,
            border: `1px solid ${i === step ? "var(--g-citron)" : "var(--g-hairline)"}`,
            background: i === step ? "var(--g-citron)" : "transparent",
            color: i === step ? "var(--g-ink)" : i < step ? "var(--g-body)" : "var(--g-dim)",
          }}
        >
          {s}
        </span>
      ))}
    </div>
  );

  let stepBody: React.ReactNode = null;
  let canContinue = false;

  if (step === 0) {
    canContinue = name.trim().length > 0;
    stepBody = (
      <>
        <div className="g-h" style={{ fontSize: 22 }}>
          Name the table
        </div>
        <div style={{ marginTop: 18 }}>
          <label className="g-label" style={{ display: "block", marginBottom: 7 }}>
            Its name
          </label>
          <input
            className="g-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Third Thursday Songwriters"
          />
          <p className="g-hint" style={{ marginTop: 6 }}>
            Name it like a night people already talk about, not a program.
          </p>
        </div>
      </>
    );
  }

  if (step === 1) {
    canContinue = mode !== null;
    stepBody = (
      <>
        <div className="g-h" style={{ fontSize: 22 }}>
          What kind of door?
        </div>
        <p className="g-hint" style={{ marginTop: 8 }}>
          One object, one setting — no table types, no branching.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className="g-card"
              onClick={() => {
                setMode(m.id);
                if (m.id !== "cohort") setPrice(0);
              }}
              style={{
                textAlign: "left",
                background: mode === m.id ? "#1a1a18" : "transparent",
                borderColor: mode === m.id ? "var(--g-paper)" : undefined,
                cursor: "pointer",
                padding: "16px 20px",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <m.Icon size={22} className={mode === m.id ? "g-ic g-ic-citron" : "g-ic"} />
                <span className="g-h" style={{ fontSize: 17 }}>
                  {m.label}
                </span>
                <span style={{ fontSize: 14, color: "var(--g-muted)" }}>{m.line}</span>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (step === 2) {
    canContinue = cadence !== null && venue !== null;
    stepBody = (
      <>
        <div className="g-h" style={{ fontSize: 22 }}>
          When, and where?
        </div>
        <div style={{ marginTop: 18 }}>
          <div className="g-label" style={{ marginBottom: 8 }}>
            Cadence
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {CADENCES.map((c) => (
              <Chip key={c} on={cadence === c} onClick={() => setCadence(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 22 }}>
          <div className="g-label" style={{ marginBottom: 8 }}>
            The room
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {VENUES.map((v) => (
              <button
                key={v.name}
                onClick={() => setVenue(v.name)}
                className="g-card"
                style={{
                  textAlign: "left",
                  background: venue === v.name ? "#1a1a18" : "transparent",
                  borderColor: venue === v.name ? "var(--g-paper)" : undefined,
                  cursor: "pointer",
                  padding: v.photo ? 0 : "12px 16px",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {v.photo ? <img src={v.photo} alt="" className="g-photo-strip" /> : null}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    padding: v.photo ? "12px 16px" : 0,
                  }}
                >
                  <span style={{ color: "var(--g-paper)", fontSize: 15, fontWeight: 500 }}>
                    {v.name}
                  </span>
                  <span className="g-credit" style={{ marginLeft: "auto" }}>
                    {v.partner ? <b>partner</b> : null} {v.note}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <p className="g-hint" style={{ marginTop: 8 }}>
            A partner venue gets a credit on everything this table makes.
          </p>
        </div>
      </>
    );
  }

  if (step === 3) {
    canContinue = !blocked;
    stepBody = (
      <>
        <div className="g-h" style={{ fontSize: 22 }}>
          What does a chair cost?
        </div>

        {mode === "open" ? (
          <p style={{ fontSize: 15, marginTop: 12, maxWidth: "50ch" }}>
            Nothing — open tables are always free to run and free to sit at. No
            platform fee, ever. This one is your front porch.
          </p>
        ) : null}

        {mode === "member" ? (
          <p style={{ fontSize: 15, marginTop: 12, maxWidth: "50ch" }}>
            Nothing at the door — a members table rides on seats people already
            hold. Belonging is what a seat buys; this table is where it happens.
          </p>
        ) : null}

        {mode === "cohort" ? (
          <>
            <p className="g-hint" style={{ marginTop: 8 }}>
              Cohorts can carry a price — deeper commitment is what costs.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
              {PRICES.map((p) => (
                <Chip key={p} on={price === p} onClick={() => setPrice(p)}>
                  {p === 0 ? "Free" : `$${p}/mo`}
                </Chip>
              ))}
            </div>
            {price > 0 ? (
              <p className="g-hint" style={{ marginTop: 10 }}>
                You keep 90% — the garden takes 10% of what you collect, and
                your $50/mo goes away while you charge. Cohort collections pay
                out after each term.
              </p>
            ) : null}
          </>
        ) : null}

        {/* The free-door rule — product-enforced, stated warmly. */}
        {blocked ? (
          <div
            style={{
              border: "1px solid var(--g-citron)",
              borderRadius: 3,
              padding: "14px 16px",
              marginTop: 18,
            }}
          >
            <span className="g-label" style={{ color: "var(--g-citron)" }}>
              House rule — one door stays open
            </span>
            <p style={{ fontSize: 14, color: "var(--g-body)", marginTop: 6 }}>
              Belonging is free — keep one door open. Every host keeps at least
              one free or open table, and right now this priced cohort would be
              your only one. Set an open table first, or let this one be free.
            </p>
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="g-btn g-btn-ghost" onClick={() => setPrice(0)}>
                Make it free
              </button>
              {simulateFirstTable ? (
                <button
                  className="g-btn g-btn-ghost"
                  onClick={() => setSimulateFirstTable(false)}
                >
                  Restore my open table
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--g-hairline)",
              borderRadius: 3,
              padding: "14px 16px",
              marginTop: 18,
            }}
          >
            <span className="g-label" style={{ color: "var(--g-citron)" }}>
              House rule
            </span>
            <p style={{ fontSize: 14, color: "var(--g-body)", marginTop: 6 }}>
              Every host keeps at least one free or open table.{" "}
              {openDoors.length > 0
                ? `Your open ${openDoors[0].name} covers this — money is never the only door in.`
                : "This table is a free door itself — money is never the only door in."}
            </p>
            {openDoors.length > 0 && mode === "cohort" ? (
              <button
                className="g-hint"
                onClick={() => setSimulateFirstTable(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  marginTop: 8,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textAlign: "left",
                }}
              >
                Demo — hide my open table and watch the rule catch
              </button>
            ) : null}
          </div>
        )}
      </>
    );
  }

  return (
    <main style={{ marginTop: 28 }}>
      <div className="g-label">Set a table · host</div>
      <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(24px,4.5vw,32px)" }}>
        Four questions. The card builds itself.
      </h1>

      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 24 }}>
        <div style={{ flex: 1, minWidth: 280, maxWidth: 520 }}>
          {stepChips}
          {stepBody}
          <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
            {step > 0 ? (
              <button className="g-btn g-btn-ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            <button
              className="g-btn g-btn-citron"
              disabled={!canContinue}
              onClick={() => canContinue && setStep(step + 1)}
              style={!canContinue ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
            >
              {step === 3 ? "Set the table" : "Continue"}
            </button>
          </div>
        </div>
        {liveCard}
      </div>

      {step === 0 ? <GateStrip result={gate} personaId={persona.id} /> : null}
    </main>
  );
}
