// /demo/create — passion vs. paid, and the gates.
// The whole flow hangs off can(persona, capability): every screen renders the
// CanResult it got — including denials, verbatim (denial anatomy, mock G6).
// Client-only; transient useState, never mutates demo-data.

import { useEffect, useState } from "react";
import { can, SPLITS } from "../garden/capabilities";
import type { CanResult, Capability } from "../garden/capabilities";
import { useDemo } from "../garden/demo-context";
import { PROJECTS } from "../garden/demo-data";

type Path = "chooser" | "passion" | "paid";

// ————— Local copy (mock G0–G4 voice; plan §3) —————

const FORK = [
  {
    path: "passion" as Path,
    kind: "Passion · seeking support",
    name: "I'm making something and want support",
    desc: "Your work. The community and its patrons get behind it — money, hands, honest ears.",
  },
  {
    path: "paid" as Path,
    kind: "Paid · budget declared",
    name: "I have a budget and need a creative",
    desc: "A commission, a gig, a hire. You say the number; creatives apply.",
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

function DropZone({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px dashed var(--g-hairline)",
        borderRadius: 3,
        padding: "22px 20px",
        textAlign: "center",
        color: "var(--g-dim)",
        fontSize: 13.5,
      }}
    >
      {text}
    </div>
  );
}

/** Two-cell dues split — The Garden as default host org (plan §3.1). */
function SplitStrip() {
  return (
    <div
      className="g-mono"
      style={{
        display: "flex",
        border: "1px solid var(--g-hairline)",
        borderRadius: 3,
        overflow: "hidden",
        marginTop: 16,
        fontSize: 10,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        textAlign: "center",
      }}
    >
      <div style={{ flex: 1, padding: "10px 6px", background: "var(--g-citron)", color: "var(--g-ink)" }}>
        <b style={{ display: "block", fontSize: 13, fontWeight: 500 }}>$5</b>
        another creative's project
      </div>
      <div style={{ flex: 1, padding: "10px 6px", borderLeft: "1px solid var(--g-hairline)", color: "var(--g-body)" }}>
        <b style={{ display: "block", fontSize: 13, fontWeight: 500 }}>$5</b>
        the garden — the place itself
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
      Demo — checkout lives in the Join flow. Or walk as another persona on the
      bar below and watch this gate change its mind.
    </p>
  ) : null;

  // ——— G0 · the fork ———
  if (path === "chooser") {
    return (
      <main style={{ marginTop: 28 }}>
        <div className="g-label">Start a project</div>
        <h1 className="g-h" style={{ marginTop: 10, fontSize: "clamp(26px,4.5vw,34px)" }}>
          What are we starting?
        </h1>
        <p className="g-hint" style={{ marginTop: 10, maxWidth: "58ch" }}>
          Two doors, no third. The fork asks who brings the money — nothing else.
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
              <span className="g-label">{f.kind}</span>
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
          <div className="g-label" style={{ color: "var(--g-citron)" }}>
            Planted
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
            It surfaces in the “just posted” rotation within the minute — rotation,
            not merit. Support can be money, hands, or honest ears; whoever shows
            up lands in the credits on the story page.
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
      const openTitles = PROJECTS.filter(
        (pr) => pr.kind === "passion" && pr.byId === persona.id
      ).map((pr) => pr.title);
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
                : "Take a seat"}
            </div>
            <div className="g-h" style={{ fontSize: atCap ? 24 : 26, marginTop: 8 }}>
              {atCap ? capHeadline : "Start your first project"}
            </div>

            {/* The CanResult, verbatim: reason … */}
            <p style={{ fontSize: 15, color: "var(--g-body)", marginTop: 12 }}>{gate.reason}</p>

            {/* … limit and used … */}
            <p className="g-credit" style={{ marginTop: 12 }}>
              active passion projects · <b>{gate.used} of {gate.limit}</b>
            </p>

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
                <span className="g-mono" style={{ color: "var(--g-citron)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
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
          Let the work speak first
        </h1>
        <div style={{ marginTop: 18 }}>
          <DropZone text="Drop a cover image or video — the work leads, the words follow" />
          <p className="g-hint" style={{ marginTop: 6 }}>
            Title and one-liner draft themselves from what you upload — yours to
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
        <Field label="The ask (one line)" hint="Money, hands, or honest ears — say which.">
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
            Plant it
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
        <div className="g-label" style={{ color: "var(--g-citron)" }}>
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
          {Math.round(SPLITS.patronage.platform * 100)}% keeps the place on — in
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
