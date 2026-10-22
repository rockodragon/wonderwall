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
