# Organizations

Rick, 2026-10-01: an event says "Hosted by Abiding Practice (David Russo)",
and clicking "Abiding Practice" opened their website. It should open a page
inside the app. People belong to organizations (their company, their church,
a collective), can belong to more than one, and hold a title in each —
"like LinkedIn, but cooler": a real organization object, and a real
position object linking a person to it.

Before this, an organization was two strings on a profile
(`profiles.orgName`, `profiles.orgUrl`). Nothing linked two people at the
same organization, and there was nowhere to send a visitor.

## What a visitor sees: `/orgs/:slug`

Public, like an event page, so a signed-out guest who clicks a host lands
somewhere real. Instagram's profile is the bar; this matches it and adds
where the organization is and who's in it.

- Logo (square, so it reads as an organization, not a person), name,
  category and city ("Nonprofit · San Diego, CA"), one-line tagline.
- Website, Instagram, X, LinkedIn: icon links, opened in a new tab.
- Share. Edit, for the organization's admins.
- About: the mission, in their words.
- People: a grid of cards — photo, name, title, "since 2019". Signed-in
  visitors open their profiles. Former members sit under Alumni.
- Events: upcoming events hosted by its people (cards), then the last few.
- Where: the map card the event page already uses.
- When the organization also runs a community or a fund here (a `hostOrgs`
  row, e.g. Abiding Practice's fund), a link to it.

Browsing lives on People, as a second tab: **People · Organizations**
(`/people?tab=orgs`; bare `/orgs` redirects there). The tabs are the page
title; one search box serves both; Near me, filters and the community line
are people-only for now. An organization card has the same footprint as a
person card: square logo (people are round), name, category · city, and
the first three faces of its people with the count. Person cards show
their organization under their name, and searching People matches it.
Decided with the UX pass on 2026-10-01: one task ("find who"), one page;
the phone bar keeps three slots.

## Who can do what

- Anyone signed in adds an organization to their profile in Settings ›
  Profile: search, pick one, or create it. Creating makes you its admin.
- Self-organizing (Rick, 2026-10-01): joining is open — anyone can say
  they're part of an organization, from its page ("Add to my profile") or
  Settings — and the check comes after, not before: every admin gets a
  notification ("Dana joined Grove") linking to the edit page, where they
  can remove them. No approval queue for now; add one if people abuse it.
- Admins also add people themselves: "Add a person" on the edit page
  searches the directory and lists them right away. The person is notified
  ("David added you to Abiding Practice") and can change their title or
  remove it in Settings.
- Whoever creates an organization is its first admin, even when they're
  not the owner — they're whoever took the lead. They make others admins
  (the real owner, a co-lead) from the edit page; platform admins can fix
  any organization.
- A position is one row per person per organization: a free-text title
  ("Founder", "Board chair"), an optional start year, and an optional end
  year (set = former). Your current positions are ordered; the first one is
  the organization shown with your name on events you host.
- Your profile shows your organizations under your name ("Founder at
  Abiding Practice") and as a section of logo cards with title and years.
- Admins edit the page and its people (remove, make admin). Platform
  admins can edit any organization.
- The last admin can't leave while others remain. Joining an organization
  with no admin makes you its admin (that's how a backfilled or abandoned
  page gets claimed).
- Slugs are set once at creation, so links never break on a rename.

## Data

`organizations`: `name`, `nameKey` (lowercased, spaces collapsed, for
dedupe), `slug`, `category`, `tagline`, `mission`, logo (`logoStorageId`),
`websiteUrl`, `instagram` / `x` (handles), `linkedin` (path such as
`company/abiding-practice`), the shared location fields (`location`,
`locationType`, `address`, `coordinates`, `placeId`, collected by
`LocationAutocomplete` + `useLocationField` like events and profiles),
optional `hostOrgId`, `createdByUserId`, timestamps.

`orgPositions`: `organizationId`, `userId`, `profileId`, `title`,
`startYear`, `endYear` (absent = current), `isAdmin`, `order` (lowest
current = primary).

`profiles.orgName` / `orgUrl` stay as a cache of the primary organization's
name and website, rewritten on every membership change, so older readers
(onboarding prefill, the gig form's venue prefill) keep working. Nothing new
reads them.

Typing a new name never creates a duplicate: a create whose `nameKey`
already exists joins the existing organization.

## Events

"Hosted by" resolves each host's primary organization and links to
`/orgs/:slug`. An org page's events are the published events whose
organizer or a co-host has that organization first. Hosts whose
organization predates the backfill fall back to the old text (and its
website link) until the backfill runs.

## Rollout

1. Deploy the backend before merging (prod Convex is not auto-deployed).
2. Run the backfill once on prod. It creates an organization for each
   distinct `profiles.orgName`, makes the first person admin, adds the rest
   as members, and links a `hostOrgs` row with the same name:
   `npx convex run organizations:backfillFromProfiles '{}' --prod`
   (`'{"dryRun":true}'` prints what it would do).

## Not in this pass

- Following an organization (the `favorites` table takes profiles and
  events today) and notifying followers when it hosts.
- Picking "host as" per event. Today the host's first organization is used
  for every event they host.
- An approval queue before someone appears in People (joining is open;
  admins are notified and remove after).
- Link-preview (OG) tags for `/orgs/:slug`; events have them via
  `functions/events/[id].ts`.
- Linking a job's `hiringOrg` string to an organization.
