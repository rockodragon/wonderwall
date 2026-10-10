// What the /admin/engagement-loops "PostHog setup" box shows for each loop
// (docs/features/engagement-loops.md): the webhook's URL and body, and the
// name of the secret's header. Never the secret itself: it lives only in the
// deployment's NUDGE_WEBHOOK_SECRET env var and in PostHog. No React, no
// Convex calls, so a test can hold it.

/** The header PostHog sends the shared secret in. */
export const NUDGE_SECRET_HEADER = "X-Nudge-Secret";

/** The env var on the Convex deployment that holds that secret. */
export const NUDGE_SECRET_ENV = "NUDGE_WEBHOOK_SECRET";

/** The deployment's HTTP origin. VITE_CONVEX_URL is the .convex.cloud address
 * the app talks to; HTTP routes (convex/http.ts) answer on .convex.site (the
 * location search does the same swap). Null when it isn't set or isn't a
 * Convex address. */
export function convexSiteUrl(convexUrl: string | undefined): string | null {
  const url = convexUrl?.trim().replace(/\/+$/, "");
  if (!url || !url.includes(".convex.cloud")) return null;
  return url.replace(".convex.cloud", ".convex.site");
}

/** Where PostHog posts. Null when the deployment's address isn't known. */
export function nudgeWebhookUrl(convexUrl: string | undefined): string | null {
  const site = convexSiteUrl(convexUrl);
  return site ? `${site}/api/nudges` : null;
}

/** The body to paste into PostHog's webhook step, written out: PostHog fills
 * in {event.distinct_id} with the person's id, which is our user id. */
export function nudgeWebhookBody(loopKey: string): string {
  return `{"loop": "${loopKey}", "distinct_id": "{event.distinct_id}"}`;
}
