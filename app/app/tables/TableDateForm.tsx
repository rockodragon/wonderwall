import { useState } from "react";
import { tableEventInput } from "./eventInput";
import { tableErrorMessage } from "./errors";

export type TableDate = ReturnType<typeof tableEventInput>;

/** One date: title, start, length, where. Shared by "Add a date" and "Run it
 * again". `onSubmit` throws to show its reason under the form. */
export function TableDateForm({
  heading,
  note,
  submitLabel,
  pendingLabel,
  defaultTitle = "",
  onSubmit,
  onCancel,
}: {
  heading: string;
  note: string;
  submitLabel: string;
  pendingLabel: string;
  defaultTitle?: string;
  onSubmit: (event: TableDate) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("90");
  const [location, setLocation] = useState("");
  const [locationType, setLocationType] = useState<"online" | "in_person">(
    "in_person",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await onSubmit(
        tableEventInput(
          { title, date, duration, location, locationType },
          Date.now(),
        ),
      );
    } catch (cause) {
      setError(
        tableErrorMessage(cause, "We couldn't save the date. Please try again."),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="tables-form-session" onSubmit={submit}>
      <h3 className="tables-subheading">{heading}</h3>
      <p className="tables-note">{note}</p>
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
                setLocationType(event.target.value as "online" | "in_person")
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
            {pending ? pendingLabel : submitLabel}
          </button>
          <button
            className="tables-button"
            type="button"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="tables-error">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
