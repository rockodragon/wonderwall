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

