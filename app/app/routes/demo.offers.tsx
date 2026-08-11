// /demo/offers — the offers directory: one shape for "a standing thing you
// can take someone up on," whether it comes from a place or a person.
// Mock spec: docs/mocks/partner-light.html (PL3) · extended to people 2026-08-10.
// Client-only, read-only against demo-data — no loaders, no mutation.

import { useDemo } from "../garden/demo-context";
import { OFFERS, TABLES } from "../garden/demo-data";
import { IconPeople, IconPlace } from "../garden/icons";

const FORMAT_TABLE_IDS = ["winter-cohort", "critique-table", "pathfinding-fall"];
const FORMAT_TABLES = TABLES.filter((t) => FORMAT_TABLE_IDS.includes(t.id));

// ————— Small pieces —————

function OfferCard({ offer }: { offer: (typeof OFFERS)[number] }) {
  const ByIcon = offer.byKind === "person" ? IconPeople : IconPlace;
  return (
    <div
      className="g-card"
      style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {offer.photo && <img src={offer.photo} alt={offer.by} className="g-photo" />}
      <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ByIcon size={18} className="g-ic" />
          <div className="g-h" style={{ fontSize: 17 }}>
            {offer.by}
          </div>
        </div>
        <div className="g-credit">
          {offer.where}
          {!offer.claimed && " · unclaimed"}
        </div>
        {offer.program && (
          <div className="g-credit">
            <b>{offer.program}</b>
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginTop: 8,
            paddingTop: 10,
            borderTop: "1px solid var(--g-hairline)",
            flexWrap: "wrap",
          }}
        >
          <span
            className="g-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--g-citron)",
              minWidth: 70,
            }}
          >
            {offer.kind}
          </span>
          <span style={{ flex: 1, fontSize: 14, color: "var(--g-body)" }}>{offer.desc}</span>
          {offer.price && (
            <span className="g-mono" style={{ fontSize: 11, color: "var(--g-paper)" }}>
              {offer.price}
            </span>
          )}
          <span
            className="g-mono"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--g-dim)",
            }}
          >
            {offer.cadence}
          </span>
        </div>
      </div>
    </div>
  );
}

function LivesCell({ label, line }: { label: string; line: string }) {
  return (
    <div className="g-cell">
      <div className="g-label" style={{ color: "var(--g-citron)" }}>
        {label}
      </div>
      <p style={{ fontSize: 13.5, marginTop: 6 }}>{line}</p>
    </div>
  );
}

function FormatTableCard({ table }: { table: (typeof TABLES)[number] }) {
  return (
    <div className="g-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div className="g-h" style={{ fontSize: 17 }}>
          {table.name}
        </div>
        {table.format && <span className="g-badge g-badge-line">{table.format}</span>}
      </div>
      {table.program && (
        <div className="g-credit" style={{ marginTop: 6 }}>
          <b>{table.program}</b>
        </div>
      )}
      <div
        className="g-mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--g-dim)",
          marginTop: 10,
        }}
      >
        {table.mode} · {table.cadence}
      </div>
      <div className="g-hint" style={{ marginTop: 6 }}>
        {table.roster} at the table
      </div>
    </div>
  );
}

// ————— The page —————

export default function OffersDirectory() {
  const { persona } = useDemo();
  const canList = persona.partnerRole || persona.level === "host";

  return (
    <main>
      <div className="g-label" style={{ marginTop: 28 }}>
        Offers · San Diego
      </div>
      <h1 className="g-h" style={{ marginTop: 10 }}>
        What&rsquo;s on <span className="g-accent">offer.</span>
      </h1>
      <p style={{ marginTop: 14, maxWidth: "60ch" }}>
        Offers are standing things you can take someone up on — space, gear,
        an audience, coaching. Places list them and so do people; this
        directory holds both.
      </p>

      {/* ————— Directory ————— */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 14,
          marginTop: 32,
        }}
      >
        {OFFERS.map((offer) => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </div>
      <p className="g-hint" style={{ marginTop: 14 }}>
        Listed by hosts and by the people themselves · unclaimed listings
        marked · every offer here is a conversation someone already had.
      </p>

      {/* ————— Where an offer lives ————— */}
      <div className="g-label" style={{ marginTop: 44 }}>
        Where an offer lives
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <LivesCell
          label="This directory"
          line="Every open offer in the city, browsable without an account."
        />
        <LivesCell
          label="Their profile"
          line="The full listing for that person or place — every offer they have."
        />
        <LivesCell
          label="Their Table page"
          line="Offers tied to a Table show up there too, next to its roster and cadence."
        />
      </div>

      {/* ————— Format tags ————— */}
      <div className="g-label" style={{ marginTop: 44 }}>
        Tables carry format tags
      </div>
      <p style={{ marginTop: 10, maxWidth: "60ch" }}>
        A Table's mode still governs who can join. The format tag is the
        word a visitor actually reads on the card.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        {FORMAT_TABLES.map((table) => (
          <FormatTableCard key={table.id} table={table} />
        ))}
      </div>
      <p className="g-hint" style={{ marginTop: 14 }}>
        Format is the label people read; open, member, or cohort is what the
        machinery uses underneath.
      </p>

      {/* ————— List an offer ————— */}
      <div style={{ marginTop: 44 }}>
        {canList ? (
          <button className="g-btn g-btn-ghost">List an offer</button>
        ) : (
          <p className="g-hint">
            Hosts and partners can list an offer from their own dashboard.
          </p>
        )}
      </div>
    </main>
  );
}
