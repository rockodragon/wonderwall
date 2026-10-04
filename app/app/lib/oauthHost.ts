import { SITE_ORIGIN } from "./eventCalendar";
import { isGardenHost } from "../../convex/garden/brandHosts";

// Google sign-in only works when it starts on the same host it finishes on.
// Convex Auth keeps a one-time verifier in this origin's localStorage, and
// Convex sends the browser back to SITE_URL (the canonical host). Starting
// on any other host (the old creatives.exchange, a www. alias) leaves the
// verifier behind, the code exchange fails, and the person lands back on
// /login. So: hop to the canonical host first, same path and query, and let
// them press the button there.
//
// The Garden's own addresses are the exception (2026-10-03): the backend lets
// sign-in return to them (convex/garden/brandHosts.ts allowedAuthRedirect),
// so Google starts and finishes there and the person stays on The Garden.
export function isOAuthHost(hostname: string): boolean {
  return (
    hostname === new URL(SITE_ORIGIN).hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    isGardenHost(hostname)
  );
}

/** Where Google sign-in comes back to: `path`, else this page. On The
 *  Garden's addresses it has to be the full address, since a bare path means
 *  SITE_URL. */
export function oauthReturnTo(path?: string): string {
  const here = path ?? window.location.pathname + window.location.search;
  return isGardenHost(window.location.hostname) ? window.location.origin + here : here;
}

/** Extra sign-in params for asking for a code: on one of The Garden's
 *  addresses, the address itself, so the text says The Garden. Nothing
 *  anywhere else — the code then names TheCreative.exchange, as it always has. */
export function codeRequestParams(): { redirectTo?: string } {
  return isGardenHost(window.location.hostname) ? { redirectTo: `${window.location.origin}/` } : {};
}

/** True when it's safe to start Google sign-in here; otherwise sends the
 * browser to the same page on the canonical host and returns false. */
export function ensureOAuthHost(): boolean {
  if (isOAuthHost(window.location.hostname)) return true;
  window.location.assign(SITE_ORIGIN + window.location.pathname + window.location.search);
  return false;
}
