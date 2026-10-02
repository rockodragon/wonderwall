# Favorites redesign: the Shortlist

Status: mockup v1. Name, palette slot and Today placement decided by Rick on 2026-10-02 (see Decisions). Mockup: `mockup.html` in this folder (open it in a browser; the top bar steps through the frames, "Design notes" shows the annotations). Built on the desk + palette (`docs/features/desktop-desk-palette.md`, `docs/handoff/garden-desk-palette/README.md`).

## Problem

Rick, after using the desk: the favorites page is hard to digest. It has no information hierarchy and no clear priorities. People care about work first, then projects, then events, then people. They need a clear summary of how much they're tracking, with areas that open up to more detail so they can focus.

What's wrong today:
- One place has four names: "Following" (nav, h1), "people and events" (subtitle), "Favorites" (desk), and "See my favorites" (buried under Events in the palette).
- People, the lowest priority, fill the top of the page. Work and Projects aren't on it at all.
- Every item has the same weight. Going, saved, requested and past events look alike, and nothing says "this needs you".
- There's no summary. On the desk's `fav` view, a person's face and an event poster share one 3:4 grid.

## Decisions (Rick, 2026-10-02)

1. **The name is Shortlist.** It replaces "Favorites" and "Following" everywhere: the page, the desk view, the palette, and the phone nav.
2. **Shortlist takes the Desk tool's slot in the palette.** The Desk tool goes (see Palette).
3. **Only what the member did themselves.** Nothing on the Shortlist is suggested by the app or by AI. Suggestions belong on Today and in the browse views.
4. **Needs you also leads Today** (see "Needs you on Today").

## The model

**Shortlist.** It holds everything of other people's that you've set aside or put your hand up for. Things you own or host stay on your profile. Items rank by how much they need you: in motion (invited, applied, going, on the team, backing), then saved, then followed.

**Areas**, in fixed positions, never hidden:

| Area | Holds | Groups |
|---|---|---|
| Work | Anything that pays: paid projects, and paid roles | Needs you · Applied · On the team · Saved · Closed (folded) |
| Projects | Passion projects and volunteer roles | Needs you · Asked to join · On the team · Backing · Saved · Closed (folded) |
| Events | Saved, requested, going | This week · Going · Requested · Saved (by month past 6) · Past (folded, includes cancelled) |
| People | Follows | By first interest (`groupFollows`, 6+ follows) |

**Needs you.** These rules apply across all areas, in this order, and nothing else qualifies:
1. An invite waiting on your reply.
2. An event you're going to in the next 7 days.
3. A saved role that fills within 7 days.

The overview shows 3, then "N more →". These rows get a 3px yellow left rule and a yellow mono status. Counts include live items only.

## Needs you on Today

Today and Needs you answer different questions:
- Today: "What's happening?" It's a briefing from the community and admins.
- Needs you: "What do I owe a reply or an appearance to?" It's built from the member's own Shortlist.

Today should still lead with what's personal and urgent, so Needs you goes first on Today too. It's one rule set shown in two places.

- **One source.** A pure `needsYou(input, now)` function holds the three rules above and their order. Today, the Shortlist overview and the palette's dot all read it, so they can't disagree. Put it beside `deskCards.ts`, with a unit test covering each rule and the 7-day edges.
- **Desktop Today** (`/today?view=today`):
  - **Header:** the view header, as now.
  - **Needs you rows:** up to 3, using the Shortlist's row component. Under them, "N more on your Shortlist →", which goes to the Shortlist overview.
  - **Today's card row**, as now:
    - unread Updates
    - the monthly grant, while open
    - the Sophia Fund
    - the next event
- **No duplicates.** If the next event is one you're going to and it's already in Needs you, the next-event card shows the following upcoming event instead.
- **Nothing needs you:** the section doesn't render on Today. Today still has its cards, so an empty state would only add noise.
- **Phones** (the current Today page): the same rows stack above the Updates.
- **The palette's Today tool stays as it is.** The yellow dot belongs to Shortlist only, so one signal means one thing.

## Three levels

1. **Overview** (`/today?view=shortlist`). Header "Shortlist · N things", then the Needs you strip, then four tiles: kicker, count at 56px, a breakdown line ("1 invite · 2 applied · 1 on the team · 3 saved"), and one next step. It fits 1440×900 without scrolling. When the whole list is 8 items or fewer, every item is also listed as a row under the tiles.
2. **An area** (`&area=work`). Header "The Garden · Shortlist" / "Work 7". Area chips: All · Work · Projects · Events · People. Items are 64px rows, not cards: a thumbnail or date block, the title and a second line, mono meta (pay, going count), status, and an outline action on Needs you rows. Rows were chosen because status, dates and pay are what people decide on, and rows fit 10+ items on a screen.
3. **One item** (`&card=role:<id>`, `project:`, `event:`, `person:`). This is the existing opened card, plus three things:
   - A status line ("Mara invited you Sep 30 · Waiting on you").
   - One action that follows the state: Invited → Accept, with Decline as text. Applied → Withdraw request. Saved role → Apply. Saved event → I'm going. Going → You're going (disabled). Person → See profile.
   - ← / → to step through the current group, with "2 of 6".

## Palette

- **Shortlist replaces the Desk tool**, in the same arc slot. The main button already does what Desk did (reset to everything); give it the title "Desk". A 7th tool on the 150px arc would put 44px tools 39px apart.
- **Order:** Today, People, Projects, Events, Shortlist, Profile. Icon: Phosphor `bookmark-simple`.
- **Stack:** See my shortlist ("4 need you" in yellow), Work 7, Projects 8, Events 9, People I follow 14.
- **"See my favorites" leaves the Events stack.**
- **A yellow dot** on the Shortlist tool when something needs you. The number chip stays for messages.
- **Highlight:** Shortlist lights on the overview, in an area, and on any card opened from it. It no longer lights Events.
- **Old route:** `/favorites` redirects to the Shortlist on desktop. On phones, `/favorites` takes the same structure (tiles 2×2, then rows), and the nav label becomes "Shortlist".

## Empty and sparse

- **Zero of everything:** one note, "Nothing on your shortlist yet.", with Browse work / projects / events and Find people.
- **A few items:** all four tiles stay. Empty ones are dashed and read "Nothing saved yet" plus a browse link. Every item is listed under the tiles.
- **Many events:** the tile counts live events only. Saved events group by month, and Past folds behind "Show 12 past events" with "Remove past events".

## Data gaps (marked New in the mockup)

| Need | Change |
|---|---|
| Save a project or role | `favorites.targetType` gains `"project"` and `"role"`, with matching branches in `getMyFavorites` (/events reads it too). Save buttons on project and role pages. |
| Invited / Applied / On the team / Asked to join | A new "my requests" query over `projectMembers.by_userId_status`. It returns status, role title, budget, neededBy and the lead's name. |
| Going | `eventRsvps` has no user index; add `by_userId`. |
| Requested | Already exists: `eventApplications.by_applicantId`. |
| Backing | Already exists: `garden/support.listMySupportGiven`. |
| Role card | A new `role:<id>` opened-card kind. |
| Interactions | ←/→ stepping in the opened card. Bulk "Remove past events". |
| Legacy jobs | `jobInterests` were not migrated. Don't surface them. |

## Open questions for Rick

1. **Paid roles under Work, volunteer roles under Projects.** Is that the right split? The spec assumes yes. A role's own `budgetType` decides: "volunteer" goes to Projects, anything else goes to Work.
2. **Phones.** The spec assumes the same structure, with the tiles 2×2. Confirm when the phone pass happens.
