import { useCallback, useState } from "react";
import type { LocationSuggestion } from "../components/LocationAutocomplete";

/**
 * Shape of the structured location fields as they're stored on a Convex doc
 * (events, garden projects, offerings, profiles, …) — a display string plus
 * the structured half (locationType/address/coordinates/placeId) that a
 * LocationAutocomplete pick fills in.
 */
export interface LocationFieldSource {
  location?: string;
  // Convex docs store this as a plain string (v.optional(v.string())), not
  // LocationSuggestion's narrower locationType union — matches the cast
  // offerings.tsx's existing (correct) implementation already does when
  // rebuilding a LocationSuggestion from a stored record.
  locationType?: string;
  address?: LocationSuggestion["address"];
  coordinates?: LocationSuggestion["coordinates"];
  placeId?: string;
}

export interface LocationFieldArgs {
  location: string | undefined;
  locationType: LocationSuggestion["locationType"] | undefined;
  address: LocationSuggestion["address"] | undefined;
  coordinates: LocationSuggestion["coordinates"] | undefined;
  placeId: string | undefined;
}

function suggestionFromSource(
  doc: LocationFieldSource | null | undefined,
): LocationSuggestion | null {
  if (!doc?.location || !doc?.locationType) return null;
  return {
    placeId: doc.placeId ?? "",
    displayName: doc.location,
    formattedAddress: doc.location,
    locationType: doc.locationType as LocationSuggestion["locationType"],
    address: doc.address ?? {},
    coordinates: doc.coordinates,
  };
}

/**
 * Shared LocationAutocomplete wiring for every form that collects a
 * location: tracks the display string plus the resolved LocationSuggestion
 * side by side, and — the part that was missing in onboarding.tsx and
 * settings.tsx's ProfileEditForm — clears the resolved suggestion back to
 * null the moment the user edits the text away from what they picked, so a
 * stale placeId/coordinates/address can never be submitted alongside a
 * freshly-typed (and un-geocoded) string.
 *
 * `hydrate`/the constructor argument accept any doc with
 * location/locationType/address/coordinates/placeId fields (events, garden
 * projects, offerings, profiles all share this shape) and rebuild the
 * LocationSuggestion an edit form needs to seed `selected` — without it, an
 * edit form that never re-picks a location patches its structured fields to
 * undefined on save (event.tsx's bug: opening an existing event's edit form
 * and saving without touching location wiped it).
 */
export function useLocationField(initial?: LocationFieldSource | null) {
  const [value, setValue] = useState(() => initial?.location ?? "");
  const [selected, setSelected] = useState<LocationSuggestion | null>(() =>
    suggestionFromSource(initial),
  );

  // Mirrors the guard every correct call site already had: if the user
  // clears the field, or edits it so it no longer contains the picked
  // suggestion's display name, the resolved suggestion is stale — drop it
  // rather than let it ride along with unrelated freshly-typed text.
  const onChange = useCallback((newValue: string) => {
    setValue(newValue);
    setSelected((prev) => {
      if (!prev) return null;
      if (!newValue || !newValue.includes(prev.displayName)) return null;
      return prev;
    });
  }, []);

  // `displayValue` lets a caller show something other than the suggestion's
  // raw displayName (settings.tsx's ProfileEditForm reformats to "City, ST")
  // while keeping the guard's baseline in sync with what's actually shown —
  // `selected.displayName` is overwritten to match so a later onChange
  // compares against the right string.
  const onSelect = useCallback(
    (suggestion: LocationSuggestion, displayValue?: string) => {
      const finalDisplay = displayValue ?? suggestion.displayName;
      setValue(finalDisplay);
      setSelected({ ...suggestion, displayName: finalDisplay });
    },
    [],
  );

  const hydrate = useCallback((doc: LocationFieldSource | null | undefined) => {
    setValue(doc?.location ?? "");
    setSelected(suggestionFromSource(doc));
  }, []);

  const toArgs = useCallback((): LocationFieldArgs => {
    const trimmed = value.trim();
    return {
      location: trimmed || undefined,
      locationType: selected?.locationType,
      address: selected?.address,
      coordinates: selected?.coordinates,
      placeId: selected?.placeId,
    };
  }, [value, selected]);

  return { value, selected, onChange, onSelect, hydrate, toArgs };
}
