// /demo/join — signup + membership, the whole arc in one sitting.
// Mock spec: docs/mocks/creative-flow.html (S2, S5, S6, S6B) · plan §2.1–2.2, §3.1.
// Client-only wizard: all steps are useState, no routing between them.

import { useState } from "react";
import { Link } from "react-router";
import { useDemo } from "../garden/demo-context";
import { SPLITS, type Level } from "../garden/capabilities";
import { TABLES, PHOTOS } from "../garden/demo-data";
import {
  IconMake,
  IconFund,
  IconPlace,
  IconGather,
  IconPeople,
  IconSeat,
  IconSpark,
  IconTable,
  IconCheck,
} from "../garden/icons";

// ————— Local constants (this file only) —————

type Door = "make" | "fund" | "place" | "gather";
type Step = "doors" | "pointer" | "profile" | "tier" | "checkout" | "seated";

const DOORS: { id: Door; name: string; desc: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  {
    id: "make",
    name: "I make things",
    desc: "Writer, musician, filmmaker, designer — or you've made one thing and you're scared to show it.",
    Icon: IconMake,
  },
  {
    id: "fund",
    name: "I fund work",
    desc: "You want to put money behind a person, by name.",
    Icon: IconFund,
  },
  {
    id: "place",
    name: "I have a place or resources",
    desc: "A room, a stage, a channel, materials — something the scene needs.",
    Icon: IconPlace,
  },
  {
    id: "gather",
    name: "I gather people",
    desc: "You already lead something — a group, a night, a cohort held together with texts.",
    Icon: IconGather,
  },
];

const TIERS: {
  level: Level;
  name: string;
  price: string;
  monthly: number;
  perks: string[];
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    level: "free",
    name: "Free account",
    price: "$0",
    monthly: 0,
    perks: [
      "Profile + portfolio",
      "Join open tables",
      "RSVP public events",
      "Follow projects",
    ],
    Icon: IconPeople,
  },
  {
    level: "seat",
    name: "A seat",
    price: "$10/mo",
    monthly: 10,
    perks: [
      "1 active passion project",
      "Apply to paid work",
      "Put on events",
      "Join member tables",
      "Propose to the grant pool",
    ],
    Icon: IconSeat,
  },
  {
    level: "five",
    name: "Five seats",
    price: "$25/mo",
    monthly: 25,
    perks: [
      "Up to 5 active passion projects",
      "Invite collaborators onto them",
      "Everything a seat gets",
    ],
    Icon: IconSpark,
  },
  {
    level: "host",
    name: "Host",
    price: "$50/mo",
    monthly: 50,
    perks: [
      "Create tables — your roster, your room",
      "Spawn closed tables from open ones",
      "10 active passion projects",
      "Patron routing to your community",
    ],
    Icon: IconTable,
  },
];

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: "doors", label: "What brings you" },
  { id: "profile", label: "You" },
  { id: "tier", label: "Your seat" },
  { id: "checkout", label: "Checkout" },
  { id: "seated", label: "Seated" },
];

const FIRST_TABLE = TABLES[0]; // Third Thursday Songwriters

// ————— Shared bits —————

function StepDots({ current }: { current: Step }) {
  const at = current === "pointer" ? "doors" : current;
  const idx = STEP_LABELS.findIndex((s) => s.id === at);
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 28 }}>
      {STEP_LABELS.map((s, i) => (
        <span
          key={s.id}
          className="g-label"
          style={{
            color:
              i === idx
                ? "var(--g-citron)"
                : i < idx
                  ? "var(--g-body)"
                  : undefined,
          }}
        >
          {String(i + 1).padStart(2, "0")} {s.label}
        </span>
      ))}
    </div>
  );
}

/** The two-cell split strip — the claim and the receipt are one component.
    Emphasis without buttonhood: the funded-creative cell is the "hot" data
    cell (raised ink + citron rule), never a citron fill. */
function SplitStrip({ monthly }: { monthly: number }) {
  const pool = monthly * SPLITS.dues.pool;
  const garden = monthly - pool; // host share + platform — The Garden is the default host
  const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
      <div className="g-cell g-cell-hot" style={{ flex: 1 }}>
        <span className="g-cell-v">{money(pool)}</span>
        <div className="g-label" style={{ marginTop: 6 }}>
          another creative's project
        </div>
      </div>
      <div className="g-cell" style={{ flex: 1 }}>
        <span className="g-cell-v">{money(garden)}</span>
        <div className="g-label" style={{ marginTop: 6 }}>
          the garden — the place itself
        </div>
      </div>
    </div>
  );
}

function ChoiceRow({
  name,
  desc,
  icon,
  hot,
  onPick,
  onHover,
  last,
}: {
  name: string;
  desc: string;
  icon: React.ReactNode;
  hot: boolean;
  onPick: () => void;
  onHover: (hovering: boolean) => void;
  last?: boolean;
}) {
  return (
    <button
      onClick={onPick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        padding: "16px 4px",
        borderTop: "1px solid var(--g-hairline)",
        borderBottom: last ? "1px solid var(--g-hairline)" : "none",
        borderLeft: "none",
        borderRight: "none",
        background: "transparent",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 44%" }}>
        <span className={hot ? "g-ic g-ic-citron" : "g-ic"} style={{ display: "inline-flex" }}>
          {icon}
        </span>
        <span className="g-h" style={{ fontSize: 19 }}>
          {name}
        </span>
      </span>
      <span style={{ flex: 1, fontSize: 14, color: "var(--g-muted)", lineHeight: 1.5 }}>
        {desc}
      </span>
    </button>
  );
}

/** Display-only field — reads as an input, never functional. */
function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="g-label" style={{ marginBottom: 7 }}>
        {label}
      </div>
      <div className="g-input" style={{ color: "var(--g-dim)" }}>
        {value}
      </div>
    </div>
  );
}

// ————— The flow —————

export default function DemoJoin() {
  const { persona } = useDemo();
  const [step, setStep] = useState<Step>("doors");
  const [door, setDoor] = useState<Door>("make");
  const [hoverDoor, setHoverDoor] = useState<Door | null>(null);
  const [name, setName] = useState("");
  const [craft, setCraft] = useState("");
  const [city, setCity] = useState("");
  const [tier, setTier] = useState<Level>("seat");
  const [inviteName, setInviteName] = useState("");
  const [inviteSent, setInviteSent] = useState(false);

  const chosen = TIERS.find((t) => t.level === tier) ?? TIERS[1];
  const recommended: Level = door === "gather" ? "host" : "seat";

  const pickDoor = (d: Door) => {
    setDoor(d);
    if (d === "fund" || d === "place") setStep("pointer");
    else setStep("profile");
  };

  return (
    <main style={{ maxWidth: 620 }}>
      <StepDots current={step} />

      {step === "doors" && (
        <section style={{ marginTop: 32 }}>
          <div className="g-label">Welcome</div>
          <h1 className="g-h" style={{ marginTop: 8 }}>
            What brings you?
          </h1>
          <p className="g-hint" style={{ marginTop: 10, marginBottom: 14 }}>
            Pick the closest. You can be more than one — most people are.
          </p>
          <div>
            {DOORS.map((d, i) => (
              <ChoiceRow
                key={d.id}
                name={d.name}
                desc={d.desc}
                icon={<d.Icon size={20} />}
                hot={hoverDoor === d.id}
                onHover={(hovering) => setHoverDoor(hovering ? d.id : null)}
                onPick={() => pickDoor(d.id)}
                last={i === DOORS.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {step === "pointer" && (
        <section style={{ marginTop: 32 }}>
          <div className="g-card" style={{ maxWidth: 480 }}>
            {door === "fund" ? (
              <>
                <div className="g-label">Patron</div>
                <h1 className="g-h" style={{ fontSize: 26, marginTop: 8 }}>
                  Put money behind a person, by name.
                </h1>
                <p style={{ fontSize: 15, marginTop: 12 }}>
                  The patron role is free to hold — you pay per act. Cover one
                  creative's seat at $10/mo, and their story updates carry your
                  name in the credit line.
                </p>
                <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <Link to="/demo/patron" className="g-btn g-btn-citron">
                    Walk the patron door →
                  </Link>
                  <button className="g-btn g-btn-ghost" onClick={() => setStep("profile")}>
                    I also make things
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="g-label">Partner</div>
                <h1 className="g-h" style={{ fontSize: 26, marginTop: 8 }}>
                  Partners come in through a relationship.
                </h1>
                <p style={{ fontSize: 15, marginTop: 12 }}>
                  A creative or host who knows your room lists you — no account
                  needed to start. You get a directory listing, your offer next
                  to it, and your name on the work made in your space.
                </p>
                <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <Link to="/demo/host" className="g-btn g-btn-citron">
                    See how hosts list partners →
                  </Link>
                  <button className="g-btn g-btn-ghost" onClick={() => setStep("profile")}>
                    I also make things
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            className="g-label"
            onClick={() => setStep("doors")}
            style={{ background: "none", border: "none", cursor: "pointer", marginTop: 18, padding: 0 }}
          >
            ← Back
          </button>
        </section>
      )}

      {step === "profile" && (
        <section style={{ marginTop: 32, maxWidth: 480 }}>
          <div className="g-label">2 of 4</div>
          <h1 className="g-h" style={{ fontSize: 28, marginTop: 8 }}>
            Enough to introduce you.
          </h1>
          <p className="g-hint" style={{ marginTop: 10 }}>
            Three fields. A portfolio is not required — one thing you already
            made is plenty, and that comes later.
          </p>
          <div style={{ marginTop: 4 }}>
            <div style={{ marginTop: 18 }}>
              <div className="g-label" style={{ marginBottom: 7 }}>Your name</div>
              <input
                className="g-input"
                value={name}
                placeholder={persona.name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="g-label" style={{ marginBottom: 7 }}>What you make</div>
              <input
                className="g-input"
                value={craft}
                placeholder="Songs, murals, zines, films — say it plain"
                onChange={(e) => setCraft(e.target.value)}
              />
            </div>
            <div style={{ marginTop: 18 }}>
              <div className="g-label" style={{ marginBottom: 7 }}>City</div>
              <input
                className="g-input"
                value={city}
                placeholder="San Diego"
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="g-btn g-btn-citron" onClick={() => setStep("tier")}>
              Continue
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => setStep("doors")}>
              Back
            </button>
          </div>
        </section>
      )}

      {step === "tier" && (
        <section style={{ marginTop: 32 }}>
          <div className="g-label">3 of 4</div>
          <h1 className="g-h" style={{ fontSize: 28, marginTop: 8 }}>
            Take a seat — or just come in.
          </h1>
          <p style={{ fontSize: 15, marginTop: 12, maxWidth: "56ch" }}>
            {SPLITS.duesSentence}
          </p>
          <div style={{ maxWidth: 420 }}>
            <SplitStrip monthly={10} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
              marginTop: 24,
            }}
          >
            {TIERS.map((t) => {
              const active = t.level === tier;
              return (
                <button
                  key={t.level}
                  className="g-card"
                  onClick={() => setTier(t.level)}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    background: active ? "#1a1a18" : "transparent",
                    borderColor: active ? "var(--g-citron)" : undefined,
                    font: "inherit",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <t.Icon size={18} className="g-ic" />
                      <span className="g-h" style={{ fontSize: 19 }}>
                        {t.name}
                      </span>
                    </span>
                    <span className={t.level === recommended ? "g-badge g-badge-citron" : "g-badge g-badge-line"}>
                      {t.price}
                    </span>
                  </div>
                  {t.level === recommended && (
                    <div className="g-credit" style={{ marginTop: 8 }}>
                      <b>{door === "gather" ? "For the one who makes the room" : "Most people start here"}</b>
                    </div>
                  )}
                  <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
                    {t.perks.map((p) => (
                      <li
                        key={p}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 14,
                          color: "var(--g-muted)",
                          padding: "3px 0",
                        }}
                      >
                        <IconCheck size={14} className="g-ic" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className="g-btn g-btn-citron"
              onClick={() => setStep(tier === "free" ? "seated" : "checkout")}
            >
              {tier === "free" ? "Come on in — free" : `Continue · ${chosen.price}`}
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => setStep("profile")}>
              Back
            </button>
          </div>
        </section>
      )}

      {step === "checkout" && (
        <section style={{ marginTop: 32, maxWidth: 460 }}>
          <div className="g-label">Checkout</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <span className="g-h" style={{ fontSize: 24 }}>
              {chosen.name}
            </span>
            <span className="g-badge g-badge-citron">{chosen.price}</span>
          </div>
          <SplitStrip monthly={chosen.monthly} />
          <MockField label="Card" value="•••• •••• •••• 4242" />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <MockField label="Expires" value="08 / 29" />
            </div>
            <div style={{ flex: 1 }}>
              <MockField label="CVC" value="•••" />
            </div>
          </div>
          <p
            className="g-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--g-dim)",
              marginTop: 16,
            }}
          >
            No ads. No algorithm. You're not the product — your seat is what
            keeps this place alive.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
            <button className="g-btn g-btn-citron" onClick={() => setStep("seated")}>
              Take your seat
            </button>
            <button className="g-btn g-btn-ghost" onClick={() => setStep("tier")}>
              Back
            </button>
          </div>
          <p className="g-hint" style={{ marginTop: 16 }}>
            Covered by your church or a patron?{" "}
            <span className="g-mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--g-citron)" }}>
              Enter coverage code
            </span>
          </p>
        </section>
      )}

      {step === "seated" && (
        <section style={{ marginTop: 32, maxWidth: 480 }}>
          <div className="g-label">Seated</div>
          <h1 className="g-h" style={{ fontSize: 28, marginTop: 8 }}>
            {tier === "free" ? "You're in." : "Your seat is held."}
          </h1>
          {tier !== "free" && (
            <p style={{ fontSize: 15, marginTop: 10 }}>
              Half of your dues just started funding another creative's project.
            </p>
          )}
          <div className="g-card" style={{ marginTop: 18 }}>
            <img
              src={PHOTOS.songwriters}
              alt=""
              className="g-photo-strip"
              style={{ marginBottom: 14 }}
            />
            <div className="g-label">First table</div>
            <div className="g-h" style={{ fontSize: 22, marginTop: 8 }}>
              {FIRST_TABLE.name}
            </div>
            <div className="g-credit" style={{ marginTop: 10 }}>
              {FIRST_TABLE.cadence} · <b>open — walk in</b>
            </div>
          </div>
          <p style={{ fontSize: 15, marginTop: 18 }}>
            One more thing makes this real:{" "}
            <b style={{ color: "var(--g-paper)", fontWeight: 600 }}>
              a table's only as good as who's at it.
            </b>
          </p>
          {inviteSent ? (
            <div className="g-credit" style={{ marginTop: 18 }}>
              Seat saved for <b>{inviteName || "your someone"}</b> — the invite
              carries your name, not a referral link.
            </div>
          ) : (
            <>
              <div style={{ marginTop: 18 }}>
                <div className="g-label" style={{ marginBottom: 7 }}>
                  Save a seat for someone
                </div>
                <input
                  className="g-input"
                  value={inviteName}
                  placeholder="A name and an email — someone whose work you want at your table"
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center" }}>
                <button className="g-btn g-btn-citron" onClick={() => setInviteSent(true)}>
                  Send a personal invite
                </button>
                <button
                  className="g-label"
                  onClick={() => setInviteSent(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Later
                </button>
              </div>
            </>
          )}
          <hr className="g-rule" style={{ margin: "24px 0" }} />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <Link to="/demo/create" className="g-btn g-btn-ghost">
              Start your first project →
            </Link>
            <button
              className="g-label"
              onClick={() => {
                setStep("doors");
                setInviteSent(false);
                setInviteName("");
              }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Restart the walk
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
