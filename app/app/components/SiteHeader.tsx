import { useConvexAuth } from "convex/react";
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
  return (
    <header
      className={`${overlay ? "absolute top-0 left-0 right-0 z-50" : ""} px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between gap-3 max-w-7xl mx-auto`}
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
              to={"publicTo" in item && !isAuthenticated ? item.publicTo : item.to}
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
      </div>
    </header>
  );
}
