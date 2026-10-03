import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Guest intent never creates a Table membership or unlocks its roster. */
export function GuestRsvp({ eventId }: { eventId: Id<"events"> }) {
  const rsvp = useMutation(api.garden.eventRsvps.rsvpGuestToTableEvent);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await rsvp({ eventId, name: name.trim(), email: email.trim() });
      setConfirmed(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't save your RSVP. Please try again.",
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
        RSVP to this Event without joining the Table. Your email is shared with
        the host for Event logistics.
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
      </div>
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
