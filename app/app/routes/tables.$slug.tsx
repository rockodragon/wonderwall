// /tables/:slug — a single table's public page (spec §1.5): who's on the
// roster, what's coming up, and the join path. Meeting links only ever
// appear for roster members (server-enforced in tables.ts's
// visibleMeetingUrl) — this page just renders whatever the query hands back,
// it never has the link to withhold on its own.

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, useParams, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DenialPanel,
  FactRow,
  GardenErrorState,
  GardenLoading,
  GardenPage,
  GardenWordmark,
  SectionLabel,
  formatDateTime,
  formatDuration,
} from "../garden/ui";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Table — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError();
  return (
    <GardenPage>
      <GardenWordmark />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="This table isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

const MODE_LINE: Record<string, string> = {
  open: "Anyone can join, account or not.",
  member: "A seat gets you a place at it — no walk-ins.",
  cohort: "A fixed group for a fixed term.",
};

type Session = {
  _id: Id<"tableSessions">;
  title?: string;
  startsAt: number;
  durationMins?: number;
  meetingUrl?: string;
};

function SessionRow({
  session,
  isMember,
  isAuthenticated,
}: {
  session: Session;
  isMember: boolean;
  isAuthenticated: boolean;
}) {
  const rsvpSession = useMutation(api.garden.tables.rsvpSession);
  const [status, setStatus] = useState<"going" | "out" | null>(null);
  const [pending, setPending] = useState(false);

  const duration = formatDuration(session.durationMins);

  async function rsvp(next: "going" | "out") {
    setPending(true);
    try {
      await rsvpSession({ sessionId: session._id, status: next });
      setStatus(next);
    } catch {
      // Warm, silent-ish failure — the RSVP just doesn't stick; the button
      // stays available to try again rather than surfacing a stack trace.
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      style={{
        padding: "14px 0",
        borderBottom: "1px solid var(--g-hairline)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 14.5, color: "var(--g-paper)" }}>
          {formatDateTime(session.startsAt)}
        </span>
        {duration && (
          <span className="g-mono" style={{ fontSize: 10.5, color: "var(--g-dim)" }}>
            {duration}
          </span>
        )}
        {session.title && (
          <span style={{ fontSize: 13.5, color: "var(--g-muted)" }}>{session.title}</span>
        )}
      </div>

      {session.meetingUrl ? (
        <a
          href={session.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="g-btn g-btn-citron"
          style={{ marginTop: 10, display: "inline-block" }}
        >
          Join link →
        </a>
      ) : (
        <p className="g-hint" style={{ marginTop: 8 }}>
          Join link visible to members.
        </p>
      )}

      {isMember && isAuthenticated && (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="g-btn g-btn-ghost"
            disabled={pending}
            aria-pressed={status === "going"}
            onClick={() => rsvp("going")}
          >
            Going
          </button>
          <button
            type="button"
            className="g-btn g-btn-ghost"
            disabled={pending}
            aria-pressed={status === "out"}
            onClick={() => rsvp("out")}
          >
            Can't make it
          </button>
          {status && (
            <span className="g-hint">
              {status === "going" ? "You're down as going." : "Marked — you're out."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function JoinPanel({
  tableId,
  mode,
  priceCents,
  isMember,
  canJoin,
}: {
  tableId: Id<"gardenTables">;
  mode: string;
  priceCents?: number;
  isMember: boolean;
  canJoin: { allowed: boolean; reason?: string; upgradePath?: string };
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const joinTable = useMutation(api.garden.tables.joinTable);
  const [note, setNote] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <Link to="/login" className="g-btn g-btn-ghost">
        Sign in to join
      </Link>
    );
  }

  if (isMember) {
    return <p style={{ fontSize: 14.5, color: "var(--g-paper)" }}>You're on the roster.</p>;
  }

  if (!canJoin.allowed) {
    return <DenialPanel reason={canJoin.reason} upgradePath={canJoin.upgradePath} />;
  }

  async function handleJoin() {
    setJoining(true);
    try {
      const result = await joinTable({ tableId });
      setNote(
        result.paymentPending
          ? "Seat held — an operator will follow up on payment."
          : "Joined.",
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't join — try again.");
    } finally {
      setJoining(false);
    }
  }

  const label =
    mode === "cohort" && priceCents
      ? `Join — ${(priceCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}`
      : "Join";

  return (
    <div>
      <button className="g-btn g-btn-citron" onClick={handleJoin} disabled={joining}>
        {joining ? "Joining…" : label}
      </button>
      {note && <p style={{ marginTop: 12, fontSize: 13.5, color: "var(--g-citron)" }}>{note}</p>}
    </div>
  );
}

export default function TableDetailPage() {
  const { slug } = useParams();
  const table = useQuery(api.garden.tables.getTable, slug ? { slug } : "skip");
  const { isAuthenticated } = useConvexAuth();

  if (table === undefined) {
    return (
      <GardenPage>
        <GardenWordmark />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (table === null) {
    return (
      <GardenPage>
        <GardenWordmark />
        <div style={{ marginTop: 28 }}>
          <GardenErrorState message="Check the link — this table isn't set up here." />
        </div>
      </GardenPage>
    );
  }

  return (
    <GardenPage>
      <GardenWordmark />

      <div style={{ marginTop: 28 }}>
        {table.format && <span className="g-badge g-badge-line">{table.format}</span>}
        <h1 className="g-h" style={{ marginTop: 12, fontSize: "clamp(28px,5vw,40px)" }}>
          {table.name}
        </h1>
        {table.program && (
          <div className="g-credit" style={{ marginTop: 8 }}>
            <b>{table.program}</b>
          </div>
        )}
        {table.blurb && (
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, maxWidth: "62ch" }}>
            {table.blurb}
          </p>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10, maxWidth: 460 }}>
        {table.cadence && <FactRow k="Cadence" v={table.cadence} />}
        <FactRow k="Mode" v={MODE_LINE[table.mode] ?? table.mode} />
      </div>

      <div style={{ marginTop: 24 }}>
        <SectionLabel>Roster</SectionLabel>
        <p style={{ marginTop: 8, fontSize: 14.5 }}>
          {table.roster.length === 0
            ? "No one's joined yet — be the first."
            : `${table.roster.join(", ")}.`}
        </p>
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionLabel>Upcoming sessions</SectionLabel>
        {table.sessions.length === 0 ? (
          <p style={{ marginTop: 12, fontSize: 14.5 }}>
            No sessions scheduled yet.
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {table.sessions.map((s) => (
              <SessionRow
                key={s._id}
                session={s}
                isMember={table.viewer.isMember}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 28 }}>
        <JoinPanel
          tableId={table._id}
          mode={table.mode}
          priceCents={table.priceCents}
          isMember={table.viewer.isMember}
          canJoin={table.viewer.canJoin}
        />
      </div>
    </GardenPage>
  );
}
