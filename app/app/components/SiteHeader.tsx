import { useConvexAuth } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { NAV_ITEMS } from "../garden/ui";
import { Wordmark } from "./Wordmark";

// The public site header — wordmark, the same five items GardenNav carries,
// and Sign in / Go to App. Home renders it over the hero (`overlay`); the
// audience pages, /opportunities, credits and claim render it in flow.
//
// One component so a visitor moving from the landing page to a /for page
// sees the same header, not the credit-sheet nav the Garden pages use.
// The link set matches GardenNav so nothing is reachable from one header
// and not the other.

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  // Below md the five nav items don't fit beside the wordmark, so they live
  // behind a menu button. Same NAV_ITEMS list, same publicTo rule, so the
  // phone menu can't drift from the desktop row.
  const [open, setOpen] = useState(false);
  const href = (item: (typeof NAV_ITEMS)[number]) =>
    "publicTo" in item && !isAuthenticated ? item.publicTo : item.to;
  return (
    <header
      className={`${overlay ? "absolute top-0 left-0 right-0 z-50" : "relative z-40"} px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-3 max-w-7xl mx-auto`}
    >
      <Link to="/" className="min-w-0" aria-label="creatives.exchange home">
        <div className="sm:hidden">
          <Wordmark size="sm" />
        </div>
        <div className="hidden sm:flex">
          <Wordmark size="lg" tagline />
        </div>
      </Link>
      <div className="flex items-center gap-4 shrink-0">
        <nav aria-label="Site" className="hidden md:flex items-center gap-5 mr-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={href(item)}
              className="text-[14px] text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {isAuthenticated ? (
          <Link
            to="/search"
            className="px-4 py-2 sm:px-6 sm:py-2.5 text-[14px] sm:text-base whitespace-nowrap bg-[var(--garden-citron)] text-[var(--garden-ink)] rounded-xl font-semibold hover:opacity-90 transition-all"
          >
            Go to App
          </Link>
        ) : (
          <Link
            to="/login"
            className="px-4 py-2 text-[14px] sm:text-[15px] whitespace-nowrap text-[var(--garden-body)] hover:text-[var(--garden-paper)] font-medium transition-colors"
          >
            Sign in
          </Link>
        )}
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-lg text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div
          id="site-menu"
          className="md:hidden absolute left-4 right-4 top-full mt-1 rounded-xl border border-[var(--garden-hairline-raised)] bg-[var(--garden-ink-raised)] p-2 shadow-2xl"
        >
          <nav aria-label="Site" className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={href(item)}
                onClick={() => setOpen(false)}
                className="px-3 py-2.5 rounded-lg text-[15px] text-[var(--garden-body)] hover:bg-[var(--garden-ink)] hover:text-[var(--garden-paper)] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
