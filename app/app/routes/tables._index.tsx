import { useMemo, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { Link, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  CommunityContextLine,
  useCommunityContext,
} from "../components/CommunityFilter";
import { TableCard } from "../tables/TableCard";
import { filterTables } from "../tables/presentation";
import "../tables/tables.css";

export function meta() {
  return [{ title: "Tables — Creative Exchange" }];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <main className="tables-page">
      <h1 className="tables-heading">Tables</h1>
      <p className="tables-error" role="alert">
        We couldn't load Tables. Please refresh to try again.
      </p>
    </main>
  );
}

export default function TablesIndex() {
  const tables = useQuery(api.garden.tables.listTables, {});
  const { isAuthenticated } = useConvexAuth();
  const [params] = useSearchParams();
  const mine = params.get("view") === "mine";
  const myTables = useQuery(
    api.garden.tables.listMyTables,
    isAuthenticated ? {} : "skip",
  );
  const {
    selected: community,
    setSelected,
    communities,
  } = useCommunityContext();
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("All");
  const [free, setFree] = useState(false);
  const [online, setOnline] = useState(false);
  const [month, setMonth] = useState(false);
  const [location, setLocation] = useState("");
  const source = mine ? myTables : tables;
  const topics = useMemo(
    () => [
      "All",
      ...new Set(
        (source ?? [])
          .map((table) => table.format)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [source],
  );
  const shown = filterTables(
    source ?? [],
    { search, topic, free, online, month, location, community },
    Date.now(),
  );
  const viewUrl = (view?: string) => {
    const next = new URLSearchParams(params);
    if (view) next.set("view", view);
    else next.delete("view");
    return `/tables${next.size ? `?${next}` : ""}`;
  };

  return (
    <main className="tables-page">
      <header className="tables-header">
        <div>
          <span className="tables-eyebrow">Creative Exchange</span>
          <h1 className="tables-heading">Tables</h1>
          <p className="tables-intro">
            Find your people. Make something, learn something, pull up a chair.
          </p>
        </div>
        <Link className="tables-button" to="/tables/new">
          + Set a Table
        </Link>
      </header>
      <nav className="tables-tabs" aria-label="Tables views">
        <Link
          className="tables-tab"
          aria-current={!mine ? "page" : undefined}
          to={viewUrl()}
        >
          Find a Table
        </Link>
        <Link
          className="tables-tab"
          aria-current={mine ? "page" : undefined}
          to={viewUrl("mine")}
        >
          Your Tables{myTables ? ` · ${myTables.length}` : ""}
        </Link>
      </nav>
      <CommunityContextLine
        variant="app"
        selected={community}
        setSelected={setSelected}
        communities={communities}
        rows={tables}
      />
      {mine && !isAuthenticated ? (
        <div className="tables-empty">
          <p>Sign in to see the Tables you've joined or host.</p>
          <Link
            className="tables-button tables-button-primary"
            to="/login?redirect=%2Ftables%3Fview%3Dmine"
          >
            Sign in
          </Link>
        </div>
      ) : source === undefined ? (
        <p className="tables-note" role="status">
          Loading Tables…
        </p>
      ) : (
        <>
          <div className="tables-filters">
            <div className="tables-filter-row">
              <label className="tables-search">
                <span className="sr-only">Search Tables</span>
                <input
                  className="tables-input"
                  placeholder="Search topic, Table or host…"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button
                className="tables-chip"
                type="button"
                aria-pressed={free}
                onClick={() => setFree(!free)}
              >
                Free
              </button>
              <button
                className="tables-chip"
                type="button"
                aria-pressed={online}
                onClick={() => setOnline(!online)}
              >
                Online
              </button>
              <button
                className="tables-chip"
                type="button"
                aria-pressed={month}
                onClick={() => setMonth(!month)}
              >
                This month
              </button>
              <label className="tables-location-filter">
                <span className="sr-only">Filter by location</span>
                <input
                  className="tables-input"
                  value={location}
                  placeholder="City or venue"
                  onChange={(event) => setLocation(event.target.value)}
                />
              </label>
            </div>
            {topics.length > 1 && (
              <div className="tables-filter-row" aria-label="Topics">
                {topics.map((value) => (
                  <button
                    className="tables-chip"
                    key={value}
                    type="button"
                    aria-pressed={topic === value}
                    onClick={() => setTopic(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="tables-count" aria-live="polite">
            {shown.length} {shown.length === 1 ? "Table" : "Tables"}
            {mine ? " in your collection" : " to explore"}
          </p>
          {shown.length ? (
            <div className="tables-grid">
              {shown.map((table) => (
                <TableCard key={table._id} table={table} joined={mine} />
              ))}
            </div>
          ) : (
            <div className="tables-empty">
              <h2 className="tables-subheading">
                {source.length
                  ? "No Tables match these filters"
                  : mine
                    ? "Your chair is waiting"
                    : "Make room for something new"}
              </h2>
              <p>
                {source.length
                  ? "Try a different topic, date or location."
                  : mine
                    ? "Explore a Table to join, or set a free one-time Table of your own."
                    : "Set the first Table: a free one-time gathering starts with you."}
              </p>
              <Link
                className="tables-button"
                to={mine ? "/tables" : "/tables/new"}
              >
                {mine ? "Find a Table" : "Set a Table"}
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
