import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { autocomplete, autocompletePreflight } from "./location";
import {
  proxy as posthogProxy,
  proxyPreflight as posthogPreflight,
} from "./posthog";

const http = httpRouter();

auth.addHttpRoutes(http);

// Location autocomplete API
http.route({
  path: "/api/location/autocomplete",
  method: "POST",
  handler: autocomplete,
});

http.route({
  path: "/api/location/autocomplete",
  method: "OPTIONS",
  handler: autocompletePreflight,
});

// PostHog proxy - bypasses ad blockers by routing through first-party domain
// Each endpoint needs explicit route since Convex doesn't support wildcards
const posthogPaths = [
  // Core event ingestion (with and without trailing slash)
  "/capture",
  "/capture/",
  "/batch",
  "/batch/",
  "/e",
  "/e/",
  "/s",
  "/s/",
  // New versioned event ingestion (PostHog v1.335+)
  "/i/v0/e",
  "/i/v0/e/",
  // Feature flags and config
  "/decide",
  "/decide/",
  "/flags",
  "/flags/",
];
for (const path of posthogPaths) {
  http.route({
    path: `/api/ph${path}`,
    method: "POST",
    handler: posthogProxy,
  });
  http.route({
    path: `/api/ph${path}`,
    method: "GET",
    handler: posthogProxy,
  });
  http.route({
    path: `/api/ph${path}`,
    method: "OPTIONS",
    handler: posthogPreflight,
  });
}

export default http;
