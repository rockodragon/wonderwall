import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

// Generate a unique anonymous ID for the session
function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";

  let id = localStorage.getItem("analytics_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("analytics_id", id);
  }
  return id;
}

// Get the PostHog proxy URL from Convex
function getProxyUrl(): string {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
  if (convexUrl) {
    return convexUrl.replace(".convex.cloud", ".convex.site") + "/api/ph";
  }
  return "https://us.i.posthog.com";
}

// Send event via HTTP proxy (gets client IP from headers for geo)
async function captureEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
) {
  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  const proxyUrl = getProxyUrl();
  await fetch(`${proxyUrl}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event,
      distinct_id: distinctId,
      properties: properties || {},
      timestamp: new Date().toISOString(),
    }),
  });
}

export function Analytics() {
  const location = useLocation();
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    // Skip if same path (prevents double-tracking)
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;

    const distinctId = getAnonymousId();
    console.log("[Analytics] Tracking pageview:", location.pathname);

    // Track pageview via HTTP proxy (IP extracted from headers for geo)
    captureEvent("$pageview", distinctId, {
      $current_url: window.location.href,
      $pathname: location.pathname,
      $host: window.location.host,
      $referrer: document.referrer || undefined,
      $screen_width: window.screen.width,
      $screen_height: window.screen.height,
    })
      .then(() => console.log("[Analytics] Pageview sent"))
      .catch((err) => console.error("[Analytics] Pageview failed:", err));
  }, [location.pathname]);

  return null;
}
