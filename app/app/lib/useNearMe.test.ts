import { afterEach, describe, expect, it, vi } from "vitest";
import { GEO_OPTIONS, GEO_UNSUPPORTED, geolocationAllowed, geoProblemFor, isAppleTouch } from "./useNearMe";

describe("geoProblemFor", () => {
  it("denied (1) tells an iPad where to turn location on", () => {
    const p = geoProblemFor(1, true);
    expect(p.kind).toBe("denied");
    expect(p.message).toContain("Settings → Safari → Location");
    expect(p.message).toContain("aA menu → Website Settings → Location");
    expect(p.message).toMatch(/Ask or Allow/);
  });

  it("denied (1) elsewhere points to the site settings, not Safari's", () => {
    const p = geoProblemFor(1, false);
    expect(p.kind).toBe("denied");
    expect(p.message).not.toContain("Safari");
    expect(p.message).toContain("site settings");
  });

  it("unavailable (2) and timeout (3) are not called denied", () => {
    const unavailable = geoProblemFor(2, true);
    const timeout = geoProblemFor(3, true);
    expect(unavailable).toEqual({ kind: "unavailable", message: "Couldn't get your location." });
    expect(timeout.kind).toBe("timeout");
    expect(timeout.message).not.toMatch(/denied|off|blocked/i);
    expect(unavailable.message).not.toMatch(/denied|off|blocked/i);
  });

  it("an unknown or missing code falls back to unavailable, never denied", () => {
    expect(geoProblemFor(undefined).kind).toBe("unavailable");
    expect(geoProblemFor(99).kind).toBe("unavailable");
  });

  it("a browser with no location support says so", () => {
    expect(GEO_UNSUPPORTED.kind).toBe("unsupported");
    expect(GEO_UNSUPPORTED.message).toMatch(/can't share your location/);
  });
});

describe("isAppleTouch", () => {
  it("is true for iPhone and iPad user agents", () => {
    expect(isAppleTouch("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isAppleTouch("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad", 5)).toBe(true);
  });

  it("is true for iPadOS Safari, which reports a Mac with a touch screen", () => {
    expect(isAppleTouch("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
  });

  it("is false for a Mac with no touch screen and for Windows", () => {
    expect(isAppleTouch("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(isAppleTouch("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0)).toBe(false);
  });
});

describe("GEO_OPTIONS", () => {
  it("is low accuracy, a 15 second wait, and accepts a position a few minutes old", () => {
    expect(GEO_OPTIONS.enableHighAccuracy).toBe(false);
    expect(GEO_OPTIONS.timeout).toBe(15000);
    expect(GEO_OPTIONS.maximumAge).toBeGreaterThanOrEqual(2 * 60 * 1000);
    expect(GEO_OPTIONS.maximumAge).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe("geolocationAllowed", () => {
  afterEach(() => vi.unstubAllGlobals());

  const withPermissions = (permissions: unknown) => vi.stubGlobal("navigator", { permissions });

  it("is true only when the person already said yes", async () => {
    withPermissions({ query: async () => ({ state: "granted" }) });
    expect(await geolocationAllowed()).toBe(true);
  });

  it("is false while still asking, so a tap is needed", async () => {
    withPermissions({ query: async () => ({ state: "prompt" }) });
    expect(await geolocationAllowed()).toBe(false);
  });

  it("is false for 'denied' too: Safari can say that when the setting is really Ask", async () => {
    withPermissions({ query: async () => ({ state: "denied" }) });
    expect(await geolocationAllowed()).toBe(false);
  });

  it("is false when the Permissions API is missing or throws", async () => {
    withPermissions(undefined);
    expect(await geolocationAllowed()).toBe(false);
    withPermissions({
      query: async () => {
        throw new TypeError("unsupported permission name");
      },
    });
    expect(await geolocationAllowed()).toBe(false);
  });
});
