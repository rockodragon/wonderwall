import { useConvexAuth, useQuery } from "convex/react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { usePostHog } from "@posthog/react";
import { api } from "../../convex/_generated/api";
import { InviteCTA } from "../components/InviteCTA";
import { Wordmark } from "../components/Wordmark";

// V1 (docs/the-exchange-v1-prd.md §5): Projects / People / Events, full
// stop. "The Garden" retires as a nav destination (superseded); "Portfolios"
// (/works) drops from nav - the page itself stays live, un-linked rather
// than deleted, same pattern as /organizations. Everything else (Favorites,
// Profile, Messages, admin Crawler) is real but secondary — the desktop
// sidebar visually demotes it below a divider so the primary pitch stays to
// three things; mobile's bottom bar has no room for that hierarchy, so it
// keeps showing the full set.
const primaryNavItems = [
  { path: "/projects", label: "Projects", icon: BriefcaseIcon },
  { path: "/search", label: "People", icon: SearchIcon },
  { path: "/events", label: "Events", icon: CalendarIcon },
  { path: "/offerings", label: "Classes", icon: ClassesIcon },
];
const secondaryNavItems = [
  { path: "/favorites", label: "Favorites", icon: HeartIcon },
  { path: "/settings", label: "Profile", icon: UserIcon },
];
const navItems = [...primaryNavItems, ...secondaryNavItems];

export default function AppLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const posthog = usePostHog();
  const profile = useQuery(api.profiles.getMyProfile);
  const unreadCount = useQuery(api.messaging.getUnreadCount) ?? 0;
  const notificationCount = useQuery(api.notifications.getUnreadCount) ?? 0;
  // Notifications don't get their own nav row — the count folds into the
  // Messages badge instead (2026-08-30, on request).
  const sidebarBadgeCount = unreadCount + notificationCount;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Identify user in PostHog when authenticated and profile loaded
  useEffect(() => {
    if (isAuthenticated && profile && posthog) {
      posthog.identify(profile.userId, {
        email: profile.attributes?.email,
        name: profile.name,
        plan: profile.plan,
        jobFunctions: profile.jobFunctions,
      });
    }
  }, [isAuthenticated, profile, posthog]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Main content */}
      <main className="pb-20 md:pb-0 md:pl-64">
        <Outlet />
      </main>

      {/* Mobile bottom nav - icons only to fit 7 items */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 md:hidden">
        <div className="flex justify-around py-3">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const isProfileItem = item.path === "/settings";
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-center p-2 ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
                aria-label={item.label}
              >
                {isProfileItem && profile?.imageUrl ? (
                  <img
                    src={profile.imageUrl}
                    alt={profile.name}
                    className={`w-6 h-6 rounded-full object-cover ${isActive ? "ring-2 ring-blue-500" : ""}`}
                  />
                ) : (
                  <item.icon className="w-6 h-6" />
                )}
              </Link>
            );
          })}
          <Link
            to="/messages"
            className={`flex items-center justify-center p-2 ${
              location.pathname.startsWith("/messages")
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-500 dark:text-gray-400"
            }`}
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
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
        <div className="p-6">
          <Link to="/">
            <Wordmark size="sm" tone="adaptive" />
          </Link>
        </div>

        <nav className="px-4 space-y-1">
          {primaryNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Secondary — real destinations, just not the three-item pitch.
            Pushed to the bottom of the rail (mt-auto), not just below a
            divider, so they read as genuinely lower-priority. */}
        <nav className="mt-auto px-4 py-3 space-y-1 border-t border-gray-100 dark:border-gray-800">
          {secondaryNavItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const isProfileItem = item.path === "/settings";
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {isProfileItem && profile?.imageUrl ? (
                  <img
                    src={profile.imageUrl}
                    alt={profile.name}
                    className="w-4.5 h-4.5 rounded-full object-cover"
                  />
                ) : (
                  <item.icon className="w-4.5 h-4.5" />
                )}
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/messages"
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              location.pathname.startsWith("/messages")
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <div className="relative">
              <EnvelopeIcon className="w-4.5 h-4.5" />
              {sidebarBadgeCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                  {sidebarBadgeCount > 99 ? "99+" : sidebarBadgeCount}
                </span>
              )}
            </div>
            Messages
          </Link>
          {/* Admin-only: Crawler link */}
          {profile?.isAdmin && (
            <Link
              to="/admin/crawler"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                location.pathname.startsWith("/admin/crawler")
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <CrawlerIcon className="w-4.5 h-4.5" />
              Crawler
            </Link>
          )}
        </nav>

        <div className="p-4">
          <InviteCTA />
        </div>
      </aside>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
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
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
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

function BriefcaseIcon({ className }: { className?: string }) {
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
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
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
