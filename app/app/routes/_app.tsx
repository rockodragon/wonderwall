import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { usePostHog } from "@posthog/react";
import { BookmarkSimple, CalendarBlank, GraduationCap, PaintBrush, SquaresFour, Sun, UserCircle, Users, UsersThree, type Icon } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import { setPendingIntent, takePendingIntent } from "../lib/pendingIntent";
import { loginHref } from "../lib/loginHref";
import { inviteFromSearch, rememberInvite } from "../lib/carriedInvite";
import { needsOnboarding } from "../lib/onboardingGate";
import { claimPendingTickets } from "../lib/pendingTicket";
import { useMarkNotificationsReadForPath } from "../lib/useMarkNotificationsReadForPath";
import { InviteCTA } from "../components/InviteCTA";
import { NAV_ITEMS } from "../garden/ui";
import { FF_DESK, FF_V2 } from "../lib/featureFlags";
import { initialsOf } from "../lib/initials";
import { GARDEN_SLUG } from "../lib/communitySlugs";
import { PHONE_BAR_HEIGHT } from "../lib/phoneBar";
import { Palette } from "../desk/Palette";
import { NeedsYouDot } from "../components/shortlist/NeedsYouDot";
import { useShortlist } from "../lib/shortlist/useShortlist";
import { CountBadge } from "../components/phone/CountBadge";

// The Garden holds the top of the rail (garden-first-ia mock, screen 2):
// the community you're in takes the wordmark slot, the platform moves to the
// foot of the rail, and the old "All communities" lens switcher becomes a
// short list of other places you can visit, down at the bottom left. The
// ?community= filter state (useCommunityContext) is untouched — the rail
// just stops presenting it as a lens. A lens is now set by visiting: each
// community page links into Projects/Events/Classes filtered to it, and the
// browse pages' CommunityContextLine clears it.
const VISIT_LIMIT = 3;

// Public paths (community-ux.md §2/§6): a signed-out visitor may browse
// these without being redirected to /login — the directory, the apply page,
// and individual community pages all do their own signed-out handling
// (Sign in CTAs, no partial forms) rather than being gated at the shell.
// Prefix match is correct here: /communities, /communities/apply, and every
// /communities/:slug should all be public.
const PUBLIC_PATH_PREFIXES = ["/about", "/docs", "/communities", "/people", "/search", "/offerings", "/tables", "/orgs"];

// The project list is public, and so is each project's own page (below);
// acting on one still needs an account: Cheer, Follow and Apply send a
// visitor to sign up and back (projects.tsx, projects.$id.tsx), and Back
// this takes a one-time card payment without one.
// /give is public too: The Garden's home asks visitors to give, and the page
// shows them the two ways (use our money, bring your own) before any sign-in.
const PUBLIC_EXACT_PATHS = ["/projects", "/give"];

// /projects/:id is public (Rick, 2026-10-22), the way a shared post opens on
// Instagram or TikTok: anyone with the link sees the work, and the page
// shows a visitor only what has something in it. Only the page itself (a
// trailing slash allowed); deeper paths are not, so this is not a prefix match.
const PUBLIC_PROJECT_DETAIL_PATH = /^\/projects\/[^/]+\/?$/;

// /events/:eventId is public too — a calendar invite goes to a guest with
// no account by design (eventRsvps.userId is optional), and event.tsx's own
// guest branches (RSVP, no organizer tools) depend on this page not
// redirecting them to /login (docs/gated-event-video-prd.md). The list at
// /events is public too (the home page links it for signed-out visitors);
// deeper paths are not, so this is not a prefix match.
const PUBLIC_EVENT_DETAIL_PATH = /^\/events(\/[^/]+)?$/;

// A person's public page, /@handle (routes/slug.tsx), is for a visitor with
// no account most of all. /profile/:id is public only so it can forward
// there: profile.tsx sends a signed-out visitor to sign in itself when the
// person has no address yet, so that page behaves as before for them.
const PUBLIC_PERSON_PATH = /^\/(?:@[^/]+|profile\/[^/]+)$/;

function isPublicPathname(pathname: string): boolean {
  return (
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_EVENT_DETAIL_PATH.test(pathname) ||
    PUBLIC_PROJECT_DETAIL_PATH.test(pathname) ||
    PUBLIC_PERSON_PATH.test(pathname)
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
// sidebar — there's nothing behind Shortlist/Profile/Messages for them to
// see, and every one of those three redirects a guest straight to /login).
//
// The items themselves (label/destination/signed-out fallback) come from
// garden/ui.tsx's NAV_ITEMS — the same list the public GardenNav/SiteHeader
// build their nav from — so this sidebar and the marketing header can't
// drift into showing the same label pointed at two different routes again.
// "Spaces" is /communities (2026-09-14, product decision) — see NAV_ITEMS'
// own comment for the full history.
//
// Phosphor icons, because each has a filled twin: the phone's bar draws
// the place you're on filled (Rick, 2026-10-12), the way a native tab bar
// does, instead of only changing its colour.
const NAV_ICONS: Record<(typeof NAV_ITEMS)[number]["to"], Icon> = {
  "/people": Users,
  "/projects": PaintBrush,
  "/events": CalendarBlank,
  "/tables": UsersThree,
  "/communities": SquaresFour,
  "/offerings": GraduationCap,
};
// The Shortlist (docs/handoff/favorites-redesign/README.md) replaced
// "Following" here: same /favorites, now the phone's Shortlist page.
const SHORTLIST_PATH = "/favorites";
// The phone's bar, in its own order (Rick, 2026-10-12): Today, Projects,
// Events, People, then anything a flag turns on, then you. Five, like a
// native tab bar; the Shortlist and Messages left it for the top corner of
// Today (components/phone/TodayActions.tsx).
const BAR_ORDER: readonly string[] = ["/projects", "/events", "/people"];
const barRank = (to: string) => {
  const at = BAR_ORDER.indexOf(to);
  return at === -1 ? BAR_ORDER.length : at;
};

// With `children`, the shell wraps them instead of the route below it: for a
// page mounted by a route outside this layout (routes/slug.tsx's /@handle).
export default function AppLayout({ children }: { children?: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();
  const profile = useQuery(api.profiles.getMyProfile);
  const unreadCount = useQuery(api.messaging.getUnreadCount) ?? 0;
  const notificationCount = useQuery(api.notifications.getUnreadCount) ?? 0;
  // Only the sidebar's Shortlist dot reads this (the palette reads its own,
  // the same subscription): one dot when something needs you, signed in and
  // with the sidebar up. The phone's bar has no Shortlist; Today's corner
  // does, and reads the Shortlist it already has.
  const shortlist = useShortlist(isAuthenticated && !FF_DESK);
  const needsYou = shortlist.status === "ready" ? shortlist.needs.length : 0;
  const dotId = useId();
  // Only the sidebar's community chips read this; with the palette there is
  // no sidebar, so don't subscribe.
  const allCommunities = useQuery(api.garden.communities.listCommunities, FF_DESK ? "skip" : {});
  // Notifications don't get their own nav row — the count folds into the
  // Messages badge instead (2026-08-30, on request).
  const sidebarBadgeCount = unreadCount + notificationCount;

  const isPublicPath = isPublicPathname(location.pathname);

  // Clears any unread notification pointing at wherever the user just
  // navigated to, so reaching a page from an email CTA or a direct link
  // clears the badge same as clicking the bell would.
  useMarkNotificationsReadForPath();

  // A shared link's invite (?invite=<code>, lib/carriedInvite.ts) is kept
  // for signup and the invite-only door, whatever page it came on.
  useEffect(() => {
    const code = inviteFromSearch(location.search);
    if (code) rememberInvite(code);
  }, [location.search]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPath) {
      navigate(loginHref(location.pathname + location.search));
    }
  }, [isAuthenticated, isLoading, isPublicPath, navigate, location.pathname, location.search]);

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

  // A brand-new account goes through onboarding before anything else
  // (lib/onboardingGate.ts says who). Except on an event page: someone who
  // just signed up through the RSVP form there (event.tsx) stays put to see
  // "You're in". They go through onboarding on their next visit anywhere else.
  const mustOnboard = needsOnboarding(profile);
  const onEventPage = location.pathname.startsWith("/events/");
  // Platform-wide Tables keep free hosting outside community invite/onboarding gates.
  const onTablePage = location.pathname === "/tables" || location.pathname.startsWith("/tables/");

  // While the community new accounts join is invite-only (2026-10-02),
  // someone signed in who isn't in it — a Google sign-up without a code, a
  // refused code, a tab closed mid-signup — goes to /invite before anything
  // else, onboarding included. Never a platform admin (nobody locks the
  // operators out), and not on an event page, same as onboarding.
  const signupCommunity = useQuery(
    api.garden.defaultCommunity.getSignupCommunity,
    isAuthenticated ? {} : "skip",
  );
  const mustInvite =
    isAuthenticated &&
    !!signupCommunity?.inviteOnly &&
    signupCommunity.viewer?.isMember === false &&
    profile !== undefined &&
    !profile?.isAdmin;
  useEffect(() => {
    if (mustInvite && !onEventPage && !onTablePage) navigate("/invite", { replace: true });
  }, [mustInvite, onEventPage, onTablePage, navigate]);

  useEffect(() => {
    if (isAuthenticated && mustOnboard && !onEventPage && !onTablePage && !mustInvite) {
      // Come back here afterwards — onboarding ends on /today, which
      // replays the pending intent.
      if (location.pathname !== "/today") {
        setPendingIntent(location.pathname + location.search);
      }
      navigate("/onboarding", { replace: true });
    }
  }, [isAuthenticated, mustOnboard, onEventPage, onTablePage, mustInvite, navigate, location.pathname, location.search]);

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
  const places = NAV_ITEMS.map((item) => ({
    to: item.to,
    path: isAuthenticated || !("publicTo" in item) ? item.to : item.publicTo,
    label: item.label,
    icon: NAV_ICONS[item.to],
  }));
  const primaryNavItems = [
    ...(isAuthenticated ? [{ path: "/today", label: "Today", icon: Sun }] : []),
    ...places,
  ];
  // Other places on the platform — every listed community except the one
  // whose name is on the rail, biggest first, a few at most; "All →" is
  // the directory.
  // "The Exchange" in the switcher is lit on any platform-level page: the
  // directory and community pages, and the apply form.
  const onExchange = location.pathname.startsWith("/communities");
  // Pages that fill the window and place their own bottom edge: the desk
  // (/today) and an open message thread (/messages/:id; the inbox is a
  // normal page).
  const isThread = /^\/messages\/[^/]+/.test(location.pathname);
  const ownsBottom = isThread || location.pathname.replace(/\/$/, "") === "/today";
  const otherCommunities = (allCommunities ?? [])
    .filter((c) => c.slug !== GARDEN_SLUG)
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, VISIT_LIMIT);
  // The bar: Today and Profile need an account, so a signed-out visitor on a
  // public path gets the places at their public addresses plus Sign in.
  const barItems = [
    ...(isAuthenticated ? [{ path: "/today", label: "Today", icon: Sun }] : []),
    ...[...places].sort((a, b) => barRank(a.to) - barRank(b.to)),
    // Signed in: your profile. Signed out: the same icon opens sign in /
    // sign up, so a visitor isn't left with three places and no way in.
    isAuthenticated
      ? { path: "/settings", label: "Profile", icon: UserCircle }
      : { path: "/login", label: "Sign in", icon: UserCircle },
  ];

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
      {/* Main content. With the palette (FF_DESK) there is no sidebar to
          make room for on desktop, but the palette sits over the lower-left
          corner (56px at 28px in, plus its ring), so a normal page gets
          room at the foot to scroll its last line clear of it. The desk and
          a message thread are full-height and manage their own bottom. On a
          phone every page gets room for the bottom bar except a thread,
          which stops above the bar itself (lib/phoneBar.ts). */}
      {/* Desktop pages end 128px clear of the palette's button in the
          corner (desk/Palette.tsx), so the last row can scroll out from
          under it. */}
      <main
        className={`${isThread ? "" : "pb-20"} ${
          FF_DESK ? (ownsBottom ? "md:pb-0" : "md:pb-32") : "md:pb-0 md:pl-64"
        }`}
      >
        {children ?? <Outlet />}
      </main>

      {/* Desktop palette — the places you can go, resting on an arc in the
          lower-left corner (desk/Palette.tsx). Phones keep the bottom bar
          below. */}
      {FF_DESK && (
        <div className="hidden md:block">
          <Palette isAuthenticated={isAuthenticated} profile={profile} badgeCount={sidebarBadgeCount} />
        </div>
      )}

      {/* The phone's bottom bar: five places, icons only (Rick,
          2026-10-12: seven was too many). Today, Projects, Events, People
          and you; a signed-out visitor on a public path gets the three
          public ones. Messages and the Shortlist moved to the top corner of
          Today (components/phone/TodayActions.tsx). The place you're on is
          the filled icon, in the accent. Sits fixed over scrolling
          content, so it needs a real shadow (not just the fill color) to
          read as a solid bar instead of blending with whatever scrolls
          underneath it. z-40, under dialogs (z-50): a full-screen form on
          a phone covers the bar, so its Next/Save row at the bottom is
          never hidden behind it (Rick, 2026-10-05). */}
      <nav
        aria-label="Places"
        className={`fixed bottom-0 left-0 right-0 z-40 border-t md:hidden ${PHONE_BAR_HEIGHT}`}
        style={{
          backgroundColor: "var(--app-surface-raised)",
          borderColor: "var(--app-hairline)",
          boxShadow: "0 -8px 24px -6px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div className="h-full flex items-center justify-around">
          {barItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const isProfileItem = item.path === "/settings";
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={isActive ? "page" : undefined}
                className="relative flex items-center justify-center p-2"
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
                  <item.icon size={24} weight={isActive ? "fill" : "regular"} aria-hidden />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar — The Garden's name on top, the places you can
          visit and your account at the foot, the platform last. Replaced by
          the palette while FF_DESK is on. */}
      {!FF_DESK && (
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
            behind FF_V2 until there's more than one community to switch to,
            and so is the switch itself (2026-10-02). */}
        <div className="mt-auto pt-6">
          {isAuthenticated && (
            <div className="px-4 pb-3">
              {/* Always open, one click to copy — the link used to sit
                  behind a row and an expand, three clicks deep. Sign-up
                  is invite-only, so this stays reachable. */}
              <InviteCTA />
            </div>
          )}

          {/* Where am I: The Garden, or the exchange it sits on. Behind
              FF_V2 (Rick, 2026-10-02): with one community, a second place
              to switch to read as two missions; The Garden is the place. */}
          {FF_V2 && (
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
          )}

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
                <RailIconLink
                  to={SHORTLIST_PATH}
                  label="Shortlist"
                  active={location.pathname.startsWith(SHORTLIST_PATH)}
                  describedBy={needsYou > 0 ? `${dotId}-rail` : undefined}
                >
                  <span className="relative">
                    <BookmarkSimple className="w-4.5 h-4.5" />
                    {needsYou > 0 && <NeedsYouDot id={`${dotId}-rail`} count={needsYou} />}
                  </span>
                </RailIconLink>
                <RailIconLink to="/messages" label="Messages" active={location.pathname.startsWith("/messages")}>
                  <span className="relative">
                    <EnvelopeIcon className="w-4.5 h-4.5" />
                    <CountBadge count={sidebarBadgeCount} />
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
                to={loginHref(location.pathname + location.search)}
                className="flex items-center justify-center px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors hover:bg-[var(--app-hairline)]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Sign in
              </Link>
            </div>
          ) : null}

          {/* What this all is. One line; the page it opens says the rest:
              The Garden's own page — who we are, why we're here, the
              agreements (2026-10-02; was the platform's /about). */}
          <div className="px-4 pt-1 pb-5">
            <Link
              to={`/communities/${GARDEN_SLUG}`}
              className="text-xs uppercase tracking-[0.04em] whitespace-nowrap hover:underline"
              style={{ fontFamily: "var(--garden-font-mono)", color: "var(--app-text-dim)" }}
            >
              About The Garden →
            </Link>
          </div>
        </div>
      </aside>
      )}
    </div>
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
  describedBy,
  children,
}: {
  to: string;
  label: string;
  active: boolean;
  /** The id of text that says more about the link: the Shortlist's dot. */
  describedBy?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-describedby={describedBy}
      title={label}
      aria-current={active ? "page" : undefined}
      className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg transition-colors hover:bg-[var(--app-hairline)]"
      style={{ color: active ? "var(--app-accent-ink)" : "var(--app-text-muted)" }}
    >
      {children}
    </Link>
  );
}



/** People: a stick figure — the page is people, not a search box. */

/** Projects: a paintbrush — work being made, not a job board. */
