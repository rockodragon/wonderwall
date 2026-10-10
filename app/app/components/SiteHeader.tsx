import { useConvexAuth } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { NAV_ITEMS } from "../garden/ui";
import { Wordmark } from "./Wordmark";
import { GardenLockup } from "../brand/GardenMark";
import { useMediaQuery } from "../hooks/useMediaQuery";

// The public site header — wordmark, the same five items GardenNav carries,
// and, on the right, Sign in for a visitor or a quiet "Today" link for someone
// signed in. (It used to show a filled "Go to App" button to a signed-in
// person — a marketing CTA on pages like a fund's, where the one filled button
// should be the page's own action. Today is a plain link now, and nothing
// shows at all while the sign-in state is still loading, so a signed-in person
// doesn't see "Sign in" flash first.) Home renders it over the hero
// (`overlay`); the audience pages, /opportunities, credits, claim, unsubscribe
// and every Garden page (GardenPage) render it in flow.
//
// One component so a visitor moving from the landing page to a /for page
// sees the same header, not the credit-sheet nav the Garden pages use.
// The link set matches GardenNav so nothing is reachable from one header
// and not the other.

export function SiteHeader({
  overlay = false,
  growMark,
}: {
  overlay?: boolean;
  /** The Garden's front door only (brand/GardenHome.tsx): the color under the
   *  mark, so its lockup plays the grow on load (once a day per device, never
   *  under reduced motion; GardenGrow). Then it's one lockup sized to the
   *  screen, not the phone and wide pair: the grow plays once a day, and a
   *  hidden copy would use it up. Off everywhere else. */
  growMark?: string;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const wide = useMediaQuery("(min-width: 640px)");
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
      {/* Both brands ship in the prerendered HTML; CSS shows the one for
          this domain (app/brand/brands.ts), so neither flashes. */}
      <Link to="/" className="brand-exchange min-w-0" aria-label="TheCreative.exchange home">
        <div className="sm:hidden">
          <Wordmark size="sm" />
        </div>
        <div className="hidden sm:flex">
          <Wordmark size="lg" tagline />
        </div>
      </Link>
      <Link to="/" className="brand-garden min-w-0" aria-label="The Garden home">
        {growMark ? (
          <span className="flex">
            <GardenLockup fontSize={wide ? 20 : 16} grow surface={growMark} />
          </span>
        ) : (
          <>
            <span className="flex sm:hidden">
              <GardenLockup fontSize={16} />
            </span>
            <span className="hidden sm:flex">
              <GardenLockup fontSize={20} />
            </span>
          </>
        )}
      </Link>
      <div className="flex items-center gap-4 shrink-0">
        <nav aria-label="Site" className="hidden md:flex items-center gap-4 lg:gap-5 mr-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={href(item)}
              className="text-[15px] text-[var(--garden-body)] hover:text-[var(--garden-paper)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {isAuthenticated ? (
          <Link
            to="/today"
            className="px-3 py-2 text-[15px] whitespace-nowrap text-[var(--garden-paper)] font-medium hover:text-[var(--garden-citron)] transition-colors"
          >
            Today
          </Link>
        ) : (
          // Kept in the markup while loading (prerender and first paint read
          // as signed out) but invisible, so it neither flashes for a
          // signed-in person nor shifts the layout when the answer arrives.
          <Link
            to="/login"
            className="px-3 py-2 text-[15px] whitespace-nowrap text-[var(--garden-body)] hover:text-[var(--garden-paper)] font-medium transition-colors"
            style={isLoading ? { visibility: "hidden" } : undefined}
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
