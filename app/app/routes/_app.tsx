import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { api } from "../../convex/_generated/api";
import { takePendingIntent } from "../lib/pendingIntent";
import { claimPendingTickets } from "../lib/pendingTicket";
import { useMarkNotificationsReadForPath } from "../lib/useMarkNotificationsReadForPath";
import { InviteCTA } from "../components/InviteCTA";
import { NAV_ITEMS } from "../garden/ui";
import { FF_V2 } from "../lib/featureFlags";

// The Garden holds the top of the rail (garden-first-ia mock, screen 2):
// the community you're in takes the wordmark slot, the platform moves to the
// foot of the rail, and the old "All communities" lens switcher becomes a
// short list of other places you can visit, down at the bottom left. The
// ?community= filter state (useCommunityContext) is untouched — the rail
// just stops presenting it as a lens. A lens is now set by visiting: each
// community page links into Projects/Events/Classes filtered to it, and the
// browse pages' CommunityContextLine clears it.
const HOME_COMMUNITY_SLUG = "the-garden";
const VISIT_LIMIT = 3;

// Public paths (community-ux.md §2/§6): a signed-out visitor may browse
// these without being redirected to /login — the directory, the apply page,
// and individual community pages all do their own signed-out handling
// (Sign in CTAs, no partial forms) rather than being gated at the shell.
// Prefix match is correct here: /communities, /communities/apply, and every
// /communities/:slug should all be public.
const PUBLIC_PATH_PREFIXES = ["/about", "/communities", "/people", "/search", "/offerings", "/tables"];

// /events/:eventId is public too — a calendar invite goes to a guest with
// no account by design (eventRsvps.userId is optional), and event.tsx's own
// guest branches (RSVP, no organizer tools) depend on this page not
// redirecting them to /login (docs/gated-event-video-prd.md). Unlike
// /communities, a prefix match would also expose the *list* at /events —
// nobody asked for that — so this matches exactly one path segment after
// /events/, never the bare list.
const PUBLIC_EVENT_DETAIL_PATH = /^\/events\/[^/]+$/;

function isPublicPathname(pathname: string): boolean {
  return (
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_EVENT_DETAIL_PATH.test(pathname)
  );
}

// V1 (docs/the-exchange-v1-prd.md §5, though that draft predated Spaces/
// Learn and only sketched three items — the shipped nav grew to five):
// People / Projects / Events / Spaces / Learn. "The Garden" is one
// community inside Spaces, not a nav-level destination. "Portfolios"
// (/works) drops from nav — the page itself stays live, un-linked rather
// than deleted, same pattern as /organizations. Everything else (Favorites,
// Profile, Messages, admin Crawler) is real but secondary — the desktop
// sidebar folds it into the account row at the foot of the rail so the
// primary list stays short; mobile's bottom bar has no room for that, so it
// shows the full set too, but only for a signed-in viewer (a signed-out
// visitor on a public path gets primary items only, same as the desktop
// sidebar — there's nothing behind Following/Profile/Messages for them to
// see, and every one of those three redirects a guest straight to /login).
//
// The items themselves (label/destination/signed-out fallback) come from
// garden/ui.tsx's NAV_ITEMS — the same list the public GardenNav/SiteHeader
// build their nav from — so this sidebar and the marketing header can't
// drift into showing the same label pointed at two different routes again.
// "Spaces" is /communities (2026-09-14, product decision) — see NAV_ITEMS'
// own comment for the full history.
const NAV_ICONS = {
  "/people": PersonIcon,
  "/projects": BrushIcon,
  "/events": CalendarIcon,
  "/communities": GridIcon,
  "/offerings": ClassesIcon,
} as const;
const secondaryNavItems = [
  { path: "/favorites", label: "Following", icon: HeartIcon },
  { path: "/settings", label: "Profile", icon: UserIcon },
];

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();
  const profile = useQuery(api.profiles.getMyProfile);
  const unreadCount = useQuery(api.messaging.getUnreadCount) ?? 0;
  const notificationCount = useQuery(api.notifications.getUnreadCount) ?? 0;
  const allCommunities = useQuery(api.garden.communities.listCommunities);
  // Notifications don't get their own nav row — the count folds into the
  // Messages badge instead (2026-08-30, on request).
  const sidebarBadgeCount = unreadCount + notificationCount;

  const isPublicPath = isPublicPathname(location.pathname);

  // Clears any unread notification pointing at wherever the user just
  // navigated to, so reaching a page from an email CTA or a direct link
  // clears the badge same as clicking the bell would.
  useMarkNotificationsReadForPath();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPath) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, isPublicPath, navigate]);

  // Whatever this person clicked before they had an account — Join, Back
  // this, Apply — replayed the moment they're authenticated, so they never
  // have to choose the same thing twice. Claim links use the older
  // pendingClaim stash; both are checked, claim first.
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const token = localStorage.getItem("pendingClaim");
      if (token) {
        localStorage.removeItem("pendingClaim");
        navigate(`/claim/${token}`);
        return;
      }
    } catch {
      // Private browsing / storage disabled — nothing to recover.
    }
    const intent = takePendingIntent();
    if (intent) navigate(intent);
  }, [isAuthenticated, navigate]);

  // A ticket paid for while signed out (event.tsx stashed its Stripe
  // session): attach it to this account now that there is one.
  const claimTicket = useMutation(api.garden.eventRsvps.claimTicketBySession);
  useEffect(() => {
    if (isAuthenticated) void claimPendingTickets(claimTicket);
  }, [isAuthenticated, claimTicket]);

  // A brand-new account goes through onboarding before anything else. The
  // auth callback (convex/auth.ts afterUserCreatedOrUpdated) creates the
  // profile as "New User" with nothing filled in; onboarding sets
  // primaryRole. Requiring BOTH (no role AND an empty profile) keeps members
  // who joined before primaryRole existed — they have bios and interests —
  // from being sent back through it. Phone sign-in made this reachable: a
  // new number lands here with an empty profile and nowhere to go.
  const needsOnboarding =
    !!profile &&
    !profile.primaryRole &&
    !profile.bio?.trim() &&
    !(profile.interests?.length) &&
    (!profile.name?.trim() || profile.name === "New User");
  useEffect(() => {
    if (isAuthenticated && needsOnboarding) navigate("/onboarding", { replace: true });
  }, [isAuthenticated, needsOnboarding, navigate]);

  // Identify user in PostHog when authenticated and profile loaded
  useEffect(() => {
    if (isAuthenticated && profile && posthog) {
      posthog.identify(profile.userId, {
        email: profile.attributes?.email,
        name: profile.name,
        plan: profile.plan,
        interests: profile.interests,
      });
    }
  }, [isAuthenticated, profile, posthog]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--app-surface)" }}
      >
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: "var(--app-accent)" }}
        />
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath) {
    return null;
  }

  // Signed in → each item's real destination; signed out → its public
  // fallback where NAV_ITEMS declares one (Projects, Events), otherwise the
  // same destination (People/Spaces/Learn are already public routes).
  // Today is the signed-in home (routes/today.tsx) and leads the list; a
  // signed-out visitor has no Today to see, so it drops out for them.
  const primaryNavItems = [
    ...(isAuthenticated ? [{ path: "/today", label: "Today", icon: SunIcon }] : []),
    ...NAV_ITEMS.map((item) => ({
      path: isAuthenticated || !("publicTo" in item) ? item.to : item.publicTo,
      label: item.label,
      icon: NAV_ICONS[item.to],
    })),
  ];
  // Other places on the platform — every listed community except the one
  // whose name is on the rail, biggest first, a few at most; "All →" is
  // the directory.
  // "The Exchange" in the switcher is lit on any platform-level page: the
  // directory and community pages, and the apply form.
  const onExchange = location.pathname.startsWith("/communities");
  const otherCommunities = (allCommunities ?? [])
    .filter((c) => c.slug !== HOME_COMMUNITY_SLUG)
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, VISIT_LIMIT);
  // Following/Profile/Messages all require an account — nothing behind them
  // for a signed-out visitor, so the mobile bar drops to primary items only,
  // matching the desktop sidebar's secondaryNavItems block below.
  const navItems = isAuthenticated
    ? [...primaryNavItems, ...secondaryNavItems]
    : primaryNavItems;

  // Shared active/inactive treatment for every sidebar/bottom-nav link —
  // citron wash + accessible accent-ink when active (readable in both
  // themes, see tokens.css's --app-accent-ink note), muted text otherwise.
  function navLinkStyle(isActive: boolean) {
    return isActive
      ? { backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }
      : { color: "var(--app-text-muted)" };
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "var(--app-surface)",
        // A handful of pages inside this shell (Projects, Events, Learn,
        // project/offering detail, Communities) still render permanently
        // dark against --garden-ink and reach for --garden-ink-raised
        // directly for card/pill fills, rather than the theme-responsive
        // --app-surface-raised above. --garden-ink-raised is only ~7
        // lightness units off --garden-ink though — fine as a hairline
        // accent, not enough for a fixed bar (the mobile nav) or a card
        // that needs to read as clearly separate from the page behind it.
        // Overriding it here — scoped to this shell's subtree only, never
        // touching :root — gives every page inside the app the same
        // stronger separation as --app-surface-raised, without moving the
        // true marketing pages (home, grant-program, etc.) that live
        // outside this layout and still want the subtler original value.
        "--garden-ink-raised": "#242420",
      } as CSSProperties}
    >
      {/* Main content */}
      <main className="pb-20 md:pb-0 md:pl-64">
        <Outlet />
      </main>

      {/* Mobile bottom nav - icons only, to fit up to 8 items (5 primary +
          Following/Profile/Messages once signed in; 5 for a signed-out
          visitor on a public path). Sits fixed over scrolling content, so
          it needs a real shadow (not just the fill color) to read as a
          solid bar instead of blending with whatever scrolls underneath
          it. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden"
        style={{
          backgroundColor: "var(--app-surface-raised)",
          borderColor: "var(--app-hairline)",
          boxShadow: "0 -8px 24px -6px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div className="flex justify-around py-3">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const isProfileItem = item.path === "/settings";
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center justify-center p-2"
                style={{ color: isActive ? "var(--app-accent-ink)" : "var(--app-text-dim)" }}
                aria-label={item.label}
              >
                {isProfileItem && profile?.imageUrl ? (
                  <img
                    src={profile.imageUrl}
                    alt={profile.name}
                    className="w-6 h-6 rounded-full object-cover"
                    style={isActive ? { boxShadow: "0 0 0 2px var(--app-accent)" } : undefined}
                  />
                ) : (
                  <item.icon className="w-6 h-6" />
                )}
              </Link>
            );
          })}
          {isAuthenticated && (
            <Link
              to="/messages"
              className="flex items-center justify-center p-2"
              style={{
                color: location.pathname.startsWith("/messages")
                  ? "var(--app-accent-ink)"
                  : "var(--app-text-dim)",
              }}
              aria-label="Messages"
            >
              <div className="relative">
                <EnvelopeIcon className="w-6 h-6" />
                {sidebarBadgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    {sidebarBadgeCount > 99 ? "99+" : sidebarBadgeCount}
                  </span>
                )}
              </div>
            </Link>
          )}
        </div>
      </nav>

      {/* Desktop sidebar — The Garden's name on top, the places you can
          visit and your account at the foot, the platform last. */}
      <aside
        className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 border-r overflow-y-auto"
        style={{ backgroundColor: "var(--app-surface-raised)", borderColor: "var(--app-hairline)" }}
      >
        <Link
          to={isAuthenticated ? "/today" : "/garden"}
          className="block px-6 pt-7 pb-5"
          aria-label="The Garden — home"
        >
          <span
            className="block text-[15px] uppercase tracking-[0.3em]"
            style={{ fontFamily: "var(--garden-font-mono)", color: "var(--app-text)" }}
          >
            The Garden
          </span>
          <span
            className="block mt-1.5 text-xs uppercase tracking-[0.12em]"
            style={{ fontFamily: "var(--garden-font-mono)", color: "var(--app-text-dim)" }}
          >
            San Diego · Online
          </span>
        </Link>

        <nav className="px-4 space-y-1" aria-label="The Garden">
          {primaryNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? "page" : undefined}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-[15px] transition-colors hover:bg-[var(--app-hairline)]"
                style={navLinkStyle(isActive)}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* The foot of the rail, in three rows: a way to invite, the
            switch between The Garden and the exchange, and your account.
            The chips of other communities, "Host your own", the wordmark
            link to the marketing home and a separate "Account →" all lived
            here too and read as the same thing said three ways; they're
            behind FF_V2 until there's more than one community to switch to. */}
        <div className="mt-auto pt-6">
          {isAuthenticated && (
            <div className="px-4 pb-3">
              {/* Always open, one click to copy — the link used to sit
                  behind a row and an expand, three clicks deep. Sign-up
                  is invite-only, so this stays reachable. */}
              <InviteCTA />
            </div>
          )}

          {/* Where am I: The Garden, or the exchange it sits on. Two
              places, one control. The exchange side is the directory of
              every community on the platform. */}
          <div className="px-4 py-3 border-t" style={{ borderColor: "var(--app-hairline)" }}>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg p-1"
              style={{ backgroundColor: "var(--app-surface)" }}
              role="group"
              aria-label="Switch between The Garden and TheCreative.exchange"
            >
              <Link
                to={isAuthenticated ? "/today" : "/garden"}
                aria-current={!onExchange ? "page" : undefined}
                className="rounded-md px-1 py-2 text-center text-[13px] font-medium whitespace-nowrap transition-colors"
                style={
                  !onExchange
                    ? { backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }
                    : { color: "var(--app-text-muted)" }
                }
              >
                The Garden
              </Link>
              <Link
                to="/communities"
                aria-current={onExchange ? "page" : undefined}
                className="rounded-md px-1 py-2 text-center text-[13px] font-medium whitespace-nowrap transition-colors"
                style={
                  onExchange
                    ? { backgroundColor: "var(--app-accent-wash)", color: "var(--app-accent-ink)" }
                    : { color: "var(--app-text-muted)" }
                }
              >
                The Exchange
              </Link>
            </div>
            {FF_V2 && otherCommunities.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
                {otherCommunities.map((c) => (
                  <Link
                    key={c._id}
                    to={`/communities/${c.slug}`}
                    className="px-2.5 py-1.5 rounded border text-[13.5px] transition-colors hover:bg-[var(--app-hairline)]"
                    style={{ borderColor: "var(--app-hairline-raised)", color: "var(--app-text-muted)" }}
                  >
                    {c.name}
                  </Link>
                ))}
                <Link
                  to="/communities/apply"
                  className="px-1 py-1.5 text-xs uppercase tracking-[0.1em] hover:underline"
                  style={{ fontFamily: "var(--garden-font-mono)", color: "var(--app-text-dim)" }}
                >
                  Host your own →
                </Link>
              </div>
            )}
          </div>

          {isAuthenticated ? (
            <div className="px-4 py-3 border-t" style={{ borderColor: "var(--app-hairline)" }}>
              <div className="flex items-center gap-2">
                <Link
                  to="/settings"
                  className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 rounded-lg transition-colors hover:bg-[var(--app-hairline)]"
                  style={navLinkStyle(location.pathname.startsWith("/settings"))}
                  aria-label="Your account"
                  title="Your account"
                >
                  {profile?.imageUrl ? (
                    <img src={profile.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs border"
                      style={{
                        fontFamily: "var(--garden-font-mono)",
                        borderColor: "var(--app-hairline-raised)",
                        color: "var(--app-text-muted)",
                      }}
                    >
                      {initialsOf(profile?.name)}
                    </span>
                  )}
                  <span className="truncate text-sm" style={{ color: "var(--app-text)" }}>
                    {profile?.name ?? "Your account"}
                  </span>
                </Link>
                <RailIconLink to="/favorites" label="Following" active={location.pathname.startsWith("/favorites")}>
                  <HeartIcon className="w-4.5 h-4.5" />
                </RailIconLink>
                <RailIconLink to="/messages" label="Messages" active={location.pathname.startsWith("/messages")}>
                  <span className="relative">
                    <EnvelopeIcon className="w-4.5 h-4.5" />
                    {sidebarBadgeCount > 0 && (
                      <span className="absolute -top-2 -right-2.5 bg-red-500 text-white text-xs rounded-full h-4.5 min-w-4.5 flex items-center justify-center px-1">
                        {sidebarBadgeCount > 99 ? "99+" : sidebarBadgeCount}
                      </span>
                    )}
                  </span>
                </RailIconLink>
              </div>
              {profile?.isAdmin && (
                <div className="flex gap-1 mt-1">
                  <RailIconLink to="/admin/crawler" label="Crawler" active={location.pathname.startsWith("/admin/crawler")}>
                    <CrawlerIcon className="w-4.5 h-4.5" />
                  </RailIconLink>
                  <RailIconLink to="/admin/waitlist" label="Waitlist" active={location.pathname.startsWith("/admin/waitlist")}>
                    <WaitlistIcon className="w-4.5 h-4.5" />
                  </RailIconLink>
                </div>
              )}
            </div>
          ) : isPublicPath ? (
            <div className="px-4 py-3 border-t" style={{ borderColor: "var(--app-hairline)" }}>
              <Link
                to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
                className="flex items-center justify-center px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline)]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Sign in
              </Link>
            </div>
          ) : null}

          {/* What this all is. One line; the page it opens says the rest. */}
          <div className="px-4 pt-1 pb-5">
            <Link
              to="/about"
              className="text-xs uppercase tracking-[0.04em] whitespace-nowrap hover:underline"
              style={{ fontFamily: "var(--garden-font-mono)", color: "var(--app-text-dim)" }}
            >
              About TheCreative.exchange →
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function ClassesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6L3 10l9 4 9-4-9-4zM6.5 12.5V17c0 1 2.5 3 5.5 3s5.5-2 5.5-3v-4.5"
      />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function CrawlerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}

function WaitlistIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function GardenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.5-2.5-6-6-6 0 3.5 2.5 6 6 6zM12 10c0-3 2.2-5 5.5-5 0 3-2.2 5-5.5 5z" />
    </svg>
  );
}

/** An icon-only destination in the account row at the foot of the rail. */
function RailIconLink({
  to,
  label,
  active,
  children,
}: {
  to: string;
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg transition-colors hover:bg-[var(--app-hairline)]"
      style={{ color: active ? "var(--app-accent-ink)" : "var(--app-text-muted)" }}
    >
      {children}
    </Link>
  );
}

function initialsOf(name: string | undefined): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "·";
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

/** People: a stick figure — the page is people, not a search box. */
function PersonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="2.5" />
      <path d="M12 7v7M12 14l-4 7M12 14l4 7M6 10.5h12" />
    </svg>
  );
}

/** Projects: a paintbrush — work being made, not a job board. */
function BrushIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 3.5 11 13" />
      <path d="M9.5 11.5 12.5 14.5" />
      <path d="M10 14c-2 0-3.5 1.5-3.5 3.5S5 21 3 21c2.5 1 7 .5 7.5-3 .2-1.5-.2-2.8-.5-4z" />
    </svg>
  );
}
