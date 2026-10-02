// Small pieces every admin page shares: the page frame and heading, the
// loading and access-denied states, a notice box, and the sort button for
// table headers. Class strings live in adminStyles.ts.

import type { AriaAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { PAGE_WIDTH, type PageWidth } from "../../lib/pageWidth";
import { admin } from "./adminStyles";

/** The page frame. The app shell already paints the ground, so this only
    sets the width and the gutters. Tables use `wide`; a column of cards can
    ask for `list`. */
export function AdminFrame({
  width = "wide",
  children,
}: {
  width?: PageWidth;
  children: ReactNode;
}) {
  return (
    <div className={`${PAGE_WIDTH[width]} mx-auto p-4 sm:p-6`}>{children}</div>
  );
}

/** Title, optional line under it, optional "← Admin Dashboard" link above,
    optional actions to the right. */
export function AdminHeader({
  title,
  sub,
  back = false,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link to="/admin" className={admin.backLink}>
            ← Admin Dashboard
          </Link>
        )}
        <h1
          className={`${admin.h1} ${back ? "mt-1" : ""}`}
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          {title}
        </h1>
        {sub && <p className={`mt-1 ${admin.meta}`}>{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A centred message on the page ground: "Checking access…", "Loading…". */
export function AdminCenter({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      {children}
    </div>
  );
}

export function AdminLoading({ children }: { children: ReactNode }) {
  return (
    <AdminCenter>
      <p className={admin.meta}>{children}</p>
    </AdminCenter>
  );
}

export function AdminAccessDenied() {
  return (
    <AdminCenter>
      <div className="text-center">
        <h1
          className="mb-2 text-2xl font-semibold text-[color:var(--app-text)]"
          style={{ fontFamily: "var(--garden-font-display)" }}
        >
          Access Denied
        </h1>
        <p className={admin.meta}>
          You don't have permission to access this page.
        </p>
      </div>
    </AdminCenter>
  );
}

export type NoticeTone = keyof typeof admin.notice;

export function AdminNotice({
  tone = "info",
  className = "",
  children,
}: {
  tone?: NoticeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${admin.notice[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

export type Sorted = false | "asc" | "desc";

export function ariaSortFor(sorted: Sorted): AriaAttributes["aria-sort"] {
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

/** A real button inside the header cell, so sorting works from the keyboard;
    the th carries aria-sort. The arrow is a separate fixed-width slot so the
    header does not jump when it appears. */
export function SortButton({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: Sorted;
  onClick: ((event: unknown) => void) | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${admin.sortButton} ${
        sorted
          ? "text-[color:var(--app-text)]"
          : "text-[color:var(--app-text-muted)]"
      }`}
    >
      {label}
      <span aria-hidden="true" className="inline-block w-3 text-center">
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}
      </span>
    </button>
  );
}
