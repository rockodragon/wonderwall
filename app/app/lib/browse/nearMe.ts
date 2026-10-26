// The "Near me" cut, shared by People and Events (and the desk's browse views):
// keep what's within a radius of the visitor, nearest first. Pure, with no
// React, so the server's People directory (convex/profiles.ts directory) runs
// the same cut; the browser location request itself lives in lib/useNearMe.ts.

export type LatLng = { lat: number; lng: number };

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

/** Where the visitor is and how far they'll go, in miles. */
export type NearMe = {
  pos: LatLng;
  radius: number;
  /** Keep items with no coordinates (online, TBD), after the located ones.
   *  Set when Near me came on by itself from the profile's location, so a
   *  default nobody chose doesn't hide events anyone can attend. */
  keepUnlocated?: boolean;
};

export type WithDistance<T> = T & { _distance: number };

/**
 * Items within `near.radius` miles of `near.pos`, nearest first. An item with
 * no coordinates is infinitely far, so it drops out — unless `keepUnlocated`,
 * which keeps it at the end.
 */
export function withinRadius<T extends { coordinates?: LatLng | null }>(items: readonly T[], near: NearMe): WithDistance<T>[] {
  return items
    .map((item) => ({
      ...item,
      _distance: item.coordinates
        ? haversineDistance(near.pos.lat, near.pos.lng, item.coordinates.lat, item.coordinates.lng)
        : Infinity,
    }))
    .filter((item) => item._distance <= near.radius || (!!near.keepUnlocated && !item.coordinates))
    .sort((a, b) => (a._distance === b._distance ? 0 : a._distance - b._distance));
}

/** "< 1 mi" or "12 mi"; null for something with no location (infinitely far). */
export function distanceLabel(miles: number | null | undefined): string | null {
  if (miles == null || !isFinite(miles)) return null;
  return miles < 1 ? "< 1 mi" : `${Math.round(miles)} mi`;
}
