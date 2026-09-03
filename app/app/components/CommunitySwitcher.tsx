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

// One line, and never the platform's name: the Wordmark directly above
// already says CREATIVES.EXCHANGE, so repeating it here read as the brand
// stuttering. Unselected the control names what it does — "All communities"
// — and selected it names the community you're looking through.
const ALL_LABEL = "All communities";

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
        aria-label={`Switch community — showing ${label}`}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {/* min-w-0 lets the name actually truncate inside the 256px rail
            instead of clipping mid-word. */}
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
          {selectedCommunity?.isHome && <span aria-hidden="true">⌂</span>}
          <span className="truncate">{label}</span>
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
            {ALL_LABEL}
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
