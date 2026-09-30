import { SITE_ORIGIN } from "./eventCalendar";

// Google sign-in only works when it starts on the same host it finishes on.
// Convex Auth keeps a one-time verifier in this origin's localStorage, and
// Convex sends the browser back to SITE_URL (the canonical host). Starting
// on any other host (the old creatives.exchange, a www. alias, a community
// domain) leaves the verifier behind, the code exchange fails, and the
// person lands back on /login. So: hop to the canonical host first, same
// path and query, and let them press the button there.
export function isOAuthHost(hostname: string): boolean {
  return (
    hostname === new URL(SITE_ORIGIN).hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

/** True when it's safe to start Google sign-in here; otherwise sends the
 * browser to the same page on the canonical host and returns false. */
export function ensureOAuthHost(): boolean {
  if (isOAuthHost(window.location.hostname)) return true;
  window.location.assign(SITE_ORIGIN + window.location.pathname + window.location.search);
  return false;
}
