import { analyticsDistinctId, captureAnalytics, captureAnalyticsNow } from "../lib/posthog";

// Compatibility for the giving page: the SDK owns identity, buffering and
// unload delivery, just as it does for every other browser event. Identity
// and logout reset belong exclusively to PostHogIdentify.
const analytics = {
  capture: captureAnalytics,
  captureNow: captureAnalyticsNow,
  getDistinctId: analyticsDistinctId,
};

export function useAnalytics() {
  return analytics;
}
