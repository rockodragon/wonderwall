import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TableDateForm } from "./TableDateForm";

/** "Add a date", on any Table. A one-time Table becomes a series. A host
 * who can't add dates (getTable's addDatesBlocked) sees why instead of a
 * form; the server checks again either way. */
export function AddTableEvent({
  tableId,
  tableName,
  oneTime,
  blocked,
}: {
  tableId: Id<"gardenTables">;
  tableName: string;
  oneTime: boolean;
  blocked: string | null;
}) {
  const add = useMutation(api.garden.tables.addTableEvent);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  if (blocked)
    return (
      <div className="tables-date-tool">
        <p className="tables-note">{blocked}</p>
      </div>
    );
  return (
    <div className={`tables-date-tool${open ? " is-open" : ""}`}>
      {open ? (
        <TableDateForm
          heading="Add a date"
          note={
            oneTime
              ? "This makes the Table a series, which takes paid membership in its community. Everyone here stays in and gets an email."
              : "Everyone here stays in and gets an email. Times use your device's time zone."
          }
          submitLabel="Add date"
          pendingLabel="Adding…"
          defaultTitle={tableName}
          onSubmit={async (event) => {
            await add({ tableId, event });
            setOpen(false);
            setMessage("Date added. People at this Table will get an email.");
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="tables-button"
          onClick={() => {
            setMessage("");
            setOpen(true);
          }}
        >
          + Add a date
        </button>
      )}
      {message && (
        <p role="status" className="tables-status">
          {message}
        </p>
      )}
    </div>
  );
}
