import { useCallback, useRef, useState } from "react";

// Great-circle distance in miles. Shared by every "Near me" filter (People,
// Events, Learn) so the formula lives in exactly one place.
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const NEAR_ME_RADIUS_OPTIONS = [
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
] as const;

// ——————————————————————————————————————————————————————————————
// Asking for the location
// ——————————————————————————————————————————————————————————————

/** Safari (and most browsers) only show the location prompt for a tap, and
 * answer "denied" at once to a request made from an effect. So the request
 * runs from a tap on a button, never from page load. A slow Wi-Fi-only iPad
 * can take a while to find itself, and a cached fix from a few minutes ago is
 * fine for a 25-mile radius. */
export const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 5 * 60 * 1000,
};

export type GeoProblemKind = "denied" | "unavailable" | "timeout" | "unsupported";
export type GeoProblem = { kind: GeoProblemKind; message: string };

/** iPhone, iPad, and iPadOS Safari, which says it is a Mac but has a screen
 * you touch. They share Safari's Settings path for turning location on. */
export function isAppleTouch(ua: string, platform: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

const DENIED_APPLE =
  "Location is off for this site. Turn it on in Settings → Safari → Location, or the aA menu → Website Settings → Location → Ask or Allow.";
const DENIED_OTHER =
  "Location is blocked for this site. Allow it in your browser's site settings (the icon beside the address bar).";

/** The words for each way a location request can fail, from the
 * GeolocationPositionError code (1 denied, 2 unavailable, 3 timeout). The
 * three are different: only the first is about permission. */
export function geoProblemFor(code: number | undefined, apple = false): GeoProblem {
  if (code === 1) return { kind: "denied", message: apple ? DENIED_APPLE : DENIED_OTHER };
  if (code === 3) return { kind: "timeout", message: "Finding you took too long." };
  return { kind: "unavailable", message: "Couldn't get your location." };
}

export const GEO_UNSUPPORTED: GeoProblem = {
  kind: "unsupported",
  message: "This browser can't share your location.",
};

/** True only when the person already said yes to this site, so asking again
 * shows no prompt and needs no tap. Anything else (still asking, denied,
 * a browser without the Permissions API) is "not yet": Safari can report
 * "denied" when the setting is really "Ask", so that answer is never trusted. */
export async function geolocationAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Shared "Near me" geolocation state — browser location request, loading/
 * error state, and a mile radius. Used by People, Events, and Learn to
 * filter/sort their own item list by distance from the visitor. Each page
 * still owns its own haversineDistance() call against its item's
 * `coordinates` field (profiles/events/offerings all carry the same
 * { lat, lng } shape per convex/schema.ts, but the item types differ), since
 * that filtering logic is page-specific — only the browser geolocation
 * plumbing itself is identical everywhere, so it lives here once.
 *
 * Two ways in, and the difference matters on iPad:
 *  - requestLocation() / toggleNearMe() ask the browser right now. Call them
 *    only from a tap (onClick), the same tap, so the prompt can show.
 *  - askForLocation() is for effects (the ?near=1 link): it never asks the
 *    browser. It sets `geoAsk`, which the page answers with a "Use my
 *    location" button; the person's tap calls requestLocation().
 */
export function useNearMe() {
  const [nearMe, setNearMe] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoProblem, setGeoProblem] = useState<GeoProblem | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoAsk, setGeoAsk] = useState(false);
  const [radius, setRadius] = useState<number>(NEAR_ME_RADIUS_OPTIONS[0].value);
  const inFlight = useRef(false);

  /** Ask the browser for the location. Must run inside a tap handler. */
  const requestLocation = useCallback(() => {
    if (userPos) {
      setGeoAsk(false);
      setGeoProblem(null);
      setNearMe(true);
      return;
    }
    if (inFlight.current) return;
    setGeoAsk(false);
    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setGeoProblem(GEO_UNSUPPORTED);
      return;
    }
    const apple = isAppleTouch(navigator.userAgent, navigator.platform, navigator.maxTouchPoints ?? 0);
    inFlight.current = true;
    setGeoLoading(true);
    setGeoProblem(null);
    // Called straight from the tap: nothing awaited before this line.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        inFlight.current = false;
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMe(true);
        setGeoLoading(false);
      },
      (err) => {
        inFlight.current = false;
        setGeoProblem(geoProblemFor(err.code, apple));
        setGeoLoading(false);
      },
      GEO_OPTIONS,
    );
  }, [userPos]);

  /** For effects: turn Near me on if the position is known or already
   * allowed; otherwise raise `geoAsk` and wait for a tap. Never prompts. */
  const askForLocation = useCallback(() => {
    if (userPos) {
      setGeoProblem(null);
      setNearMe(true);
      return;
    }
    setGeoProblem(null);
    setGeoAsk(true);
    void geolocationAllowed().then((allowed) => {
      if (allowed) requestLocation();
    });
  }, [userPos, requestLocation]);

  /** Near me off, and nothing left asking or complaining. */
  const resetNearMe = useCallback(() => {
    setNearMe(false);
    setGeoAsk(false);
    setGeoProblem(null);
  }, []);

  const toggleNearMe = useCallback(() => {
    if (nearMe) resetNearMe();
    else requestLocation();
  }, [nearMe, requestLocation, resetNearMe]);

  return {
    nearMe,
    userPos,
    /** The plain-words reason the last request failed, or "". */
    geoError: geoProblem?.message ?? "",
    geoProblem,
    geoLoading,
    /** Near me was asked for without a tap: show "Use my location". */
    geoAsk,
    radius,
    setRadius,
    requestLocation,
    askForLocation,
    toggleNearMe,
    resetNearMe,
  };
}
