// /demo — the cast of characters and where each flow starts.

import { Link } from "react-router";
import { useDemo } from "../garden/demo-context";
import { PERSONAS, PERSONA_TAGLINE } from "../garden/demo-data";
import { IconSeat, IconSpark, IconCredit, IconTable, IconLedger } from "../garden/icons";

const FLOWS = [
  {
    to: "/demo/join",
    title: "Join — make · fund · place · gather",
    note: "Signup order, tier chooser, checkout that ends in an invitation.",
    as: "Walk as Maya (free)",
    Icon: IconSeat,
  },
  {
    to: "/demo/create",
    title: "Create — passion vs. paid, and the gates",
    note: "Every denial shows its reason, the limit, and the path through.",
    as: "Walk as Maya, then Tessa (at her cap)",
    Icon: IconSpark,
  },
  {
    to: "/demo/patron",
    title: "Patron — two doors, coverage codes, QR",
    note: "Cover Shua by name, or cover a seat and we'll seat a creative.",
    as: "Walk as Diane (patron)",
    Icon: IconCredit,
  },
  {
    to: "/demo/host",
    title: "Host — the table wizard",
    note: "Free-door rule enforced; the QR link that spawns a table.",
    as: "Walk as Marcus (host)",
    Icon: IconTable,
  },
  {
    to: "/demo/host/dashboard",
    title: "Host dashboard — people, attendance, money",
    note: "Provenance on every member; the ledger that lands at $324.",
    as: "Walk as Marcus (host)",
    Icon: IconLedger,
  },
];

export default function DemoIndex() {
  const { persona, setPersonaId } = useDemo();
  return (
    <main>
      <h1 className="g-h" style={{ marginTop: 28 }}>
        The product, <span className="g-accent">walkable.</span>
      </h1>
      <p style={{ marginTop: 14, maxWidth: "58ch" }}>
        One San Diego cast, five flows. Pick who you're walking as on the bar
        below — the gates, prices, and credits change with your seat, exactly as
        the entitlement matrix says they should.
      </p>

      <div className="g-label" style={{ marginTop: 36 }}>
        The cast
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, marginTop: 12 }}>
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            className="g-card"
            onClick={() => setPersonaId(p.id)}
            style={{
              textAlign: "left",
              background: p.id === persona.id ? "#1a1a18" : "transparent",
              cursor: "pointer",
            }}
          >
            <div className="g-h" style={{ fontSize: 18 }}>
              {p.name}
            </div>
            <div className="g-hint" style={{ marginTop: 6 }}>
              {PERSONA_TAGLINE[p.id]}
            </div>
          </button>
        ))}
      </div>

      <div className="g-label" style={{ marginTop: 40 }}>
        The flows
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {FLOWS.map((f) => (
          <Link
            key={f.to}
            to={f.to}
            className="g-card"
            style={{ textDecoration: "none", display: "block" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <f.Icon size={20} className="g-ic" />
              <div className="g-h" style={{ fontSize: 19 }}>
                {f.title}
              </div>
            </div>
            <p style={{ fontSize: 15, marginTop: 6 }}>{f.note}</p>
            <div className="g-credit" style={{ marginTop: 8 }}>
              <b>{f.as}</b>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
