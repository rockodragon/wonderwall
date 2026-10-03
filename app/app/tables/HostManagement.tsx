import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
              <span className="tables-note">{status ?? "Not recorded"}</span>
            </div>
            <div className="tables-session-actions">
              <button
                type="button"
                className="tables-chip"
                disabled={pending === person.userId}
                aria-pressed={status === "attended"}
                onClick={() => mark(person.userId, "attended")}
              >
                Attended
              </button>
              <button
                type="button"
                className="tables-chip"
                disabled={pending === person.userId}
                aria-pressed={status === "absent"}
                onClick={() => mark(person.userId, "absent")}
              >
                Absent
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

export function HostManagement({
  tableId,
  events,
}: {
  tableId: Id<"gardenTables">;
  events: { _id: Id<"events">; title: string; datetime: number }[];
}) {
  const roster = useQuery(api.garden.tables.getHostRoster, { tableId });
  const manage = useMutation(api.garden.tables.manageEnrollment);
  const [selectedEvent, setSelectedEvent] = useState<Id<"events"> | undefined>(
    events[0]?._id,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function decide(userId: Id<"users">, decision: "accept" | "remove") {
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
      <p className="tables-note">
        Enrollment and payment stay separate. Approving a paid request still
        requires checkout before roster access.
      </p>
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
                    {person.status} ·{" "}
                    {person.paymentStatus.replaceAll("_", " ")}
                  </span>
                </div>
                {!["host", "co_host"].includes(person.role) && (
                  <div className="tables-session-actions">
                    {person.status === "pending" && (
                      <button
                        type="button"
                        className="tables-button tables-button-primary tables-button-small"
                        disabled={pending === person.userId}
                        onClick={() => decide(person.userId, "accept")}
                      >
                        Accept request
                      </button>
                    )}
                    <button
                      type="button"
                      className="tables-button tables-button-small"
                      disabled={pending === person.userId}
                      onClick={() => decide(person.userId, "remove")}
                    >
                      {person.status === "pending"
                        ? "Decline request"
                        : "Remove from Table"}
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
      {events.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 className="tables-subheading">Record attendance</h3>
          <p className="tables-note">
            Record what happened at an Event. Joining or RSVPing never marks
            someone as attended.
          </p>
          <label className="tables-field" style={{ marginTop: 12 }}>
            Event
            <select
              className="tables-input"
              value={selectedEvent ?? ""}
              onChange={(event) =>
                setSelectedEvent(event.target.value as Id<"events">)
              }
            >
              {events.map((event) => (
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
              Attendance becomes available after participants join.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
