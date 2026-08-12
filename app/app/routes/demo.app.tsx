// /demo/app — the app-shell navigation mock. Not a flow: this is the frame
// itself, primary nav + a browse screen per nav item. The open question this
// page exists to test: does "Tables" work as the home for classes, or is it
// confusing next to Events (which also carries one-off workshops)?
// Client-only, read-only against demo-data — no loaders, no mutation.

import { useState, type ReactNode } from "react";
import { useDemo } from "../garden/demo-context";
import { PROJECTS, TABLES, OFFERS, type DemoProject, type DemoTable } from "../garden/demo-data";
import { IconEvent, IconPeople, IconPlace } from "../garden/icons";

// ————— Glue data: two small items not in demo-data.ts, kept local and
// named so they're easy to spot. Everything else below is PROJECTS / TABLES
// / OFFERS as-is. —————

const FIRST_EVENT = {
  title: "A table for the ones making things",
  date: "Thu Sep",
  price: "Free",
};

const WORKSHOP_EVENT = {
  title: "Hearing God in the Edit",
  sub: "One-evening workshop · Abiding Practice",
  program: "Pathfinding · Abiding Practice",
  price: "$15",
};

const OPEN_MIC_EVENT = {
  title: "Songwriters' night at Grounds & Common",
  venue: "Partner venue · walk in",
  price: "Free",
};

const NAV_ITEMS = ["Buzz", "Projects", "Events", "Tables", "Offers"] as const;
type NavItem = (typeof NAV_ITEMS)[number];

const TABLE_FILTERS = ["All", "Class", "Critique", "Open mic"] as const;

// ————— Small shared pieces —————

function KindBadge({ project }: { project: DemoProject }) {
  return project.kind === "passion" ? (
    <span className="g-badge g-badge-line">Passion</span>
  ) : (
    <span className="g-badge g-badge-citron">Paid · ${project.budget?.toLocaleString()}</span>
  );
}

function FormatBadge({ children }: { children: string }) {
  return <span className="g-badge g-badge-line">{children}</span>;
}

function MetaLine({ children }: { children: ReactNode }) {
  return (
    <div
      className="g-mono"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--g-dim)",
      }}
    >
      {children}
    </div>
  );
}

// ————— Sections —————

function BuzzSection() {
  const justPosted = PROJECTS.slice(0, 3);
  return (
    <div>
      <div className="g-label">This week in San Diego</div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          border: "1px solid var(--g-hairline)",
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <IconEvent size={16} className="g-ic" />
        <span className="g-h" style={{ fontSize: 15.5 }}>
          {FIRST_EVENT.title}
        </span>
        <MetaLine>
          {FIRST_EVENT.date} · {FIRST_EVENT.price}
        </MetaLine>
      </div>

      <div className="g-label" style={{ marginTop: 28 }}>
        Just posted
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {justPosted.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--g-hairline)", borderRadius: 8, padding: 12 }}>
            {p.photo && <img src={p.photo} alt={p.title} className="g-photo-strip" />}
            <div className="g-h" style={{ fontSize: 15, marginTop: 10 }}>
              {p.title}
            </div>
            <div className="g-credit" style={{ marginTop: 6 }}>
              {p.byLine}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsSection() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 14,
      }}
    >
      {PROJECTS.map((p) => (
        <div key={p.id} className="g-card" style={{ padding: 0, overflow: "hidden" }}>
          {p.photo && <img src={p.photo} alt={p.title} className="g-photo" />}
          <div style={{ padding: "16px 18px 18px" }}>
            <KindBadge project={p} />
            <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
              {p.title}
            </div>
            <div className="g-credit" style={{ marginTop: 6 }}>
              {p.byLine}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>{p.blurb}</p>
            {p.kind === "passion" && p.backers && (
              <div className="g-hint" style={{ marginTop: 10 }}>
                Behind it: {p.backers.join(", ")}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsSection() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 14,
      }}
    >
      <div className="g-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div className="g-h" style={{ fontSize: 16.5 }}>
            {FIRST_EVENT.title}
          </div>
          <FormatBadge>Gathering</FormatBadge>
        </div>
        <MetaLine>
          {FIRST_EVENT.date} · {FIRST_EVENT.price}
        </MetaLine>
      </div>

      <div className="g-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div className="g-h" style={{ fontSize: 16.5 }}>
            {WORKSHOP_EVENT.title}
          </div>
          <FormatBadge>Workshop</FormatBadge>
        </div>
        <div className="g-credit" style={{ marginTop: 6 }}>
          {WORKSHOP_EVENT.sub}
        </div>
        <div className="g-credit" style={{ marginTop: 4 }}>
          <b>{WORKSHOP_EVENT.program}</b>
        </div>
        <MetaLine>{WORKSHOP_EVENT.price}</MetaLine>
      </div>

      <div className="g-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div className="g-h" style={{ fontSize: 16.5 }}>
            {OPEN_MIC_EVENT.title}
          </div>
          <FormatBadge>Open mic</FormatBadge>
        </div>
        <div className="g-credit" style={{ marginTop: 6 }}>
          {OPEN_MIC_EVENT.venue}
        </div>
        <MetaLine>{OPEN_MIC_EVENT.price}</MetaLine>
      </div>
    </div>
  );
}

function TableCard({ table }: { table: DemoTable }) {
  return (
    <div className="g-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {table.format && <FormatBadge>{table.format}</FormatBadge>}
      </div>
      <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
        {table.name}
      </div>
      {table.program && (
        <div className="g-credit" style={{ marginTop: 6 }}>
          <b>{table.program}</b>
        </div>
      )}
      <MetaLine>{table.cadence}</MetaLine>
      <div className="g-hint" style={{ marginTop: 8 }}>
        {table.roster} on the roster
      </div>
      <MetaLine>{table.mode}</MetaLine>
    </div>
  );
}

function TablesSection() {
  const [filter, setFilter] = useState<(typeof TABLE_FILTERS)[number]>("All");
  const shown = filter === "All" ? TABLES : TABLES.filter((t) => t.format === filter);

  return (
    <div>
      <p style={{ maxWidth: "58ch" }}>
        Ongoing gatherings with a roster — classes, critique nights, mentorship groups.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {TABLE_FILTERS.map((f) => (
          <button
            key={f}
            className="g-demo-chip"
            data-active={filter === f}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 14,
          marginTop: 16,
        }}
      >
        {shown.map((t) => (
          <TableCard key={t.id} table={t} />
        ))}
      </div>
    </div>
  );
}

function CompactOfferCard({ offer }: { offer: (typeof OFFERS)[number] }) {
  const ByIcon = offer.byKind === "person" ? IconPeople : IconPlace;
  return (
    <div className="g-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ByIcon size={16} className="g-ic" />
        <div className="g-h" style={{ fontSize: 15 }}>
          {offer.by}
        </div>
      </div>
      <div className="g-credit" style={{ marginTop: 6 }}>
        {offer.where}
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--g-hairline)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            className="g-badge g-badge-line"
            style={{ color: "var(--g-citron)", borderColor: "#3a3a36" }}
          >
            {offer.kind}
          </span>
          {offer.price && <span className="g-badge g-badge-line">{offer.price}</span>}
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>{offer.desc}</p>
        <MetaLine>{offer.cadence}</MetaLine>
      </div>
    </div>
  );
}

function OffersSection() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
        gap: 12,
      }}
    >
      {OFFERS.map((o) => (
        <CompactOfferCard key={o.id} offer={o} />
      ))}
    </div>
  );
}

// ————— App top bar —————

function TopBar({ active, onSelect }: { active: NavItem; onSelect: (n: NavItem) => void }) {
  const { persona } = useDemo();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
        padding: "14px 20px",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <span className="g-wordmark" style={{ fontSize: 11 }}>
        The Garden
      </span>
      <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", flex: 1 }}>
        {NAV_ITEMS.map((n) => (
          <button
            key={n}
            onClick={() => onSelect(n)}
            className="g-mono"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "4px 0",
              color: active === n ? "var(--g-citron)" : "var(--g-body)",
              borderBottom: active === n ? "2px solid var(--g-citron)" : "2px solid transparent",
            }}
          >
            {n}
          </button>
        ))}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          className="g-mono"
          title="Unread messages"
          style={{
            fontSize: 10,
            border: "1px solid var(--g-hairline)",
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--g-body)",
          }}
        >
          2
        </span>
        <span
          className="g-mono"
          title={persona.name}
          style={{
            fontSize: 10,
            border: "1px solid var(--g-hairline)",
            borderRadius: "50%",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--g-paper)",
          }}
        >
          {persona.name.charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// ————— The page —————

export default function AppShellMock() {
  const [active, setActive] = useState<NavItem>("Buzz");

  return (
    <main>
      <div className="g-label" style={{ marginTop: 28 }}>
        App shell · navigation mock
      </div>
      <p style={{ marginTop: 10, maxWidth: "62ch" }}>
        This is the app frame — switch sections with the nav; walk as different personas on the bar below.
      </p>

      <div
        style={{
          marginTop: 24,
          border: "1px solid var(--g-hairline)",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--g-ink)",
        }}
      >
        <TopBar active={active} onSelect={setActive} />
        <div style={{ padding: "22px 20px 26px" }}>
          {active === "Buzz" && <BuzzSection />}
          {active === "Projects" && <ProjectsSection />}
          {active === "Events" && <EventsSection />}
          {active === "Tables" && <TablesSection />}
          {active === "Offers" && <OffersSection />}
        </div>
      </div>

      <p className="g-hint" style={{ marginTop: 16, maxWidth: "62ch" }}>
        Classes live under Tables and Events, labeled by format tags; coaching lives under Offers.
        Search, Messages, and Profile are omitted from this mock on purpose.
      </p>
    </main>
  );
}
