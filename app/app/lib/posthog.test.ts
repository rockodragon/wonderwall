import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { analyticsDistinctId, analyticsErrorProperties, captureAnalytics, captureAnalyticsNow, isTestHost } from "./posthog";
import { useAnalytics } from "../hooks/useAnalytics";

const sdk = vi.hoisted(() => ({ __loaded: true, capture: vi.fn(), get_distinct_id: vi.fn(() => "users:one") }));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => { vi.clearAllMocks(); sdk.__loaded = true; });
afterEach(() => vi.unstubAllGlobals());

describe("isTestHost", () => {
  it("keeps local dev and Pages previews out of PostHog", () => {
    for (const h of ["localhost", "app.localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1", "abc123.wonderwall.pages.dev", "wonderwall.pages.dev"]) expect(isTestHost(h)).toBe(true);
  });
  it("reports from the live addresses", () => {
    for (const h of ["thecreative.exchange", "www.thecreative.exchange", "createthegarden.com", "garden.thecreative.exchange"]) expect(isTestHost(h)).toBe(false);
  });
});

describe("shared browser analytics", () => {
  it("keeps giving events on the SDK identity instead of a separate local identity", async () => {
    vi.stubGlobal("window", { location: { hostname: "createthegarden.com" } });
    const analytics = useAnalytics();
    analytics.capture("giving_decided", { target: "project" });
    expect(sdk.capture).toHaveBeenCalledWith("giving_decided", { target: "project" });
    expect(analytics.getDistinctId()).toBe("users:one");
    sdk.get_distinct_id.mockReturnValueOnce("users:two");
    expect(analytics.getDistinctId()).toBe("users:two");
    await analytics.captureNow("giving_notice_opened");
    expect(sdk.capture).toHaveBeenLastCalledWith("giving_notice_opened", undefined, { send_instantly: true });
  });

  it("does not send from server rendering, local development, previews, or before SDK initialization", async () => {
    vi.stubGlobal("window", undefined);
    captureAnalytics("giving_decided");
    expect(analyticsDistinctId()).toBeNull();
    for (const hostname of ["localhost", "wonderwall.pages.dev"]) {
      vi.stubGlobal("window", { location: { hostname } });
      captureAnalytics("giving_decided");
      await captureAnalyticsNow("giving_decided");
      expect(analyticsDistinctId()).toBeNull();
    }
    vi.stubGlobal("window", { location: { hostname: "createthegarden.com" } });
    sdk.__loaded = false;
    captureAnalytics("giving_decided");
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("captures a machine error code without raw message, phone, address or token data", () => {
    const sensitive = "person@example.com +16195550100 token=secret";
    expect(analyticsErrorProperties(new ConvexError({ code: "blocked", reason: sensitive }))).toEqual({ error_code: "blocked" });
    expect(analyticsErrorProperties(new Error(sensitive))).toEqual({ error_code: "unknown" });
    expect(analyticsErrorProperties(new ConvexError({ code: sensitive }))).toEqual({ error_code: "unknown" });
  });
});
