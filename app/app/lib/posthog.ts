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
import { errorCode } from "./convexError";

const POSTHOG_KEY: string = import.meta.env.VITE_PUBLIC_POSTHOG_KEY || "phc_v7Aaz8wNG9vd6zGBjMm9oynfW4MH3eTNoG9GLJuewSjM";
const POSTHOG_HOST = "https://us.i.posthog.com";

/** Hosts that never report: local dev and Pages previews. */
export function isTestHost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]" || hostname === "::1" || hostname.endsWith(".pages.dev");
}

/** Every capture adapter uses the same browser/environment gate. */
export function browserAnalyticsReady(): boolean {
  return typeof window !== "undefined" && !isTestHost(window.location.hostname) && !!posthog.__loaded;
}

/** Error text can contain addresses, phone numbers or auth tokens. */
export function analyticsErrorProperties(error: unknown): { error_code: string } {
  const code = errorCode(error);
  return { error_code: code && /^[a-z][a-z0-9_]{0,63}$/.test(code) ? code : "unknown" };
}

export function captureAnalytics(event: string, properties?: Record<string, unknown>): void {
  if (browserAnalyticsReady()) posthog.capture(event, properties);
}

/** Ask the SDK to send now; this does not promise receipt by PostHog. */
export async function captureAnalyticsNow(event: string, properties?: Record<string, unknown>): Promise<void> {
  if (browserAnalyticsReady()) posthog.capture(event, properties, { send_instantly: true });
}

export function analyticsDistinctId(): string | null {
  return browserAnalyticsReady() ? posthog.get_distinct_id() : null;
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
