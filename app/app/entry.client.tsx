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
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: getPostHogApiHost(),
    person_profiles: "identified_only",
    capture_pageview: false, // We'll capture manually to avoid double-counting
    disable_session_recording: false,
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
