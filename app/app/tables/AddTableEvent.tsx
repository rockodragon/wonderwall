import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { tableEventInput } from "./eventInput";

export function AddTableEvent({ tableId }: { tableId: Id<"gardenTables"> }) {
  const add = useMutation(api.garden.tables.addTableEvent);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("90");
  const [location, setLocation] = useState("");
  const [locationType, setLocationType] = useState<"online" | "in_person">(
    "in_person",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      await add({
        tableId,
        event: tableEventInput(
          { title, date, duration, location, locationType },
          Date.now(),
        ),
      });
      setOpen(false);
      setTitle("");
      setDate("");
      setMessage("Event added to this Table's schedule.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't add the Event. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div style={{ marginTop: 24 }}>
      {open ? (
        <form className="tables-form-session" onSubmit={submit}>
          <h3 className="tables-subheading">Add an Event</h3>
          <p className="tables-note">
            Additional Events require current membership in this Table's
            community. Dates use your device's time zone.
          </p>
          <div className="tables-inline-fields" style={{ marginTop: 16 }}>
            <label className="tables-field">
              Title
              <input
                className="tables-input"
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <div className="tables-fields">
              <label className="tables-field">
                Date and time
                <input
                  className="tables-input"
                  required
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="tables-field">
                Duration in minutes
                <input
                  className="tables-input"
                  required
                  type="number"
                  min="1"
                  max="1440"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </label>
              <label className="tables-field">
                Where
                <select
                  className="tables-input"
                  value={locationType}
                  onChange={(event) =>
                    setLocationType(
                      event.target.value as "online" | "in_person",
                    )
                  }
                >
                  <option value="in_person">In person</option>
                  <option value="online">Online</option>
                </select>
              </label>
              <label className="tables-field">
                City or venue label
                <input
                  className="tables-input"
                  maxLength={200}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </label>
            </div>
            <div className="tables-session-actions">
              <button
                className="tables-button tables-button-primary"
                type="submit"
                disabled={pending}
              >
                {pending ? "Adding…" : "Add Event"}
              </button>
              <button
                className="tables-button"
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="tables-button"
          onClick={() => setOpen(true)}
        >
          + Add an Event
        </button>
      )}
      {error && (
        <p role="alert" className="tables-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="tables-status">
          {message}
        </p>
      )}
    </div>
  );
}
