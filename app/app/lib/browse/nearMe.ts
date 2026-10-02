// The "Near me" cut, shared by People and Events (and the desk's browse views):
// keep what's within a radius of the visitor, nearest first. Pure; the browser
// location request itself lives in lib/useNearMe.ts.

import { haversineDistance } from "../useNearMe";

export type LatLng = { lat: number; lng: number };

/** Where the visitor is and how far they'll go, in miles. */
export type NearMe = { pos: LatLng; radius: number };

export type WithDistance<T> = T & { _distance: number };

/**
 * Items within `near.radius` miles of `near.pos`, nearest first. An item with
 * no coordinates is infinitely far, so it drops out.
 */
export function withinRadius<T extends { coordinates?: LatLng | null }>(items: readonly T[], near: NearMe): WithDistance<T>[] {
  return items
    .map((item) => ({
      ...item,
      _distance: item.coordinates
        ? haversineDistance(near.pos.lat, near.pos.lng, item.coordinates.lat, item.coordinates.lng)
        : Infinity,
    }))
    .filter((item) => item._distance <= near.radius)
    .sort((a, b) => a._distance - b._distance);
}

/** "< 1 mi" or "12 mi"; null for something with no location (infinitely far). */
export function distanceLabel(miles: number | null | undefined): string | null {
  if (miles == null || !isFinite(miles)) return null;
  return miles < 1 ? "< 1 mi" : `${Math.round(miles)} mi`;
}
