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
  route("signup/:inviteSlug", "routes/signup.tsx"),
  route("onboarding", "routes/onboarding.tsx"),

  // App routes (with nav layout)
  layout("routes/_app.tsx", [
    route("search", "routes/search.tsx"),
    route("works", "routes/works.tsx"),
    route("works/:artifactId", "routes/work.tsx"),
    route("events", "routes/events.tsx"),
    route("events/:eventId", "routes/event.tsx"),
    route("jobs", "routes/jobs._index.tsx"),
    route("jobs/new", "routes/jobs.new.tsx"),
    route("jobs/:id", "routes/jobs.$id.tsx"),
    route("jobs/:id/edit", "routes/jobs.$id.edit.tsx"),
    route("profile/:profileId", "routes/profile.tsx"),
    route("favorites", "routes/favorites.tsx"),
    route("settings", "routes/settings.tsx"),
    route("faq", "routes/faq.tsx"),
    route("admin", "routes/admin.tsx"),
  ]),
] satisfies RouteConfig;
