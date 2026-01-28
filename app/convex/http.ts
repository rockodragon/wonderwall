import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { autocomplete, autocompletePreflight } from "./location";

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

export default http;
