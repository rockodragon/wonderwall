import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useParams, useRouteError, useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ChairIcon, TablePortrait } from "../tables/TableCard";
import { GuestRsvp } from "../tables/GuestRsvp";
import { HostManagement } from "../tables/HostManagement";
import { AddTableEvent } from "../tables/AddTableEvent";
import { tableBadge, tablePrice } from "../tables/presentation";
import "../tables/tables.css";

export function meta() {
  return [{ title: "Table — Creative Exchange" }];
}
export function ErrorBoundary() {
  useRouteError();
  return (
    <main className="tables-page">
      <h1 className="tables-heading">Table unavailable</h1>
      <p className="tables-error" role="alert">
        We couldn't load this Table. Please refresh or{" "}
        <Link to="/tables">explore Tables</Link>.
      </p>
    </main>
  );
}

export function ParticipationState({
  action,
  reason,
  priceCents,
  slug,
  pending,
  onJoin,
  onCheckout,
}: {
  action: string;
  reason?: string;
  priceCents?: number;
  slug: string;
  pending: boolean;
  onJoin: () => void;
  onCheckout: () => void;
}) {
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((priceCents ?? 0) / 100);
  if (action === "sign_in")
    return (
      <Link
        className="tables-button"
        to={`/login?redirect=${encodeURIComponent(`/tables/${slug}`)}`}
      >
        Sign in to pull up a chair
      </Link>
    );
  if (action === "joined")
    return (
      <p className="tables-status">
        <ChairIcon /> You have a chair.
      </p>
    );
  if (
    action === "join" ||
    action === "request" ||
    action === "accept_invitation"
  )
    return (
      <button
        type="button"
        className="tables-button tables-button-primary"
        disabled={pending}
        onClick={onJoin}
      >
        <ChairIcon />
        {pending
          ? "Saving…"
          : action === "request"
            ? "Ask for a chair"
            : action === "accept_invitation"
              ? "Take your seat"
              : "Pull Up a Chair"}
      </button>
    );
  if (action === "checkout")
    return (
      <button
        type="button"
        className="tables-button tables-button-primary"
        disabled={pending}
        onClick={onCheckout}
      >
        <ChairIcon />
        {pending ? "Opening checkout…" : `Pull Up a Chair · ${price}`}
      </button>
    );
  return (
    <p className="tables-note">
      {reason ||
        (action === "membership_required"
          ? "Membership in this Table's community is required."
          : action === "full"
            ? "This Table is full."
            : action === "closed"
              ? "Enrollment is closed."
              : action === "pending"
                ? "Your request is with the host."
                : "This Table isn't accepting participation right now.")}
    </p>
  );
}

function LegacySession({
  session,
  isMember,
}: {
  session: {
    _id: Id<"tableSessions">;
    title?: string;
    startsAt: number;
    durationMins?: number;
    meetingUrl?: string;
  };
  isMember: boolean;
}) {
  const rsvpSession = useMutation(api.garden.tables.rsvpSession);
  const [status, setStatus] = useState<"going" | "out" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function rsvp(next: "going" | "out") {
    setPending(true);
    setError("");
    try {
      await rsvpSession({ sessionId: session._id, status: next });
      setStatus(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save your RSVP. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="tables-session">
      <p className="tables-session-title">{session.title || "Gathering"}</p>
      <p className="tables-session-detail">
        {new Date(session.startsAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        {session.durationMins ? ` · ${session.durationMins} minutes` : ""}
      </p>
      {session.meetingUrl && (
        <a
          className="tables-button tables-button-small"
          href={session.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Join meeting ↗
        </a>
      )}
      {isMember && (
        <div className="tables-session-actions">
          <button
            type="button"
            className="tables-chip"
            disabled={pending}
            aria-pressed={status === "going"}
            onClick={() => rsvp("going")}
          >
            Going
          </button>
          <button
            type="button"
            className="tables-chip"
            disabled={pending}
            aria-pressed={status === "out"}
            onClick={() => rsvp("out")}
          >
            Can't make it
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="tables-error">
          {error}
        </p>
      )}
    </article>
  );
}

export default function TableDetailPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const table = useQuery(api.garden.tables.getTable, slug ? { slug } : "skip");
  const joinTable = useMutation(api.garden.tables.joinTable);
  const leaveTable = useMutation(api.garden.tables.leaveTable);
  const checkout = useAction(api.garden.stripe.createTableCheckout);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function join() {
    if (!table) return;
    setPending(true);
    setError("");
    try {
      await joinTable({ tableId: table._id });
      setMessage(
        table.viewer.action === "request"
          ? "Your request has been sent to the host."
          : "Your chair is ready.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't join this Table. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function pay() {
    if (!table) return;
    setPending(true);
    setError("");
    try {
      const result = await checkout({ tableId: table._id });
      if (!result.url)
        throw new Error("Checkout is unavailable. Please try again.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't open checkout. Please try again.",
      );
      setPending(false);
    }
  }
  async function leave() {
    if (!table) return;
    setPending(true);
    setError("");
    try {
      await leaveTable({ tableId: table._id });
      setMessage("You've left this Table.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't leave this Table. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  if (table === undefined)
    return (
      <main className="tables-page">
        <p role="status" className="tables-note">
          Loading Table…
        </p>
      </main>
    );
  if (!table)
    return (
      <main className="tables-page">
        <h1 className="tables-heading">We couldn't find this Table</h1>
        <p className="tables-intro">
          The link may have changed, or this Table may be private.
        </p>
        <Link className="tables-button" style={{ marginTop: 24 }} to="/tables">
          Explore Tables
        </Link>
      </main>
    );
  return (
    <main className="tables-page">
      <Link className="tables-note" to="/tables">
        ← Find a Table
      </Link>
      <div className="tables-detail">
        <div className="tables-detail-art">
          <TablePortrait table={table} large joined={table.viewer.isMember} />
        </div>
        <div className="tables-detail-copy">
          <span className="tables-eyebrow">
            {table.community?.name ?? "Creative Exchange"}
          </span>
          <h1 className="tables-heading">{table.name}</h1>
          <div className="tables-detail-meta">
            <span className="tables-badge">{tableBadge(table)}</span>
            <span>{tablePrice(table)}</span>
            {table.capacity && (
              <span>
                {table.spotsRemaining ??
                  Math.max(0, table.capacity - table.memberCount)}{" "}
                chairs available
              </span>
            )}
          </div>
          {table.host?.name && (
            <p className="tables-note">
              {table.hostRoleLabel || "Hosted"} by {table.host.name}
              {table.community ? (
                <>
                  {" "}
                  ·{" "}
                  <Link to={`/communities/${table.community.slug}`}>
                    {table.community.name}
                  </Link>
                </>
              ) : null}
            </p>
          )}
          {(table.description || table.blurb) && (
            <p className="tables-description">
              {table.description || table.blurb}
            </p>
          )}
          <section aria-label="Schedule">
            <h2 className="tables-subheading">Around this Table</h2>
            {table.events.length ? (
              table.events.map((event) => (
                <article key={event._id} className="tables-session">
                  <div className="tables-session-top">
                    <p className="tables-session-title">{event.title}</p>
                    <Link className="tables-note" to={`/events/${event._id}`}>
                      Event details ↗
                    </Link>
                  </div>
                  <p className="tables-session-detail">
                    {new Date(event.datetime).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {event.location
                      ? ` · ${event.location}`
                      : event.locationType === "online"
                        ? " · Online"
                        : ""}
                  </p>
                  <p className="tables-note" style={{ marginTop: 8 }}>
                    RSVP, calendar and joining details are on the Event page.
                  </p>
                  {table.viewer.canGuestRsvp && (
                    <GuestRsvp eventId={event._id} />
                  )}
                </article>
              ))
            ) : table.sessions.length ? (
              table.sessions.map((session) => (
                <LegacySession
                  key={session._id}
                  session={session}
                  isMember={table.viewer.isMember}
                />
              ))
            ) : (
              <p className="tables-note">No Events are scheduled yet.</p>
            )}
          </section>
          <section aria-label="Table roster">
            <h2 className="tables-subheading">People at this Table</h2>
            {table.viewer.canSeeRoster ? (
              table.rosterProfiles.length ? (
                <div className="tables-roster">
                  {table.rosterProfiles.map((person) => (
                    <Link
                      className="tables-roster-person"
                      to={`/profile/${person.profileId}`}
                      key={person.userId}
                    >
                      {person.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="tables-note">No participants have joined yet.</p>
              )
            ) : (
              <p className="tables-note">
                The roster is private. Accepted participants can see one another
                after joining and satisfying membership and payment
                requirements.
              </p>
            )}
          </section>
          <section
            className="tables-participation tables-participation-sticky"
            aria-label="Participation"
          >
            {table.viewer.action === "checkout" &&
            table.externalPaymentLinkUrl ? (
              <>
                <a
                  className="tables-button tables-button-primary"
                  href={table.externalPaymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Host signup page ↗
                </a>
                <p className="tables-note">
                  Enrollment is handled by the host. An external signup does not
                  automatically grant roster access.
                </p>
              </>
            ) : (
              <ParticipationState
                action={table.viewer.action}
                reason={table.viewer.reason}
                priceCents={table.priceCents}
                slug={table.slug}
                pending={pending}
                onJoin={join}
                onCheckout={pay}
              />
            )}
            {table.viewer.action === "membership_required" &&
              table.community && (
                <Link
                  className="tables-button"
                  to={`/communities/${table.community.slug}`}
                >
                  View community membership
                </Link>
              )}
            {params.get("paid") === "1" && !table.viewer.isMember && (
              <p className="tables-note" role="status">
                We're confirming your payment. Your chair and roster access
                appear once payment is confirmed.
              </p>
            )}
            {params.get("checkout") === "cancelled" && (
              <p className="tables-note">
                Checkout was cancelled. You can return to checkout when you're
                ready.
              </p>
            )}
            {message && (
              <p role="status" className="tables-status">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="tables-error">
                {error}
              </p>
            )}
            {table.viewer.isMember && !table.viewer.isHost && (
              <button
                className="tables-button tables-button-small"
                type="button"
                disabled={pending}
                onClick={leave}
              >
                Leave this Table
              </button>
            )}
          </section>
        </div>
      </div>
      {table.viewer.isHost && (
        <HostManagement tableId={table._id} events={table.events} />
      )}
      {table.viewer.isHost && table.scheduleType === "series" && (
        <AddTableEvent tableId={table._id} />
      )}
    </main>
  );
}
