// Lightweight stand-in for real feature flags — PostHog isn't actually
// wired up yet (no VITE_PUBLIC_POSTHOG_KEY, no PostHogProvider anywhere;
// every posthog?.capture()/isFeatureEnabled() call in the app is currently
// a silent no-op). When PostHog is set up for real, swap the constant
// below for `posthog.isFeatureEnabled("ffJobs")` and delete this file —
// same name on purpose so that's a one-line change, not a rename.
//
// ffJobs: the job board (ongoing-role postings) is a real, working
// feature, deliberately held back from the V1 rollout — the strategy is
// "let people ask for it" rather than presenting every option up front.
// Not deleted, not broken — set to true to bring it back into nav/routes.
export const FF_JOBS = false;

// Hook, not just a constant, so the gate lives in one place: a route calls
// this once at the top of its component and gets a redirect-away for free
// if the flag is off, instead of every /jobs/* file reimplementing the
// same useEffect+navigate.
import { useEffect } from "react";
import { useNavigate } from "react-router";

export function useFeatureGate(enabled: boolean, redirectTo: string) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!enabled) navigate(redirectTo, { replace: true });
  }, [enabled, redirectTo, navigate]);
  return enabled;
}


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
