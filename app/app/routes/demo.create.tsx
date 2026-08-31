// /demo/create — passion vs. paid, and the gates.
// The whole flow hangs off can(persona, capability): every screen renders the
// CanResult it got — including denials, verbatim (denial anatomy, mock G6).
// Client-only; transient useState, never mutates demo-data.

import { useEffect, useState } from "react";
import { can, SPLITS } from "../garden/capabilities";
import type { CanResult, Capability } from "../garden/capabilities";
import { useDemo } from "../garden/demo-context";
import { PROJECTS } from "../garden/demo-data";
import { IconSpark, IconTag, IconSeat, IconMake, IconCheck } from "../garden/icons";

type Path = "chooser" | "passion" | "paid";

// ————— Local copy (mock G0–G4 voice; plan §3) —————

const FORK = [
  {
    path: "passion" as Path,
    kind: "Passion · seeking support",
    name: "I'm making something and want support",
    desc: "Your own work. The community and its patrons back it with funding, collaborators, and feedback.",
    Icon: IconSpark,
  },
  {
    path: "paid" as Path,
    kind: "Paid · budget declared",
    name: "I have a budget and need a creative",
    desc: "A commission, a gig, a hire. You say the number; creatives apply.",
    Icon: IconTag,
  },
];

const SEAT_VALUE_LINE =
  "A seat lets you run one active passion project at a time, apply to paid work, and join member tables.";

// ————— Small pieces —————

/** "How the gate thinks" — demo-explainer chrome, visually secondary. */
function GateStrip({
  capability,
  result,
  personaId,
}: {
  capability: Capability;
  result: CanResult;
  personaId: string;
}) {
  const parts = [`allowed: ${result.allowed}`];
  if (result.reason) parts.push(`reason: "${result.reason}"`);
  if (result.limit !== undefined) parts.push(`limit: ${result.limit}`);
  if (result.used !== undefined) parts.push(`used: ${result.used}`);
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
      <span style={{ color: "var(--g-citron)" }}>how the gate thinks</span>{" "}
      · can({personaId}, "{capability}") → {"{ "}
      {parts.join(" · ")}
      {" }"}
    </div>
  );
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
    <div style={{ marginTop: 18 }}>
      <label className="g-label" style={{ display: "block", marginBottom: 7 }}>
        {label}
        {required ? <span style={{ color: "var(--g-citron)" }}> *</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="g-hint" style={{ marginTop: 6 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function DropZone({
  text,
  Icon,
}: {
  text: string;
  Icon?: (p: { size?: number; className?: string }) => React.ReactElement;
}) {
  return (
    <div
      style={{
        border: "1px dashed var(--g-hairline)",
        borderRadius: 3,
        padding: Icon ? "28px 20px" : "22px 20px",
        textAlign: "center",
        color: "var(--g-dim)",
        fontSize: 13.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: Icon ? 10 : 0,
      }}
    >
      {Icon ? <Icon size={28} className="g-ic" /> : null}
      <span>{text}</span>
    </div>
  );
}

/** Two-cell dues split — $5 funds other creatives' projects, $5 runs the
    place. Data cells, not buttons: citron stays a bottom-rule accent, never a fill. */
function SplitStrip() {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
      <div className="g-cell g-cell-hot" style={{ flex: 1, textAlign: "center", padding: "10px 6px" }}>
        <span className="g-cell-v" style={{ fontSize: 18 }}>$5</span>
        <div className="g-mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--g-muted)", marginTop: 4 }}>
          funds other creatives' projects
        </div>
      </div>
      <div className="g-cell" style={{ flex: 1, textAlign: "center", padding: "10px 6px" }}>
        <span className="g-cell-v" style={{ fontSize: 18 }}>$5</span>
        <div className="g-mono" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--g-muted)", marginTop: 4 }}>
          runs the place
        </div>
      </div>
    </div>
  );
}

/** Small photo card for an example project — .g-photo-strip per the
    "make it come alive" rule, kept credit-sheet sized. */
function ProjectStrip({ title, byLine, photo }: { title: string; byLine: string; photo?: string }) {
  if (!photo) return null;
  return (
    <div className="g-cell" style={{ marginTop: 14, padding: 8, display: "flex", gap: 10, alignItems: "center" }}>
      <img src={photo} alt={title} className="g-photo-strip" style={{ width: 64, height: 64, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13.5, color: "var(--g-paper)", fontWeight: 500 }}>“{title}”</div>
        <div className="g-hint" style={{ marginTop: 2 }}>{byLine}</div>
      </div>
    </div>
  );
}

// ————— The flow —————

export default function DemoCreate() {
  const { persona } = useDemo();
  const [path, setPath] = useState<Path>("chooser");

  // Passion form
  const [pTitle, setPTitle] = useState("");
  const [pAsk, setPAsk] = useState("");
  const [pGoal, setPGoal] = useState("");
  const [planted, setPlanted] = useState(false);

  // Paid funder registration + form
  const [funderKind, setFunderKind] = useState("A business or organization");
  const [funderName, setFunderName] = useState("");
  const [funderContact, setFunderContact] = useState("");
  const [registered, setRegistered] = useState(false);
  const [bTitle, setBTitle] = useState("");
  const [bBudget, setBBudget] = useState("");
  const [bScope, setBScope] = useState("");
  const [bTimeline, setBTimeline] = useState("");
  const [posted, setPosted] = useState(false);

  const [upgradeNote, setUpgradeNote] = useState(false);
  const [hoveredFork, setHoveredFork] = useState<Path | null>(null);

  // The flow reacts live to the persona bar: gates recompute on render, and
  // anything the old persona "did" (planted, posted, registered) resets.
  useEffect(() => {
    setPlanted(false);
    setPosted(false);
    setRegistered(false);
    setUpgradeNote(false);
  }, [persona.id]);

  const backToChooser = () => {
    setPath("chooser");
    setPlanted(false);
    setPosted(false);
    setRegistered(false);
    setUpgradeNote(false);
  };

  const upgradeHint = upgradeNote ? (
    <p className="g-hint" style={{ marginTop: 12 }}>
      Demo — checkout lives in the Join flow. Switch personas on the bar
      below and this result will change.
    </p>
  ) : null;

  // ——— G0 · the fork ———
  if (path === "chooser") {
    return (
      <main style={{ marginTop: 28 }}>
        <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(26px,4.5vw,34px)" }}>
          What are we starting?
        </h1>
        <p className="g-hint" style={{ marginTop: 10, maxWidth: "58ch" }}>
          Two kinds of project. The only difference is who brings the money.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          {FORK.map((f) => (
            <button
              key={f.path}
              className="g-card"
              onClick={() => setPath(f.path)}
              aria-label={f.name}
              onMouseEnter={() => setHoveredFork(f.path)}
              onMouseLeave={() => setHoveredFork((h) => (h === f.path ? null : h))}
              style={{
                textAlign: "left",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="g-label">{f.kind}</span>
                <f.Icon size={22} className={hoveredFork === f.path ? "g-ic g-ic-citron" : "g-ic"} />
              </div>
              <span className="g-h" style={{ fontSize: 21 }}>
                {f.name}
              </span>
              <span style={{ fontSize: 14, color: "var(--g-muted)", lineHeight: 1.5, flex: 1 }}>
                {f.desc}
              </span>
              <span className="g-credit">
                <b>Start →</b>
              </span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  // ——— Passion path ———
  if (path === "passion") {
    const gate = can(persona, "project.create.passion");

    // Planted confirmation
    if (planted) {
      const nowUsed = (gate.used ?? 0) + 1;
      return (
        <main style={{ marginTop: 28, maxWidth: 520 }}>
          <div className="g-label" style={{ color: "var(--g-citron)", display: "flex", alignItems: "center", gap: 7 }}>
            <IconCheck size={18} className="g-ic-citron" />
            Live
          </div>
          <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(24px,4.5vw,32px)" }}>
            “{pTitle.trim() || "Untitled"}” is live
          </h1>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <span className="g-badge g-badge-line">Passion · seeking support</span>
            <span className="g-badge g-badge-line">
              {nowUsed} of {gate.limit} active on your seat
            </span>
          </div>
          <p style={{ fontSize: 15, marginTop: 16, maxWidth: "52ch" }}>
            It appears in the “just posted” rotation within a minute — that's
            rotation, not merit. Support can be funding, collaborators, or
            feedback; whoever contributes lands in the credits on the story page.
          </p>
          {pGoal.trim() ? (
            <p className="g-hint" style={{ marginTop: 10 }}>
              Goal ${pGoal.trim()} — funding progress shows as a fact, plainly.
            </p>
          ) : null}
          <div style={{ marginTop: 24 }}>
            <button className="g-btn g-btn-ghost" onClick={backToChooser}>
              Back to start
            </button>
          </div>
          <GateStrip capability="project.create.passion" result={gate} personaId={persona.id} />
        </main>
      );
    }

    // Denial anatomy — G1 (no seat) / G2 (at the cap)
    if (!gate.allowed) {
      const atCap = (gate.limit ?? 0) > 0;
      const openProjects = PROJECTS.filter(
        (pr) => pr.kind === "passion" && pr.byId === persona.id
      );
      const openTitles = openProjects.map((pr) => pr.title);
      const others = (gate.used ?? 0) - 1;
      const capHeadline =
        openTitles.length > 0
          ? `“${openTitles[0]}”${others > 0 ? ` — and ${others} more —` : ""} ${others > 0 ? "are" : "is"} still open`
          : `You're running ${gate.used} of ${gate.limit}`;

      return (
        <main style={{ marginTop: 28 }}>
          <div className="g-card" style={{ maxWidth: 470, padding: "30px 30px 26px" }}>
            <div className="g-label">
              {atCap
                ? gate.upgradePath?.startsWith("Host")
                  ? "Five at once — or host"
                  : "One at a time — or five"
                : "Get a seat"}
            </div>
            <div className="g-h" style={{ fontSize: atCap ? 24 : 26, marginTop: 8 }}>
              {atCap ? capHeadline : "Start your first project"}
            </div>

            {/* The CanResult, verbatim: reason … */}
            <p style={{ fontSize: 15, color: "var(--g-body)", marginTop: 12 }}>{gate.reason}</p>

            {/* … limit and used … */}
            <p className="g-credit" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7 }}>
              <IconSeat size={16} className="g-ic" />
              active passion projects · <b>{gate.used} of {gate.limit}</b>
            </p>

            {atCap && openProjects[0]?.photo ? (
              <ProjectStrip
                title={openProjects[0].title}
                byLine={openProjects[0].byLine}
                photo={openProjects[0].photo}
              />
            ) : null}

            {!atCap ? (
              <>
                <p style={{ fontSize: 15, color: "var(--g-body)", marginTop: 12 }}>
                  {SEAT_VALUE_LINE}
                </p>
                <SplitStrip />
              </>
            ) : null}

            {/* … and the upgradePath, on the one citron button. */}
            <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {gate.upgradePath ? (
                <button className="g-btn g-btn-citron" onClick={() => setUpgradeNote(true)}>
                  {gate.upgradePath}
                </button>
              ) : null}
              {atCap ? (
                <button className="g-btn g-btn-ghost" onClick={backToChooser}>
                  Finish or archive current
                </button>
              ) : (
                <button
                  className="g-label"
                  onClick={backToChooser}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  Not now
                </button>
              )}
            </div>
            {upgradeHint}
            {!atCap ? (
              <p className="g-hint" style={{ marginTop: 14 }}>
                Covered by a church or patron?{" "}
                <span className="g-mono" style={{ color: "var(--g-citron)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Enter coverage code
                </span>
              </p>
            ) : null}
          </div>
          <GateStrip capability="project.create.passion" result={gate} personaId={persona.id} />
        </main>
      );
    }

    // Allowed → media-first create form
    return (
      <main style={{ marginTop: 28, maxWidth: 520 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="g-badge g-badge-line">Passion · seeking support</span>
          <span className="g-badge g-badge-line">
            {gate.used} of {gate.limit} active — room for this one
          </span>
        </div>
        <h1 className="g-h" style={{ marginTop: 16, fontSize: "clamp(24px,4.5vw,32px)" }}>
          Show the work first
        </h1>
        <div style={{ marginTop: 18 }}>
          <DropZone
            text="Drop a cover image or video — add the title and details after"
            Icon={IconMake}
          />
          <p className="g-hint" style={{ marginTop: 6 }}>
            Title and one-liner are drafted from what you upload — yours to
            edit, never auto-published.
          </p>
        </div>
        <Field label="Title" required>
          <input
            className="g-input"
            value={pTitle}
            onChange={(e) => setPTitle(e.target.value)}
            placeholder="What are you making?"
          />
        </Field>
        <Field label="The ask (one line)" hint="Funding, collaborators, or feedback — say which.">
          <input
            className="g-input"
            value={pAsk}
            onChange={(e) => setPAsk(e.target.value)}
            placeholder="What does support look like?"
          />
        </Field>
        <Field label="Funding goal (optional)">
          <input
            className="g-input"
            value={pGoal}
            onChange={(e) => setPGoal(e.target.value)}
            inputMode="numeric"
            placeholder="$ 500"
            style={{ maxWidth: 180 }}
          />
        </Field>
        <div style={{ marginTop: 22, display: "flex", gap: 12, alignItems: "center" }}>
          <button
            className="g-btn g-btn-citron"
            disabled={!pTitle.trim()}
            style={{ opacity: pTitle.trim() ? 1 : 0.4 }}
            onClick={() => setPlanted(true)}
          >
            Post it
          </button>
          <button
            className="g-label"
            onClick={backToChooser}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            Not now
          </button>
        </div>
        <GateStrip capability="project.create.passion" result={gate} personaId={persona.id} />
      </main>
    );
  }

  // ——— Paid path ———
  const gate = can(persona, "project.create.paid");
  const needsRegistration = !gate.allowed && !registered;
  const postingAs = gate.allowed ? persona.name : funderName.trim() || "Unnamed funder";

  // Posted confirmation
  if (posted) {
    const amount = Number(bBudget) || 0;
    return (
      <main style={{ marginTop: 28, maxWidth: 520 }}>
        <div className="g-label" style={{ color: "var(--g-citron)", display: "flex", alignItems: "center", gap: 7 }}>
          <IconCheck size={18} className="g-ic-citron" />
          Posted
        </div>
        <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(24px,4.5vw,32px)" }}>
          “{bTitle.trim() || "Untitled"}” is live
        </h1>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <span className="g-badge g-badge-citron">Paid · ${amount}</span>
          <span className="g-badge g-badge-line">Posting as {postingAs}</span>
        </div>
        <p style={{ fontSize: 15, marginTop: 16, maxWidth: "52ch" }}>
          Creatives apply to the number on the badge. When money moves through The
          Garden, {Math.round(SPLITS.patronage.work * 100)}% goes to the work and{" "}
          {Math.round(SPLITS.patronage.platform * 100)}% funds the platform — in
          v1 you pay the creative directly when the work's agreed, and the ledger
          records the commitment.
        </p>
        <p className="g-hint" style={{ marginTop: 10 }}>
          Posted just now · reviewed Fridays. Time facts only — no scoreboard.
        </p>
        <div style={{ marginTop: 24 }}>
          <button className="g-btn g-btn-ghost" onClick={backToChooser}>
            Back to start
          </button>
        </div>
        <GateStrip capability="project.create.paid" result={gate} personaId={persona.id} />
      </main>
    );
  }

  // G3 — no seat, no role: not a paywall, a 60-second free registration.
  if (needsRegistration) {
    return (
      <main style={{ marginTop: 28, maxWidth: 480 }}>
        <div className="g-label">Paid project · step 1 of 2</div>
        <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(22px,4.5vw,28px)" }}>
          Who's funding this?
        </h1>
        <p className="g-hint" style={{ marginTop: 6 }}>
          Free, one minute. This puts your name in the credit line on the work.
        </p>
        <p style={{ fontSize: 15, marginTop: 12 }}>{gate.reason}</p>
        <Field label="You are">
          <select
            className="g-input"
            value={funderKind}
            onChange={(e) => setFunderKind(e.target.value)}
            style={{ appearance: "none" }}
          >
            <option>A business or organization</option>
            <option>A patron — an individual</option>
          </select>
        </Field>
        <Field label="Name" required>
          <input
            className="g-input"
            value={funderName}
            onChange={(e) => setFunderName(e.target.value)}
            placeholder="Grounds & Common"
          />
        </Field>
        <Field label="Contact" required hint="We verify this before the post goes live.">
          <input
            className="g-input"
            value={funderContact}
            onChange={(e) => setFunderContact(e.target.value)}
            placeholder="you@groundsandcommon.com"
          />
        </Field>
        <Field label="Your mark (optional)">
          <DropZone text="Drop a logo — it goes in the credit line on the work" />
        </Field>
        <div style={{ marginTop: 22, display: "flex", gap: 12, alignItems: "center" }}>
          <button
            className="g-btn g-btn-citron"
            disabled={!funderName.trim() || !funderContact.trim()}
            style={{ opacity: funderName.trim() && funderContact.trim() ? 1 : 0.4 }}
            onClick={() => setRegistered(true)}
          >
            Continue →
          </button>
          <button
            className="g-label"
            onClick={backToChooser}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            Not now
          </button>
        </div>
        <p className="g-hint" style={{ marginTop: 14 }}>
          Also a creative? {gate.upgradePath} unlocks this and lets you apply to
          paid work yourself.
        </p>
        <GateStrip capability="project.create.paid" result={gate} personaId={persona.id} />
      </main>
    );
  }

  // G4 — the paid form. The budget is the gate: real money, declared.
  const budgetOk = Number(bBudget) > 0;
  return (
    <main style={{ marginTop: 28, maxWidth: 520 }}>
      <div className="g-label">
        Paid project{gate.allowed ? "" : " · step 2 of 2"}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <span className="g-badge g-badge-citron">Paid</span>
        <span className="g-badge g-badge-line">Posting as {postingAs}</span>
      </div>
      <Field label="Title" required>
        <input
          className="g-input"
          value={bTitle}
          onChange={(e) => setBTitle(e.target.value)}
          placeholder="A wall that says who this neighborhood is"
        />
      </Field>
      <Field label="Budget" required hint="A number, not a range. It goes on the badge.">
        <input
          className="g-input"
          value={bBudget}
          onChange={(e) => setBBudget(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="$ 400"
          style={{
            maxWidth: 220,
            fontSize: 20,
            borderColor: budgetOk ? "var(--g-citron)" : undefined,
          }}
        />
      </Field>
      <Field label="Scope">
        <textarea
          className="g-input"
          value={bScope}
          onChange={(e) => setBScope(e.target.value)}
          placeholder="What's being made, where, by when…"
          style={{ minHeight: 84, resize: "vertical" }}
        />
      </Field>
      <Field label="Timeline">
        <input
          className="g-input"
          value={bTimeline}
          onChange={(e) => setBTimeline(e.target.value)}
          placeholder="e.g. done by end of September"
        />
      </Field>
      <Field label="Show the space or the vision (optional)">
        <DropZone text="A photo of the wall, a sketch, a reference — creatives apply to what they can see" />
      </Field>
      <div style={{ marginTop: 22, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          className="g-btn g-btn-citron"
          disabled={!bTitle.trim() || !budgetOk}
          style={{ opacity: bTitle.trim() && budgetOk ? 1 : 0.4 }}
          onClick={() => setPosted(true)}
        >
          Post project
        </button>
        <button
          className="g-label"
          onClick={backToChooser}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          Not now
        </button>
      </div>
      <p className="g-hint" style={{ marginTop: 14 }}>
        You pay the creative directly when the work's agreed. The Garden records
        the commitment and credits everyone involved.
      </p>
      <GateStrip capability="project.create.paid" result={gate} personaId={persona.id} />
    </main>
  );
}
