// /garden — The Garden's front door and hub. Before this route, /tables,
// /fund/:slug, /story/:slug, and /c/:code were live but orphaned: reachable
// only by typed URL. This page links them together and is the one page
// that should actually get indexed (meta below carries no noindex).
//
// Same three-state discipline as the other production routes: loading
// (useQuery undefined), designed empties (no tables yet, fund not started),
// and an ErrorBoundary for "backend not deployed." Hooks stay above every
// return — a Rules-of-Hooks violation crashed a Garden page before.

import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
  SectionLabel,
  formatMoney,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "The Garden — where creative work gets funded" },
    {
      name: "description",
      content:
        "Kingdom-minded creatives get their work funded, find collaborators, and gather around real tables — in San Diego and wherever the next table opens.",
    },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage wide>
      <GardenNav active="Garden" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="The Garden isn't fully live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type TableRow = {
  _id: string;
  name: string;
  slug: string;
  format?: string;
  cadence?: string;
  memberCount: number;
};

function TableTeaser({ table }: { table: TableRow }) {
  return (
    <Link
      to={`/tables/${table.slug}`}
      aria-label={table.name}
      className="g-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      {table.format && <span className="g-badge g-badge-line">{table.format}</span>}
      <div className="g-h" style={{ fontSize: 16, marginTop: 10 }}>
        {table.name}
      </div>
      {table.cadence && (
        <div
          className="g-mono"
          style={{
            marginTop: 8,
            fontSize: 12.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--g-dim)",
          }}
        >
          {table.cadence}
        </div>
      )}
      <p style={{ marginTop: 8, fontSize: 14.5, color: "var(--g-muted)" }}>
        {table.memberCount} on the roster
      </p>
    </Link>
  );
}

function HowItWorksCell({
  role,
  line,
  price,
}: {
  role: string;
  line: string;
  price: string;
}) {
  return (
    <div className="g-cell">
      <div className="g-label">{role}</div>
      <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: "var(--g-body)" }}>
        {line}
      </p>
      <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--g-dim)" }}>{price}</p>
    </div>
  );
}

export default function GardenIndex() {
  // Both queries fire unconditionally — no early return sits above them.
  const tables = useQuery(api.garden.tables.listTables, {}) as TableRow[] | undefined;
  const fund = useQuery(api.garden.allocations.getFundPage, {
    hostOrgSlug: "abiding-practice",
  });

  const upcomingTables = tables?.slice(0, 3) ?? [];

  return (
    <GardenPage wide>
      <GardenNav active="Garden" />

      {/* Hero */}
      <div style={{ marginTop: 40, maxWidth: "62ch" }}>
        <h1 className="g-h" style={{ fontSize: "clamp(32px,6vw,52px)" }}>
          Nobody makes anything alone.
        </h1>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, maxWidth: "58ch" }}>
          The Garden is where Kingdom-minded creatives get their work funded,
          find collaborators, and gather around real tables — in San Diego
          and wherever the next table opens.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
          <Link to="/join" className="g-btn g-btn-citron">
            Take a seat — $10/mo
          </Link>
          <Link to="/garden/events" className="g-btn g-btn-ghost">
            See what's happening
          </Link>
        </div>
      </div>

      {/* What's happening */}
      <div style={{ marginTop: 56 }}>
        <SectionLabel>What's happening</SectionLabel>
        {tables === undefined ? (
          <div style={{ marginTop: 12 }}>
            <GardenLoading />
          </div>
        ) : upcomingTables.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14.5, maxWidth: "50ch" }}>
            The first tables open this fall. <Link to="/tables" style={{ color: "var(--g-citron)" }}>See what's planned →</Link>
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            {upcomingTables.map((t) => (
              <TableTeaser key={t._id} table={t} />
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div style={{ marginTop: 56 }}>
        <SectionLabel>How it works</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
            marginTop: 14,
          }}
        >
          <HowItWorksCell
            role="Creatives"
            line="A seat: start projects, apply to paid work, join tables."
            price="$10/mo"
          />
          <HowItWorksCell
            role="Patrons"
            line="Back a specific creative or project — 90% goes to the work."
            price="Free to hold, pay per act"
          />
          <HowItWorksCell
            role="Hosts"
            line="Gather people; get paid to run tables."
            price="$50/mo, waived once a table charges"
          />
        </div>
      </div>

      {/* The money, in the open */}
      <div style={{ marginTop: 56 }}>
        <SectionLabel>The money, in the open</SectionLabel>
        {fund === undefined ? (
          <div style={{ marginTop: 12 }}>
            <GardenLoading />
          </div>
        ) : fund && fund.totals.allTimeCents > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="g-cell g-cell-hot" style={{ maxWidth: 220 }}>
              <div className="g-cell-v">{formatMoney(fund.totals.allTimeCents)}</div>
              <div className="g-label" style={{ marginTop: 4 }}>
                Allocated, all-time
              </div>
            </div>
            <Link
              to="/fund/abiding-practice"
              style={{ display: "inline-block", marginTop: 14, fontSize: 14.5, color: "var(--g-citron)" }}
            >
              See the ledger →
            </Link>
          </div>
        ) : (
          <p style={{ marginTop: 12, fontSize: 14.5, maxWidth: "50ch" }}>
            Allocations are published in the open — the first ones land this
            fall.
          </p>
        )}
      </div>

      {/* Footer strip */}
      <div
        style={{
          marginTop: 64,
          paddingTop: 24,
          borderTop: "1px solid var(--g-hairline)",
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <a href="/about/" className="g-label" style={{ textDecoration: "none" }}>
          About
        </a>
        <Link to="/demo/app" className="g-label" style={{ textDecoration: "none" }}>
          Product walkthrough
        </Link>
        <Link to="/tables" className="g-label" style={{ textDecoration: "none" }}>
          Tables
        </Link>
        <Link to="/garden/events" className="g-label" style={{ textDecoration: "none" }}>
          Events
        </Link>
      </div>
    </GardenPage>
  );
}
