# Community UX — one shell, a picker, and a quiet filter

v1 · 2026-09-03 · owner: Rick · status: **spec, not built.** Read `community-groups.md` §0 first — this doc only fixes where community *navigation* lives, not the data model.

## 1 · Diagnosis

- **Two shells for one product.** `_app.tsx` (dark sidebar, CREATIVES.EXCHANGE) is the real app. `GardenNav` (top nav, Garden/Communities/Projects/Events/Tables/Fund) is a separate marketing shell built for pre-launch public pages. Clicking **Communities** in the sidebar sends a signed-in user out of their app into the second shell — different layout, different nav, different visual language, no way back except the browser.
- **The chip row is pseudo-navigation wearing a filter's clothes.** ALL / THE GARDEN above Passion/Paid on `/projects` (and four more browse pages) is doing the job of a global "where am I" switch, but it's scoped per-page, styled as a content filter, and invisible everywhere except the five pages that happen to render it.
- **Community identity isn't visible where you are.** Nothing on `/projects`, `/events`, `/offerings`, or the sidebar itself says which community's lens you're looking through right now — a member of The Garden has no ambient signal they're "in" it.
- **The community page lives in the wrong shell.** `/communities/:slug` content is right — hosts, roster, tables/events/projects/classes/fund, host tools — but it's `GardenNav`-wrapped, so joining a community drops you outside the app you were just using.
- **No public entry point respects the brief's promise.** The brief and playbook both say browsing is free, no account needed ("Join free — browse every community, sit in on open tables"), but `_app.tsx` hard-redirects every signed-out visitor to `/login` before they see anything.
- **The Garden isn't framed as a community — it reads as the platform.** Its copy ("creatives.exchange is where Kingdom-minded creatives...") doesn't distinguish "the commons" from "the first tenant standing in it," which is exactly the confusion `community-groups.md` §0 says launch must avoid.
- **Two pickers with the same name.** `components/CommunityPicker.tsx` (the *post-to-a-community* form select) will collide in naming and grep-ability with any new sidebar picker — name the new one distinctly.

## 2 · Information architecture: picker + directory (decision: (a) + (b))

**Both.** A **`CommunitySwitcher`** under the wordmark sets global context (Slack/Discord pattern); **Communities** stays a nav item — the place to discover, join, and apply. They do different jobs: the switcher answers "whose lens am I using right now," the nav item answers "what communities exist." Cutting either loses a real capability: nav-item-only gives no ambient context on every page; switcher-only gives no browsable directory.

**Switcher states** (desktop sidebar, under `Wordmark`):

| State | Shows | Opens to |
|---|---|---|
| Signed out | "Sign in" pill, no picker | `/login` |
| Signed in, 0 communities | "All of creatives.exchange" (static, no chevron affordance beyond the menu) | Menu: **Browse communities →** `/communities`, **Host your own →** `/communities/apply` |
| Signed in, 1 community | Community name, small ⌂ if home | Menu: "All of creatives.exchange", the one community (bold if selected), **Browse all communities →** |
| Signed in, several | Currently-selected name (or "All…") | Menu: "All of creatives.exchange" + each active community (⌂ marks home), **Browse all communities →**, **Host your own →** |

Selecting an entry writes the same `?community=<slug>` param + `localStorage["ce.community"]` that `useCommunityContext` already owns — the switcher is a new *view* on existing state, not a new state.

**What changes when a community is selected:** `/projects`, `/events`, `/offerings` filter their rows to it (unchanged filtering logic — same predicate that reads `communitySlug`); each page's header gains one line: *"In The Garden — [Show everything]"*; the four content-creation forms' `CommunityPicker` (the form select) pre-selects that community instead of "No community — just me," still changeable.

**What does not change:** nav item list, item order, or any page's URL structure. `?community=<slug>` keeps working as a shareable deep link regardless of the switcher.

**Chip rows: removed, everywhere they appear** (`projects.tsx`, `events.tsx`, `offerings.tsx`, `tables._index.tsx`, `events_.garden._index.tsx`). Replaced by one quiet line under each page's title/subhead: *"In The Garden. [Show everything]"* — plain text + link, not a control (the control is the switcher now). This is a `useCommunityContext` consumer, same as the chips were; only the render changes.

**Mobile:** the bottom bar keeps its current 7-icon set unchanged — there's no room for a switcher affordance there, and `_app.tsx`'s own comment already says so. Community context on mobile comes from the same quiet header line (tap "Show everything" to clear) and from the Communities tab's directory; no separate mobile picker is built in v1.

## 3 · Community page, inside the app shell

Rendered by `_app.tsx`, not `GardenNav`. Section order (top to bottom), unchanged from today's content, re-shelled:

1. **Header**: name, tagline, review banner if `pending` ("In review — only you and operators can see this"), location/website/hosts/member-count line, description.
2. **Join / leave / home controls** (`JoinControl`, unchanged logic) — directly under the header, not buried.
3. **Tables → Events → Projects → Classes** sections (unchanged card lists).
4. **For members** (paid products), **Fund** link if `hasFund` — unchanged.
5. **Host tools**: keep as a **collapsed panel** (`<details>` or a toggle), not a separate tab. Reasoning: hosts are a minority of viewers of their own page, most visits are members/prospects; a tab implies a nav-level distinction this single-owner surface doesn't need, and collapsing keeps the page itself scannable while host edit/roster/products/earnings stay one click away, not gone.
6. **"Browse everything in {name}"** links (Projects/Events/Classes with `?community=` appended): **keep**. They're the one place a non-member gets a working, filtered view without joining — cutting them removes the only frictionless preview path the brief promises.

## 4 · The Garden framing

**Tagline** (short, for the directory card and page header):
> Kingdom-minded creatives, funded in the open.

**Description** (one paragraph, for the community's `description` field):
> The Garden is creatives.exchange's first community — Kingdom-minded creatives who get their work funded, find collaborators, and gather around real tables, in San Diego and wherever the next table opens. Join free: browse projects, sit in on open tables, show your portfolio. Money is never the only door. When you want your work funded, a seat is $10 a month, and half of every membership funds another creative's project.

Both sentences are load-bearing canon, used verbatim: *"Money is never the only door"* (playbook, universal don't-say list) and *"half of every membership funds another creative's project"* (playbook §pricing, product plan §2.2). "Creative," never "artist," per the locked copy voice.

**Flag for Rick:** this description keeps the current "Kingdom-minded" phrasing (discussion brief §5.4's unresolved question — explicitly Christian vs. Kingdom-founded-and-open vs. neutral infrastructure is still open); it does not resolve which of the three positions the *platform itself* takes, only names what The Garden, as one community, already calls itself.

## 5 · Directory and apply

`/communities` and `/communities/apply` move into the `_app` layout, content unchanged.

**`/communities` (directory) — public, signed out or in.** A signed-out visitor sees the full card grid (name, tagline, location, member count, hosts) and the "Host a community — apply" card, exactly as today; only actions that require an account (Join, Apply) gate on sign-in, the browse itself doesn't.

**`/communities/apply` — directory browsable, form requires an account.** Signed-out visitor sees the page's intro copy and a **"Sign in to apply"** button (same pattern already used on `/communities/apply` and `/communities/:slug`'s `JoinControl`) — no partial form, no dead-end typing before being asked to log in.

**Does `applyToHost` fill the waitlist? No — and it shouldn't.** Today it writes a `pending` `hostOrgs` row plus a `communityMembers` host row; `waitlist` and its `interestedInHosting` field are untouched. **Recommendation: leave it that way.** `/admin/garden` is already the single, correct queue for host applications from people with accounts — mirroring into `waitlist` creates two records of the same decision that can drift (approve in one, forget the other). The `waitlist` table's real job is different: it's the **pre-account** capture mechanism. Use it for exactly that gap: a signed-out visitor on `/communities/apply` who isn't ready to make an account gets a lightweight "Tell us you're interested — we'll email you when applications open to you" form, calling the *existing* `addToWaitlist` + `answerWaitlistQuestions({ interestedInHosting: true })` — no new table, no new field, and it stays a separate funnel from the real, single approval queue in `/admin/garden`.

## 6 · Route and component plan

**`app/app/routes.ts`** — move three routes from their current top-level position into the `layout("routes/_app.tsx", [...])` array: `communities`, `communities/apply`, `communities/:slug`. Leave every other Garden-shell route (`garden`, `join`, `fund/:slug`, `story/:slug`, `tables`, `tables/:slug`, `garden/events`, `garden/events/:id`) exactly where it is — **out of scope for this change.**

**`app/app/routes/_app.tsx`** — currently `useEffect` redirects any `!isAuthenticated` visitor to `/login` and renders `null` while unauthenticated (lines ~42, ~68). Add a public-path allowlist:
```ts
const PUBLIC_PATHS = ["/communities"]; // startsWith match — covers /communities, /communities/apply, /communities/:slug
```
Redirect only fires when `!isAuthenticated && !PUBLIC_PATHS.some(p => location.pathname.startsWith(p))`. The signed-out render branch stops returning `null` for allowlisted paths and instead renders the shell with: sidebar's secondary nav (Favorites/Profile/Messages/admin links) hidden, `CommunitySwitcher` in its signed-out state ("Sign in" pill), and `<Outlet />` rendered normally so `/communities/*` pages can do their own signed-out handling (per §5).

**New: `app/app/components/CommunitySwitcher.tsx`** — the sidebar workspace switcher described in §2. Named `CommunitySwitcher`, not `CommunityPicker`, to stay distinct from the existing form picker at `app/app/components/CommunityPicker.tsx` (post-to-a-community select, unchanged). Reads `useCommunityContext()` for state, `listMyCommunities` for the menu contents.

**`app/app/garden/ui.tsx`** — `GardenNav`'s `NAV_ITEMS` drops the `Communities` entry (line pointing at `/communities`); that shell no longer hosts any community page, so the link no longer belongs there. The other five items (Garden/Projects/Events/Tables/Fund) stay.

**`app/app/components/CommunityFilter.tsx`** — keep `useCommunityContext`, `communityNameFor`, and the `CommunitySummary` type unchanged (both the switcher and the browse pages depend on them). **Remove `CommunityFilterChips` and `CHIP_STYLE_APP`** — both variants — and add a small replacement, e.g. `CommunityContextLine({ selected, communities, variant })`, rendering the one-line "In {name}. Show everything" text described in §2. Update the five call sites (`projects.tsx`, `events.tsx`, `offerings.tsx`, `tables._index.tsx`, `events_.garden._index.tsx`) to render the line instead of the chip row.

**`app/app/components/CommunityPicker.tsx`** (the form select) — small addition: accept an optional `defaultHostOrgId` (derived by each call site from `useCommunityContext().selected` when it resolves to an active community) so create forms default to the switcher's current context, per §2's "what changes."

## 7 · Acceptance checklist

1. Signed-in user clicks **Communities** in the sidebar → stays inside the dark app shell (same sidebar, same wordmark), lands on `/communities`.
2. Sidebar under `CREATIVES.EXCHANGE` shows the switcher; with 0/1/several communities it matches the §2 state table.
3. Selecting a community in the switcher updates `/projects`, `/events`, `/offerings` results and each page's header line without a full navigation (URL param updates, list re-filters).
4. `?community=the-garden` deep link still filters correctly for a signed-out or non-member visitor (URL param overrides membership, per `CommunityFilter.tsx`'s existing priority rule).
5. No page in the app still renders a chip row for community filtering; each of the five former chip locations shows the quiet context line instead.
6. Signing out and visiting `/communities` and `/communities/:slug` directly renders the directory/page with a "Sign in" CTA, not a redirect to `/login`.
7. Signing out and visiting `/communities/apply` shows page copy + "Sign in to apply," never the form fields.
8. `/projects`, `/events`, `/settings`, etc. (non-allowlisted paths) still redirect a signed-out visitor to `/login`, unchanged.
9. `GardenNav` (visible on `/garden`, `/join`, `/tables`, `/fund/:slug`) no longer lists "Communities."
10. Creating a paid or passion project while a community is selected in the switcher pre-fills that community in the create form's picker; it's still changeable to "No community — just me."
11. `/communities/:slug` for a community the viewer manages shows Host tools collapsed by default, expandable, with edit form + roster inside.
12. `/admin/garden`'s pending queue is unaffected — applying to host still produces exactly one row there, and nothing appears in `/admin/waitlist` from an *account-holder's* application.
