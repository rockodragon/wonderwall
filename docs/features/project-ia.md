# Projects: posting, browsing, supporting

Decided 2026-09-27. Replaces the Passion / Paid / Paid gigs split at posting time, and finishes V1 PRD §7 ("Projects, not Portfolios").

**Shipping status (2026-09-27):** posting, the two browse views, and Cheer / Back are on `main` (PR #32). The profile, pieces-as-projects, Back links and the migration are in PR #34. The prod Convex backend is deployed by hand and was not confirmed deployed for either PR — see "Where the plan and the code disagree" below.

## The model in one paragraph

There is one thing, a **Project**. It has a stage (planning → … → completed). It can carry pieces of work (media), open roles (each with its own pay), a support ask (goal, deadline, tiers), or a schedule of paid dates (a gig series). Nothing about money is chosen when it's created. Its owner turns things on from the project page. Profiles and browse pages are **views** of projects: open ones are "Working on", completed ones are the Portfolio, and ones hiring show up under Jobs and gigs.

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

## The project page: tabs (2026-10-02)

Above the tabs: back link, the owner's ⋯ (Archive) and the admin's ⋮, the hero or player, the title with its pencil, the stage chip, the byline, the blurb, interests, the goal bar with Cheer them on / Back this, and the owner's Next steps. The stage chip is a label to visitors and a select to the owner ("Planning ▾"), saved on change (`setStage`).

Tabs, with `?tab=` in the URL (About is the default and drops the param; the URL is replaced, not pushed): **About** (the story, attached pieces, location, nonprofit note) · **Team** (team and roles; a gig shows **Dates** with its schedule instead) · **Updates** (the feed, the owner's composers) · **Support** (goal editor, tiers, supporters; passion projects only, so a job or a gig has three tabs). The owner's Team tab says how many join requests are waiting: "Team · 2 requests".

Every panel stays mounted and is hidden when it isn't chosen, so a half-written form survives a trip to another tab. Next steps switches to the tab first, then scrolls to it.

## Raising

A project is raising when it is not a gig and has any of: a goal, the `raising` stage, or an active patron tier. This is computed server-side in `summarizeAsks` (`convex/garden/projects.ts`) and returned as `raising` from `listProjects` and `getProject`. The client falls back to goal/stage when talking to an older backend.

## Browsing: one row of chips

`/projects` and the desk's Projects view share one exclusive row of chips, by what the visitor is looking for (2026-10-02, Rick: "clearly list out jobs, gigs, projects seeking funding and/or people"). There is no Projects | Work toggle and no "All" chip. A project can answer to more than one chip.

| Chip | `?show=` | A project is here when |
|---|---|---|
| **Projects** (default) | absent | `kind: "passion"`, at every stage. Clicking it resets the chip and the Stage. |
| **Seeking funding** | `funding` | `isRaising`: a goal, the Raising stage, or an active tier. Never a recurring gig. This is the card's "Raising" badge and "Back this". |
| **Seeking people** | `people` | A project with at least one open role (paid or volunteer), plus a paid-kind posting declared Volunteer. |
| **Jobs and gigs** | `work` | A paid posting that is not Volunteer (one-off jobs and recurring gigs), plus a project with an open role that pays (only a role that declared its pay, the way its card prints it). |

Search, the interest tags and **Stage** combine with any chip. Stage is a "Stage ▾" menu after the chips: Any stage, Planning, Forming team, Working, Released (`?stage=planning|forming|working|releasing`). It reads as the chosen stage once one is set, and it is hidden under Jobs and gigs (its param is dropped there). Raising is not a stage option: it is Seeking funding.

**What a card says it is, in its first line** (`lib/projectKind.ts`; the /projects badge, the desk card's kicker and the opened card's kicker):

- **Job** — one-off paid work.
- **Recurring gig · Fridays 8–10pm** — a live-booking series, with its schedule.
- **Role on {project} · Paid** — a project shown under Jobs and gigs for a paid role. The card leads with that role (its title, its pay), not the project's title. Opened on the desk it lists "Paid role" ahead of Stage.
- **Volunteer** — an unpaid posting, whatever shape. Never "Paid".
- A project reads **Raising** or **Project** on /projects, and its stage on the desk.

The opened desk card's Funding row reads "$370 of $1,000 · 37%" when there is a goal, and "Open to backing" when the project is raising through an active tier with no goal.

**Create button follows the chip.** "Start a project" on Projects, Seeking funding and Seeking people; "Hire someone" on Jobs and gigs. On `/projects` it is a split button: the main half is the one for the chip, and the arrow opens both (the old "+ Post" menu). On the desk it is the row's outline button, and it opens the focused card (`/today?view=projects&create=hire|project`). The grid's first "+" card follows the chip too.

**URLs.** Canonical: `?show=funding|people|work` (absent = Projects) and `?stage=…`, the same on `/projects` and the desk. Old links keep landing where they did (`readProjectsView` in `lib/browse/projectsFilter.ts`):

- Jobs and gigs: `?view=work`, `?kind=paid`, `?kind=gigs`, the desk's `?tab=work`, `show`/`stage` = `jobs` or `gigs`.
- Seeking people: `show`/`stage` = `roles` or `people`, `?seek=people`.
- Seeking funding: `show`/`stage` = `raising`, `?seek=funding`.
- An explicit `?seek=` beats a chip an old param implies. An old stage id (`?show=working`) is that stage with Projects. `?view=projects`, `?kind=passion` and anything unknown are Projects.
- Clicking a chip writes the canonical params and drops the old ones.

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
   - **Recommendation:** change the brief to match. Suggested wording: *"Projects — creative work, yours or a group's. A project can ask for people (paid or volunteer roles) and for backing. Hiring someone for a job or a run of gig dates is posted the same way and shows up under Jobs and gigs."*
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
