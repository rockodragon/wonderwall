import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TableDateForm } from "./TableDateForm";

/** "Run it again": a new Table with the same details and a first date the
 * host picks. The server invites this Table's people by email; nobody is
 * signed up for them. */
export function RunTableAgain({
  tableId,
  tableName,
}: {
  tableId: Id<"gardenTables">;
  tableName: string;
}) {
  const runAgain = useMutation(api.garden.tables.runTableAgain);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div className={`tables-date-tool${open ? " is-open" : ""}`}>
      {open ? (
        <TableDateForm
          heading="Run it again"
          note="A new Table with the same details and a date you pick. We'll email this Table's people so they can join."
          submitLabel="Run it again"
          pendingLabel="Starting…"
          defaultTitle={tableName}
          onSubmit={async (event) => {
            const result = await runAgain({ tableId, event });
            navigate(`/tables/${result.slug}?again=1`);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button
          type="button"
          className="tables-button"
          onClick={() => setOpen(true)}
        >
          Run it again
        </button>
      )}
    </div>
  );
}
