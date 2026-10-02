// /admin/waitlist — review "move up the list" answers and approve people
// off the waitlist. Approving sends the applicant an email with the
// approving admin's fixed short code (profiles.adminCode); they sign up
// at /signup/:code exactly like a peer invite (convex/invites.ts's
// findInviterProfile resolves either kind of code). Delete removes an entry
// outright, pending or approved, to clear out test signups. See
// convex/waitlist.ts (listForAdmin, approveEntry, deleteEntry) and
// convex/helpers.ts (ensureAdminCode).
//
// Admin detection mirrors admin.garden.tsx: the client-checkable
// profile.isAdmin flag, not admin.tsx's server-side requireAdmin() throw,
// so an unauthenticated or non-admin visitor gets a message instead of a
// stuck loading state.
//
// Table is sortable via @tanstack/react-table (pattern copied from
// admin.crawler.tsx). The server pre-sorts by priorityScore desc, then
// createdAt asc (see waitlist.ts's listForAdmin) — that's the initial
// client sort state too, on the Signals column, so the unsorted view
// matches what the server already computed.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { MetaFunction } from "react-router";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { admin } from "../components/admin/adminStyles";
import {
  AdminAccessDenied,
  AdminFrame,
  AdminHeader,
  AdminLoading,
  AdminNotice,
  SortButton,
  ariaSortFor,
} from "../components/admin/AdminUi";

export const meta: MetaFunction = () => {
  return [{ title: "Waitlist Admin | TheCreative.exchange" }];
};

const ROLE_LABEL: Record<string, string> = {
  creative: "Creative",
  patron: "Patron",
  partner: "Partner",
};

type WaitlistEntries = NonNullable<
  ReturnType<typeof useQuery<typeof import("../../convex/_generated/api").api.waitlist.listForAdmin>>
>;
type WaitlistEntry = WaitlistEntries[number];

// Number of "signals" an entry carries — used as the Signals column's
// tie-break under equal priorityScore.
function signalCount(entry: WaitlistEntry): number {
  return (
    (entry.hasLaunchProject ? 1 : 0) +
    (entry.interestedInHosting ? 1 : 0) +
    (entry.portfolioUrl ? 1 : 0)
  );
}

export default function AdminWaitlistPage() {
  const profile = useQuery(api.profiles.getMyProfile);
  const entries = useQuery(api.waitlist.listForAdmin);
  const approveEntry = useMutation(api.waitlist.approveEntry);
  const deleteEntry = useMutation(api.waitlist.deleteEntry);

  const [approving, setApproving] = useState<Id<"waitlist"> | null>(null);
  const [deleting, setDeleting] = useState<Id<"waitlist"> | null>(null);
  const [error, setError] = useState<string>("");
  // Default matches the server's own order: priorityScore desc (the
  // Signals column), so the initial render agrees with listForAdmin.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "signals", desc: true },
  ]);

  const handleApprove = async (id: Id<"waitlist">) => {
    setApproving(id);
    setError("");
    try {
      await approveEntry({ waitlistId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setApproving(null);
    }
  };

  const handleDelete = async (id: Id<"waitlist">, email: string) => {
    if (
      !window.confirm(
        `Delete ${email} from the waitlist? This can't be undone.`,
      )
    ) {
      return;
    }
    setDeleting(id);
    setError("");
    try {
      await deleteEntry({ waitlistId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  // A row's buttons are all disabled while either of its requests is in flight.
  const isBusy = (id: Id<"waitlist">) => approving === id || deleting === id;

  const columns = useMemo<ColumnDef<WaitlistEntry>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        accessorKey: "rank",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-[color:var(--app-text-muted)]">{row.original.rank}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        accessorKey: "email",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-medium max-w-[220px] break-words block">
            {row.original.email}
          </span>
        ),
      },
      {
        id: "date",
        header: "Joined",
        accessorKey: "createdAt",
        sortingFn: "basic",
        cell: ({ row }) => (
          <span className="text-[color:var(--app-text-muted)] whitespace-nowrap">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "community",
        header: "Community",
        accessorFn: (entry) => entry.communities.join(", ") || undefined,
        sortUndefined: "last",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <span className="text-[color:var(--app-text-muted)] whitespace-nowrap">
            {row.original.communities.join(", ") || "—"}
          </span>
        ),
      },
      {
        id: "role",
        header: "Role",
        // Missing role sorts last regardless of direction (sortUndefined).
        accessorFn: (entry) =>
          entry.role ? (ROLE_LABEL[entry.role] ?? entry.role) : undefined,
        sortUndefined: "last",
        sortingFn: "alphanumeric",
        cell: ({ row }) => (
          <span className="text-[color:var(--app-text-muted)] whitespace-nowrap">
            {row.original.role ? ROLE_LABEL[row.original.role] : "—"}
          </span>
        ),
      },
      {
        id: "project",
        header: "Project",
        enableSorting: false,
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="text-[color:var(--app-text-muted)] max-w-[280px]">
              {entry.projectDescription && (
                <div className="text-[color:var(--app-text)]">{entry.projectDescription}</div>
              )}
              {entry.projectUrl && (
                <a
                  href={entry.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`break-all ${admin.link}`}
                >
                  {entry.projectUrl}
                </a>
              )}
              {entry.portfolioUrl && entry.portfolioUrl !== entry.projectUrl && (
                <a
                  href={entry.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block break-all ${admin.link}`}
                >
                  {entry.portfolioUrl}
                </a>
              )}
              {!entry.projectDescription &&
                !entry.projectUrl &&
                !entry.portfolioUrl && (
                  <span className="italic">—</span>
                )}
            </div>
          );
        },
      },
      {
        id: "signals",
        header: "Signals",
        // Sort primarily by priorityScore (numeric), tie-broken by the
        // count of true signals (launch project / hosting / portfolio).
        sortingFn: (rowA, rowB) => {
          const a = rowA.original;
          const b = rowB.original;
          if (a.priorityScore !== b.priorityScore) {
            return a.priorityScore - b.priorityScore;
          }
          return signalCount(a) - signalCount(b);
        },
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="flex flex-col gap-1">
              {entry.hasLaunchProject && (
                <span className={admin.chip.purple}>
                  Ready to launch
                </span>
              )}
              {entry.interestedInHosting && (
                <span className={admin.chip.amber}>
                  Wants to host
                </span>
              )}
              {!entry.hasLaunchProject && !entry.interestedInHosting && (
                <span className="text-[color:var(--app-text-muted)]">—</span>
              )}
            </div>
          );
        },
      },
      {
        id: "hearAboutUs",
        header: "Heard via",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-[color:var(--app-text-muted)] max-w-[160px] break-words block">
            {row.original.hearAboutUsOther ||
              row.original.hearAboutUs || <span>—</span>}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "approved",
        sortingFn: "basic",
        cell: ({ row }) => {
          const entry = row.original;
          return (
            <div className="flex items-center gap-3">
              {entry.approved ? (
                <div>
                  <span className={admin.chip.green}>Approved</span>
                  <div className={`mt-1 ${admin.hint}`}>
                    by {entry.approvedByName}
                    {entry.approvedAt &&
                      ` · ${new Date(entry.approvedAt).toLocaleDateString()}`}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleApprove(entry._id)}
                  disabled={isBusy(entry._id)}
                  className={admin.btnRowPrimary}
                >
                  {approving === entry._id ? "Approving…" : "Approve"}
                </button>
              )}
              {/* Secondary and destructive: an outline, not the primary
                  fill. Label is red-300 on the raised surface (8:1). */}
              <button
                onClick={() => handleDelete(entry._id, entry.email)}
                disabled={isBusy(entry._id)}
                className={admin.btnRowDanger}
              >
                {deleting === entry._id ? "Deleting…" : "Delete"}
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [approving, deleting],
  );

  const table = useReactTable({
    data: entries ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (profile === undefined) {
    return <AdminLoading>Checking access…</AdminLoading>;
  }

  if (!profile?.isAdmin) {
    return <AdminAccessDenied />;
  }

  const approvedCount = entries?.filter((e) => e.approved).length ?? 0;

  return (
    <AdminFrame>
      <AdminHeader
        back
        title="Waitlist"
        sub={
          entries === undefined
            ? "Loading…"
            : `${entries.length} on the list · ${approvedCount} approved`
        }
      />

      {error && (
        <AdminNotice tone="error" className="mb-4">
          {error}
        </AdminNotice>
      )}

      {entries === undefined ? (
        <p className={admin.meta}>Loading waitlist…</p>
      ) : entries.length === 0 ? (
        <div className={`${admin.panel} text-center ${admin.meta}`}>
          Nobody on the waitlist yet.
        </div>
      ) : (
        <div className={admin.tableWrap}>
          <div className={admin.tableScroll}>
            <table className={`${admin.table} min-w-[960px]`}>
              <thead className={admin.thead}>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          className={admin.th}
                          aria-sort={canSort ? ariaSortFor(sorted) : undefined}
                        >
                          {header.isPlaceholder ? null : canSort ? (
                            <SortButton
                              label={String(header.column.columnDef.header)}
                              sorted={sorted}
                              onClick={() =>
                                header.column.toggleSorting(
                                  header.column.getIsSorted() === "asc",
                                )
                              }
                            />
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody className={admin.tbody}>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className={admin.tr}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={admin.td}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminFrame>
  );
}
