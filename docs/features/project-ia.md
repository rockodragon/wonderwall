# Projects: posting, browsing, supporting

Decided 2026-09-27. Replaces the Passion / Paid / Paid gigs split at posting time.

## The problem

Posting asked a money question first (passion or paid?) before anyone said what they were making. Pay was declared in two places (project and role). Fundraising fields sat inside the create form. The browse tabs sorted by how a thing was posted, not by what a visitor wants. Encouragement existed but hid behind one "Support" button.

## Posting: two ways in

`+ Post` opens a menu with two items:

- **Start a project** — step one only: title, description, link, interests, location, community. No money, no roles. It lands on the new project's page.
- **Hire someone** — one form with a **When is the work** toggle:
  - **One job**: a paid posting (`kind: "paid"`), pay stated up front.
  - **On set dates**: a gig series (`gigSeries` + slots). Flipping the toggle carries the title and description across.

A job and a gig are the same thing to the poster ("I need someone, here's the pay"). The only real difference is whether the work happens on dates.

## After posting: optional steps on the project page

The owner of a new project that has asked for nothing yet sees **Next steps**:

- **Find people** — the existing open roles (`projectRoles`), each with its own pay: amount, range, proposals, confidential, or volunteer.
- **Ask for support** — goal, raise-by date, nonprofit. Saved through `updateProject`. Sending `null` clears the goal and the date ("Stop asking").

Patron tiers only show for a project that is raising.

## Raising

A project is raising when it is not a gig and has any of: a goal, the `raising` stage, or an active patron tier. This is computed server-side in `summarizeAsks` (`convex/garden/projects.ts`) and returned as `raising` from `listProjects` and `getProject`. The client falls back to goal/stage when talking to an older backend.

## Browsing: two views

`/projects` has two views, split by what the visitor wants:

- **Projects** (default) — `kind: "passion"`. Filters: All, Raising, Looking for people.
- **Work** (`?view=work`) — paid jobs, gigs, and projects with open roles. Filters: All, Jobs, Gigs, Roles on projects. Project cards here list each open role with its pay.

A filter is `?show=…`. The old `?kind=passion|paid|gigs` links still land in the right place.

## Supporting: two buttons

On projects (never on jobs or gigs):

- **Cheer them on** — always shown, free. A message or an offer of help or gear (`encouragement` / `resource`).
- **Back this** — only when the project is raising. Money, once / monthly / yearly, through the existing checkout.

## Profile: Projects vs Portfolio

These are different things: a **piece** (artifact) is one finished thing you made, and a **project** is an effort with a stage, a team, roles and money. They looked duplicated because every quick share of a piece silently creates a companion project (`origin: "portfolio"`), and the profile's Projects list didn't filter those out.

- **Projects** on a profile lists only open, deliberately posted projects (`listAffiliations` skips `origin: "portfolio"`). Each row shows its stage, plus **Hiring** (open roles with pay, or a paid posting's pay), **Booking** (gig dates), and **Raising** ($ of goal). Visitors see there that someone is hiring.
- **Portfolio** is finished work: completed projects (tagged "Project · role") first, then the individual pieces.

## Back links

The project and work detail pages go **back to the previous page** (a profile, Today, search). On a cold shared link, with no in-app history, they fall back to /projects or /works (`app/lib/useBack.ts`).

## Not changed

- `kind: "paid"` rows stay as they are. A job is still a paid project with project-level pay, not a project plus one role. Folding jobs into roles is possible later and isn't needed for this change.
- Money copy still comes from `CLAIMS`.
