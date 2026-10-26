// Lightweight stand-in for real feature flags. PostHog is wired in the
// browser since 2026-10-09 (lib/posthog.ts, PostHogProvider in root.tsx),
// but no flag is set up in PostHog yet. To move a flag there, swap the constant
// below for `posthog.isFeatureEnabled("ffJobs")` and delete this file —
// same name on purpose so that's a one-line change, not a rename.
//
// Constants only, and no imports: the server reads FF_BACKING from here too
// (convex/garden/backingGate.ts), and a file that pulls in React or the
// router can't be bundled into a Convex function. The route-redirect hook
// that goes with these lives in useFeatureGate.ts.
//
// ffJobs: the job board (ongoing-role postings) is a real, working
// feature, deliberately held back from the V1 rollout — the strategy is
// "let people ask for it" rather than presenting every option up front.
// Not deleted, not broken — set to true to bring it back into nav/routes.
export const FF_JOBS = false;

// FF_V2 — the convention for anything held back from the current release:
// build it, gate it here, ship the code dark. One flag rather than one per
// item, because what's held back is a release, not a feature. Today it
// covers the rail's extras: the invite card, the other-communities chips
// and "Host your own" (2026-09-26, Rick — the lower-left was three ways of
// saying the same thing). Set to true to bring the V2 rail back.
export const FF_V2 = false;

// FF_DESK — desktop (md and up) trades the left sidebar for the palette in
// the lower-left corner, and /today becomes the desk (docs/features/
// desktop-desk-palette.md). Phones keep the bottom bar and the Today page
// either way. Set to false to bring the sidebar back.
export const FF_DESK = true;

// FF_TABLES — Tables: a regular gathering with seats, set dates and, for
// some, paid checkout (the `tables` branch, merged 2026-10-07). Shipped dark
// until it has had a real run, signed in and in Stripe test mode (Rick,
// 2026-10-07). Off hides every way in: the palette's Tables tool, the
// canvas's Tables row, the public nav link, a profile's Tables list and the
// first-visit note's mention; the /tables pages send people to Events. Set
// to true to open it.
export const FF_TABLES = false;

// FF_BACKING — backing a project with money (the "Back this" button on a
// project, "Support" on a public story, the /give plus-up on a project).
// Held back, on the server as well as on the page, until two things are
// true: Stripe Connect payouts have been proven end to end (a creative can
// actually be paid their 90%), and Stripe has approved us as a crowdfunding
// platform or the lawyer has said we may collect this way without it (beads
// sc15 and fpmn; docs/features/backing-payouts.md, "The problem today").
// Off, createBackingCheckout and a financial supportProject refuse with a
// readable reason before any Stripe call or row is written, and the pages
// hide every way to pay. A backing that was already paid still lands: the
// webhook (stripeHandlers.ts) does not read this flag. Cheering, memberships,
// tickets, gifts, pool contributions, products, classes and Tables are not
// affected. Set to true to open it.
export const FF_BACKING = false;
