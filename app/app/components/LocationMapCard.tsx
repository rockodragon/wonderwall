import { useState } from "react";

/** Location card (event page, organization page). The static-map image needs a Google
    Maps API key; when the key is missing (or the image fails to load —
    e.g. a free-text location Google can't geocode) we render a clean
    map-pin placeholder instead of a broken <img>. The "Open in Maps" link
    is always built from `location` — whatever the organizer's autocomplete
    pick resolved to, whether that was a venue name or a searched street
    address, since Places autocomplete resolves both from the same box. */
export function LocationMapCard({
  location,
  coordinates,
}: {
  location: string;
  coordinates?: { lat: number; lng: number };
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as
    | string
    | undefined;
  const mapsQuery = location;
  const mapSrc =
    mapsKey && !imgFailed
      ? coordinates
        ? `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}&zoom=15&size=400x400&scale=2&markers=color:red%7C${coordinates.lat},${coordinates.lng}&key=${mapsKey}`
        : `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(mapsQuery)}&zoom=15&size=400x400&scale=2&markers=color:red%7C${encodeURIComponent(mapsQuery)}&key=${mapsKey}`
      : null;

  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden hover:opacity-90 transition-opacity max-w-[300px]"
    >
      {mapSrc ? (
        <img
          src={mapSrc}
          alt={location}
          onError={() => setImgFailed(true)}
          className="w-full aspect-square object-cover bg-gray-200 dark:bg-gray-700"
        />
      ) : (
        <div className="w-full aspect-square flex flex-col items-center justify-center gap-3 bg-gray-100 dark:bg-gray-800 px-6 text-center">
          <svg
            className="w-10 h-10 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {location}
          </p>
        </div>
      )}
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800">
        <div className="min-w-0 mr-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {location}
          </p>
        </div>
        <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 flex-shrink-0">
          Open in Maps
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </span>
      </div>
    </a>
  );
}
