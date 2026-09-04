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
  // Bare /signup is a URL people type and land on; without this route it fell
  // through to the 404 catch-all, so the "Invite Required" branch inside
  // signup.tsx (which handles a missing slug, and carries the Terms/Privacy
  // links) was unreachable. Both paths render the same module.
  route("signup", "routes/signup.tsx"),
  route("signup/:inviteSlug", "routes/signup.tsx", { id: "signup-invite" }),
  route("oauth-callback", "routes/oauth-callback.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  // Organizations (Host-tier pricing/lead-gen page) un-published for V1 —
  // not wired to the real Host/Table data model, see PRD §10
  // (docs/the-exchange-v1-prd.md). An org that wants in today signs up as a
  // Patron through the regular waitlist/onboarding flow instead.
  // TODO: delete routes/organizations.tsx and routes/organizations_.demo.tsx,
  // or repurpose for a future jobs-outreach push targeting organizations —
  // see the TODO at the top of organizations.tsx.
  // route("organizations", "routes/organizations.tsx"),
  // route("organizations/demo", "routes/organizations_.demo.tsx"),

  // Legal pages are PUBLIC and deliberately outside the _app.tsx layout
  // below, for the same reason the event page is: that layout sends
  // unauthenticated visitors to /login (routes/_app.tsx:42), and the signup
  // form links here before an account exists. Gating the terms behind the
  // account they govern would be a circle.
  route("legal/terms", "routes/legal.terms.tsx"),
  route("legal/privacy", "routes/legal.privacy.tsx"),

  // App routes (with nav layout)
  layout("routes/_app.tsx", [
    route("search", "routes/search.tsx"),
    route("projects", "routes/projects.tsx"),
    route("projects/:id", "routes/projects.$id.tsx"),
    route("offerings", "routes/offerings.tsx"),
    route("offerings/:offeringId", "routes/offerings.$id.tsx"),
    route("works", "routes/works.tsx"),
    route("works/:artifactId", "routes/work.tsx"),
    route("events", "routes/events.tsx"),
    // Event detail lives inside the layout like everything else here, but
    // stays reachable by a signed-out guest: routes/_app.tsx's public-path
    // matcher exempts /events/<id> (not the bare /events list above) from
    // the redirect-to-/login effect, so the shell (wordmark, sidebar, mobile
    // nav) still renders instead of leaving the page with no chrome. A
    // calendar invite goes to exactly such a guest by design
    // (eventRsvps.userId is optional), and the join link, the recording and
    // "add to calendar" all live on this page — gating it dead-ended
    // exactly the person holding the invite (docs/gated-event-video-prd.md).
    //
    // routes/event.tsx is the component, not the /garden/events/:id one:
    // this path is what functions/events/[id].ts injects real OG tags for,
    // so link unfurling depends on it staying put. The page still degrades
    // for logged-out visitors on its own (guest RSVP, no organizer tools,
    // back link routed to the guest-facing /garden/events) — see event.tsx.
    route("events/:eventId", "routes/event.tsx"),
    route("communities", "routes/communities._index.tsx"),
    route("communities/apply", "routes/communities.apply.tsx"),
    route("communities/:slug", "routes/communities.$slug.tsx"),
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
    route("admin/garden", "routes/admin.garden.tsx"),
    route("admin/ledger", "routes/admin.ledger.tsx"),
    route("admin/waitlist", "routes/admin.waitlist.tsx"),
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

  // The Garden's first production surfaces (real Convex data, not demo-data)
  route("garden", "routes/garden._index.tsx"),
  route("join", "routes/join.tsx"),
  route("fund/:slug", "routes/fund.$slug.tsx"),
  route("story/:slug", "routes/story.$slug.tsx"),
  route("tables", "routes/tables._index.tsx"),
  route("tables/:slug", "routes/tables.$slug.tsx"),
  // "projects" here (routes/projects._index.tsx, the old GardenPage/GardenNav
  // shell) was a dead route registration — it shared this exact path with
  // the live route("projects", "routes/projects.tsx") inside the _app layout
  // below, which always won the match, so this one was never actually
  // reachable. Removed rather than left in as misleading dead code; the file
  // itself is untouched. "projects/:id" moved into the _app layout for the
  // same reason events/:eventId did (see that route's comment) — it's a
  // real, currently-reachable route, and living outside the layout meant
  // the sidebar/wordmark disappeared on every project page.
  route("c/:code", "routes/c.$code.tsx"),
  // Guest-RSVP events browse/detail — deliberately NOT at /events or
  // /events/:eventId, which are already the legacy app-shell routes above.
  // Promoting these to /events is a follow-up decision.
  route("garden/events", "routes/events_.garden._index.tsx"),
  route("garden/events/:id", "routes/events_.garden.$id.tsx"),

  route("ia", "routes/ia.tsx"),

  // 404 catch-all
  route("*", "routes/404.tsx"),
] satisfies RouteConfig;
