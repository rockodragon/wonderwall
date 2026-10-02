// The member list on /admin: search, sortable columns, two filters, pages of
// 50. Data is api.admin.getAllUsersWithInvites (newest first). The row action
// is Delete; the parent owns the confirm and the mutation so the table stays
// a view. Linking an inviter lives in the section below the table on the
// admin page, as it did before.

import { createContext, useContext, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { admin } from "./adminStyles";
import { SortButton, ariaSortFor } from "./AdminUi";

export type AdminUsers = NonNullable<
  FunctionReturnType<typeof api.admin.getAllUsersWithInvites>
>;
export type AdminUser = AdminUsers[number];

const PAGE_SIZE = 50;

// What the Delete button needs from the page. It travels by context so the
// column definitions never change: a new `cell` function would remount every
// row's cell (flexRender treats it as a component), and a button you just
// pressed would lose focus.
type RowActions = {
  deletingUserId: string | null;
  onDelete: (userId: string, name: string) => void;
};
const RowActionsContext = createContext<RowActions>({
  deletingUserId: null,
  onDelete: () => {},
});

function DeleteButton({ user }: { user: AdminUser }) {
  const { deletingUserId, onDelete } = useContext(RowActionsContext);
  const busy = deletingUserId === user.userId;
  return (
    <button
      type="button"
      onClick={() => onDelete(user.userId, user.name)}
      disabled={busy}
      aria-label={`Delete ${user.name}`}
      className={admin.btnRowDanger}
    >
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}

// Search matches any text on the row, every word of the query: "maria
// gmail" finds Maria with a gmail address. Runs once per row (see
// getColumnCanGlobalFilter below), not once per column.
const searchFilter: FilterFn<AdminUser> = (row, _columnId, value) => {
  const terms = String(value ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;
  const u = row.original;
  const haystack = [
    u.name,
    u.email,
    u.inviteSlug,
    u.invitedBy?.name,
    u.invitedBy?.email,
    new Date(u.createdAt).toLocaleDateString(),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

// "invited" = someone's invite link brought them in; "direct" = no inviter.
const joinedViaFilter: FilterFn<AdminUser> = (row, _columnId, value) =>
  value === "invited" ? row.original.invitedBy !== null : row.original.invitedBy === null;

// "some" = at least one of their invites was used; "none" = none were.
const invitesUsedFilter: FilterFn<AdminUser> = (row, _columnId, value) =>
  value === "some"
    ? row.original.inviteUsageCount > 0
    : row.original.inviteUsageCount === 0;

const COLUMNS: ColumnDef<AdminUser>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    sortingFn: "text",
    cell: ({ row }) => (
      <Link
        to={`/profile/${row.original._id}`}
        className={`font-medium whitespace-nowrap ${admin.link}`}
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    id: "email",
    header: "Email",
    accessorFn: (u) => u.email,
    sortUndefined: "last",
    sortingFn: "text",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-[color:var(--app-text-muted)]">
        {row.original.email ?? "—"}
      </span>
    ),
  },
  {
    id: "invitedBy",
    header: "Invited by",
    // Sorts by the inviter's name; direct signups go last either way.
    accessorFn: (u) => u.invitedBy?.name,
    sortUndefined: "last",
    sortingFn: "text",
    filterFn: joinedViaFilter,
    cell: ({ row }) => {
      const by = row.original.invitedBy;
      return by ? (
        <div className="whitespace-nowrap">
          <div className="font-medium">{by.name}</div>
          <div className="text-[13.5px] text-[color:var(--app-text-muted)]">
            {by.email}
          </div>
        </div>
      ) : (
        <span className="whitespace-nowrap text-[color:var(--app-text-muted)] italic">
          Direct signup
        </span>
      );
    },
  },
  {
    id: "inviteSlug",
    header: "Invite slug",
    accessorFn: (u) => u.inviteSlug,
    sortUndefined: "last",
    sortingFn: "text",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-[color:var(--app-text-muted)]">
        {row.original.inviteSlug || "-"}
      </span>
    ),
  },
  {
    id: "inviteUsageCount",
    header: "Invites used",
    accessorKey: "inviteUsageCount",
    sortingFn: "basic",
    filterFn: invitesUsedFilter,
    cell: ({ row }) => <span>{row.original.inviteUsageCount}</span>,
  },
  {
    id: "joined",
    header: "Joined",
    accessorKey: "createdAt",
    sortingFn: "basic",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-[color:var(--app-text-muted)]">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    cell: ({ row }) => <DeleteButton user={row.original} />,
  },
];

export function MembersTable({
  users,
  deletingUserId,
  onDelete,
}: {
  users: AdminUsers;
  /** userId of the row whose delete is in flight, if any. */
  deletingUserId: string | null;
  onDelete: (userId: string, name: string) => void;
}) {
  // Newest first, which is also the order the server sends them in.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "joined", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [search, setSearch] = useState("");

  const table = useReactTable({
    data: users,
    columns: COLUMNS,
    state: { sorting, columnFilters, globalFilter: search },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setSearch,
    globalFilterFn: searchFilter,
    getColumnCanGlobalFilter: (column) => column.id === "name",
    initialState: { pagination: { pageSize: PAGE_SIZE } },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const joinedVia = (table.getColumn("invitedBy")?.getFilterValue() ?? "") as string;
  const invitesUsed = (table.getColumn("inviteUsageCount")?.getFilterValue() ?? "") as string;
  const filtering = search.trim() !== "" || joinedVia !== "" || invitesUsed !== "";

  const matching = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const first = matching === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(matching, (pageIndex + 1) * pageSize);
  const pageCount = table.getPageCount();

  const rowActions = useMemo(
    () => ({ deletingUserId, onDelete }),
    [deletingUserId, onDelete],
  );

  function clearFilters() {
    setSearch("");
    setColumnFilters([]);
  }

  return (
    <RowActionsContext.Provider value={rowActions}>
      <section aria-labelledby="members-heading" className={admin.tableWrap}>
        <div className={`${admin.ruleBottom} px-4 py-4 sm:px-5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="members-heading" className={admin.h2}>
              Members
            </h2>
            <p className={admin.meta} aria-live="polite">
              {filtering ? `${matching} of ${users.length}` : users.length} members
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 sm:max-w-sm">
              <label htmlFor="members-search" className={admin.label}>
                Search
              </label>
              <input
                id="members-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, inviter, or slug"
                autoComplete="off"
                className={admin.input}
              />
            </div>
            <div>
              <label htmlFor="members-joined-via" className={admin.label}>
                Joined via
              </label>
              <select
                id="members-joined-via"
                value={joinedVia}
                onChange={(e) =>
                  table
                    .getColumn("invitedBy")
                    ?.setFilterValue(e.target.value || undefined)
                }
                className={admin.select}
              >
                <option value="">Anyone</option>
                <option value="invited">An invite</option>
                <option value="direct">Direct signup</option>
              </select>
            </div>
            <div>
              <label htmlFor="members-invites-used" className={admin.label}>
                Invites used
              </label>
              <select
                id="members-invites-used"
                value={invitesUsed}
                onChange={(e) =>
                  table
                    .getColumn("inviteUsageCount")
                    ?.setFilterValue(e.target.value || undefined)
                }
                className={admin.select}
              >
                <option value="">Any</option>
                <option value="some">One or more</option>
                <option value="none">None</option>
              </select>
            </div>
            {filtering && (
              <button type="button" onClick={clearFilters} className={admin.btnQuiet}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className={admin.tableScroll}>
          <table className={`${admin.table} min-w-[820px]`}>
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
                            onClick={header.column.getToggleSortingHandler()}
                          />
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
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
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {matching === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-10 text-center text-[14px] text-[color:var(--app-text-muted)]"
                  >
                    {users.length === 0 ? (
                      "No members yet."
                    ) : (
                      <>
                        No members match.{" "}
                        <button
                          type="button"
                          onClick={clearFilters}
                          className={`font-medium ${admin.link}`}
                        >
                          Clear filters
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={admin.tableFoot}>
          <span aria-live="polite">
            {matching === 0 ? "0 members" : `${first}–${last} of ${matching}`}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className={admin.btnRowSecondary}
              >
                Previous
              </button>
              <span>
                Page {pageIndex + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className={admin.btnRowSecondary}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </section>
    </RowActionsContext.Provider>
  );
}
