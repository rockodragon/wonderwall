import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "../../convex/_generated/api";
import { TableCard } from "./TableCard";

/** Lives below the existing desk layout so saved card placements stay intact. */
export function DeskTables({ inert = false }: { inert?: boolean }) {
  const tables = useQuery(api.garden.tables.listTables, {});
  if (!tables?.length) return null;
  return (
    <section
      className="tables-page"
      aria-label="Tables to gather around"
      inert={inert}
      style={{
        minHeight: 0,
        maxWidth: 1240,
        paddingTop: 24,
        paddingBottom: 100,
      }}
    >
      <header className="tables-header">
        <div>
          <span className="tables-eyebrow">Pull up a chair</span>
          <h2
            className="tables-heading"
            style={{ fontSize: 30, marginTop: 12 }}
          >
            Tables to gather around
          </h2>
        </div>
        <Link to="/tables" className="tables-button">
          Find a Table →
        </Link>
      </header>
      <div className="tables-grid">
        {tables.slice(0, 4).map((table) => (
          <TableCard
            key={table._id}
            table={table}
            joined={table.viewer.isMember}
          />
        ))}
      </div>
    </section>
  );
}
