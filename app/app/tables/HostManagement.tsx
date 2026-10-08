import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { eventHasStarted } from "../../convex/eventWindow";
import { rosterStatusWords } from "./presentation";

type HostPerson = {
  userId: Id<"users">;
  name: string;
  status: string;
  role: string;
  paymentStatus: string;
};
function AttendancePanel({
  eventId,
  people,
}: {
  eventId: Id<"events">;
  people: HostPerson[];
}) {
  const attendance = useQuery(api.garden.tables.getAttendance, { eventId });
  const record = useMutation(api.garden.tables.recordAttendance);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function mark(userId: Id<"users">, status: "attended" | "absent") {
    setPending(userId);
    setError("");
    try {
      await record({ eventId, userId, status });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not record attendance. Please try again.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <div>
      {people.map((person) => {
        const status = attendance?.find(
          (entry) => entry.userId === person.userId,
        )?.status;
        return (
          <div className="tables-session" key={person.userId}>
            <div className="tables-session-top">
              <span>{person.name}</span>
              <span className="tables-note">
                {status === "attended" ? "Came" : status === "absent" ? "Didn't come" : "Not marked"}
              </span>
            </div>
            <div className="tables-session-actions">
              <button
                type="button"
                className="tables-chip"
                disabled={pending === person.userId}
                aria-pressed={status === "attended"}
                onClick={() => mark(person.userId, "attended")}
              >
                Came
              </button>
              <button
                type="button"
                className="tables-chip"
                disabled={pending === person.userId}
                aria-pressed={status === "absent"}
                onClick={() => mark(person.userId, "absent")}
              >
                Didn't come
              </button>
            </div>
          </div>
        );
      })}
      {error && (
        <p role="alert" className="tables-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** "+16195550100" → "(619) 555-0100"; anything else as stored. */
export function displayPhone(phone: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
}

/** Guests who RSVP'd without an account, with the contact details they
 * gave. The query is host-only; nothing here reaches the public page. */
function GuestList({ tableId }: { tableId: Id<"gardenTables"> }) {
  const guests = useQuery(api.garden.tables.getTableGuests, { tableId });
  if (!guests?.length) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <h3 className="tables-subheading">Guests</h3>
      <p className="tables-note">Only hosts see this.</p>
      {guests.map((guest) => (
        <div className="tables-session" key={guest.rsvpId}>
          <div className="tables-session-top">
            <span>{guest.name}</span>
            <span className="tables-note">
              {new Date(guest.datetime).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <p className="tables-session-detail">
            <a href={`mailto:${guest.email}`}>{guest.email}</a>
            {guest.phone && (
              <>
                {" · "}
                <a href={`tel:${guest.phone}`}>{displayPhone(guest.phone)}</a>
              </>
            )}
            {guest.wantsNewDates ? " · Wants new dates" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

export function HostManagement({
  tableId,
  events,
  paid,
}: {
  tableId: Id<"gardenTables">;
  events: { _id: Id<"events">; title: string; datetime: number }[];
  /** A paid Table: people you accept still pay before they're in. */
  paid: boolean;
}) {
  const roster = useQuery(api.garden.tables.getHostRoster, { tableId });
  const manage = useMutation(api.garden.tables.manageEnrollment);
  // Who came is marked once a date starts, never ahead of it (the server
  // refuses too). The latest one is picked first.
  const started = events.filter((event) => eventHasStarted(event, Date.now()));
  const [selectedEvent, setSelectedEvent] = useState<Id<"events"> | undefined>(
    started.at(-1)?._id,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function decide(
    person: { userId: Id<"users">; name: string; status: string },
    decision: "accept" | "remove",
  ) {
    if (
      decision === "remove" &&
      !window.confirm(
        person.status === "pending"
          ? `Say no to ${person.name}? They'll be told.`
          : `Remove ${person.name} from this Table? They'll be told.`,
      )
    )
      return;
    const userId = person.userId;
    setPending(userId);
    setError("");
    try {
      await manage({ tableId, userId, decision });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update this participant. Please try again.",
      );
    } finally {
      setPending(null);
    }
  }
  const active = (roster ?? []).filter(
    (person) =>
      person.status === "active" &&
      ["confirmed", "not_required"].includes(person.paymentStatus),
  );
  return (
    <section className="tables-management" aria-label="Host management">
      <h2 className="tables-subheading">Your host tools</h2>
      {paid && (
        <p className="tables-note">
          People you accept pay before they're in.
        </p>
      )}
      {roster === undefined ? (
        <p role="status">Loading participants…</p>
      ) : roster.length === 0 ? (
        <p className="tables-note" style={{ marginTop: 16 }}>
          No requests or participants yet.
        </p>
      ) : (
        <div style={{ marginTop: 16 }}>
          {roster
            .filter(
              (person) =>
                !["left", "removed", "rejected"].includes(person.status),
            )
            .map((person) => (
              <div className="tables-session" key={person.userId}>
                <div className="tables-session-top">
                  <span>{person.name}</span>
                  <span className="tables-note">
                    {rosterStatusWords(person, paid)}
                  </span>
                </div>
                {!["host", "co_host"].includes(person.role) && (
                  <div className="tables-session-actions">
                    {person.status === "pending" && (
                      <button
                        type="button"
                        className="tables-button tables-button-primary tables-button-small"
                        disabled={pending === person.userId}
                        onClick={() => decide(person, "accept")}
                      >
                        Say yes
                      </button>
                    )}
                    <button
                      type="button"
                      className="tables-button tables-button-small"
                      disabled={pending === person.userId}
                      onClick={() => decide(person, "remove")}
                    >
                      {person.status === "pending"
                        ? "Say no"
                        : "Remove"}
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
      {error && (
        <p role="alert" className="tables-error">
          {error}
        </p>
      )}
      <GuestList tableId={tableId} />
      {events.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 className="tables-subheading">Who came</h3>
          {started.length === 0 ? (
            <p className="tables-note">
              Once a date starts, you can mark who came.
            </p>
          ) : (
            <>
              <label className="tables-field" style={{ marginTop: 12 }}>
                Date
                <select
                  className="tables-input"
                  value={selectedEvent ?? ""}
                  onChange={(event) =>
                    setSelectedEvent(event.target.value as Id<"events">)
                  }
                >
                  {started.map((event) => (
                    <option key={event._id} value={event._id}>
                      {event.title} ·{" "}
                      {new Date(event.datetime).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </label>
              {selectedEvent && (
                <AttendancePanel
                  key={selectedEvent}
                  eventId={selectedEvent}
                  people={active}
                />
              )}
              {active.length === 0 && (
                <p className="tables-note" style={{ marginTop: 12 }}>
                  Once people join, you can mark who came.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
