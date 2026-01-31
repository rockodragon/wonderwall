import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

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

export function Analytics() {
  const location = useLocation();
  const capture = useAction(api.posthog.capture);
  const lastPathRef = useRef<string>("");

  useEffect(() => {
    // Skip if same path (prevents double-tracking)
    if (lastPathRef.current === location.pathname) return;
    lastPathRef.current = location.pathname;

    const distinctId = getAnonymousId();

    // Track pageview - use underscore prefix, server converts to $ for PostHog
    capture({
      event: "$pageview",
      distinctId,
      properties: {
        _current_url: window.location.href,
        _pathname: location.pathname,
        _host: window.location.host,
        _referrer: document.referrer || undefined,
        _screen_width: window.screen.width,
        _screen_height: window.screen.height,
      },
    }).catch((err) => {
      console.error("[Analytics] Pageview failed:", err);
    });
  }, [location.pathname, capture]);

  return null;
}
