# PRD: Event Location System

## Overview
Add location autocomplete, geocoding, and filtering capabilities to events. Users should be able to easily enter locations with autocomplete suggestions, and discover events near them.

## Goals
1. Simplify event location entry with autocomplete
2. Store structured location data (coordinates, address components)
3. Enable location-based event discovery (near me, specific city)
4. Support various location types (venue address, city only, zip code, "Online")

---

## API Options Comparison

### 1. Google Places API (Recommended for quality)
- **Pros**: Best coverage, most accurate, session-based pricing
- **Cons**: Most expensive at scale
- **Pricing**: ~$2.83/1000 sessions (Autocomplete), $5/1000 requests (Geocoding)
- **Free tier**: $200/month credit (~70K autocomplete sessions)

### 2. Radar (Recommended for cost)
- **Pros**: Free up to 100K requests/month, good accuracy, built for developers
- **Cons**: Less POI data than Google
- **Pricing**: Free tier generous, then $0.50/1000 requests
- **Best for**: Cost-conscious startups, US-focused apps

### 3. Geoapify
- **Pros**: Built on OpenStreetMap, affordable, good API design
- **Cons**: Less accurate than Google for business names
- **Pricing**: Free tier (3000 req/day), then $49/month for 100K
- **Best for**: OSM enthusiasts, budget-conscious

### 4. HERE Maps
- **Pros**: 250K free transactions/month, good coverage
- **Cons**: Slightly less intuitive API
- **Best for**: High volume needs

### 5. Mapbox
- **Pros**: Good free tier (100K requests), nice UI components
- **Cons**: Requires displaying Mapbox attribution
- **Best for**: Apps already using Mapbox maps

### 6. Nominatim (OpenStreetMap)
- **Pros**: Completely free, open data
- **Cons**: Rate limited (1 req/sec), no commercial SLA, less accurate for POIs
- **Best for**: Non-commercial or low-volume use

### Recommendation
**Start with Radar** for cost-effectiveness with good quality:
- 100K free requests/month covers early growth
- Easy migration to Google Places if needed later
- Good autocomplete and geocoding accuracy

---

## Data Model

### Events Table Updates

```typescript
// convex/schema.ts - events table
events: defineTable({
  // ... existing fields ...

  // Location fields (new)
  location: v.optional(v.string()),              // Display string: "Tamarack State Beach, Carlsbad, CA"
  locationType: v.optional(v.string()),          // "venue" | "city" | "zip" | "online" | "tbd"

  // Structured address (when available)
  address: v.optional(v.object({
    street: v.optional(v.string()),              // "123 Main St"
    city: v.optional(v.string()),                // "Carlsbad"
    state: v.optional(v.string()),               // "CA"
    zip: v.optional(v.string()),                 // "92008"
    country: v.optional(v.string()),             // "US"
  })),

  // Coordinates for distance calculations
  coordinates: v.optional(v.object({
    lat: v.number(),                             // 33.1581
    lng: v.number(),                             // -117.3506
  })),

  // External place ID for enrichment
  placeId: v.optional(v.string()),               // Google/Radar place ID
})
  .index("by_coordinates", ["coordinates"])      // For geo queries
```

### Location Types
| Type | Description | Example |
|------|-------------|---------|
| `venue` | Specific address/place | "Tamarack State Beach, Carlsbad, CA" |
| `city` | City-level only | "Los Angeles, CA" |
| `zip` | Zip code area | "92008" |
| `online` | Virtual event | "Online" |
| `tbd` | Location not yet decided | "TBD" |

---

## User Experience

### Event Creation Flow

1. **Location Input Field**
   - Text input with autocomplete dropdown
   - Debounced search (300ms)
   - Shows suggestions as user types
   - Supports typing "Online" or "TBD" without API call

2. **Autocomplete Suggestions**
   ```
   ┌────────────────────────────────────────┐
   │ 🔍 Tamarack st                         │
   ├────────────────────────────────────────┤
   │ 📍 Tamarack State Beach               │
   │    Carlsbad, CA                        │
   │ ─────────────────────────────────────  │
   │ 📍 Tamarack Street                     │
   │    San Diego, CA 92101                 │
   │ ─────────────────────────────────────  │
   │ 📍 Tamarack Ave                        │
   │    Oceanside, CA 92054                 │
   └────────────────────────────────────────┘
   ```

3. **Selection**
   - User selects suggestion
   - System fetches full details (coordinates, address components)
   - Stores structured data

4. **Manual Entry Fallback**
   - User can type custom location if not in suggestions
   - Won't have coordinates (no distance filtering)
   - Display warning: "Location not verified - distance filtering unavailable"

### Event Discovery Filters

```
┌─ Location Filter ─────────────────────────┐
│ ○ All locations                           │
│ ● Near me (within 25 miles)              │
│ ○ Specific city: [_______________]        │
│ ○ Online only                             │
└───────────────────────────────────────────┘
```

**"Near Me" Logic:**
1. Request user's location (browser geolocation API)
2. Calculate distance to each event with coordinates
3. Filter to events within radius (default 25 miles)
4. Sort by distance ascending

---

## Technical Implementation

### Phase 1: Backend Infrastructure

1. **Add schema fields** (coordinates, address, locationType)
2. **Create location service** (abstracted for provider switching)
3. **Add geocoding action** for coordinate lookup
4. **Update event mutations** to accept location data

### Phase 2: Autocomplete API Integration

1. **Create Convex HTTP action** for autocomplete proxy
   - Keeps API key server-side
   - Rate limits per user
   - Caches common queries

2. **Frontend autocomplete component**
   - Debounced input
   - Keyboard navigation
   - Mobile-friendly dropdown

### Phase 3: Distance Filtering

1. **Add user location storage** (optional, for "near me")
2. **Implement Haversine distance calculation**
3. **Add filter UI to events page**
4. **Sort by distance when filtering**

### Distance Calculation (Haversine Formula)

```typescript
function getDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
```

---

## API Integration (Radar Example)

### Environment Setup
```bash
# .env.local
RADAR_API_KEY=prj_live_pk_xxx
```

### Autocomplete Action
```typescript
// convex/location.ts
import { httpAction } from "./_generated/server";

export const autocomplete = httpAction(async (ctx, request) => {
  const { query } = await request.json();

  const response = await fetch(
    `https://api.radar.io/v1/search/autocomplete?query=${encodeURIComponent(query)}&limit=5`,
    {
      headers: {
        Authorization: process.env.RADAR_API_KEY!,
      },
    }
  );

  const data = await response.json();

  return new Response(JSON.stringify(data.addresses), {
    headers: { "Content-Type": "application/json" },
  });
});
```

---

## Migration Plan

1. **Add optional fields** - No migration needed, fields are optional
2. **Backfill existing events** - Optional: geocode existing location strings
3. **Update event forms** - Add autocomplete component
4. **Add filters** - Enhance events list page

---

## Success Metrics

- **Autocomplete usage**: % of events created with autocomplete vs manual
- **Location accuracy**: % of events with valid coordinates
- **Filter adoption**: % of users using location filters
- **API costs**: Monthly API spend vs free tier limits

---

## Open Questions

1. **Default radius for "near me"?** - Suggest 25 miles, make configurable
2. **Show map on event page?** - Nice to have, adds complexity
3. **Store user's home location?** - Privacy consideration, make optional
4. **International support?** - Start US-only, expand based on user base

---

## Sources

- [Radar Address Autocomplete](https://radar.com/product/address-autocomplete-api)
- [Geoapify as Google Places Alternative](https://www.geoapify.com/geoapify-as-a-google-places-api-alternative/)
- [Google Places API Alternatives](https://traveltime.com/blog/google-places-api-alternatives-points-of-interest-data)
- [HERE Geocoding API](https://developer.here.com/documentation/geocoding-search-api/dev_guide/index.html)
