// PostHog in the browser (Rick, 2026-10-09). Before this, nothing started
// posthog-js: every usePostHog()?.capture() in the app was a silent no-op,
// and the old pageview component (components/Analytics.tsx) sent nothing
// because VITE_PUBLIC_POSTHOG_KEY was never set at build time.
//
// The key is PostHog's public project key, the same project the backend
// sends to (convex/posthog.ts POSTHOG_API_KEY); it's meant to ship in page
// code. VITE_PUBLIC_POSTHOG_KEY overrides it. Settings are Rick's snippet:
// pageviews and autocapture by PostHog's defaults, and a person profile only
// for someone who signed in (identify by user id, in PostHogIdentify).
//
// Started on the live site only: never on localhost or a Pages preview, so
// testing doesn't count as people.

import posthog from "posthog-js";

const POSTHOG_KEY: string = import.meta.env.VITE_PUBLIC_POSTHOG_KEY || "phc_v7Aaz8wNG9vd6zGBjMm9oynfW4MH3eTNoG9GLJuewSjM";
const POSTHOG_HOST = "https://us.i.posthog.com";

/** Hosts that never report: local dev and Pages previews. */
export function isTestHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".pages.dev");
}

let started = false;

/** Start PostHog once, in the browser, on a live host. */
export function startPostHog(): void {
  if (started || typeof window === "undefined" || isTestHost(window.location.hostname)) return;
  started = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: "2026-05-30",
    person_profiles: "identified_only",
  });
}

export { posthog };
