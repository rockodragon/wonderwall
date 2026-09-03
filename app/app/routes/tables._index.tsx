// /tables — the public tables browse page (spec §1.5): the first production
// surface for "a roster with your name on it." Format filter chips reuse the
// demo.app.tsx chip pattern (aria-pressed, one active at a time).

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenPage,
  GardenNav,
  formatMoney,
} from "../garden/ui";
import {
  CommunityContextLine,
  communityNameFor,
  useCommunityContext,
} from "../components/CommunityFilter";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Tables — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenNav active="Tables" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="Tables isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type TableRow = {
  _id: string;
  name: string;
  slug: string;
  mode: string;
  format?: string;
  program?: string;
  cadence?: string;
  blurb?: string;
  photoUrl?: string;
  priceCents?: number;
  memberCount: number;
  community?: { name: string; slug: string } | null;
};

function FilterChips({
  options,
  active,
  onSelect,
}: {
  options: readonly string[];
  active: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className="g-demo-chip"
          data-active={active === opt}
          aria-pressed={active === opt}
          onClick={() => onSelect(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function TableCard({ table }: { table: TableRow }) {
  return (
    <Link
      to={`/tables/${table.slug}`}
      aria-label={table.name}
      className="g-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      {table.format && <span className="g-badge g-badge-line">{table.format}</span>}
      <div className="g-h" style={{ fontSize: 17, marginTop: 10 }}>
        {table.name}
      </div>
      {table.program && (
        <div className="g-credit" style={{ marginTop: 6 }}>
          <b>{table.program}</b>
        </div>
      )}
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
      <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: "var(--g-muted)" }}>
        {table.memberCount} on the roster
        {table.priceCents ? ` · ${formatMoney(table.priceCents)}` : ""}
      </p>
      {table.community && (
        <div className="g-credit" style={{ marginTop: 6 }}>
          in {table.community.name}
        </div>
      )}
    </Link>
  );
}

export default function TablesIndex() {
  const tables = useQuery(api.garden.tables.listTables, {}) as TableRow[] | undefined;
  const [filter, setFilter] = useState("All");
  const { selected: communitySlug, setSelected: setCommunitySlug, communities } =
    useCommunityContext();

  const formats = useMemo(() => {
    if (!tables) return [];
    return [...new Set(tables.map((t) => t.format).filter((f): f is string => !!f))];
  }, [tables]);

  const filterOptions = ["All", ...formats];

  if (tables === undefined) {
    return (
      <GardenPage wide>
        <GardenNav active="Tables" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (tables.length === 0) {
    return (
      <GardenPage wide>
        <GardenNav active="Tables" />
        <div style={{ marginTop: 28, maxWidth: "50ch" }}>
          <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
            Tables
          </h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6 }}>
            Tables are coming — the first ones open this fall.
          </p>
        </div>
      </GardenPage>
    );
  }

  const byFormat = filter === "All" ? tables : tables.filter((t) => t.format === filter);
  const shown =
    communitySlug === "all"
      ? byFormat
      : byFormat.filter((t) => t.community?.slug === communitySlug);

  return (
    <GardenPage wide>
      <GardenNav active="Tables" />
      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Tables
        </h1>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, maxWidth: "58ch" }}>
          Groups you join and keep coming back to — classes, cohorts, critique
          nights.
        </p>
      </div>

      <CommunityContextLine
        variant="garden"
        selected={communitySlug}
        setSelected={setCommunitySlug}
        communities={communities}
        rows={tables}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <FilterChips options={filterOptions} active={filter} onSelect={setFilter} />
      </div>

      {shown.length === 0 && communitySlug !== "all" ? (
        <div style={{ marginTop: 20, fontSize: 14.5 }}>
          Nothing in {communityNameFor(communitySlug, communities, tables)} yet — see
          everything.{" "}
          <button
            type="button"
            onClick={() => setCommunitySlug("all")}
            className="g-mono"
            style={{
              color: "var(--g-citron)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Show all
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          {shown.map((t) => (
            <TableCard key={t._id} table={t} />
          ))}
        </div>
      )}
    </GardenPage>
  );
}
