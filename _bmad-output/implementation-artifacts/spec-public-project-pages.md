---
title: 'Public project pages, lean for viewers'
type: 'feature'
created: '2026-10-22'
status: 'in-review'
baseline_commit: 'c807e0f331b1abe89cc1112e804879695fc75bab'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A signed-out visitor who taps any project card (home, /projects) is sent to /login, though the plan says public work is browsable with no account and the share box promises "Everyone can see it." The list cards and project page also show noise to viewers: a repeated "PROJECT" label, "No supporters yet", wide "Cheer them on" buttons, "Remote-friendly — anywhere" when no place was set, and empty tabs.

**Approach:** Instagram/TikTok model: anyone can open `/projects/:id`; every action needs an account and brings the person back after signup. Viewers see only what has content; owners keep every empty section and control so they can fill it.

**Decisions (Rick, 2026-10-22):**
- Icons: Phosphor `Heart` for Cheer, `CurrencyDollar` for Back this.
- A tap on Cheer (signed in) opens today's Cheer sheet (note or offer of help). No change to `supportProject`.
- No email to existing members; the privacy page update is the notice.
- One build for all three parts.
- Team tab (asked during build): shown to non-owners whenever the project is still taking people, so members can Ask to join and visitors go to sign up; a finished project with only its lead has none.

## Boundaries & Constraints

**Always:** Owner (and admin) view keeps every section, empty states and edit control as today. Signed-out actions go to `/signup?redirect=<this page>` (signup.tsx stashes it; _app.tsx replays it). Server queries a visitor can reach must return the same not-found for admin-hidden projects and hidden ("_") communities as `getProject`. Reuse helpers: `currentUserId`, `communityVisibility`, `isHidden`, `isAdmin`, `SupportButtons`, `projectTabs`, `errorMessage`. Money words per `docs/marketing/claims.md` (back/fund, never "donate").

**Never:** No public profile page (`/profile/:id` stays signed-in; visitors see names as plain text). No change to the desk/Canvas cards, `ProjectTile`, story pages, or what members can do. No new tables or migrations. Don't raise drift-guard limits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Visitor opens project | signed out, `/projects/:id` | Page renders; no redirect | Bad/hidden id → "not found", same as today |
| Visitor taps Cheer / Follow / Apply | signed out | Goes to `/signup?redirect=/projects/:id` | — |
| Visitor taps Back | signed out | Back sheet opens on one-time (server allows guest one-time) | Monthly → server's account-needed reason via `errorMessage` |
| Project with no place | `location` unset, not owner | No Location card | Owner still sees "No location set" + edit |
| No team, no roles | lead only, not taking people (finished), not owner | No Team tab | `?tab=team` falls back to About |
| No updates / no support | non-owner | No Updates tab; no Support tab unless goal, tiers or supporters | — |
| Card with 0 supporters | any viewer | No "No supporters yet"; count shown only when > 0 | — |
| Hidden community project, team query | anon calls `getTeam`/`listRoles` | `null` / `[]` | — |

</frozen-after-approval>

## Code Map

- `app/app/routes/_app.tsx:41-60` -- public-path matcher; add `/projects/:id` like `PUBLIC_EVENT_DETAIL_PATH`; fix comment at :41.
- `app/app/routes/_app.test.tsx:109-114` -- model test (visitor stays on /events/:id).
- `app/convex/garden/projects.ts:568-640` -- `getProject`; inline hidden/community checks to extract; spreads `...project` (sends `address`, `coordinates`, `placeId` to anyone).
- `app/convex/garden/projectTeam.ts:1390-1460` -- `getTeam` returns null signed out (Team blank for visitors); `listRoles` :1464 has no hidden check and a comment relying on the page being gated.
- `app/app/lib/projectKind.ts:100-113` -- `projectKindLabel`, falls back to "Project" (tests in `projectKind.test.ts:102,106`).
- `app/app/routes/projects.tsx:519-815` -- `ProjectCard`: kind chip :561/:617, empty-cover strip :614 (`EMPTY_COVER`, `h-16` on phone), supporters/buttons :793-805; `withAccount` :89 sends to /login; `SupportButtons` :896-940; `SupportModal` :1051 (default type :1065 is recurring).
- `app/app/routes/projects.$id.tsx` -- kind chip :265; `isOwner` :254; tabs via `projectTabs` :289; byline/Follow :414-421 (Follow is dead for visitors); Cheer row :442-449; Support tab :508-520 ("No supporters yet" :517, empty div :3376); Location card :1478-1500; TeamCard :1728; team/profile links :1672.
- `app/app/lib/projectTabs.ts:13` -- tab rules; `readProjectTab` already falls back to "about".
- `app/app/lib/byline.ts:32`, `app/app/components/ProjectUpdates.tsx:228,333` -- `/profile` links; Updates returns null for non-owner with none.
- `app/app/routes/legal.privacy.tsx:70-72`, `app/app/legal/entity.ts:54-55` -- public/members bullets; dates ("bump both").
- `app/app/routes/projectCard.test.tsx:59-125`, `app/app/lib/projectTabs.test.ts` -- tests asserting old labels and strip.

## Tasks & Acceptance

**Execution:**
- [x] `app/convex/garden/projects.ts` -- extract `projectVisibleTo(ctx, project, viewerId)` from `getProject`'s two checks; for viewers who aren't the lead or an admin, omit `address`, `coordinates`, `placeId` -- one rule, no street address to the world.
- [x] `app/convex/garden/projectTeam.ts` -- `getTeam`: signed out returns `{lead, accepted, credits, acceptingPeople}` (no `mine`, apply not allowed) using `currentUserId`; `getTeam` and `listRoles` return null/[] when `projectVisibleTo` is false; fix the stale comment.
- [x] `app/app/routes/_app.tsx` -- `/projects/:id` public (single segment only); comment.
- [x] `app/app/lib/projectKind.ts` -- `distinctKindLabel(p)`: the label, or null when it's the generic "Project".
- [x] `app/app/routes/projects.tsx` -- card uses `distinctKindLabel`; phone strip only when there's an image or a chip/pill to hold; supporters text only when > 0; `SupportButtons` become icon buttons (aria-label "Cheer" / "Back this", count beside Cheer when > 0); signed-out Cheer → signup redirect, Back → sheet; `SupportModal` defaults guests to one-time.
- [x] `app/app/routes/projects.$id.tsx` (+ `lib/projectTabs.ts`, `components/ProjectUpdates.tsx`, `lib/byline.ts` as needed) -- no generic kind chip; non-owners don't get empty Location / Team / Updates / Support; visitor Follow, Cheer, Apply/Ask to join → signup redirect; `/profile` links render as plain names for visitors.
- [x] `app/app/routes/legal.privacy.tsx`, `app/app/legal/entity.ts` -- project pages public (title, pictures, story, stage, team names, updates, named supporters); profiles stay members-only; bump privacy dates.
- [x] Tests: `_app.test.tsx` (visitor stays on `/projects/:id`, not `/projects/:id/x`), `projectCard.test.tsx`, `projectKind.test.ts`, `projectTabs.test.ts`, `convex/garden/projectTeam.test.ts` (anon team, hidden → null), `projects` getProject redaction.

**Acceptance Criteria:**
- Given a signed-out visitor on createthegarden.com, when they tap a project card on `/` or `/projects`, then the project page opens with no login screen.
- Given the owner opens their own empty project, then Location, Team, Updates and Support with their empty states and edit controls are all still there.
- Given any viewer on `/projects`, then no card says "Project", "No supporters yet" or "Cheer them on".

## Verification

**Commands:**
- `cd app && npx vitest run` -- expected: all pass (baseline 3742).
- `cd app && npm run typecheck` -- expected: no errors.

**Manual checks (if no CLI):**
- Local dev signed out and as owner at phone width: open a project from `/projects` and from `/`; compare against the two screenshots in the request.

## Implementation Notes

- New `app/convex/garden/projectVisibility.ts` (`projectVisibleTo`, `seesProjectAddress`) beside `eventVisibility.ts` to avoid a module cycle; the same not-found guard also went on `listProjectUpdates`, `listSupportForProject`, `listTiers`, `getSchedule` (all reached by the public page).
- New `signupHref()` in `lib/pendingIntent.ts` replaced 3 inline copies (shareProject, login, projects); `supportDetour()` holds the Cheer/Back visitor rule for both pages.
- `sectionsWithContent` (lib/projectTabs.ts) decides visitor tabs; the Team rule follows the human decision above (shown while taking people).
- `SupportModal`: guests start on one-time and type the name shown (the server requires one for a named backing).
- Signed-out "Hire someone" now goes to signup, not login. Admins see every tab like the owner.
- GitNexus impact: Convex queries UNKNOWN (dynamic `api.*` dispatch; callers confirmed by text search); `projectKindLabel`, `bylineOf` HIGH and `FavoriteButton` CRITICAL were left unedited. detect-changes before the first commit: critical, 25 files / 54 symbols / 25 flows, all on the project list, project page and signup intent.

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap), 2026-10-22.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | getTeam gives anonymous callers accepted members' join notes (`message`) | high | `toPersonEntry` returns `row.message`; accepting keeps it; UI shows notes only in lead-only LeadTeamTools | patch |
| 2 | Street address still public: `location` text is the street for `locationType: "address"` | medium | location.ts display name is the address; getProject sends `location` to all | patch |
| 3 | listProjects (public /projects) sends address, coordinates, placeId to anyone | medium | spreads `...project`; Near me is off for projects (deskBrowse `canNear`); contradicts the new privacy text | patch |
| 4 | Privacy text inaccurate (works, creator interests/location, supporter notes, team pictures) | medium | work.tsx redirects to /projects/:id; listProjects/getProject send `creator.interests/location`; SupportersList shows messages | patch |
| 5 | Guests offered Monthly/Yearly backing the server refuses | medium | `SUPPORT_TYPES.back` unfiltered; GUEST_RECURRING_REASON | patch |
| 6 | Gig Dates tab: /profile links and no visitor respond/sign-up path | medium | GigSchedule.tsx:370,670; respond gated on `viewer.isSignedIn` | patch |
| 7 | "Profile link only for members" inline 3×, missed in GigSchedule | medium | CLAUDE.md reuse rule; GigSchedule miss is the drift | patch |
| 8 | While auth loads a member is treated as a visitor | low | `visitorSignUp`/`supportDetour` read `isAuthenticated` only; event.tsx waits for `!isLoading` | patch |
| 9 | `seesProjectAddress` duplicates `isOwnerOrAdmin` | low | helpers.ts isOwnerOrAdmin is the same rule | patch |
| 10 | listRoles returns roles when the project row is gone | low | `if (project && …)` skips the check on null | patch |
| 11 | `/projects/:id/` (trailing slash) redirects to login | low | regex `[^/]+$`; router matches the slash | patch |
| 12 | Visitor Ask to join / Apply detour untested | medium | renderToString runs no click; mutation left suite green | patch |
| 13 | Guest name reaching createBackingCheckout untested | medium | deleting the line left suite green | patch |
| 14 | Lead/admin and hidden-community branches of the four gated reads untested | medium | no community fixture in projects.test.ts | patch |
| 15 | Visitor Support tab on a raising project with no supporters untested | low | fixture always `raising: false` | patch |
| 16 | Admin "every tab" untested | low | page() has no admin viewer | patch |
| 17 | Org byline stays linked for visitors untested | low | every fixture `organization: null` | patch |
| 18 | Cheer/Back click wiring on page and card untested | medium | needs a DOM test setup the repo lacks; `supportDetour` tested | defer |
| 19 | getProject sends nonprofitName, benefitsNonprofit, supportPaymentLinkUrl, statusBeforeHidden to anyone | medium | pre-existing: getProject had no auth check before | defer |
| 20 | FavoriteButton has no signed-out handling (event hearts fail for visitors) | medium | pre-existing on event pages; FavoriteButton rated CRITICAL | defer |
| 21 | Shareable project pages keep `noindex` and one title; opportunities cards link nowhere | low | projects.$id.tsx meta; opportunities.tsx:24 stale | defer |
| 22 | Invite-only signup can dead-end a visitor's detour | medium | pre-existing for every join CTA; signup's Sign in tab replays the intent | defer |
| 23 | The tapped action isn't replayed after signup | medium | intent ("brings the person back") met; replay is an enhancement | defer |
| 24 | Tabs grow while loading; owner deep link flashes About | low | `?tab=` kept, corrects on load; fix needs loading branches | reject |
| 25 | Portfolio-origin projects now public | false | works are projects (project-ia.md); public is the intent; wording fixed in #4 | reject |
| 26 | Pledged-only support on a non-raising project hides Support | low | rare; fix adds a query input | reject |
| 27 | Owner sees "No location set" after choosing remote | low | owner keeps the pencil; viewers get nothing, as asked | reject |
| 28 | Admin sees empty tabs | false | spec: owner and admin keep every section | reject |
| 29 | Anonymous getTeam omits `apply` | false | no caller reads `apply.allowed === false`; visitor Apply detours per matrix | reject |
| 30 | Heart has no "already cheered" state | low | Rick chose tap-opens-sheet; needs backend | reject |
| 31 | `SignUpToFollow` copies FavoriteButton's look | low | fix means editing CRITICAL-rated FavoriteButton; see #20 | reject |
| 32 | Terms dates not bumped with privacy | maybe-false | "Bump both" may mean the changed document's two fields; would be low | reject |
