import { httpAction } from "./_generated/server";

// Types for Radar API responses
interface RadarAddress {
  placeLabel?: string;
  formattedAddress?: string;
  addressLabel?: string;
  street?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  layer?: string; // "place", "address", "locality", "postalCode", etc.
}

// Normalized location result for our frontend
export interface LocationSuggestion {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  locationType: "venue" | "city" | "zip" | "address";
  address: {
    street?: string;
    city?: string;
    state?: string;
    stateCode?: string;
    zip?: string;
    country?: string;
    countryCode?: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// Radar autocomplete HTTP action
// POST /api/location/autocomplete { query: string }
export const autocomplete = httpAction(async (_ctx, request) => {
  const RADAR_API_KEY = process.env.RADAR_API_KEY;

  if (!RADAR_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Location service not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const body = await request.json();
    const query = body.query?.trim();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: corsHeaders(),
      });
    }

    // Check for special keywords that don't need API calls
    const lowerQuery = query.toLowerCase();
    if (lowerQuery === "online" || lowerQuery.startsWith("onl")) {
      return new Response(
        JSON.stringify({
          suggestions: [
            {
              placeId: "online",
              displayName: "Online",
              formattedAddress: "Virtual Event",
              locationType: "online" as const,
              address: {},
            },
          ],
        }),
        { headers: corsHeaders() },
      );
    }

    if (lowerQuery === "tbd" || lowerQuery === "tba") {
      return new Response(
        JSON.stringify({
          suggestions: [
            {
              placeId: "tbd",
              displayName: "TBD",
              formattedAddress: "Location to be determined",
              locationType: "tbd" as const,
              address: {},
            },
          ],
        }),
        { headers: corsHeaders() },
      );
    }

    // Call Radar autocomplete API
    const url = new URL("https://api.radar.io/v1/search/autocomplete");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "5");
    url.searchParams.set("layers", "place,address,locality,postalCode");
    // Bias towards US but don't restrict
    url.searchParams.set("countryCode", "US");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: RADAR_API_KEY,
      },
    });

    if (!response.ok) {
      console.error("Radar API error:", response.status, await response.text());
      return new Response(JSON.stringify({ error: "Location search failed" }), {
        status: 502,
        headers: corsHeaders(),
      });
    }

    const data = await response.json();
    const addresses: RadarAddress[] = data.addresses || [];

    // Transform Radar results to our normalized format
    const suggestions: LocationSuggestion[] = addresses.map((addr, index) => {
      // Determine location type based on Radar's layer
      let locationType: LocationSuggestion["locationType"] = "address";
      if (addr.layer === "place") {
        locationType = "venue";
      } else if (addr.layer === "locality") {
        locationType = "city";
      } else if (addr.layer === "postalCode") {
        locationType = "zip";
      }

      // Build display name
      const displayName =
        addr.placeLabel || addr.addressLabel || addr.formattedAddress || query;

      return {
        placeId: `radar-${index}-${Date.now()}`, // Radar doesn't provide stable IDs in autocomplete
        displayName,
        formattedAddress: addr.formattedAddress || displayName,
        locationType,
        address: {
          street: addr.street,
          city: addr.city,
          state: addr.state,
          stateCode: addr.stateCode,
          zip: addr.postalCode,
          country: addr.country,
          countryCode: addr.countryCode,
        },
        coordinates:
          addr.latitude && addr.longitude
            ? { lat: addr.latitude, lng: addr.longitude }
            : undefined,
      };
    });

    return new Response(JSON.stringify({ suggestions }), {
      headers: corsHeaders(),
    });
  } catch (error) {
    console.error("Location autocomplete error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
});

// Handle CORS preflight
export const autocompletePreflight = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
});

function corsHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
