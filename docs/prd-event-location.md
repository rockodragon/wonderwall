# Location system

Status: **implemented** — this doc originally shipped as a pre-build PRD
(hence the filename) and proposed Radar as the geocoding provider; the build
went a different direction (Google Places) and grew to cover more than
events. This revision replaces the proposal with what's actually running, so
it stops misleading anyone who reads it before touching this code.

## What it covers

One location system, shared by four tables: `events`, `projects`,
`offerings`, `profiles`. All four store the same shape and go through the
same pipeline — see "Data model" and "Architecture" below. `jobs` is the one
exception: its `location` is a `"Remote" | "Hybrid" | "On-site"` enum plus
separate `city`/`state`/`country`/`zipCode` strings, a different and older
model that predates this system and wasn't migrated (`convex/schema.ts`'s
`jobs` table).

## Provider: Google Places API (New)

Not Radar. `convex/location.ts`'s `autocomplete` HTTP action calls
`places.googleapis.com/v1/places:autocomplete`, then fetches
`places.googleapis.com/v1/places/{placeId}` for each of the top 5
predictions to get real coordinates and structured address components
(`GOOGLE_PLACES_API_KEY` env var). `profiles.ts`'s `backfillCoordinates`
internal action uses the same API's `:searchText` endpoint to resolve
coordinates for profiles that have a location string but predate this
pipeline.

Typing `"online"` or `"tbd"` is special-cased in `convex/location.ts` to
return a synthetic suggestion without an API call — no key needed, no rate
limit spent, for the two location types that aren't places at all.

## Architecture (the DRY part)

Every form that collects a location uses the same two pieces:

- **`app/app/components/LocationAutocomplete.tsx`** — the debounced (300ms)
  text input + dropdown. Calls the `/api/location/autocomplete` HTTP action
  above, renders suggestions with a type icon (venue/city/online/tbd), and
  on selection calls back with a `LocationSuggestion`: `placeId`,
  `displayName`, `formattedAddress`, `locationType`, `address` (street/
  city/state/stateCode/zip/country/countryCode), and `coordinates` (when
  Google returns one). Also exports `LocationVerifiedHint`, a small status
  line every call site renders directly under the input — green "Location
  verified" when the value matches a picked suggestion, amber "Not matched
  to a place yet" when it doesn't. Typing without picking a suggestion was a
  silent failure mode before this existed: the string saves fine, but
  carries no coordinates, so it's invisible to "near me" search and gets a
  fuzzier map link. The hint makes that visible instead of silent.

- **`app/app/lib/useLocationField.ts`** — the shared state: tracks the
  display string and the resolved `LocationSuggestion` side by side, clears
  the resolved suggestion the moment the text is edited away from what was
  picked (so a stale placeId/coordinates can never ride along with
  unrelated freshly-typed text), and exposes `toArgs()` — what every create/
  edit mutation spreads into its args: `{ location, locationType, address,
  coordinates, placeId }`.

Call sites: `CreateEventModal.tsx` + `event.tsx`'s edit form (events),
`projects.tsx`'s create and edit forms (projects, gated behind a "This can
be done remotely" checkbox — see "Remote" below), `offerings.tsx`'s create
and edit forms (same remote-checkbox pattern), `settings.tsx`'s
`ProfileEditForm`, and `onboarding.tsx`'s `LocationField`.

## Data model

`events`, `projects`, `offerings`, and `profiles` each carry:

```typescript
location: v.optional(v.string()),       // display string, what search/matching reads
locationType: v.optional(v.string()),   // "venue" | "city" | "zip" | "address" | "online" | "tbd"
address: v.optional(v.object({
  street: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  stateCode: v.optional(v.string()),
  zip: v.optional(v.string()),
  country: v.optional(v.string()),
  countryCode: v.optional(v.string()),
})),
coordinates: v.optional(v.object({ lat: v.number(), lng: v.number() })),
placeId: v.optional(v.string()),        // Google Places ID, for re-fetching details later
```

`projects` and `offerings` additionally carry `remote: v.optional(v.boolean())`
— see "Remote, not multiple locations" below.

There is no `by_coordinates` index (the original PRD proposed one). "Near
me" filtering happens client-side after a normal query — see below — which
is fine at this dataset's size; a real geo-index would only earn its keep
once distance filtering runs before pagination, not after it.

### One box, not name + address

`events` originally had a second field, `venueAddress` — free-text, not
geocoded — that a user could fill in separately from the venue name, for
when a venue's own name ("Golden Gate Park") wasn't itself a street address.
That was two boxes doing one job: Places autocomplete already resolves a
*street address typed directly* just as well as a venue name (it's a
`locationType: "address"` suggestion, same pipeline, same coordinates). So
there was never a reason to search by name in one box and then separately
type an address in another — searching by whichever one you actually have
was always enough. `venueAddress` is now schema-only, kept solely so
already-created events that have a value there don't lose it (`create`/
`update` in `convex/events.ts` never read or write it); no form collects it
anymore. One box, on every one of the four tables.

## Remote, not multiple locations

`projects` and `offerings` support exactly one location plus a `remote`
boolean (`true`/unset = remote-friendly, `false` = must be local to
`location`) — not an array of locations. A project's create/edit form
renders a "This can be done remotely" checkbox; the `LocationAutocomplete`
only shows when it's unchecked, and submission requires either the checkbox
or a non-empty location. This is a deliberate choice, not a gap: the
`useLocationField`/`LocationAutocomplete` pair is a single-location
abstraction shared by all four tables, and the actual cases this needs to
cover — "based here," "based here but open to remote," "fully remote" — are
all single-location-plus-a-flag. A touring project with several real stops
would need a genuine multi-location model (an array, or a join table), which
none of the four tables have; that's future work if it's ever needed, not
something to bolt onto the shared single-location hook for one table.

## "Near me" — real coordinate distance filtering, client-side

`app/app/lib/useNearMe.ts` has the shared pieces: a Haversine great-circle
distance function, a `useNearMe()` hook wrapping browser geolocation, and
`NEAR_ME_RADIUS_OPTIONS` (25/50/100 mi). `search.tsx` (People), `events.tsx`,
and `offerings.tsx` each: fetch their normal (unfiltered-by-location) result
set, then in a `useMemo`, when "near me" is on and the browser position is
known, compute the distance to each row's `coordinates`, drop rows with no
coordinates, filter to the radius, and sort ascending.

This depends entirely on `coordinates` being populated, which only happens
when a `LocationAutocomplete` suggestion was actually picked (or a profile
was covered by the `backfillCoordinates` backfill). `LocationVerifiedHint`
(above) is what makes that dependency visible at the point where it would
otherwise silently fail.

## Open questions carried over from the original PRD

Still open, still worth a real answer before anyone builds against them:

1. Default "near me" radius — currently 25/50/100mi as user-chosen options,
   no smart default.
2. Show a map on the create/edit form itself (not just the read view)?
3. Store a signed-in user's "home" location for a default "near me" center,
   vs. always asking browser geolocation fresh?
4. International support — the address-component parsing in
   `convex/location.ts` is US-shaped (`stateCode`, `zip`); untested outside
   the US.
