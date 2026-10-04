# Desktop: the desk and the palette

Status: building on branch `desktop` (2026-10-01). Design source: `docs/handoff/garden-desk-palette/README.md` (Claude Design, option 3a "Desk + Palette"). That README is the visual spec. This file records how it maps onto the app, and where the build departs from it.

> **On screen it's the canvas** (Rick, 2026-10-04). Members see "Canvas" and "Your canvas"; the code (`app/app/desk/`, `DeskCard`, `FF_DESK`) and this file still say desk. The code rename waits until the open branches that touch `app/app/desk/` (`tables`, the pricing page) have merged.

> **Superseded in part by the Shortlist** (`docs/handoff/favorites-redesign/README.md`, 2026-10-02). The Desk tool is gone; Shortlist takes its slot, and the main button is the Desk. The `fav` view is now `shortlist` (`?view=fav` still opens it). "See my favorites" has left the Events stack. Today leads with Needs you. Where this file says otherwise about those parts, the Shortlist spec wins.

## Scope

- Desktop only: Tailwind `md` and up (≥768px). Phones keep the bottom bar and the current Today page.
- Behind `FF_DESK` (`app/app/lib/featureFlags.ts`). `false` restores the sidebar and the old Today page on desktop.
- No backend changes. Every query the desk reads is one the app already calls today.

## Where things live

| Piece | File |
|---|---|
| Palette tokens (colors, easing, focus ring) | `app/app/desk/tokens.ts` |
| URL contract + community store | `app/app/desk/deskState.ts` |
| Palette composition | `app/app/desk/Palette.tsx` |
| Palette state machine (fan, stacks, roving focus, touch, keyboard) | `app/app/desk/usePaletteController.ts` |
| Palette parts (stack panel, rows, count chip, avatar, CSS) | `app/app/desk/PaletteParts.tsx` |
| Palette tool/stack config + actions | `app/app/desk/paletteConfig.tsx` |
| Palette geometry, active-tool rules (pure) | `app/app/desk/paletteLogic.ts` + test |
| Desk surface, greeting, cards, opened card | `app/app/desk/Desk.tsx` (+ `DeskCard.tsx`, `OpenedCard.tsx` as needed) |
| Building cards from data (pure) | `app/app/desk/deskCards.ts` + `deskCards.test.ts` |
| Scatter / row / open geometry (pure) | `app/app/desk/deskLayout.ts` + `deskLayout.test.ts` |
| Shell: palette replaces the sidebar on md+ | `app/app/routes/_app.tsx` |
| /today: desk on md+, current page below md | `app/app/routes/today.tsx` |

## The contract between palette and desk

The palette lives in the `_app` shell. The desk lives in `/today`. They don't share React state. The palette writes the URL and the desk reads it (`deskState.ts`):

- `/today?view=events&card=event:<id>`
- `view` is one of `all | today | people | projects | events | fav`. Absent means `all`.
- `card` names the opened card: `event:<id>`, `project:<id>`, `person:<profileId>`, `fund`, `grant`. Opening a card pushes history, so Back closes it.
- Community (`garden | exchange`) lives in `useDeskCommunity()` / `setDeskCommunity()`, stored in localStorage `desk.community`.

## Gap analysis: current nav vs. the design

Everything the sidebar and bottom bar do today has a home in the palette. None of the gaps is a blocker. Here is each one and the decision made:

1. **Unread badge.** The design has none. Today, unread messages plus notifications show as a red count on Messages. Decision: an accent count chip (`#FFE066` on `#121212`, 12px) on the main palette button and on the Profile tool. "Read messages" shows the count at the right of its row. Same two queries as now.
2. **Admin links** (Crawler, Waitlist). Not in the design. Decision: an "Admin" row at the end of the Profile stack, admins only, linking to `/admin`.
3. **Following** (`/favorites`, people and events). The design only has "See my favorites", which filters to hearted events. Decision: the `fav` view shows hearted events and followed people. The People view shows followed people, which gives People real cards instead of an always-empty desk.
4. **Signed-out visitors** on public pages (People, Projects, Events). Not designed. Decision: the palette shows People, Projects and Events (each navigates to its public page) and a "Sign in" tool in the profile slot. The main button goes to `/garden`. There is no Desk or Today tool, because `/today` needs an account.
5. **The old Today page** (Creator Notes, featured project, open projects, paid work, monthly-grant prompt, empty-profile prompt). On desktop the desk replaces it. Its jobs move onto the desk as cards: next events, the featured project, the monthly-grant card when one is open to give, and the Sophia Fund. Lists stay one click away through "All N … →" tail cards. Phones keep the old page unchanged.
6. **Scale.** The design's straight row fits about 4 cards. Real lists are longer. Decision: when more cards match than fit, the last slot becomes a tail card, "All 12 events →", linking to the full page (`/events`, `/projects`, `/people`, `/favorites`).
7. **Find people / Meet people near me.** The desk only holds people you follow, so these go to the directory: `/people` and `/people?near=1` (the Near me toggle is on by default with that param).
8. **Community switch.** Today "The Exchange" means the `/communities` directory. Decision, per the design: switching re-filters the desk. The Garden shows content from The Garden plus content with no community, plus the Sophia Fund. The Exchange shows everything on the platform, and no fund card. Switching from another page goes to the desk.
9. **Create flows** (Start a project, Hire someone, Host an event) open as cards on the desk: `/today?create=project|hire|event`. The list pages' own `/projects?new=project` and `/events?new=event` still open the same forms in place.
10. **Palette over page content.** Off the desk, the 56px button sits over the bottom-left corner of pages (about 112×112px). The 280×280 hover zone takes no pointer events until the fan is open, so it never blocks clicks.

### Rule departures from the handoff

- Muted text is `#ACACA4`, not `#8F8F8F`. The design value measures 5.65:1 on `#151515`, under the 6:1 floor for small text.
- Nothing renders under 12px. The handoff's 11px mono kickers and stack headers are 12px.
- No "Be the first". The event aside shows "N going" only when N > 0.
- Money copy comes from `CLAIMS`. The fund aside uses a new short claim, `CLAIMS.grantFundDeductibleShort = "Tax-deductible"`. The fund's description is `CLAIMS.sophiaSchedule`.

## Palette

The visual spec is the handoff README. What follows covers the build.

**Mount.** In `_app.tsx`, `FF_DESK` on and md+: no sidebar, no `md:pl-64`, render `<Palette />`. The mobile bottom bar is unchanged.

**Layers.** The palette is fixed at the bottom-left with `z-40`: above the desk and its opened card, below page modals (`z-50`).

**Tools, signed in.** The six tools follow the handoff's order and arc: Desk, Today, People, Projects, Events, Profile. The Profile circle shows the user's initials, or their avatar image when they have one.

**Tool click** (mouse, or a second tap on touch) navigates to `deskHref(view)`. Profile has no view, so clicking it only opens its stack.

**Active tool.**
- On `/today`, the tool whose view matches. `fav` lights Events.
- On other pages:
  - People: `/people`, `/search`, `/profile/*`.
  - Projects: `/projects*`.
  - Events: `/events*`.
  - Profile: `/settings`, `/messages*`.

**Stacks.** Copy is exact, in order:

| Tool | Row | Action |
|---|---|---|
| Desk | Show everything | `deskHref("all")` |
| Today | Today | `deskHref("today")` |
| People | Find people | `/people` |
| People | Meet people near me | `/people?near=1` |
| People | Invite someone | Copy the invite link (`useInviteLink`). The row reads "Invite link copied" for 2s, the same as the old invite button. If there's no link, go to `/settings?tab=network`. |
| Projects | Browse projects | `deskHref("projects")` |
| Projects | Start a project | `deskHref("projects", null, "project")` |
| Projects | Hire someone | `deskHref("projects", null, "hire")` |
| Projects | Grant Fund | `deskHref("projects", "fund")` |
| Events | Browse events | `deskHref("events")` |
| Events | Host an event | `/events?new=event` |
| Events | See my favorites | `deskHref("fav")` |
| Profile ({full name}) | Edit my profile | `/settings` |
| Profile | Read messages | `/messages`, with the count at the right of the row |
| Profile | About {community} | The Garden goes to `/garden`. The Exchange goes to `/about`. |
| Profile | Switch to {other} | `setDeskCommunity(other)`, then the desk |
| Profile | Admin | Admins only. `/admin` |
| Profile | Sign out | `signOut()`, then `/`, the same as settings.tsx |

**Signed out.**
- Tools: People goes to `/people`, Projects to `/projects`, Events to `/events`, Tables to `/tables`, and Sign in (Phosphor `sign-in`) to `/login?redirect=<here>`.
- Stacks: People has "Find people". Projects has "Browse projects". Events has "Browse events". Tables has "Find a Table" and "Set a Table". Sign in has "Sign in" and "About The Garden".

**Main button.** Signed in, a click goes to `deskHref("all")`, which also closes any open card. Signed out, it goes to `/garden`.

**Hover.** Entering the main button opens the fan. While the fan is open, the 280×280 zone takes pointer events, and leaving the zone closes the fan. Each tool's stack has a 14px bridge.

**Keyboard.** The palette uses a roving tabindex.
- Focus on the main button opens the fan.
- Arrow Up and Left move to the previous tool. Arrow Down and Right move to the next.
- Enter or Space on a tool opens its stack and focuses its first row. Arrows move through the rows.
- Escape closes the stack, then the fan, and returns focus to the button.
- Enter on the main button resets the desk.
- Focus ring: 2px `#FFE066` with a 2px offset.

**Touch** (`pointerType === "touch"`):
- Tapping the main button toggles the fan.
- The first tap on a tool opens its stack. A second tap runs the tool's click.
- Tapping outside closes everything.

**Reduced motion.** With `prefers-reduced-motion`, transitions drop to 0ms.

**ARIA.**
- The main button: `aria-label="Navigation"`, plus `aria-expanded`.
- Tools: buttons named by their label.
- Stacks: `role="menu"`, with items as `role="menuitem"`.

**First visit** (Rick, 2026-10-03; `PaletteHint.tsx`). Nothing else on a desktop page says the corner button is the menu, so a note points at it once per browser:
- "This is your menu" / "Hover or click it to get to People, Projects, Events, Tables and more." / **Got it**. An accent ring pulses around the main button three times while it shows.
- Shows 900ms after the shell settles: signed out at once, signed in only once the profile has loaded and neither onboarding nor `/invite` is about to take over.
- Gone for good (`localStorage["desk.paletteHint"] = "seen"`) on Got it or the first time the fan opens. Blocked storage brings it back next visit.
- Desktop only: it renders with the palette, which phones don't show.
- Reduced motion: no slide-in, no pulse.

## Desk

**Mount.** In `today.tsx`, `FF_DESK` on and `useIsDesktop()` (matchMedia `(min-width: 768px)`, live) renders `<Desk />`. Otherwise it renders the current page, unchanged and renamed `TodayPage`.

**Surface.** Full viewport (`100dvh`), `overflow: hidden`, dotted background per the handoff.

**Greeting.**
- The label reads `{COMMUNITY_LABEL} · {DESK_VIEW_LABEL[view]}`.
- Below it: "Good morning, {firstName}." Before 12:00 is morning, before 17:00 is afternoon, and after that evening.
- With no name, it drops the name: "Good evening."

**Data.** Only queries the app already uses:
- Upcoming events: the same args `routes/events.tsx` uses for its upcoming list.
- `api.garden.projects.listProjects`.
- `api.garden.allocations.getFundPage({ hostOrgSlug: "abiding-practice" })`.
- `api.favorites.getMyFavorites({})`.
- `api.garden.giving.getMyGiving`.
- `api.profiles.getMyProfile`.
- The current user's RSVP state: whatever `event.tsx` uses.

### Cards (`deskCards.ts`, pure)

`buildDeskCards(input, community) → DeskCard[]`. Each card carries `id`, `kind`, `sections: DeskView[]`, face fields (kicker, title, foot, image, tone), detail fields, and `href` (its full page).

**Event** cards come from upcoming events.
- Sections: `events`. The next event also gets `today`. A hearted event also gets `fav`.
- Face: kicker `OCT 2`, title, foot venue (or "Online").
- Detail meta: `NOV 8 · LIGHT CHURCH`. Host line: "Hosted by {hosts}", formatted the way event cards format hosts.
- Description: plain text, rich text stripped.

**Fund** card (Garden only).
- Sections: `projects`, `today`.
- Paper note. Kicker `THE SOPHIA FUND`. Title is the available amount, computed the way `fund.$slug.tsx` does it: seed plus `balanceCents`. Move `NAMED_FUNDS` to `app/app/lib/namedFunds.ts` so both read one constant. Foot: "available to grant".
- Detail: title "The Sophia Fund", host "Run by Abiding Practice", description `CLAIMS.sophiaSchedule`, action "Give" linking to `/fund/abiding-practice`, aside `CLAIMS.grantFundDeductibleShort`.

**Grant** card, only while `getMyGiving().open[0]` exists.
- Sections: `today`.
- Paper note. Kicker `YOUR MONTHLY GRANT`. Title is the exact amount. Foot: "to give this month".
- Detail action: "Choose" linking to `/give`. Reuse the wording already on today.tsx's YourHalfCard and give.tsx. Don't invent money copy.

**Project** cards: open passion projects and open paid projects, picked the way today.tsx picks them.
- Section: `projects`.
- Cover from `coverOf()`.
- Kicker says what the card is (`lib/projectKind.ts`): the stage label for a project; `JOB` for one-off paid work; `RECURRING GIG · FRIDAYS 8–10PM` for a live-booking series; `VOLUNTEER` for an unpaid posting. Foot: owner or community.
- Under Jobs and gigs, a project shown for a paid role leads with the role: kicker `ROLE ON {PROJECT} · PAID`, the role as the title, its pay then the owner in the foot.
- Detail: description, then "See project" linking to `/projects/:id`. Its meta line repeats the kicker with the community. Its rows are, top to bottom: Paid role (Jobs and gigs only), Stage, Schedule (a recurring gig), Funding, Roles, Pay. Funding is "$370 of $1,000 · 37%" with a goal, "Open to backing" when the project is raising through a tier with no goal.
- The featured project, picked the way today.tsx picks it, also joins `all`.

**Person** cards: followed people.
- Sections: `people`, `fav`.
- Image from the profile photo. Kicker `FOLLOWING`. Title: name. Foot: discipline or location.
- Detail: bio, then "See profile" linking to `/profile/:id`.

**Organization** cards: in the People view, mixed in with people (see "Organizations in People" below).
- Section: `people` only. Id `org:<id>`.
- Face: the logo whole on a light plate (logos are drawn for a light page, so it is never cropped), or with no logo the initials in a square frame. Kicker `ORGANIZATION`. Foot: category · place, else the people count. A category of "Other" is left out.
- Detail: the tagline, the place, "3 people", then "See organization" linking to `/orgs/:slug`.

**Community filter.**
- garden: `community == null || community.slug === "the-garden"`.
- exchange: everything, minus the fund card.

**What `all` holds, at most 6 cards:**
- The next 3 events.
- The fund (Garden).
- The grant card, if open.
- The featured project.

### Geometry (`deskLayout.ts`, pure)

`layoutDesk({ cards, view, openId, vw, vh }) → Map<id, { x, y, w, h, r, opacity, z }>`.

**Scale.** `s = clamp(min(vw/1200, vh/760), 0.75, 1.3)`.

**Scatter** (view `all`).
- Slots in 1200×760 space: the handoff's four (330,170,230×310,−5°), (640,215,220×295,3°), (925,150,240×320,−2°), (560,520,240×170,4°), plus two more that keep clear of the greeting (top-left ~520×140) and the palette corner (bottom-left 280×280).
- Note cards take the short slots.
- Map the slots into the viewport and center the cluster horizontally.
- Card size scales by `s`.

**Row** (any other view).
- Matched cards stand straight in a centered row: 230×310 × s, notes 230×200 × s, gap 44 × s, top 230 × s.
- `fit = floor((vw − 2·96 + gap)/(w + gap))`. If there are more matches than `fit`, show `fit − 1` cards and a tail card "All N {view} →".
- Unmatched cards sit at `y = vh + 80`, with opacity 0 and rotation ×3.

**Open.** Inset 24px, rotation 0, radius 12, z above the dim layer.

**Motion.** All motion is 620ms `DESK.ease`. Hover and open behave per the handoff.

**Empty view.** Show "Nothing from {View} on the desk yet." For People and Favorites, add a link: "Find people →" (`/people`).

### Opened card

The layout follows the handoff: face at 46%, detail panel `#181818`, fade 400ms after a 260ms delay.

Close it with the close button, a click on the dim layer, or Escape. Closing removes `card` from the URL (navigate back when the open came from a push, otherwise replace).

**Event action.** Same paths as the event page (`routes/event.tsx`):
- A signed-in member joins with `api.events.apply({ eventId })`, as the page's "Join Event" does. The button reads "I'm going", then "You're going" (accepted) or "Requested" (pending), disabled. It stays disabled until the viewer's status has loaded. Hosts get no button.
- An event that needs approval shows "Apply to Attend", linking to the event page.
- A ticketed event (ticket tiers, an external ticket link, or paid access) shows "Get tickets", linking to `/events/:id`.
- `rsvpToEvent` is the guest path on the event page. The desk never uses it.
- Every event also gets a secondary text link: "Event page →".

## Tests

- `deskCards.test.ts` covers:
  - Sections.
  - The community filter.
  - The 6-card cap.
  - The grant card appearing only while open.
  - No "going" aside at 0.
- `deskLayout.test.ts` covers:
  - Scatter slots stay out of the greeting box and the palette corner at 1024×700, 1440×900 and 1920×1080.
  - The row fits and the tail card appears.
  - Unmatched cards go offscreen.
- Commands, from `app/`: `pnpm typecheck` and `pnpm test`.

## Running locally against production data

Use `.claude/launch.json` → `app-dev` (port 5173, `VITE_CONVEX_URL=https://courteous-rabbit-750.convex.cloud`). It reads and writes prod. Signing in on localhost only works with a password account; Google sign-in returns to the prod host.

## Round 2: browse, filters, focus (Rick, 2026-10-01, after using #45 live)

What Rick saw on prod:
- The tool views showed only 3 or 4 cards, with no way to browse or filter.
- The greeting repeated on every view.
- The cards were small, with empty space under them.
- An opened card's picture was small.
- An opened card with no picture showed its title twice ("Weddi/ng").
- The create forms sat over the list page.
- The palette's menus closed too easily while moving onto them.

A UX analyst's recommendations are folded in below. Rick: keep the two-step entry (card, then the full page) for now.

**Header.**
- Home (`all`) keeps the greeting.
- Every other view drops it. The header is:
  - Line 1: mono `{COMMUNITY}`.
  - Line 2: the view name at 30px, then a muted count ("13 people").
- People, Projects and Events add one filter row under the header, on the same 48px left edge:
  - a search field (280×40, 15px)
  - Projects: four chips, one at a time, Projects first (Projects, Seeking funding, Seeking people, Jobs and gigs), then a "Stage ▾" menu (Any stage, Planning, Forming team, Working, Released) after a thin divider. No toggle, no "All" chip. Stage is hidden under Jobs and gigs.
  - Events: Upcoming / Saved / Past, then Near me
  - People: Everyone / Following / Organizations, Discipline, Near me
- At the right end of the row sits the view's one create verb, as an outline button: "Start a project" (Projects, Seeking funding, Seeking people), "Hire someone" (Jobs and gigs), "Host an event", "Invite someone". The Projects button opens the card over the list as it is: the filters stay in the URL.
- One row, never wrapped. At 1280px wide the search, all four chips, Stage and the create button fit with no "More". Narrower, the pieces after the search and the toggle fold into a "More" menu from the end (Stage first, then the chips), and a chip or menu that is switched on never folds. The People row folds the same way (Near me, then Discipline), as does Events', so nothing runs into the create button between 1024 and 1279px. In the menu, a long list (Discipline) comes after the short rows.
- Chips:
  - 36px pills with a 1px `#333` border and 13.5px `#D6D6D6` text.
  - The active chip copies the palette button: yellow border, 8% yellow fill, yellow text.
  - No bar behind them.
- Solid yellow stays reserved for the opened card's one action.
- There is no community dropdown on the desk; the palette's switch scopes every view.
- On scroll, the title scrolls away and the filter row pins to the top on a 92% `#151515` band with backdrop blur.
- Filter state lives in the URL (`?view=projects&show=funding&stage=planning&q=…`; `show` is the chip, `stage` the Stage menu, the same params as `/projects`). The old `tab=work`, `stage=gigs|roles|raising` and `seek=` links still land on the chip they meant (docs/features/project-ia.md).

**Grid.**
- Browse views and Favorites lay out as a wrapping grid that scrolls: columns at least 240px, cards at most 300px, a 32px gap, 3:4 cards.
- It aligns to the header's left edge, with 140px of bottom padding so the last row clears the palette.
- Cards still animate between positions; a change of filter slides them.
- No tail card ("All N →") in browse views; the view is the full list.
- Today keeps a short centered row.
- With nothing matching: "No {things} match." plus "Clear filters".
- People defaults to Everyone (the directory, same query as /people), with Following as a chip.
- The fund note takes a full cell and comes first in Projects.

**Opened card.**
- No picture: no picture half. Show one centered sheet (detail only, about 720px wide), so no title appears twice.
- With a picture:
  - The picture side's width follows the picture's shape, between 46% and 62%.
  - Photos (projects, people) fill and crop.
  - Event posters stay uncropped (framed), filling the larger side.
- Never break a word across lines.

**Cards with no picture** get a designed fallback:
- People: a paper name card with large initials.
- Projects: `AbstractCover`, as now.
- Events: the tone card, with the date set large.

**Create flows.**
- The palette's "Start a project", "Hire someone" and "Host an event", and each view's create button, go to `/today?create=project|hire|event`. "Hire someone" is the chooser `/projects` uses (`components/HireFlow.tsx`): one job, or a recurring gig. Its "Start a project instead" link swaps the card to `create=project`.
- The form opens as a single card on the desk's dotted surface, with nothing from the list behind it.
- Closing it returns to the desk.
- The same forms opened from the list pages use the same opaque backdrop (`components/FocusBackdrop.tsx`) instead of a 60% black overlay.

**Palette menus.**
- Moving from a tool to its menu keeps the menu open.
- A 300ms grace period applies before:
  - switching to a neighbouring tool while a menu is open
  - closing on leave
- The bridge between a tool and its menu is wider.

**People verbs.** "Find people" and "Meet people near me" open the desk's People view (Everyone), the latter with Near me on (`&near=1`, taken once, then dropped from the URL).

**Organizations in People (Rick, 2026-10-02).** On `/people` the Organizations tab sits beside People; the desk's People view had no way in. Organizations are mixed into the one grid, and the toggle gains a third state: **Everyone · Following · Organizations**.
- Everyone: people with the organizations mixed in. The header reads "30 people · 4 organizations".
- Following: people you follow. Organizations can't be followed yet.
- Organizations: only organizations (`?tab=orgs`, the same param as `/people`). Discipline and Near me are hidden: an organization has neither in `api.organizations.list`.
- Search is one box. People are searched on the server; organizations by name, category, place and tagline (`lib/browse/orgFilter.ts`, shared with `/people`).
- Discipline or Near me on, under Everyone: the organizations step aside, since they can't match.
- Order: people keep the server's order; organizations (most members first) are spread evenly through them, so with 30 people and 4 organizations there is one after every sixth. People and organizations have no sort key in common, and this keeps both lists as `/people` shows them.
- Organizations belong to no community, so the community switch doesn't scope them (as on `/people`).
- Not in this pass: a People-only state (turn on a Discipline for that), following an organization, Near me for organizations (the list doesn't send coordinates).

**Spacing (settled 2026-10-03).** Rick tried an admin dial for negative space and kept the layout as designed (1.00×). The dial is gone; `GRID_GAP`, `GRID_SIDE`, `ROW_GAP` and `HEADER_SIDE` in `deskLayout.ts` are the values.

**Who owns what.**
- Desk presentation (header, grid, opened card, fallbacks): `Desk.tsx`, `DeskCard.tsx`, `OpenedCard.tsx`, `deskLayout.ts`, `DeskHeader.tsx`.
- Browse data and filters: `deskBrowse.tsx`, plus pure filter logic in `lib/browse/` shared with `/people`, `/projects` and `/events`.
- Create flows and palette menus: `DeskCreate.tsx`, `FocusBackdrop.tsx`, `usePaletteController.ts`.

## Community tint (Rick, 2026-10-02)

There's no background picker; a UX review advised against one. Instead, each community's desk gets its own dark:
- The Garden is warm (`#19150f`, dots `#2b251b`).
- The Exchange is cool (`#10151b`, dots `#212a35`).

The tint follows the palette's community switch. `DESK_TINT`, `useDeskTint()` and `deskSurfaceStyle()` live in `desk/tokens.ts`. It covers:
- the desk
- the pinned filter band
- the desk search field
- the create-flow backdrop
- the palette button's base
- the admin Updates preview

Text tokens are unchanged, and both darks measure within 0.1:1 of `#151515`: muted text is 7.9:1 on the warm dark and 8.0:1 on the cool one.

## Later

- Open create flows and settings as desk cards instead of pages.
- More card kinds on the desk as content arrives (classes, messages, notifications).
- Decide whether phones get a desk at all.
