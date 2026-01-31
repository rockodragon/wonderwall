import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import posthog from "posthog-js";
import { PostHogProvider } from "@posthog/react";

// Get Convex site URL for PostHog proxy (bypasses ad blockers)
function getPostHogApiHost(): string {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  if (convexUrl) {
    // Convert https://xxx.convex.cloud to https://xxx.convex.site/api/ph
    const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
    return `${siteUrl}/api/ph`;
  }
  // Fallback to direct PostHog host
  return import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
}

// Only initialize PostHog in the browser if token is available
if (typeof window !== "undefined" && import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  const apiHost = getPostHogApiHost();
  console.log("[PostHog] Initializing with api_host:", apiHost);
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: apiHost,
    person_profiles: "identified_only",
    capture_pageview: false, // We'll capture manually to avoid double-counting
    disable_session_recording: false,
    debug: import.meta.env.DEV, // Enable debug mode in development
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <PostHogProvider client={posthog}>
      <StrictMode>
        <HydratedRouter />
      </StrictMode>
    </PostHogProvider>,
  );
});
