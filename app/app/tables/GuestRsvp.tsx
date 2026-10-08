import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { tableErrorMessage } from "./errors";

/** Guest intent never creates a Table membership or unlocks its roster.
 * Name, email and phone go to the Table's hosts only. */
export function GuestRsvp({ eventId }: { eventId: Id<"events"> }) {
  const rsvp = useMutation(api.garden.eventRsvps.rsvpGuestToTableEvent);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notifyNewDates, setNotifyNewDates] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await rsvp({
        eventId,
        name: name.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        notifyNewDates,
      });
      setConfirmed(true);
    } catch (cause) {
      setError(
        tableErrorMessage(cause, "We couldn't save your RSVP. Please try again."),
      );
    } finally {
      setPending(false);
    }
  }
  if (confirmed)
    return (
      <p role="status" className="tables-status" style={{ marginTop: 12 }}>
        You're on the guest list for this Event. The Table roster stays private.
      </p>
    );
  if (!open)
    return (
      <button
        className="tables-button tables-button-small"
        type="button"
        style={{ marginTop: 12 }}
        onClick={() => setOpen(true)}
      >
        RSVP as an external guest
      </button>
    );
  return (
    <form
      onSubmit={submit}
      className="tables-form-session"
      style={{ marginTop: 16 }}
    >
      <p className="tables-note">
        RSVP without joining the Table. Only the host sees your name, email
        and phone.
      </p>
      <div className="tables-fields" style={{ marginTop: 12 }}>
        <label className="tables-field">
          Your name
          <input
            className="tables-input"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="tables-field">
          Email
          <input
            className="tables-input"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="tables-field">
          Phone (optional)
          <input
            className="tables-input"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
      </div>
      <label className="tables-check" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={notifyNewDates}
          onChange={(event) => setNotifyNewDates(event.target.checked)}
        />
        Tell me when this Table adds a date
      </label>
      <div className="tables-session-actions">
        <button
          type="submit"
          className="tables-button tables-button-primary tables-button-small"
          disabled={pending}
        >
          {pending ? "Saving…" : "Confirm guest RSVP"}
        </button>
        <button
          type="button"
          className="tables-button tables-button-small"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="tables-error">
          {error}
        </p>
      )}
    </form>
  );
}
