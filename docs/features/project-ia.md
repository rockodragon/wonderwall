# Projects: posting, browsing, supporting

Decided 2026-09-27. Replaces the Passion / Paid / Paid gigs split at posting time, and finishes V1 PRD §7 ("Projects, not Portfolios").

**Shipping status (2026-09-27):** posting, the two browse views, and Cheer / Back are on `main` (PR #32). The profile, pieces-as-projects, Back links and the migration are in PR #34. The prod Convex backend is deployed by hand and was not confirmed deployed for either PR — see "Where the plan and the code disagree" below.

## The model in one paragraph

There is one thing, a **Project**. It has a stage (planning → … → completed). It can carry pieces of work (media), open roles (each with its own pay), a support ask (goal, deadline, tiers), or a schedule of paid dates (a gig series). Nothing about money is chosen when it's created. Its owner turns things on from the project page. Profiles and browse pages are **views** of projects: open ones are "Working on", completed ones are the Portfolio, and ones hiring show up under Work.

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

- **Projects** (default) — `kind: "passion"`. Filters are the stages (Rick, 2026-10-01 — the old "Raising / Looking for people" pills read as stages and collided with them): All, Planning, Raising, Forming team, Working, Releasing. A stage pill matches `resolveStage`; Raising matches `isRaising`, the same rule as the card's badge and "Back this". Old `?show=people` lands on Forming team.
- **Work** (`?view=work`) — paid jobs, shows, and projects with open roles. Filters: All, Jobs, Shows, Roles on projects. Project cards here list each open role with its pay. "Shows" was "Gigs" until 2026-10-01: a gig is any paid work, so it overlapped with the Work view itself; a show is a recurring live-booking series (`?show=gigs` still works). On-screen copy says "show"; code keeps `gig`.
- Both views (and Events) start their grid with a "+" card — "Start a project", "Hire someone", "Host an event" — first in the lineup, so posting is the first thing you see, especially when the list is short.

A filter is `?show=…`. The old `?kind=passion|paid|gigs` links still land in the right place.

## Supporting: two buttons

On projects (never on jobs or gigs):

- **Cheer them on** — always shown, free. A message or an offer of help or gear (`encouragement` / `resource`).
- **Back this** — only when the project is raising. Money, once / monthly / yearly, through the existing checkout.

## Projects, not Portfolios

A shared piece of work **is** a project (V1 PRD §7). "Add work" creates the piece (an `artifacts` row) and its project (`origin: "portfolio"`), and the piece is that project's media. Past work is a **completed project**, and Portfolio is simply a person's completed projects. It is not a separate thing.

- **New pieces** land as completed. The composer's "Still working on it" leaves them open instead (`artifacts.create` `inProgress`).
- **Existing pieces**: `garden/portfolioCompletedMigration:completePortfolioProjects` marks every never-staged portfolio-origin project completed. It's idempotent, dry run by default, and patches directly so no follower notifications go out.
- **One person's cleanup**: `completeProjectsForProfile` marks all of a person's projects completed except the ids passed in `keep`. Dry run by default; the dry run lists titles and ids.
- **Profile**: **Working on** lists the open projects, with Hiring / Booking / Raising lines; **Portfolio** lists the completed projects. Both come from `listAffiliations`. Pieces that never got a project still show in Portfolio on their own.
- **Project page** plays or shows its attached pieces: embeds, video, audio, images, text and links. It skips whatever the hero or blurb already shows.
- **`/works/:id`** redirects to the piece's project. `/works` itself stays for now; it's where clips for gig responses are added.

## Back links

The project and work detail pages go **back to the previous page** (a profile, Today, search). On a cold shared link, with no in-app history, they fall back to /projects or /works (`app/lib/useBack.ts`).

## Where the plan and the code disagree

Checked 2026-09-27 against the live set (docs/README.md) and the code. **The plan says** marks the brief or a spec; **as coded** marks the code.

### Needs Rick's call

1. **Are jobs projects?**
   - **The plan says:** "Jobs are their own thing, not projects." (brief §2, edited 2026-09-27). It also says a passion project "is unpaid and looks for backing" and a paid project "comes with a budget".
   - **As coded:** "Hire someone" creates a project (`kind: "paid"`) or a gig series under a project. Backing is opt-in on any project, and pay lives on roles.
   - **Recommendation:** change the brief to match. Suggested wording: *"Projects — creative work, yours or a group's. A project can ask for people (paid or volunteer roles) and for backing. Hiring someone for a job or a run of gig dates is posted the same way and shows up under Work."*
2. **Who owns the work, stated when the project is created.**
   - **The plan says:** "the project leader states who owns the result when the project is created" (brief §4).
   - **As coded:** there's no field or step for it anywhere.
   - **Recommendation:** add an optional "Who owns what this makes" line to the project page, not to the create form, so creating stays one step.
3. **"Back this" collects on the platform's own Stripe account.**
   - **The plan says:** Stripe Connect separate charges is the recommended route. backing-payouts.md "The problem today" warns that collecting for creatives on the platform account risks a frozen account.
   - **As coded:** `createBackingCheckout` has no Connect destination, unlike event checkout.
   - Making "Back this" easier to find increases exposure until Connect lands. See handoff/nov6-backings.md.

### Bugs and loose ends

4. **Prod backend may be behind the prod frontend.** `updateProject` only takes `goal` / `raiseByDate` once #32's Convex code is deployed. Until then, "Ask for support" on production fails, and "Back this" only shows on projects with a goal or the raising stage. Deploy Convex after each merge that touches `app/convex/`.
5. **`/jobs/new` still posts to the legacy `jobs` table** under the heading "Post a Project" (`app/app/routes/jobs.new.tsx`). It isn't linked from the nav but it's reachable. Retire it, or send it to "Hire someone".
6. **The browse Projects view shows completed projects.** `listProjects` keeps status `completed` and never checks stage. So a finished *posted* project shows up as something to back or join, while a finished *shared piece* never appears (browse drops portfolio-origin rows). Browse should show open projects only; completed ones live on profiles.
7. **Two "completed" flags.** `status: "completed"` (lifecycle) and `stage: "completed"` (the label) both exist. The stage select sets only the stage, and readers check either one. Pick stage as the one that counts and stop offering "Completed" in the status select.
8. **Two ways to state pay.** A job (`kind: "paid"`) carries pay on the project, while roles carry their own. Folding a job into project + one role would leave one pay model. It's not needed for launch.
9. **`projects.supportPaymentLinkUrl` is dead.** It's the V1 PRD §9 "support widget" link, superseded by Stripe checkout. Nothing reads or writes it.
10. **`/works` still lists every piece** as the old Portfolio grid. It's kept because musicians add gig-response clips there. Once clips can be added from the gig response itself, `/works` can redirect to the profile.

### Doc hygiene

11. `live-booking.md` still describes "+ Post a project → Paid gigs" and "All / Passion / Paid" chips. The gig mechanics it documents are still right; the posting and browse copy is here.
12. `the-exchange-v1-prd.md` is listed in the README without a status. §7 (Projects, not Portfolios) is live and finished here; its nav section (§5) is out of date.

## Not changed

- `kind: "paid"` rows stay as they are. A job is still a paid project with project-level pay, not a project plus one role. Folding jobs into roles is possible later and isn't needed for this change.
- Money copy still comes from `CLAIMS`.
