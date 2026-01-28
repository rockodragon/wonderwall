import { httpAction } from "./_generated/server";

// Types for Google Places API (New) responses
interface GooglePlaceSuggestion {
  placePrediction?: {
    placeId: string;
    structuredFormat: {
      mainText: { text: string };
      secondaryText?: { text: string };
    };
    text: { text: string };
    types?: string[];
  };
}

interface GooglePlaceDetails {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
  }>;
  location?: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
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

// Google Places autocomplete HTTP action
// POST /api/location/autocomplete { query: string }
export const autocomplete = httpAction(async (_ctx, request) => {
  const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  if (!GOOGLE_PLACES_API_KEY) {
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

    // Call Google Places Autocomplete API (New)
    const autocompleteResponse = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ["us"], // Bias towards US
          languageCode: "en",
        }),
      },
    );

    if (!autocompleteResponse.ok) {
      console.error(
        "Google Places API error:",
        autocompleteResponse.status,
        await autocompleteResponse.text(),
      );
      return new Response(JSON.stringify({ error: "Location search failed" }), {
        status: 502,
        headers: corsHeaders(),
      });
    }

    const autocompleteData = await autocompleteResponse.json();
    const predictions: GooglePlaceSuggestion[] =
      autocompleteData.suggestions || [];

    // Get place details for each suggestion to get coordinates and full address
    const suggestions = await Promise.all(
      predictions.slice(0, 5).map(async (prediction) => {
        const placeId = prediction.placePrediction?.placeId;
        if (!placeId) {
          return null;
        }

        // Fetch place details
        const detailsResponse = await fetch(
          `https://places.googleapis.com/v1/places/${placeId}`,
          {
            headers: {
              "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask":
                "id,displayName,formattedAddress,addressComponents,location,types",
            },
          },
        );

        if (!detailsResponse.ok) {
          // Fall back to autocomplete data only
          const mainText =
            prediction.placePrediction?.structuredFormat.mainText.text || query;
          const secondaryText =
            prediction.placePrediction?.structuredFormat.secondaryText?.text ||
            "";

          return {
            placeId,
            displayName: mainText,
            formattedAddress: secondaryText
              ? `${mainText}, ${secondaryText}`
              : mainText,
            locationType: "address" as const,
            address: {},
          };
        }

        const details: GooglePlaceDetails = await detailsResponse.json();

        // Parse address components
        const addressComponents = details.addressComponents || [];
        const getComponent = (type: string) =>
          addressComponents.find((c) => c.types.includes(type));

        const streetNumber = getComponent("street_number")?.longText || "";
        const route = getComponent("route")?.longText || "";
        const city =
          getComponent("locality")?.longText ||
          getComponent("sublocality")?.longText ||
          "";
        const state = getComponent("administrative_area_level_1")?.longText;
        const stateCode = getComponent(
          "administrative_area_level_1",
        )?.shortText;
        const zip = getComponent("postal_code")?.longText;
        const country = getComponent("country")?.longText;
        const countryCode = getComponent("country")?.shortText;

        // Determine location type based on Google's types
        const types = details.types || [];
        let locationType: LocationSuggestion["locationType"] = "address";
        if (
          types.includes("establishment") ||
          types.includes("point_of_interest")
        ) {
          locationType = "venue";
        } else if (
          types.includes("locality") ||
          types.includes("administrative_area_level_3")
        ) {
          locationType = "city";
        } else if (types.includes("postal_code")) {
          locationType = "zip";
        }

        return {
          placeId,
          displayName: details.displayName?.text || query,
          formattedAddress: details.formattedAddress || query,
          locationType,
          address: {
            street: streetNumber && route ? `${streetNumber} ${route}` : route,
            city,
            state,
            stateCode,
            zip,
            country,
            countryCode,
          },
          coordinates: details.location
            ? {
                lat: details.location.latitude,
                lng: details.location.longitude,
              }
            : undefined,
        };
      }),
    );

    // Filter out nulls
    const validSuggestions = suggestions.filter(
      (s): s is NonNullable<typeof s> => s !== null,
    );

    return new Response(JSON.stringify({ suggestions: validSuggestions }), {
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
