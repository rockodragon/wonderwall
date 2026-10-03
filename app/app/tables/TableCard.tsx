import { Link } from "react-router";
import {
  fullnessSegments,
  tableBadge,
  tablePrice,
  type TableSummary,
} from "./presentation";
import "./tables.css";

export function ChairIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3v18M7 13h10v8" />
    </svg>
  );
}

export function TablePortrait({
  table,
  large = false,
  joined = false,
}: {
  table: TableSummary;
  large?: boolean;
  joined?: boolean;
}) {
  const reserved =
    table.capacity && typeof table.spotsRemaining === "number"
      ? table.capacity - table.spotsRemaining
      : table.memberCount;
  const occupied = fullnessSegments(reserved, table.capacity);
  return (
    <div className={`tables-portrait${large ? " tables-portrait-large" : ""}`}>
      <svg className="tables-ring" viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <circle
            key={index}
            cx="50"
            cy="50"
            r="47"
            fill="none"
            strokeWidth={joined && index === 9 ? "1.8" : "1.2"}
            strokeDasharray="24 272"
            transform={`rotate(${index * 36 - 90} 50 50)`}
            className={
              joined && index === 9
                ? "tables-ring-you"
                : index < occupied
                  ? "tables-ring-taken"
                  : "tables-ring-open"
            }
          />
        ))}
      </svg>
      {table.photoUrl ? (
        <img
          src={table.photoUrl}
          alt=""
          loading={large ? "eager" : "lazy"}
          className="tables-photo"
        />
      ) : (
        <div className="tables-photo tables-photo-empty" aria-hidden="true">
          <ChairIcon />
        </div>
      )}
      {joined && (
        <span className="tables-chair-marker" aria-label="You have a chair">
          <ChairIcon />
        </span>
      )}
    </div>
  );
}

export function TableCard({
  table,
  preview = false,
  joined = false,
}: {
  table: TableSummary;
  preview?: boolean;
  joined?: boolean;
}) {
  const content = (
    <>
      <TablePortrait table={table} joined={joined} />
      <h2 className="tables-card-title">{table.name || "Your Table"}</h2>
      {(table.host?.name || table.hostName || table.community?.name) && (
        <p className="tables-card-host">
          {table.host?.name || table.hostName || table.community?.name}
        </p>
      )}
      <div className="tables-card-meta">
        <span className="tables-badge">{tableBadge(table)}</span>
        <span>{tablePrice(table)}</span>
      </div>
      {(table.nextEvent?.datetime ??
        table.nextEventAt ??
        table.nextSessionAt) !== undefined && (
        <p className="tables-card-when">
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(
            table.nextEvent?.datetime ??
              table.nextEventAt ??
              table.nextSessionAt,
          )}
        </p>
      )}
      <p className="tables-card-capacity">
        {table.capacity
          ? `${table.spotsRemaining ?? Math.max(0, table.capacity - table.memberCount)} chairs available`
          : `${table.memberCount} joined`}
        {table.isOnline || table.nextEvent?.locationType === "online"
          ? " · Online"
          : (table.nextEvent?.location ?? table.location)
            ? ` · ${table.nextEvent?.location ?? table.location}`
            : ""}
      </p>
    </>
  );
  return preview ? (
    <article className="tables-card tables-card-preview">{content}</article>
  ) : (
    <Link
      className="tables-card"
      to={`/tables/${table.slug}`}
      aria-label={`${table.name}. ${tablePrice(table)}`}
    >
      {content}
    </Link>
  );
}
