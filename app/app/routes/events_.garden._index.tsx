// /garden/events — the Garden events browse page (spec: guest RSVP closes
// the "/events/first-table still says email rickmoy@gmail.com" gap). Reuses
// events.ts's existing `list` query (already public — no auth check inside)
// rather than standing up a duplicate garden/eventsPublic.ts wrapper; see
// events_.garden.$id.tsx for the same reasoning on `get`.
//
// Registered as a top-level route at "garden/events" (not "/events" — that
// path is already claimed by the legacy app-shell route in routes.ts).
// Promoting this to /events is a follow-up decision, not made here.
//
// Same three-state shape as tables._index.tsx: loading (useQuery undefined),
// empty (no upcoming events), and the real list.

import { useQuery } from "convex/react";
import { Link, useRouteError } from "react-router";
import { api } from "../../convex/_generated/api";
import {
  GardenErrorState,
  GardenLoading,
  GardenNav,
  GardenPage,
  formatDateTime,
} from "../garden/ui";
import {
  CommunityContextLine,
  communityNameFor,
  useCommunityContext,
} from "../components/CommunityFilter";
import "../garden/garden.css";

export function meta() {
  return [
    { title: "Events — The Garden" },
    { name: "robots", content: "noindex" },
  ];
}

export function ErrorBoundary() {
  useRouteError(); // logged by the framework; the page just degrades warmly
  return (
    <GardenPage>
      <GardenNav active="Events" />
      <div style={{ marginTop: 28 }}>
        <GardenErrorState message="Events isn't live yet — check back soon." />
      </div>
    </GardenPage>
  );
}

type EventRow = {
  _id: string;
  title: string;
  datetime: number;
  location?: string;
  tags: string[];
  priceCents?: number;
  community?: { name: string; slug: string } | null;
};

/** The `events` table has no dedicated price field today — if one lands
    later (priceCents, or a "$"-style tag) this picks it up; until then
    every event reads as free, which is also just the truth right now. */
function costLine(event: EventRow): string {
  if (typeof event.priceCents === "number") {
    return event.priceCents > 0
      ? `$${(event.priceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`
      : "Free";
  }
  const priceTag = event.tags?.find((t) => /^\$\d/.test(t.trim()));
  if (priceTag) return priceTag.trim();
  return "Free";
}

function EventCard({ event }: { event: EventRow }) {
  return (
    <Link
      to={`/garden/events/${event._id}`}
      aria-label={event.title}
      className="g-card"
      style={{ display: "block", textDecoration: "none", color: "inherit" }}
    >
      <div className="g-h" style={{ fontSize: 17 }}>
        {event.title}
      </div>
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
        {formatDateTime(event.datetime)}
      </div>
      <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: "var(--g-muted)" }}>
        {event.location ?? "Location TBA"} · {costLine(event)}
      </p>
      {event.community && (
        <div className="g-credit" style={{ marginTop: 6 }}>
          in {event.community.name}
        </div>
      )}
    </Link>
  );
}

export default function GardenEventsIndex() {
  const events = useQuery(api.events.list, {
    status: "published",
    upcoming: true,
  }) as EventRow[] | undefined;
  const { selected: communitySlug, setSelected: setCommunitySlug, communities } =
    useCommunityContext();

  if (events === undefined) {
    return (
      <GardenPage wide>
        <GardenNav active="Events" />
        <div style={{ marginTop: 28 }}>
          <GardenLoading />
        </div>
      </GardenPage>
    );
  }

  if (events.length === 0) {
    return (
      <GardenPage wide>
        <GardenNav active="Events" />
        <div style={{ marginTop: 28, marginBottom: 24 }}>
          <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
            Events
          </h1>
          <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, maxWidth: "58ch" }}>
            Shows, workshops, open mics — pick a night and show up.
          </p>
        </div>
        <p style={{ fontSize: 14.5, maxWidth: "50ch" }}>
          The next gathering is being set — check back soon.{" "}
          <Link to="/garden" style={{ color: "var(--g-citron)" }}>
            Back to The Garden
          </Link>
        </p>
      </GardenPage>
    );
  }

  const shown =
    communitySlug === "all"
      ? events
      : events.filter((e) => e.community?.slug === communitySlug);

  return (
    <GardenPage wide>
      <GardenNav active="Events" />
      <div style={{ marginTop: 28, marginBottom: 24 }}>
        <h1 className="g-h" style={{ fontSize: "clamp(28px,5vw,40px)" }}>
          Events
        </h1>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, maxWidth: "58ch" }}>
          Shows, workshops, open mics — pick a night and show up.
        </p>
      </div>

      <CommunityContextLine
        variant="garden"
        selected={communitySlug}
        setSelected={setCommunitySlug}
        communities={communities}
        rows={events}
      />

      {shown.length === 0 ? (
        <div style={{ marginTop: 20, fontSize: 14.5 }}>
          Nothing in {communityNameFor(communitySlug, communities, events)} yet — see
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
          {shown.map((event) => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      )}
    </GardenPage>
  );
}
