import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  // Public routes
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup/:inviteCode?", "routes/signup.tsx"),

  // App routes (with nav layout)
  layout("routes/_app.tsx", [
    route("search", "routes/search.tsx"),
    route("works", "routes/works.tsx"),
    route("events", "routes/events.tsx"),
    route("events/:eventId", "routes/event.tsx"),
    route("profile/:profileId", "routes/profile.tsx"),
    route("favorites", "routes/favorites.tsx"),
    route("settings", "routes/settings.tsx"),
    route("faq", "routes/faq.tsx"),
  ]),
] satisfies RouteConfig;
