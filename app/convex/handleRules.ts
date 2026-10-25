// A person's address: thecreative.exchange/@handle. The profile is the
// portfolio, and this is its one public door (routes/slug.tsx).
//
// The rules are Instagram's, so people can bring the name they already use:
// 1–30 characters; letters, numbers, periods and underscores; no period at
// the start or end, never two in a row. Case doesn't matter: a handle is
// stored lowercase and compared lowercase.
//
// No Convex imports on purpose (as garden/gigRules.ts): convex/handles.ts
// applies these on the server and routes/settings.tsx gives the same answer
// as a person types, so the two can't disagree. Unit-tested in
// handleRules.test.ts without Convex.

export const HANDLE_MAX_LENGTH = 30;

/** How long an old address keeps forwarding to the new one after a change,
 * and stays off the market (handles.claimHandle). */
export const HANDLE_FORWARD_DAYS = 90;
export const HANDLE_FORWARD_MS = HANDLE_FORWARD_DAYS * 24 * 60 * 60 * 1000;

/** First path segments the site already uses (app/routes.ts, public/), plus
 * names that would read as the site's own (api, help, support, exchange). A
 * community's /<slug> can't be one (garden/communityDomains.ts
 * RESERVED_SLUGS), and neither can a person's @handle. handleRules.test.ts
 * checks every static route in app/routes.ts is here. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set(
  (
    "about admin api assets brand c campaign claim code communities coverage create demo docs e events exchange faq " +
    "favorites for fund garden give grant-program help host ia invite j jobs join legal login messages " +
    "oauth-callback offerings offers onboarding opportunities orgs patron people pricing profile projects " +
    "search settings showcase signup story support tables today unsubscribe works"
  ).split(" "),
);

/** What a person typed, as an address: no "@", no space around it, lowercase. */
export function cleanHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export type HandleProblem = "empty" | "too_long" | "characters" | "periods" | "reserved";

/** The line a person reads for each problem. "Taken" is the server's to say
 * (handles.ts HANDLE_TAKEN), since only it can look. */
export const HANDLE_PROBLEM_REASON: Record<HandleProblem, string> = {
  empty: "Type an address.",
  too_long: `Keep it to ${HANDLE_MAX_LENGTH} characters.`,
  characters: "Use letters, numbers, periods and underscores.",
  periods: "Periods can't start or end it, or sit side by side.",
  reserved: "That address is reserved.",
};

/** Why a cleaned handle breaks the rules, or null when it doesn't. */
export function handleProblem(handle: string): HandleProblem | null {
  if (!handle) return "empty";
  if (handle.length > HANDLE_MAX_LENGTH) return "too_long";
  if (!/^[a-z0-9._]+$/.test(handle)) return "characters";
  if (handle.startsWith(".") || handle.endsWith(".") || handle.includes("..")) return "periods";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

/** The address as a path on the site: /@handle. */
export function profilePath(handle: string): string {
  return `/@${handle}`;
}
