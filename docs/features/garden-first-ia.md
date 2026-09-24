# Garden-first IA — the community is the shell

v1 · 2026-09-24 · owner: Rick · status: **exploration, not a decision.** A UX-analyst pass (BMAD UX Expert framing: diagnose from evidence, reframe, offer options, mock the recommendation) on the concern that the app feels confusing and that The Garden reads as subordinate to the platform. Mocks: `docs/mocks/garden-first-ia.html` (committed) and the Design canvas at https://claude.ai/artifact/2tjtncBQjFpjGxZucpb1FH (artboards with notes).

Read `community-ux.md` first: this doc argues with its §2 decision (a Slack/Discord community switcher under the wordmark) and keeps everything else it decided.

## 1 · Diagnosis — why it feels confusing, and why The Garden feels subjugated

Evidence is from the shipped code on `main` (2026-09-24), the specs, and screenshots of the running app.

1. **Three layers are taught before anyone can act.** A new member must understand platform → community → content before the first screen makes sense: the wordmark says CREATIVES.EXCHANGE, a switcher under it says "All communities", and five nav buckets sit under that. The `/ia` page exists because this needs explaining. An IA that needs an IA page is the finding.
2. **The switcher inverts the tenancy the brand was built on.** The rebrand handoff (Brand Framework v2 §02) put The Garden at Tier 1, the container, and named it for that reason ("tables go inside a garden; the container gets the bigger name"). The September pivot made creatives.exchange Tier 1 and The Garden one row in a menu whose default state is "All communities". The chrome now belongs to the layer with no identity, and the layer with the identity is a filter value. That is the subjugation, mechanically.
3. **The switcher solves a problem the launch does not have.** `community-groups.md` §0: "creatives.exchange launches with The Garden as the only listed community." A workspace switcher with one entry is a control with no job that still costs a concept. Slack and Discord earn the pattern because users arrive already belonging to several servers. Here the switcher is the first thing under the logo for a member of exactly one community.
4. **The app contradicts the plan's own sentence about where the platform belongs.** `creatives-exchange-discussion-brief.md` §1: "People feel they joined their community, not the platform. The platform's name shows up on receipts. It runs underneath." The shell puts the platform's name at the top of every screen and the community's name nowhere.
5. **There is no ambient "you are here".** `community-ux.md` §1 already named this ("nothing on `/projects`, `/events`, `/offerings`, or the sidebar itself says which community's lens you're looking through"). The fix chosen, a one-line "In The Garden. Show everything", is a caption. Identity in a product is carried by the frame, not a caption inside it.
6. **The first screen after sign-in is a search box.** Login, OAuth and "Go to App" all land on `/search` ("People"). There is no home. The handoff's onramp rule is "every persona arrives through a person or a room, never through search."
7. **Vocabulary drifts between three navs.** Sidebar: People · Projects · Events · Spaces · Learn. `/garden` hub: Garden · Projects · Events · Tables · Fund. `/demo/app`: Buzz · People · Projects · Events · Tables · Offers. Page headings disagree with their nav labels (nav "Spaces" → page "Communities"; nav "Learn" → page "Classes & Coaching"; `/tables` titles itself "Spaces"). Each shell is a separate small lesson.
8. **Two public front doors, neither Garden-first.** `/` sells the platform ("Create better together") with The Garden in the second fold; `/garden` is a separate hub outside the app shell with its own nav. A visitor who was invited to The Garden is handed the platform first.
9. **A visible seam.** The sidebar follows the OS light/dark setting (`--app-*` tokens) while Projects, Events, Learn, Communities and Tables are permanently dark. On a light-mode machine the rail is cream and the page is ink. The seam reads as two products.

## 2 · Reframe

**A community is a place you are in. A platform is the ground it stands on.** The current design treats the community as a lens you apply to the platform. The proposal treats the platform as provenance for the community: your home community is the shell; other communities are places you visit; creatives.exchange is the account, the receipts, and a footer line.

This is not a reversal of the pivot. Multi-community tenancy, one account, one portable portfolio, per-community pricing and vocabulary all stand. Only the chrome moves.

## 3 · Options

| | A · Fix the switcher's defaults | **B · Garden-first shell (recommended)** | C · Hide tenancy until it earns its place |
|---|---|---|---|
| Shape | Keep the switcher. Default the lens to the home community, rename "All communities" to "Everywhere", show the selected name in the rail header | Home community owns the rail: name in the wordmark slot, Today as home, "Also on creatives.exchange" visit list at the foot, platform at receipt level. Visiting another community re-skins the rail with its name and gathering word, one way home | Ship a single-community app. No switcher, no directory in nav; The Garden is the product until a second community is approved (the original product plan §6 posture) |
| Fixes findings | 5 partly | 1–8 | 1–6, 8 |
| Cost | Hours | Days: rail, `/today` route, signed-out front door, banner on visited pages | Hours, plus a reversal later |
| Risk | The concept is still taught first; identity is still a caption | Needs one "home community" per account (schema has `communityMembers.isHome`, no UI sets it) | Communities approved in November arrive into a shell that was not designed for them |

**Recommendation: B, rendered like C at launch.** With one community, B *is* C: the rail shows The Garden and the visit list is empty except "All communities →". When Abiding Practice or Table Art Society are approved, nothing in the shell changes shape; a second name appears at the foot.

## 4 · The proposal, screen by screen

Mocked in `docs/mocks/garden-first-ia.html` (S0–S5) and on the canvas.

- **S1 · The rail.** Wordmark slot = home community ("THE GARDEN · San Diego · online", JetBrains Mono at 0.28em per the handoff). Nav: Today · People · Projects · Events · Tables · Learn. "Your tables" under the nav. At the foot: "Also on creatives.exchange" with the other communities as chips and "All →", then account, then a one-line platform credit with "Receipts · Account". The switcher, the "All communities" state and the chip rows are removed; `useCommunityContext` keeps its `?community=` param as the source of truth.
- **S2 · Today in The Garden.** The signed-in home, replacing `/search` as the landing route. It is the Buzz surface from the handoff (Task 6), scoped to the home community: aggregate deeds (tables this week, projects funded, pool balance, seats covered), "This week" sorted by soonest with the "no ranking" label, a just-posted rail by rotation, and the curator byline. The ledger from `community-groups.md` §3 already computes the money numbers.
- **S3 · Visiting.** Opening another community swaps the rail's name, sub-line and gathering word (Cohorts for Abiding Practice, per `/demo/app`'s per-community words) and adds a thin banner: "You're visiting Abiding Practice · Your home is The Garden · Go home →". The page under it is today's `/communities/:slug` content unchanged. This is the per-community theming and vocabulary the brief lists as not yet built, done at the cheapest layer: the rail.
- **S4 · Front door, signed out.** The Garden is the public entry: its name, the descriptor, this week's open tables visible without an account, the three near-spec Table cards, and creatives.exchange once in the footer with "All communities →". This folds `/` and `/garden` into one door for an invited visitor; the platform-level `/` can remain for partner conversations, reached from the footer.
- **S5 · Phone.** Today is the first tab: Today · People · Projects · Events · More. The header carries the community name. No switcher was ever going to fit here and the visiting model needs none.

Copy stays inside the locked voice (`the-garden-product-plan.md` §3.1): no new metaphors, canon sentences verbatim ("Money is never the only door", "half of every membership funds another creative's project", "Nobody makes anything alone").

## 5 · What changes in code (if adopted)

Small, and mostly in one file.

1. `app/app/routes/_app.tsx` — the rail header renders the viewer's home community (name, location) instead of `Wordmark` + `CommunitySwitcher`; the foot renders the visit list from `listMyCommunities` plus the platform credit. Signed out: the rail shows the community of the page being viewed (or The Garden by default).
2. `app/app/components/CommunitySwitcher.tsx` — retire; its state lives on in `useCommunityContext`. `CommunityContextLine` becomes unnecessary once the frame carries identity.
3. New `app/app/routes/today.tsx` — the Buzz surface scoped to the home community, using the `grantContributions` / `allocations` aggregates and the existing tables, events and projects queries. `login.tsx`, `oauth-callback.tsx` and "Go to App" land on `/today`.
4. `communityMembers.isHome` — one home per account, settable from the community page ("Make this my home"). The schema already has the field.
5. `NAV_ITEMS` in `app/app/garden/ui.tsx` — Today · People · Projects · Events · Tables · Learn, one list for every shell; "Spaces" leaves the nav and the directory moves under "All →" at the foot.
6. `/communities/:slug` — when the slug is not the viewer's home, render the visiting banner.
7. Sidebar theming — either follow the page (permanently ink) or make the browse pages follow the OS; the seam in finding 9 goes either way.

Not in scope: prices, splits, entitlements, the community data model, per-community pricing, the ledger. None of them move.

## 6 · Open questions for Rick

1. **Home community.** Does one account have one home, chosen by the member? The design needs it; the schema already allows it. Default for a new account from an invite link: the community that invited them.
2. **Domain and door.** If The Garden is the front door for invited visitors, does `creatives.exchange/` stay a platform page for partner conversations (this doc assumes yes), or does the root become The Garden until a second community is public?
3. **Gathering word in nav.** The mock shows "Cohorts" while visiting Abiding Practice. Is a nav label that changes per community acceptable, or should the nav say Tables everywhere and the page heading carry the local word?
4. **What "All communities" is for.** In this design it is a directory page, not a browsing lens. Is there a real job for cross-community browsing of projects and events at launch, beyond the directory? If not, the `?community=` filter can stay server-side only.

## 7 · Sources

- `docs/creatives-exchange-discussion-brief.md` §1, §6 — "the platform's name shows up on receipts"; "pages show your own community by default"
- `docs/features/community-ux.md` §1–2 — the switcher decision and its own diagnosis
- `docs/features/community-groups.md` §0 — one listed community at launch
- `docs/the-garden-product-plan.md` §1, §3.1, §6 — onramp rule, copy voice, the superseded Garden-as-host posture
- `audit-8-7/design_handoff_garden_rebrand/README.md` — tokens, the Table card, the Buzz surface, "browsable without an account is the highest-leverage onramp"
- `audit-8-7/design_handoff_garden_rebrand/Brand Framework v2.dc.html` §02 — the three-tier architecture with The Garden at Tier 1
- `app/app/routes/_app.tsx`, `app/app/components/CommunitySwitcher.tsx`, `app/app/garden/ui.tsx`, `app/app/routes/login.tsx` — the shipped shell
