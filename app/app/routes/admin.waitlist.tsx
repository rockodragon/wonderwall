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
import { Link } from "react-router";
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

export const meta: MetaFunction = () => {
  return [{ title: "Waitlist Admin | creatives.exchange" }];
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

// A real button (not a bare th click target) so the sort control is
// keyboard/AT accessible; the th itself carries aria-sort.
function SortButton({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-medium text-gray-700 uppercase tracking-wider hover:text-gray-900"
    >
      {label}
      <span aria-hidden="true">
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}
      </span>
    </button>
  );
}

function ariaSortFor(sorted: false | "asc" | "desc"): React.AriaAttributes["aria-sort"] {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
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
          <span className="text-sm text-gray-500">{row.original.rank}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        accessorKey: "email",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-gray-900 max-w-[220px] break-words block">
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
          <span className="text-sm text-gray-600 whitespace-nowrap">
            {new Date(row.original.createdAt).toLocaleDateString()}
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
          <span className="text-sm text-gray-600 whitespace-nowrap">
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
            <div className="text-sm text-gray-600 max-w-[280px]">
              {entry.projectDescription && (
                <div className="text-gray-900">{entry.projectDescription}</div>
              )}
              {entry.projectUrl && (
                <a
                  href={entry.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  {entry.projectUrl}
                </a>
              )}
              {entry.portfolioUrl && entry.portfolioUrl !== entry.projectUrl && (
                <a
                  href={entry.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-600 hover:underline break-all"
                >
                  {entry.portfolioUrl}
                </a>
              )}
              {!entry.projectDescription &&
                !entry.projectUrl &&
                !entry.portfolioUrl && (
                  <span className="text-gray-400 italic">—</span>
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
                <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                  Ready to launch
                </span>
              )}
              {entry.interestedInHosting && (
                <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                  Wants to host
                </span>
              )}
              {!entry.hasLaunchProject && !entry.interestedInHosting && (
                <span className="text-gray-400">—</span>
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
          <span className="text-sm text-gray-600 max-w-[160px] break-words block">
            {row.original.hearAboutUsOther ||
              row.original.hearAboutUs || (
                <span className="text-gray-400">—</span>
              )}
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
                <div className="text-sm">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    Approved
                  </span>
                  <div className="mt-1 text-xs text-gray-500">
                    by {entry.approvedByName}
                    {entry.approvedAt &&
                      ` · ${new Date(entry.approvedAt).toLocaleDateString()}`}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleApprove(entry._id)}
                  disabled={isBusy(entry._id)}
                  className="px-3 py-1.5 text-sm bg-green-800 text-white rounded-lg hover:bg-green-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {approving === entry._id ? "Approving…" : "Approve"}
                </button>
              )}
              {/* Secondary and destructive: an outline, not the
                  primary fill. Label is red-900 on white (10:1).
                  Disabled swaps to gray-700 on gray-100 instead of
                  dimming the label, so it stays readable. */}
              <button
                onClick={() => handleDelete(entry._id, entry.email)}
                disabled={isBusy(entry._id)}
                className="px-3 py-1.5 text-sm text-red-900 bg-white border border-red-700 rounded-lg enabled:hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:text-gray-700 disabled:bg-gray-100 disabled:border-gray-500 whitespace-nowrap"
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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Checking access…</div>
      </div>
    );
  }

  if (!profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-500">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  const approvedCount = entries?.filter((e) => e.approved).length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link
              to="/admin"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">
              Waitlist
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {entries === undefined
                ? "Loading…"
                : `${entries.length} on the list · ${approvedCount} approved`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {entries === undefined ? (
          <div className="text-gray-500">Loading waitlist…</div>
        ) : entries.length === 0 ? (
          <div className="bg-white shadow-md rounded-lg p-8 text-center text-gray-500">
            Nobody on the waitlist yet.
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const sorted = header.column.getIsSorted();
                        return (
                          <th
                            key={header.id}
                            className="px-4 py-3 text-left"
                            aria-sort={
                              canSort ? ariaSortFor(sorted) : undefined
                            }
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
                              <span className="text-xs font-medium text-gray-700 uppercase tracking-wider">
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 align-top">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-4">
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
      </div>
    </div>
  );
}
