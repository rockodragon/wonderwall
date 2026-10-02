# Favorites redesign: the Shortlist

Status: IA v2, decided by Rick on 2026-10-02. Mockup: `mockup.html` in this folder (open it in a browser; the top bar steps through the frames, "Design notes" shows the annotations). Built on the desk + palette (`docs/features/desktop-desk-palette.md`, `docs/handoff/garden-desk-palette/README.md`).

## Problem

Rick, after using the desk: the favorites page is hard to digest. It has no information hierarchy and no clear priorities. People care about work first, then projects, then events, then people. They need a clear summary of how much they're tracking, with areas that open up to more detail so they can focus.

What's wrong today:
- One place has four names: "Following" (nav, h1), "people and events" (subtitle), "Favorites" (desk), and "See my favorites" (buried under Events in the palette).
- People, the lowest priority, fill the top of the page. Projects and paid work aren't on it at all.
- Every item has the same weight. Going, saved, requested and past events look alike, and nothing says "this needs you".
- There's no summary. On the desk's `fav` view, a person's face and an event poster share one 3:4 grid.

Rick found v1 of this spec overlappy. It cut a project two ways at once, by pay (Work vs. Projects) and by role (lead vs. member), so one project could land in two or three places. v2 sorts by one thing: your relationship to the item.

## Decisions (Rick, 2026-10-02)

v2 supersedes the v1 Work/Projects split by pay and the "My projects" proposal.

1. **The name is Shortlist.** It replaces "Favorites" and "Following" everywhere: the page, the desk view, the palette and the phone nav.
2. **Shortlist takes the Desk tool's slot in the palette** (see Palette).
3. **Only what the member did themselves.** Nothing on the Shortlist is suggested by the app or by AI. Suggestions belong on Today and in the browse views.
4. **Needs you also leads Today** (see Needs you on Today).
5. **Three areas: Projects, Events, People.** Work is no longer an area. Paid or passion is a filter inside Projects (see The model).
6. **Projects you lead sit in Projects, under Leading.** There is no separate "My projects".
7. **Work first survives as order and filter, not as a section.** Paid invites lead Needs you, the Paid chip filters to paid work, and the Projects tile reads like "7 paid · 8 passion".
8. **No rename for the browse toggle.** Renaming the desk's "Projects / Work" toggle (`PROJECT_VIEWS`) to "Passion / Paid" is moot: that toggle is gone, and `/projects` and the desk's Projects view now browse by intent chips (`docs/features/project-ia.md`, "Browsing: one row of chips").

## The model

**Shortlist.** Everything you've put your hand up for, set aside, lead or host. Inside an area, rows group by your relationship to the item, in the order below: what needs you first, folded history last.

**Areas**, in fixed positions, never hidden:

| Area | Holds | Groups, in order |
|---|---|---|
| Projects | What you lead, joined, asked to join, back or saved | Needs you · Leading · On the team · Waiting to hear (applied, or asked to join) · Backing · Saved · Closed (folded) |
| Events | What you host, go to, asked to attend or saved | This week · Hosting · Going · Requested · Saved (by month past 6) · Past (folded, includes cancelled) |
| People | People you follow | By first interest (`groupFollows`: groups at 6+ follows) |

**Inside Projects:**
- **Paid · Passion chips** filter rows by what the work pays (`workKind`, `app/app/lib/shortlist/kind.ts`). A row is Paid when its work states pay that isn't volunteer, the same test as browse's Jobs and gigs; otherwise it's Passion. So a paid role on a passion project is Paid. Each row is in exactly one chip, so nothing shows twice.
- Every role row shows its pay, in the words of `app/app/lib/budgetLabel.ts`: "$1,200", "$300–600", "Open to proposals", "Confidential" or "Volunteer".
- Each Leading row shows "N requests waiting".

## Needs you rules

These apply across all areas, in this order. Nothing else qualifies.

1. **Someone is waiting on your reply:** an invite to you, a join request or application on a project you lead, or a request to attend an event you host. Paid invites come first (decision 7).
2. **An event you're going to or hosting** in the next 7 days.
3. **A saved role that closes within 7 days** (its `projectRoles.neededBy`).

Display:
- The overview shows 3, then "N more →". These rows get a 3px yellow left rule and a yellow mono status.
- Requests don't add to counts. They belong to the project you lead and show on its Leading row.
- Every count on the Shortlist (header, tiles, chips, palette) includes live items only. Past and closed never count.

**One function.** A pure `needsYou(input, now)` holds these rules and their order. Today, the Shortlist overview, the area chips and the palette dot all read it, so they can't disagree. Put it beside `deskCards.ts`, with a unit test for each rule and the 7-day edges.

## Needs you on Today

Today and Needs you answer different questions:
- Today: "What's happening?" It's a briefing from the community and admins.
- Needs you: "What do I owe a reply or an appearance to?" It's built from the member's own Shortlist.

Today should still lead with what's personal and urgent, so Needs you goes first on Today too. Today reads the same `needsYou` function, so the Needs you rules above apply unchanged.

- **Desktop Today** (`/today?view=today`):
  - **Header:** the view header, as now.
  - **Needs you rows:** up to 3, using the Shortlist's row component. Under them, "N more on your Shortlist →", which goes to the Shortlist overview.
  - **Today's card row**, as now:
    - unread Updates
    - the monthly grant, while open
    - the Sophia Fund
    - the next event
- **No duplicates.** If the next event is already in Needs you (rule 2), the next-event card shows the following upcoming event instead.
- **Nothing needs you:** the section doesn't render on Today. Today still has its cards, so an empty state would only add noise.
- **Phones** (the current Today page): the same rows stack above the Updates.
- **The palette's Today tool stays as it is.** The yellow dot belongs to Shortlist only, so one signal means one thing.

## Three levels

1. **Overview** (`/today?view=shortlist`, replacing the desk's `fav` view). Header "Shortlist · N things", then the Needs you strip, then three tiles: Projects, Events, People. Each tile has a kicker, a count at 56px, a breakdown line and one next step. Projects' breakdown is the paid/passion split (decision 7). It fits 1440×900 without scrolling. When the whole list is 8 items or fewer, every item is also listed as a row under the tiles.
2. **An area** (`&area=projects`). Header "The Garden · Shortlist" / "Projects 15". Chips: All · Projects · Events · People, a divider, then Paid · Passion (Projects only; click again to clear). Rows group as in The model. They are 64px rows, not cards: a thumbnail or date block, the title and a second line, mono meta (pay, going count), status, and an outline action on Needs you rows. Rows were chosen because status, dates and pay are what people decide on, and rows fit 10+ items on a screen.
3. **One item** (`&card=role:<id>`, `request:<id>`, `project:`, `event:`, `person:`). This is the existing opened card, plus three things:
   - A status line ("Mara invited you Sep 30 · Waiting on you").
   - One action that follows the state (table below).
   - ← / → to step through the current group, with "2 of 6".

| State | Action |
|---|---|
| Invited | Accept, with Decline as text |
| Join request on your project | Accept, with Decline as text |
| Request to attend your event | Approve, with Decline as text (the existing `events.updateApplicationStatus`) |
| Leading | Review requests |
| Applied or asked to join | Withdraw request |
| Saved role | Apply |
| Saved event | I'm going |
| Going | You're going (disabled) |
| Person | See profile |

## Palette

- **Shortlist replaces the Desk tool**, in the same arc slot. The main button already does what Desk did (reset to everything); give it the title "Desk". A 7th tool on the 150px arc would put 44px tools 39px apart.
- **Order:** Today, People, Projects, Events, Shortlist, Profile. Icon: Phosphor `bookmark-simple`.
- **Stack:** See my shortlist ("4 need you" in yellow), Projects 15, Events 9, People I follow 14.
- **"See my favorites" leaves the Events stack.**
- **A yellow dot** on the Shortlist tool when something needs you. The number chip stays for messages.
- **Highlight:** Shortlist lights on the overview, in an area, and on any card opened from it. It no longer lights Events.
- **Old route:** `/favorites` redirects to the Shortlist on desktop. On phones, `/favorites` takes the same structure (see Open questions), and the nav label becomes "Shortlist".

## Empty and sparse

- **Zero of everything:** one note, "Nothing on your shortlist yet.", with Browse projects, Browse events and Find people.
- **A few items:** all three tiles stay. Empty ones are dashed and read "Nothing saved yet" plus a browse link. Items list under the tiles (the 8-item rule in Three levels).
- **Many events:** the tile counts live events only (see Needs you rules, Display). Past folds behind "Show 12 past events", with "Remove past events".

## Data gaps (marked New in the mockup)

| Need | Change |
|---|---|
| Save a project or role | New. `favorites.targetType` (now "profile" or "event") gains `"project"` and `"role"`, with branches in `getMyFavorites`, which `/events`, `EventCard` and the desk also read. Save buttons on project and role pages. |
| Invited, waiting to hear, on the team, closed | New query over `projectMembers.by_userId_status`. It returns status, role title, pay, `neededBy` and the lead's name. |
| Projects you lead and their requests | New query. The indexes exist: `projects.by_userId` / `by_userId_kind_status`, then `projectMembers.by_projectId_status`. |
| Events you host and their requests | New query. The indexes exist: `events.by_organizerId`, then `eventApplications.by_eventId_status`. Events you co-host are included too, through `eventCoHosts.by_userId`: a join table that mirrors `events.coHostIds`, since an array can't be indexed. |
| Going | New `eventRsvps.by_userId` index. It has no user index today. |
| Opened cards | New `role:<id>` and `request:<id>` card kinds. |
| Interactions | New: ← / → stepping in the opened card; bulk "Remove past events". |
| Hourly pay | Roles have no rate unit, so "$40/hr" needs a new field on `projectRoles`. |
| Already exists | Follows and saved events (`favorites`). Backing (`garden/support.listMySupportGiven`). Your event requests (`eventApplications.by_applicantId`). |
| Legacy jobs | `jobInterests` were never migrated. Don't surface them. |

## Open questions for Rick

1. **Phones.** The spec assumes the same structure, with the three tiles stacked or in a row of 3. Confirm when the phone pass happens.
