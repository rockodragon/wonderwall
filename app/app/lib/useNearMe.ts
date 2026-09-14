import { useCallback, useState } from "react";

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

/**
 * Shared "Near me" geolocation state — browser location request, loading/
 * error state, and a mile radius. Used by People, Events, and Learn to
 * filter/sort their own item list by distance from the visitor. Each page
 * still owns its own haversineDistance() call against its item's
 * `coordinates` field (profiles/events/offerings all carry the same
 * { lat, lng } shape per convex/schema.ts, but the item types differ), since
 * that filtering logic is page-specific — only the browser geolocation
 * plumbing itself is identical everywhere, so it lives here once.
 */
export function useNearMe() {
  const [nearMe, setNearMe] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [radius, setRadius] = useState<number>(NEAR_ME_RADIUS_OPTIONS[0].value);

  const requestLocation = useCallback(() => {
    if (userPos) {
      setNearMe(true);
      return;
    }
    if (!navigator.geolocation) {
      setGeoError("Location not supported by your browser");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearMe(true);
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(err.code === 1 ? "Location access denied" : "Could not determine location");
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, [userPos]);

  const toggleNearMe = useCallback(() => {
    if (nearMe) setNearMe(false);
    else requestLocation();
  }, [nearMe, requestLocation]);

  return {
    nearMe,
    userPos,
    geoError,
    geoLoading,
    radius,
    setRadius,
    requestLocation,
    toggleNearMe,
  };
}
