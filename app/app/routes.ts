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
  route("oauth-callback", "routes/oauth-callback.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("organizations", "routes/organizations.tsx"),
  route("organizations/demo", "routes/organizations_.demo.tsx"),

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
    route("admin/crawler", "routes/admin.crawler.tsx"),
    route("messages", "routes/messages._index.tsx"),
    route("messages/:conversationId", "routes/messages.$conversationId.tsx"),
  ]),

  // The Garden demo world (client-only, Convex-free — see beads wonderwall-qej)
  route("demo", "routes/demo.tsx", [
    index("routes/demo._index.tsx"),
    route("join", "routes/demo.join.tsx"),
    route("create", "routes/demo.create.tsx"),
    route("patron", "routes/demo.patron.tsx"),
    route("host", "routes/demo.host.tsx"),
    route("host/dashboard", "routes/demo.host.dashboard.tsx"),
    route("offers", "routes/demo.offers.tsx"),
  ]),
  // The app-shell mock renders as the app itself — no demo chrome around it
  route("demo/app", "routes/demo.app.tsx"),

  // 404 catch-all
  route("*", "routes/404.tsx"),
] satisfies RouteConfig;
