// Sidebar workspace switcher — answers "whose lens am I using right now"
// (community-ux.md §2), a Slack/Discord-style picker rendered under the
// Wordmark in _app.tsx's desktop sidebar. Distinct from
// components/CommunityPicker.tsx, the *post-to-a-community* form select —
// this one drives global filtering state via useCommunityContext(), the
// same state the five browse pages and CommunityContextLine read. Selecting
// an entry writes the same `?community=<slug>` param + localStorage that
// useCommunityContext already owns; this is a new view on existing state,
// not a new state (community-ux.md §2).
//
// Desktop only, per spec — the mobile bottom bar has no room for it; community
// context on mobile comes from the CommunityContextLine + Communities tab.

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { Link, useLocation } from "react-router";
import { communityNameFor, useCommunityContext } from "./CommunityFilter";

// The no-community-selected value is the platform's own name: you are always
// somewhere, and when you haven't picked a community that somewhere is
// creatives.exchange itself (the commons — community-groups.md §0). The
// control is labelled "Community" so the name below it reads as a value, not
// as a stray brand mark.
const ALL_LABEL = "creatives.exchange";
const ALL_HINT = "Everything, every community";

export function CommunitySwitcher() {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation();
  const { selected, setSelected, communities } = useCommunityContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Signed out: a "Sign in" pill, no picker (community-ux.md §2 state table).
  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    return (
      <Link
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        className="flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const selectedCommunity = communities.find((c) => c.slug === selected);
  const label = selected === "all" ? ALL_LABEL : communityNameFor(selected, communities);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Community: ${label}`}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {/* min-w-0 lets the value actually truncate instead of overflowing the
            256px rail — the old single-line label clipped mid-word. */}
        <span className="min-w-0">
          <span className="block text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            Community
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
            {selectedCommunity?.isHome && <span aria-hidden="true">⌂</span>}
            <span className="truncate">{label}</span>
          </span>
        </span>
        <ChevronIcon
          className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch community"
          className="absolute left-0 right-0 mt-1 py-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg z-50"
        >
          <MenuItem
            selected={selected === "all"}
            onClick={() => {
              setSelected("all");
              setOpen(false);
            }}
          >
            <span className="block">
              {ALL_LABEL}
              <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                {ALL_HINT}
              </span>
            </span>
          </MenuItem>
          {communities.map((c) => (
            <MenuItem
              key={c._id}
              selected={selected === c.slug}
              onClick={() => {
                setSelected(c.slug);
                setOpen(false);
              }}
            >
              {c.isHome && (
                <span aria-hidden="true" className="mr-1">
                  ⌂
                </span>
              )}
              {c.name}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <Link
            to="/communities"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Browse communities →
          </Link>
          <Link
            to="/communities/apply"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Host your own →
          </Link>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  selected,
  onClick,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-sm text-left transition-colors ${
        selected
          ? "font-semibold text-blue-600 dark:text-blue-400"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
