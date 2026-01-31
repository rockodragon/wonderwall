import { useAction } from "convex/react";
import { useCallback, useRef, useEffect } from "react";
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

export function useAnalytics() {
  const captureAction = useAction(api.posthog.capture);
  const identifyAction = useAction(api.posthog.identify);
  const batchAction = useAction(api.posthog.batch);

  const distinctIdRef = useRef<string | null>(null);
  const queueRef = useRef<
    Array<{
      event: string;
      distinctId: string;
      properties?: Record<string, unknown>;
    }>
  >([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize distinct ID on mount
  useEffect(() => {
    distinctIdRef.current = getAnonymousId();
  }, []);

  const getDistinctId = useCallback(() => {
    if (!distinctIdRef.current) {
      distinctIdRef.current = getAnonymousId();
    }
    return distinctIdRef.current;
  }, []);

  // Flush queued events
  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;

    const events = [...queueRef.current];
    queueRef.current = [];

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    try {
      await batchAction({ events });
    } catch (error) {
      console.error("[Analytics] Batch send failed:", error);
    }
  }, [batchAction]);

  // Capture an event (queued for batching)
  const capture = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      const distinctId = getDistinctId();

      queueRef.current.push({
        event,
        distinctId,
        properties,
      });

      // Flush after 2 seconds of inactivity or when queue reaches 10 events
      if (queueRef.current.length >= 10) {
        flush();
      } else {
        if (flushTimeoutRef.current) {
          clearTimeout(flushTimeoutRef.current);
        }
        flushTimeoutRef.current = setTimeout(flush, 2000);
      }
    },
    [getDistinctId, flush],
  );

  // Capture immediately (for important events)
  const captureNow = useCallback(
    async (event: string, properties?: Record<string, unknown>) => {
      const distinctId = getDistinctId();
      try {
        await captureAction({ event, distinctId, properties });
      } catch (error) {
        console.error("[Analytics] Capture failed:", error);
      }
    },
    [captureAction, getDistinctId],
  );

  // Identify a user
  const identify = useCallback(
    async (userId: string, properties?: Record<string, unknown>) => {
      // Update the distinct ID to the user's ID
      const oldId = distinctIdRef.current;
      distinctIdRef.current = userId;
      localStorage.setItem("analytics_id", userId);

      // Flush any pending events with old ID before identifying
      await flush();

      try {
        await identifyAction({
          distinctId: userId,
          properties: {
            ...properties,
            $anon_distinct_id: oldId, // Link anonymous to identified
          },
        });
      } catch (error) {
        console.error("[Analytics] Identify failed:", error);
      }
    },
    [identifyAction, flush],
  );

  // Reset analytics (on logout)
  const reset = useCallback(() => {
    distinctIdRef.current = crypto.randomUUID();
    localStorage.setItem("analytics_id", distinctIdRef.current);
    queueRef.current = [];
  }, []);

  // Flush on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (queueRef.current.length > 0) {
        // Use sendBeacon for reliability on page unload
        // Fall back to sync flush for browsers without sendBeacon
        flush();
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [flush]);

  return {
    capture,
    captureNow,
    identify,
    reset,
    flush,
    getDistinctId,
  };
}
